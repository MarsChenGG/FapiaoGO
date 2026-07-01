/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SEMANTIC RENDERER REGISTRY — Architecture Contract Core       ║
 * ║                                                                  ║
 * ║  This is the SINGLE SOURCE OF TRUTH for renderer roles.         ║
 * ║  Any function performing layout→markup transformation MUST       ║
 * ║  be registered here.                                             ║
 * ║                                                                  ║
 * ║  VIOLATION: Any unregistered function matching renderer role    ║
 * ║  = process.exit(1)                                               ║
 * ║                                                                  ║
 * ║  THIS FILE IS FROZEN. DO NOT MODIFY WITHOUT REVIEW.              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─── Role Definitions ──────────────────────────────────────────────

export type RendererRole =
  | 'layout-interpreter'    // layout → HTML (MUST BE UNIQUE)
  | 'preview-renderer'      // HTML → PDF/PNG
  | 'print-executor'        // PDF → SumatraPDF
  | 'neutral';              // no rendering role

export type RegisteredRenderer = Readonly<{
  /** Fully qualified function name */
  readonly functionName: string;
  /** Module path relative to electron/ */
  readonly modulePath: string;
  /** Semantic role */
  readonly role: RendererRole;
  /** Description of observed semantic pattern */
  readonly pattern: string;
}>;

// ─── THE REGISTRY ──────────────────────────────────────────────────

/**
 * ALL registered renderers.
 *
 * RULES:
 * - `layout-interpreter` role: EXACTLY ONE entry allowed
 * - `preview-renderer` role: max one entry per module
 * - `print-executor` role: max one entry per module
 * - Any function matching a renderer role NOT in this list = VIOLATION
 */
export const RENDERER_REGISTRY: ReadonlyArray<RegisteredRenderer> = [
  {
    functionName: 'renderLayoutToHTML',
    modulePath: 'electron/preview-service/PreviewService.ts',
    role: 'layout-interpreter',
    pattern: 'LayoutSnapshot → HTML string (template construction)',
  },
  {
    functionName: 'renderElementToHTML',
    modulePath: 'electron/preview-service/PreviewService.ts',
    role: 'layout-interpreter',  // auxiliary to renderLayoutToHTML
    pattern: 'LayoutElement → HTML div (internal helper)',
  },
  {
    functionName: 'PreviewService.render',
    modulePath: 'electron/preview-service/PreviewService.ts',
    role: 'preview-renderer',
    pattern: 'HTML → PDF/PNG (Chromium headless)',
  },
  {
    functionName: 'PrintService.executeOnly',
    modulePath: 'electron/print-service/PrintService.ts',
    role: 'print-executor',
    pattern: 'PDF filePath → SumatraPDF process invocation',
  },
];

// ─── Invariant Rules ────────────────────────────────────────────────

export const REGISTRY_INVARIANTS = {
  /** layout-interpreter role must be unique */
  maxLayoutInterpreters: 1,
  /** preview-renderer role per module max */
  maxPreviewRenderersPerModule: 1,
  /** print-executor role per module max */
  maxPrintExecutorsPerModule: 1,
} as const;

// ─── Registry Validation ───────────────────────────────────────────

export function validateRegistry(): ReadonlyArray<string> {
  const errors: string[] = [];
  const layoutInterpreters = RENDERER_REGISTRY.filter(
    (r) => r.role === 'layout-interpreter'
  );

  if (layoutInterpreters.length !== REGISTRY_INVARIANTS.maxLayoutInterpreters) {
    errors.push(
      `[INVARIANT VIOLATION] Expected ${REGISTRY_INVARIANTS.maxLayoutInterpreters} ` +
      `layout-interpreter, found ${layoutInterpreters.length}`
    );
  }

  return errors;
}
