/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  DOWNGRADED — Use ast-contract-scanner.ts instead           ║
 * ║                                                                  ║
 * ║  This regex-based scanner is a FAST FIRST-PASS filter.           ║
 * ║  It catches obvious keyword-level violations quickly.            ║
 * ║                                                                  ║
 * ║  The AUTHORITATIVE scanner is:                                   ║
 * ║    electron/architecture/ast-contract-scanner.ts                  ║
 * ║                                                                  ║
 * ║  AST scanner provides semantic-level enforcement:                ║
 * ║  - Detects computation INTENT, not keyword occurrence            ║
 * ║  - Cannot be bypassed by renaming functions                      ║
 * ║  - Detects hidden interpreters via body analysis                 ║
 * ║  - Validates against the renderer registry                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Scan Rules ────────────────────────────────────────────────────

type ScanRule = Readonly<{
  readonly id: string;
  /** Glob or file path to check */
  readonly target: string;
  /** Pattern to search for */
  readonly pattern: string | RegExp;
  /** Expected max occurrences (0 = must not exist) */
  readonly maxOccurrences: number;
  /** Description */
  readonly description: string;
  /** Severity */
  readonly severity: 'error' | 'warn';
}>;

const SCAN_RULES: ReadonlyArray<ScanRule> = [
  // ── LayoutSnapshot must only exist in PreviewService ──
  {
    id: 'LAYOUT_SNAPSHOT_SCOPE',
    target: 'electron/**/*.ts',
    pattern: 'LayoutSnapshot',
    maxOccurrences: 0,
    description:
      'LayoutSnapshot must ONLY be defined in PreviewService.ts. ' +
      'Any import by PrintService is a FATAL violation.',
    severity: 'error',
  },

  // ── renderLayoutToHTML must only exist in PreviewService ──
  {
    id: 'RENDER_LAYOUT_SINGLE_SOURCE',
    target: 'electron/**/*.ts',
    pattern: 'renderLayoutToHTML',
    maxOccurrences: 1,
    description:
      'renderLayoutToHTML() must exist exactly once — in PreviewService.ts. ' +
      'Any second definition is a FATAL architecture violation.',
    severity: 'error',
  },

  // ── PrintService must never contain html/render ──
  {
    id: 'PRINT_NO_RENDER',
    target: 'electron/print-service/**/*.ts',
    pattern: /renderToHTML|renderLayout|renderElement/,
    maxOccurrences: 0,
    description:
      'PrintService must not contain any rendering logic. ' +
      'It must only consume pre-generated PDF files.',
    severity: 'error',
  },

  // ── PrintService must never import LayoutSnapshot ──
  {
    id: 'PRINT_NO_LAYOUT_IMPORT',
    target: 'electron/print-service/**/*.ts',
    pattern: /import\s+.*LayoutSnapshot/,
    maxOccurrences: 0,
    description:
      'PrintService must not import LayoutSnapshot. ' +
      'It must only consume PDF file paths.',
    severity: 'error',
  },

  // ── PreviewService must never import PrintService ──
  {
    id: 'PREVIEW_NO_PRINT_IMPORT',
    target: 'electron/preview-service/**/*.ts',
    pattern: /import\s+.*PrintService|from\s+['"].*print-service/,
    maxOccurrences: 0,
    description:
      'PreviewService must not import PrintService. ' +
      'Preview and Print are independent renderers.',
    severity: 'error',
  },

  // ── No SumatraPDF reference outside print-service ──
  {
    id: 'SUMATRA_SCOPE',
    target: 'electron/preview-service/**/*.ts',
    pattern: /SumatraPDF/,
    maxOccurrences: 0,
    description:
      'SumatraPDF must not be referenced outside of print-service.',
    severity: 'error',
  },

  // ── No execFile in preview-service ──
  {
    id: 'PREVIEW_NO_EXEC',
    target: 'electron/preview-service/**/*.ts',
    pattern: /execFile|exec\(|spawn\(/,
    maxOccurrences: 0,
    description:
      'PreviewService must not execute OS processes. ' +
      'It must only use Chromium for rendering.',
    severity: 'error',
  },

  // ── No fallback path logic in SumatraPDF resolution ──
  {
    id: 'NO_SUMATRA_FALLBACK',
    target: 'electron/print-service/**/*.ts',
    pattern: /fallback|scanPath|detectExecutable|tryPath/,
    maxOccurrences: 0,
    description:
      'SumatraPDF path resolution must not contain fallback logic. ' +
      'getSumatraPath() is the single source of truth.',
    severity: 'error',
  },
];

// ─── Exceptions (valid occurrences) ────────────────────────────────

const ALLOWED_OCCURRENCES: Readonly<Record<string, ReadonlyArray<string>>> = {
  // LayoutSnapshot is allowed in PreviewService.ts (definition)
  LAYOUT_SNAPSHOT_SCOPE: ['electron/preview-service/PreviewService.ts'],

  // renderLayoutToHTML is allowed exactly once in PreviewService.ts
  RENDER_LAYOUT_SINGLE_SOURCE: ['electron/preview-service/PreviewService.ts'],
};

// ─── Scanner Implementation ────────────────────────────────────────

function findFiles(glob: string): string[] {
  const [dir, pattern] = glob.split('/').reduce(
    ([d, p], part, i, arr) => {
      if (part.includes('*')) {
        return [d, arr.slice(i).join('/')] as [string, string];
      }
      return [path.join(d, part), p] as [string, string];
    },
    ['.', ''] as [string, string]
  );

  const results: string[] = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && fullPath.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function grepInFile(filePath: string, pattern: string | RegExp): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    if (pattern instanceof RegExp) {
      return (content.match(new RegExp(pattern.source, 'g')) || []).length;
    }

    // String pattern: count occurrences
    let count = 0;
    let idx = 0;
    while ((idx = content.indexOf(pattern, idx)) !== -1) {
      count++;
      idx += pattern.length;
    }
    return count;
  } catch {
    return 0;
  }
}

interface ScanResult {
  readonly ruleId: string;
  readonly passed: boolean;
  readonly violations: string[];
}

function runScan(): { allPassed: boolean; results: ScanResult[] } {
  const results: ScanResult[] = [];
  let allPassed = true;

  for (const rule of SCAN_RULES) {
    const files = findFiles(rule.target);
    const allowed = ALLOWED_OCCURRENCES[rule.id] || [];
    const violations: string[] = [];
    let totalHits = 0;

    for (const file of files) {
      const relativePath = file.replace(/\\/g, '/');
      const hits = grepInFile(file, rule.pattern);

      if (hits > 0) {
        totalHits += hits;
        if (!allowed.includes(relativePath)) {
          violations.push(`  ${relativePath} (${hits} occurrence${hits > 1 ? 's' : ''})`);
        }
      }
    }

    // Calculate effective hits: subtract allowed occurrences
    let effectiveHits = totalHits;
    for (const allowedFile of allowed) {
      const hits = grepInFile(allowedFile, rule.pattern);
      effectiveHits -= hits;
    }

    const passed = rule.maxOccurrences === 0
      ? effectiveHits === 0
      : effectiveHits <= rule.maxOccurrences;

    if (!passed) {
      allPassed = false;
    }

    results.push({ ruleId: rule.id, passed, violations });
  }

  return { allPassed, results };
}

// ─── Main ──────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  STATIC CONTRACT SCANNER                            ║');
  console.log('║  Single Rendering Contract Enforcement              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const { allPassed, results } = runScan();

  let errorCount = 0;
  let warnCount = 0;

  for (const result of results) {
    const rule = SCAN_RULES.find((r) => r.id === result.ruleId)!;
    const icon = result.passed ? '✅' : rule.severity === 'error' ? '❌' : '⚠️';

    console.log(`${icon} ${rule.id}`);
    console.log(`   ${rule.description}`);

    if (!result.passed) {
      for (const violation of result.violations) {
        console.log(`   → ${violation}`);
      }
      if (rule.severity === 'error') errorCount++;
      else warnCount++;
    }
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('✅ ALL CONTRACTS PASSED');
    console.log('   Single Rendering Contract is enforced.');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log(`❌ SCAN FAILED: ${errorCount} error(s), ${warnCount} warning(s)`);
    console.log('   See: electron/architecture/ARCHITECTURE_LOCK.md');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}

main();
