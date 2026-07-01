# ARCHITECTURE LOCK — Single Rendering Contract

> **This document is part of the architecture lock. Do not modify without architectural review.**

## Core Principle

This system enforces **Single Rendering Contract**.

**Any second layout interpreter is a critical architecture violation.**

## Frozen Architecture

```
LayoutSnapshot
     ↓
renderLayoutToHTML()   ← SOLE INTERPRETER (PreviewService.ts)
     ↓
    HTML
     ↓
 ┌──────────────┐
 ▼              ▼
Preview         Print
(Chromium)   (SumatraPDF)
```

## Immutable Contracts

### 1. Layout Contract
- `LayoutSnapshot` is defined only in `electron/preview-service/PreviewService.ts`
- No other module may import or reference `LayoutSnapshot`
- `renderLayoutToHTML()` is the ONLY `layout → HTML` interpreter
- Violation = immediate process exit

### 2. Rendering Contract
- `renderLayoutToHTML()` exists exactly once in the entire codebase
- `renderElementToHTML()` is a private helper — not a standalone interpreter
- Any second `layout → HTML` conversion function = architecture violation
- Violation detected at import time by `contract-guard.ts`

### 3. Preview Contract
- Input: `html: string` ONLY
- Output: `PreviewArtifact` (PDF / PNG)
- Forbidden: `LayoutSnapshot` as input, `PrintService` import, `execFile` usage
- Guard: `contract-guard.ts` + runtime HTML validation in `render()`

### 4. Print Contract
- Input: `PrintPayload.filePath` (must end with `.pdf`)
- Output: `{ jobId, executor, status: 'submitted' }` ONLY
- Forbidden: `LayoutSnapshot` import, `renderLayoutToHTML` import, `PreviewService` import
- Guard: `contract-guard.ts` + runtime `.pdf` extension validation in `executeOnly()`

### 5. Binary Contract
- `getSumatraPath()` is the ONLY SumatraPDF path resolver
- Constructor hard-fail if binary missing
- Forbidden: PATH scan, registry lookup, ProgramFiles scan, fallback paths

## Enforcement Mechanisms

### Layer 1: Runtime Guards (import time)
- `electron/architecture/contract-guard.ts`
- Validates module source code for forbidden imports
- Violation → `process.exit(1)` with diagnostic message
- Called in both `PrintService.ts` and `PreviewService.ts`

### Layer 2: Build-Time Static Scan
- `electron/architecture/scan-contracts.ts`
- Grep-based scan for forbidden patterns
- CI integration point
- Fails build on any violation

### Layer 3: Forbidden Dependency List
- `electron/architecture/forbidden-deps.ts`
- Centralized rule definition
- TypeScript types enforce rule structure
- Rules are self-documenting

### Layer 4: Frozen Documentation
- This file (`ARCHITECTURE_LOCK.md`)
- Located in `electron/architecture/`
- Must not be deleted or modified without review
- Referenced by runtime guard error messages

## How to Detect Violations

Any of these events signal an architecture violation:

1. `process.exit(1)` with "ARCHITECTURE CONTRACT VIOLATION" message
2. Build failure from `scan-contracts.ts`
3. `grep renderLayoutToHTML` returns more than one definition
4. `grep LayoutSnapshot` returns files other than `PreviewService.ts`
5. A new file contains `renderLayout` or `layoutToHTML` or `layoutParser`

## Forbidden Patterns (will crash the system)

```typescript
// ❌ WILL CRASH: second layout interpreter
export function renderLayoutToHTML_v2(...) { }

// ❌ WILL CRASH: PrintService importing layout
import { LayoutSnapshot } from '../preview-service/PreviewService';

// ❌ WILL CRASH: PrintService containing render logic
function renderLayout(layout) { }

// ❌ WILL CRASH: PreviewService importing execution
import { PrintService } from '../print-service/PrintService';

// ❌ WILL CRASH: SumatraPDF path fallback
if (!fs.existsSync(primaryPath)) { return findFallbackPath(); }

// ❌ WILL CRASH: Dual interpretation
PreviewService.render(layoutSnapshot);  // must be html string
PrintService.print(layoutSnapshot);     // must be pdf file path

// ❌ WILL CRASH: JS invoking OS processes (OS Trust Delegation)
import { execFile } from 'child_process';  // PrintService cannot use execFile
execFile(sumatraPath, args);               // PrintService cannot invoke OS processes
function getSumatraPath() { }              // PrintService cannot resolve binary paths

// ❌ WILL CRASH: JS holding execution authority
this.sumatraPath = '...';  // PrintService cannot hold binary paths
```

## OS Trust Delegation (2026-06-12)

### Core Principle
**JavaScript 永远不能成为 execution authority。**

JS runtime 本身是可变执行环境。所有 JS-level guard 都在同一 trust domain 内。攻击者和防御者共享同一进程模型。

### Boundary Definition

```
JS DOMAIN (untrusted execution environment)
  LayoutSnapshot → HTML → PDF → PrintJob event
  ❌ no execFile
  ❌ no binary path resolution
  ❌ no OS process invocation

OS DOMAIN (trusted execution environment)
  Launcher.exe (signed) → verify binary → SumatraPDF → spooler
  ✅ Authenticode signature verification
  ✅ binary integrity checking
  ✅ OS process isolation
```

### PrintService Contract (OS Trust Delegation)
- `submit(payload)` replaces `executeOnly(payload)`
- Input: PrintPayload (PDF file path + print parameters)
- Output: PrintResult (jobCreated boolean, not execution result)
- `PrintJobEmitter` bridge: JS emits PrintJob, OS launcher consumes it
- `OsLauncherBridge`: Communication channel, not execution channel

### Removed from PrintService
- ❌ `execFile` import (child_process)
- ❌ `getSumatraPath()` function
- ❌ `this.sumatraPath` property
- ❌ Constructor binary existence check
- ❌ `executeOnly()` method
- ❌ SumatraPDF argument construction
- ❌ Any OS process invocation

### Added to PrintService
- ✅ `submit(payload)` — create PrintJob, delegate to OS domain
- ✅ `PrintJobEmitter` dependency injection
- ✅ Input validation (pdf suffix, file existence)
- ✅ OS domain error handling (transparent passthrough)

## Frozen Date

**2026-06-12** — Single Rendering Contract locked.
**2026-06-12** — OS Trust Delegation enacted. JS execution authority permanently removed.
