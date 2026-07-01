/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  FORBIDDEN DEPENDENCY LIST — Architecture Immunization         ║
 * ║                                                                  ║
 * ║  This file defines dependency rules that MUST NOT be violated.   ║
 * ║  The contract guard validates these rules at startup.            ║
 * ║  Violation = immediate process.exit(1).                          ║
 * ║                                                                  ║
 * ║  THIS FILE IS PART OF THE ARCHITECTURE LOCK.                     ║
 * ║  DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─── Type Definitions ─────────────────────────────────────────────

export type ForbiddenDependency = Readonly<{
  /** The module that must NOT contain the forbidden import */
  readonly module: string;
  /** The import pattern that is forbidden */
  readonly forbidden: string;
  /** Human-readable reason */
  readonly reason: string;
  /** Severity: 'fatal' = process.exit, 'warn' = console.error */
  readonly severity: 'fatal' | 'warn';
}>;

export type ForbiddenDependencyRuleSet = Readonly<{
  readonly name: string;
  readonly description: string;
  readonly rules: ReadonlyArray<ForbiddenDependency>;
}>;

// ─── SINGLE RENDERING CONTRACT — FORBIDDEN DEPENDENCIES ───────────

export const FORBIDDEN_DEPENDENCIES: ForbiddenDependencyRuleSet = {
  name: 'Single Rendering Contract',
  description:
    'Enforces that layout is interpreted exactly once, ' +
    'and that Preview and Print are independent renderers consuming the same HTML source.',
  rules: [
    // ── PrintService must never import layout/rendering ──
    {
      module: 'electron/print-service/PrintService.ts',
      forbidden: 'LayoutSnapshot',
      reason: 'PrintService must only consume pre-generated PDF files',
      severity: 'fatal',
    },
    {
      module: 'electron/print-service/PrintService.ts',
      forbidden: 'renderLayoutToHTML',
      reason: 'PrintService must not interpret layout — use renderLayoutToHTML() externally',
      severity: 'fatal',
    },
    {
      module: 'electron/print-service/PrintService.ts',
      forbidden: 'PreviewService',
      reason: 'PrintService must not depend on preview rendering',
      severity: 'fatal',
    },
    {
      module: 'electron/print-service/PrintService.ts',
      forbidden: 'renderToHTML',
      reason: 'PrintService must not contain any rendering logic',
      severity: 'fatal',
    },

    // ── PreviewService must never import execution layer ──
    {
      module: 'electron/preview-service/PreviewService.ts',
      forbidden: 'PrintService',
      reason: 'PreviewService must not depend on print execution',
      severity: 'fatal',
    },
    {
      module: 'electron/preview-service/PreviewService.ts',
      forbidden: 'execFile',
      reason: 'PreviewService must not execute OS processes',
      severity: 'fatal',
    },
    {
      module: 'electron/preview-service/PreviewService.ts',
      forbidden: 'SumatraPDF',
      reason: 'PreviewService must not interact with SumatraPDF',
      severity: 'fatal',
    },

    // ── No second layout interpreter anywhere ──
    {
      module: '*',
      forbidden: 'renderLayoutToHTML',
      reason: 'renderLayoutToHTML() is the ONLY layout interpreter — must not be duplicated',
      severity: 'warn',
      // This rule is a warning because it matches PreviewService.ts itself.
      // The contract guard handles the "only one definition" check separately.
    },

    // ── No module shall import both Preview and Print ──
    {
      module: '*',
      forbidden: 'from.*preview-service.*PrintService|from.*print-service.*PreviewService',
      reason: 'Preview and Print must be consumed independently — no module can bridge them',
      severity: 'fatal',
    },
  ],
};

// ─── Self-check: this file must not be importable by forbidden modules ───

export const FORBIDDEN_DEPENDENCIES_SELF_GUARD = true;
