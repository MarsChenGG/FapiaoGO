# RUNTIME_CUSTOM_PAPER_DESIGN

> **Status:** DESIGN — Not yet implemented
> **Date:** 2026-06-12

---

## 1. Business Context

**Current product does NOT require a user-managed paper catalog.**

The actual need: users occasionally (once per session or less) need to print to a non-standard paper size that's not in the registry. Examples: a specific envelope size, a custom receipt form, a unique label stock.

**Key constraint:** No paper management UI. No add/edit/delete dialogs. The custom paper is ephemeral — entered at print time, used once, forgotten.

---

## 2. Data Flow

```
Settings Window
    │
    ├── Paper selector <select>
    │     ├── A4
    │     ├── A5
    │     ├── Voucher240x140
    │     └── 自定义尺寸 ← NEW
    │             │
    │             ▼
    │     Width: [___] mm
    │     Height: [___] mm
    │
    ▼
Settings.json
{
  "paperSize": "Custom",
  "customPaper": {
    "widthMM": 240,
    "heightMM": 140
  }
}
    │
    ▼
PaperRegistryProvider.resolvePaperDimensions("Custom")
    → customPaper from settings → width=240mm, height=140mm
    │
    ├── PreviewService → HTML preview with custom dimensions
    └── ipc-print / PrintService → print with custom dimensions
```

---

## 3. Settings Model

```json
{
  "paperSize": "Custom",
  "customPaper": {
    "widthMM": 240,
    "heightMM": 140
  }
}
```

**Existing Settings.json location:**
`app.getPath('userData') + '/paper-registry/../Settings.json'`
(actual path confirmed from legacy code: `path.join(app.getPath('userData'), 'Settings.json')`)

**When paperSize is NOT "Custom":**
`customPaper` field may be stale/absent — ignored.

**When paperSize IS "Custom":**
`customPaper.widthMM` and `customPaper.heightMM` are required.

**Validation (applied at SettingsWindow save):**
- widthMM: 50–1000
- heightMM: 50–1000
- Both must be positive numbers
- Non-integer values are rounded to 1 decimal place

---

## 4. Resolution Path — PaperRegistryProvider

**Problem:** `PaperRegistryProvider.resolvePaperDimensions("Custom")` currently falls back to A4 because "Custom" is not in the registry.

**Solution:** Add a `resolveDimensionsForPaper(paperKey, customPaper?)` method or inject custom paper at query time.

```typescript
function resolvePaperDimensions(
  paperKey: string,
  customPaper?: { widthMM: number; heightMM: number }
): { width: string; height: string } {
  if (paperKey === 'Custom' && customPaper) {
    const w = Math.round(customPaper.widthMM * 10) / 10
    const h = Math.round(customPaper.heightMM * 10) / 10
    return {
      width: `${w}mm`,
      height: `${h}mm`,
    }
  }
  const dims = getEffectivePaperMap()[paperKey]
  if (dims) {
    return {
      width: `${dims.widthMM}mm`,
      height: `${dims.heightMM}mm`,
    }
  }
  // Fallback to A4
  return { width: '210mm', height: '297mm' }
}
```

**Benefits:** No registry pollution. Custom paper exists only in the query parameters. Consumers that don't pass `customPaper` get fallback behavior.

---

## 5. Preview Integration

### Current flow:
```
renderLayoutToHTML(layout: LayoutSnapshot)
  → resolvePaperDimensions(layout.paperSize) → CSS width/height
```

### Modified flow:
```typescript
// LayoutSnapshot already carries paperSize.
// LayoutSnapshot does NOT carry customPaper dimensions.

// Solution: PreviewService.render() receives dimensions via LayoutSnapshot.
// The LayoutSnapshot must be built with resolved dimensions.
```

**Two approaches:**

### Option A: LayoutSnapshot carries custom dimensions (RECOMMENDED)

```typescript
export type LayoutSnapshot = Readonly<{
  readonly elements: ReadonlyArray<LayoutElement>;
  readonly paperSize: string;
  readonly orientation: 'portrait' | 'landscape';
  readonly layoutHash: string;
  readonly metadata?: Readonly<Record<string, any>>;
  // NEW: resolves custom paper without registry lookup
  readonly customPaperDimensions?: Readonly<{
    widthMM: number;
    heightMM: number;
  }>;
}>
```

In `renderLayoutToHTML()`:
```typescript
function resolvePaperDimensions(paperKey, customDims?) {
  if (customDims) {
    return { width: `${customDims.widthMM}mm`, height: `${customDims.heightMM}mm` }
  }
  return PaperRegistryProvider.resolvePaperDimensions(paperKey)
}
```

### Option B: PreviewService reads settings directly

```
PreviewService.render() receives settings object with customPaper.
→ Reads PaperRegistryProvider for standard papers
→ Reads settings.customPaper for custom papers
```

Option A is preferred because `renderLayoutToHTML` remains a pure function — all input comes from `LayoutSnapshot`, no hidden dependencies on global state.

---

## 6. Print Integration

### ipc-print.js (legacy pipeline)

Current:
```javascript
const paperKey = options.paperSize || 'A4'
const paperMap = PaperRegistryProvider.getEffectivePaperMap()
const paper = paperMap[paperKey] || paperMap.A4
```

Modified:
```javascript
const paperKey = options.paperSize || 'A4'
const customPaper = options.customPaper

if (paperKey === 'Custom' && customPaper) {
  paper = { widthMM: customPaper.widthMM, heightMM: customPaper.heightMM }
} else {
  const paperMap = PaperRegistryProvider.getEffectivePaperMap()
  paper = paperMap[paperKey] || paperMap.A4
}
```

