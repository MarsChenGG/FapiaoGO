/**
 * RenderModel Validator — Structural validation layer (Step 3.5)
 *
 * Ensures RenderModel is structurally valid BEFORE entering renderer.
 *
 * Principle: FAIL FAST, NOT SILENTLY WRONG
 *   - Renderer must NEVER guess
 *   - Renderer must NEVER tolerate invalid model
 *   - All structural validation happens BEFORE render
 *
 * ❌ This module MUST NOT:
 *   - Access hook state
 *   - Call IPC
 *   - Render anything
 *   - Make business decisions
 *
 * ✅ This module ONLY:
 *   - Validates RenderModel structure
 *   - Returns detailed validation results
 */

// ═══════════════════════════════════════════════════════════
// Allowed file formats
// ═══════════════════════════════════════════════════════════
const VALID_FILE_FORMATS = new Set(['pdf', 'ofd', 'image'])

// ═══════════════════════════════════════════════════════════
// validateRenderModel — Structural validator
// ═══════════════════════════════════════════════════════════
/**
 * Validate a RenderModel's structural integrity.
 *
 * Checks:
 *   - model exists and has slots + layout
 *   - slots is non-empty array
 *   - each slot has: key (string), fileFormat (valid enum),
 *     and renderable data (pdfData or imageUrl)
 *   - layout has: paperSize (string), slotCount (positive number)
 *   - slotCount matches slots.length
 *
 * @param {RenderModel|null} model - RenderModel from buildRenderModel()
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRenderModel(model) {
  const errors = []

  // ── 1. Top-level structure ──
  if (!model || typeof model !== 'object') {
    return { valid: false, errors: ['RenderModel must be a non-null object'] }
  }

  if (!Array.isArray(model.slots)) {
    errors.push('model.slots must be an array')
  }

  if (!model.layout || typeof model.layout !== 'object') {
    errors.push('model.layout must be a non-null object')
  }

  // Early return if top-level is broken — no point checking deeper
  if (errors.length > 0) {
    return { valid: false, errors }
  }

  // ── 2. Slots validation ──
  const { slots } = model

  if (slots.length === 0) {
    errors.push('model.slots must contain at least one slot')
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const prefix = `slot[${i}]`

    if (!slot || typeof slot !== 'object') {
      errors.push(`${prefix}: must be a non-null object`)
      continue
    }

    // key: required non-empty string
    if (!slot.key || typeof slot.key !== 'string') {
      errors.push(`${prefix}.key: must be a non-empty string`)
    }

    // fileFormat: required, must be valid enum
    if (!slot.fileFormat || typeof slot.fileFormat !== 'string') {
      errors.push(`${prefix}.fileFormat: must be a non-empty string`)
    } else if (!VALID_FILE_FORMATS.has(slot.fileFormat)) {
      errors.push(`${prefix}.fileFormat: must be one of [${[...VALID_FILE_FORMATS].join(', ')}], got "${slot.fileFormat}"`)
    }

    // renderable data: must have pdfData OR imageUrl
    const hasPdfData = slot.pdfData instanceof Uint8Array && slot.pdfData.length > 0
    const hasImageUrl = typeof slot.imageUrl === 'string' && slot.imageUrl.length > 0

    if (!hasPdfData && !hasImageUrl) {
      errors.push(`${prefix}: must have pdfData (Uint8Array) or imageUrl (string) for rendering`)
    }

    // pdf-specific: PDF files should have pdfData
    if (slot.fileFormat === 'pdf' && !hasPdfData && !hasImageUrl) {
      errors.push(`${prefix}: PDF file must have pdfData or imageUrl`)
    }
  }

  // ── 3. Layout validation ──
  const { layout } = model

  if (!layout.paperSize || typeof layout.paperSize !== 'string') {
    errors.push('layout.paperSize: must be a non-empty string')
  }

  if (typeof layout.landscape !== 'boolean') {
    errors.push('layout.landscape: must be a boolean')
  }

  if (typeof layout.slotCount !== 'number' || layout.slotCount < 1) {
    errors.push('layout.slotCount: must be a positive number')
  }

  if (layout.rotations !== undefined && layout.rotations !== null && typeof layout.rotations !== 'object') {
    errors.push('layout.rotations: must be an object or null')
  }

  // ── 4. Cross-field validation ──
  if (slots.length > 0 && typeof layout.slotCount === 'number') {
    if (layout.slotCount < slots.length) {
      errors.push(`layout.slotCount (${layout.slotCount}) is less than slots.length (${slots.length})`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