### PrintService.submit() (new pipeline)

Current: accepts `PrintPayload { filePath, printerName, paperSize, orientation }`
Modified: add optional `customPaperDimensions?: { widthMM, heightMM }`

### Electron Print API (both pipelines)

```javascript
const pageWidthUM = Math.round(paper.widthMM * 1000)
const pageHeightUM = Math.round(paper.heightMM * 1000)
```

Both custom and registered papers converge to the same micron-level API. No special handling needed downstream.

---

## 7. PaperRegistryProvider — Custom Paper Support

Add a helper method:

```javascript
/**
 * Resolve paper dimensions, supporting runtime custom papers.
 *
 * @param {string} paperKey - Paper identifier (e.g. "A4", "Custom")
 * @param {object} [customPaper] - Runtime custom paper dimensions
 * @param {number} customPaper.widthMM
 * @param {number} customPaper.heightMM
 * @returns {{ width: string, height: string }}
 */
function resolvePaperDimensions(paperKey, customPaper) {
  // Runtime custom paper bypasses registry entirely
  if (paperKey === 'Custom' && customPaper) {
    const w = customPaper.widthMM
    const h = customPaper.heightMM
    return { width: `${w}mm`, height: `${h}mm` }
  }
  // Standard papers from effective registry
  const dims = getEffectivePaperMap()[paperKey]
  if (dims) {
    return { width: `${dims.widthMM}mm`, height: `${dims.heightMM}mm` }
  }
  // Unknown → A4 fallback
  return { width: '210mm', height: '297mm' }
}
```

**Not adding to registry.** Custom papers are ephemeral, not persistent definitions. The distinction:

| Property | Registry Paper | Custom Paper |
|----------|---------------|--------------|
| Source | `system` or `user` | `runtime` |
| Persistent | ✅ Yes | ❌ No |
| In effectiveRegistry | ✅ Yes | ❌ No |
| Has label in dropdown | ✅ Yes | ✅ Yes ("自定义尺寸") |
| Has dimensions in dropdown | ✅ Yes | ❌ No (input fields) |

---

## 8. Settings Persistence

**Existing:** `electron/constants.js` → `app.getPath('userData')/Settings.json`
(confirmed in main.js: `settingsPath = path.join(app.getPath('userData'), 'Settings.json')`)

**No new file needed.** Append to existing Settings.json:

```json
{
  "paperSize": "Custom",
  "customPaper": {
    "widthMM": 240,
    "heightMM": 140
  }
}
```

**Loading:**
```javascript
const settings = JSON.parse(fs.readFileSync(settingsPath))
const paperKey = settings.paperSize
const customPaper = settings.customPaper
```

**Saving (from SettingsWindow):**
```javascript
if (paperSize === 'Custom') {
  settings.customPaper = { widthMM, heightMM }
}
```

---

## 9. Error / Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| `paperSize === 'Custom'` but `customPaper` is missing | Fallback to A4 + console.warn |
| `customPaper.widthMM` < 50 | Cap at 50mm |
| `customPaper.widthMM` > 1000 | Cap at 1000mm |
| `customPaper.heightMM` is NaN | Fallback to A4 |
| `paperSize` resolved normally + `customPaper` also present | Ignore customPaper |

---

## 10. UI Integration Points (Future)

The custom paper UI will be added to `SettingsWindow.jsx`:

```jsx
<select value={settings.paperSize}>
  {PAPER_REGISTRY.map(p => <option value={p.id}>{p.label}</option>)}
  <option value="Custom">自定义尺寸</option>
</select>

{settings.paperSize === 'Custom' && (
  <div className="custom-paper-inputs">
    <label>宽度 (mm)</label>
    <input type="number" min={50} max={1000}
      value={settings.customPaper?.widthMM || ''}
      onChange={...} />
    <label>高度 (mm)</label>
    <input type="number" min={50} max={1000}
      value={settings.customPaper?.heightMM || ''}
      onChange={...} />
  </div>
)}
```

**Validation on save:**
```javascript
function validateCustomPaper(settings) {
  if (settings.paperSize !== 'Custom') return null
  const { widthMM, heightMM } = settings.customPaper || {}
  if (!widthMM || !heightMM || isNaN(widthMM) || isNaN(heightMM)) {
    return '请输入有效的宽度和高度'
  }
  if (widthMM < 50 || widthMM > 1000) return '宽度超出范围 (50-1000mm)'
  if (heightMM < 50 || heightMM > 1000) return '高度超出范围 (50-1000mm)'
  return null
}
```

---

## 11. Summary — No Code Changes Required

This document is a DESIGN. Implementation requires:

| Phase | Requires | Status |
|-------|----------|--------|
| Settings model | Existing Settings.json | ✅ Already exists |
| Registry "Custom" entry | `paper-registry.js` — add one entry | 🔜 1 line |
| Resolution path | `PaperRegistryProvider.resolvePaperDimensions()` | 🔜 Add custom param |
| Preview integration | `LayoutSnapshot` + `renderLayoutToHTML()` | 🔜 Add optional field |
| Print integration | `ipc-print.js` resolve path | 🔜 Add custom check |
| UI | `SettingsWindow.jsx` — custom dimensions inputs | ❌ Future work |

**The custom paper is implemented as a data flow override, not a registry extension.** It exists only at query/print time and leaves no persistent artifact in the paper registry.
