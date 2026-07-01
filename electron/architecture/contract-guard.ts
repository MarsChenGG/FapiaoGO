/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CONTRACT GUARD — Architecture Immunization                    ║
 * ║                                                                  ║
 * ║  Purpose: Make it IMPOSSIBLE to accidentally violate the        ║
 * ║  Single Rendering Contract at runtime.                           ║
 * ║                                                                  ║
 * ║  Mechanism:                                                      ║
 * ║  - Each guarded module calls validateContract() on import       ║
 * ║  - validateContract() reads its own module's source             ║
 * ║  - Checks for forbidden imports / patterns                      ║
 * ║  - Violation → process.exit(1) with diagnostic message          ║
 * ║                                                                  ║
 * ║  THIS FILE IS PART OF THE ARCHITECTURE LOCK.                     ║
 * ║  DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────────

type GuardRule = Readonly<{
  /** Pattern to search for in source code (string or regex) */
  readonly pattern: string | RegExp;
  /** Description of the violation */
  readonly message: string;
}>;

type GuardResult = Readonly<{
  readonly passed: boolean;
  readonly violations: ReadonlyArray<string>;
}>;

// ─── Guard Definitions ─────────────────────────────────────────────

/**
 * PrintService Guard Rules
 *
 * PrintService must:
 * - Never import LayoutSnapshot
 * - Never import renderLayoutToHTML
 * - Never import PreviewService
 * - Never contain render/href/html layout logic
 * - Never import execFile / child_process / spawn (OS execution)
 * - Never contain sumatraPath / getSumatraPath (binary resolution)
 */
const PRINT_SERVICE_GUARD_RULES: ReadonlyArray<GuardRule> = [
  {
    pattern: /import\s+.*LayoutSnapshot/,
    message: '[FATAL CONTRACT VIOLATION] PrintService cannot import LayoutSnapshot',
  },
  {
    pattern: /import\s+.*renderLayoutToHTML/,
    message: '[FATAL CONTRACT VIOLATION] PrintService cannot import renderLayoutToHTML',
  },
  {
    pattern: /from\s+['"].*preview-service/,
    message: '[FATAL CONTRACT VIOLATION] PrintService cannot import from preview-service',
  },
  {
    pattern: /import\s+.*PreviewService/,
    message: '[FATAL CONTRACT VIOLATION] PrintService cannot import PreviewService',
  },
  // ── OS Trust Delegation: JS 不能拥有执行权限 ──
  {
    pattern: /execFile|child_process|spawn\(|exec\(/,
    message: '[FATAL CONTRACT VIOLATION] PrintService cannot call OS processes — execution is delegated to OS launcher',
  },
  {
    pattern: /sumatraPath|getSumatraPath/,
    message: '[FATAL CONTRACT VIOLATION] PrintService cannot resolve binary paths — binary selection is delegated to OS launcher',
  },
];

/**
 * PreviewService Guard Rules
 *
 * PreviewService must:
 * - Never import PrintService
 * - Never import execFile / child_process (except for its own render)
 * - Never import SumatraPDF
 */
const PREVIEW_SERVICE_GUARD_RULES: ReadonlyArray<GuardRule> = [
  {
    pattern: /from\s+['"].*print-service/,
    message: '[FATAL CONTRACT VIOLATION] PreviewService cannot import from print-service',
  },
  {
    pattern: /import\s+.*PrintService/,
    message: '[FATAL CONTRACT VIOLATION] PreviewService cannot import PrintService',
  },
  {
    pattern: /SumatraPDF/,
    message: '[FATAL CONTRACT VIOLATION] PreviewService cannot reference SumatraPDF',
  },
];

// ─── Guard Registry ────────────────────────────────────────────────

type GuardEntry = Readonly<{
  readonly modulePath: string;
  readonly rules: ReadonlyArray<GuardRule>;
}>;

const GUARD_REGISTRY: ReadonlyArray<GuardEntry> = [
  {
    modulePath: 'print-service/PrintService.ts',
    rules: PRINT_SERVICE_GUARD_RULES,
  },
  {
    modulePath: 'preview-service/PreviewService.ts',
    rules: PREVIEW_SERVICE_GUARD_RULES,
  },
];

// ─── Core Validation Logic ─────────────────────────────────────────

/**
 * Validate a module's source code against its guard rules.
 *
 * @param sourceCode - The raw source code of the module
 * @param rules - The guard rules to check against
 * @returns GuardResult with violations
 */
function validateSource(sourceCode: string, rules: ReadonlyArray<GuardRule>): GuardResult {
  const violations: string[] = [];

  for (const rule of rules) {
    const result =
      rule.pattern instanceof RegExp
        ? rule.pattern.test(sourceCode)
        : sourceCode.includes(rule.pattern);

    if (result) {
      violations.push(rule.message);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Find a module's source file on disk.
 *
 * Tries multiple strategies:
 * 1. __dirname relative (development)
 * 2. process.resourcesPath relative (packaged)
 */
function findModuleSource(modulePath: string): string | null {
  const candidates = [
    path.join(__dirname, '..', modulePath),
    path.join(process.resourcesPath, 'app', 'electron', modulePath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Run contract validation for a specific module.
 *
 * Called at module import time. If violations found, process exits immediately.
 *
 * @param moduleName - Human-readable name for error messages
 * @param modulePath - Relative path from electron/ to the module file
 */
export function validateContract(moduleName: string, modulePath: string): void {
  const entry = GUARD_REGISTRY.find((g) => g.modulePath === modulePath);
  if (!entry) {
    console.warn(`[CONTRACT GUARD] No guard rules registered for: ${moduleName}`);
    return;
  }

  const sourceFile = findModuleSource(modulePath);

  if (!sourceFile) {
    // In production (packaged), source files may not be readable.
    // Contract enforcement is handled at build time by CI.
    console.log(`[CONTRACT GUARD] Source file not found for ${moduleName} — skipping runtime check (production mode)`);
    return;
  }

  let sourceCode: string;
  try {
    sourceCode = fs.readFileSync(sourceFile, 'utf-8');
  } catch {
    console.warn(`[CONTRACT GUARD] Cannot read source for ${moduleName} at ${sourceFile}`);
    return;
  }

  const result = validateSource(sourceCode, entry.rules);

  if (!result.passed) {
    console.error(`\n╔══════════════════════════════════════════════════════╗`);
    console.error(`║  ARCHITECTURE CONTRACT VIOLATION DETECTED           ║`);
    console.error(`║  Module: ${moduleName.padEnd(44)}║`);
    console.error(`╠══════════════════════════════════════════════════════╣`);
    for (const violation of result.violations) {
      console.error(`║  ${violation.padEnd(50)}║`);
    }
    console.error(`╠══════════════════════════════════════════════════════╣`);
    console.error(`║  The Single Rendering Contract has been violated.    ║`);
    console.error(`║  This module contains forbidden dependencies.        ║`);
    console.error(`║  Fix the imports before continuing.                  ║`);
    console.error(`║  See: electron/architecture/ARCHITECTURE_LOCK.md     ║`);
    console.error(`╚══════════════════════════════════════════════════════╝\n`);

    // FATAL: exit immediately to prevent runtime corruption
    process.exit(1);
  }

  console.log(`[CONTRACT GUARD] ✅ ${moduleName} passed architecture contract validation`);
}

/**
 * Run ALL contract validations at startup.
 *
 * Should be called once during app initialization.
 */
export function validateAllContracts(): void {
  console.log('[CONTRACT GUARD] Running architecture contract validation...');

  let allPassed = true;

  for (const entry of GUARD_REGISTRY) {
    const sourceFile = findModuleSource(entry.modulePath);

    if (!sourceFile) {
      console.log(`[CONTRACT GUARD] ⚠️  Cannot find source for ${entry.modulePath} — skipping`);
      continue;
    }

    let sourceCode: string;
    try {
      sourceCode = fs.readFileSync(sourceFile, 'utf-8');
    } catch {
      console.log(`[CONTRACT GUARD] ⚠️  Cannot read source for ${entry.modulePath} — skipping`);
      continue;
    }

    const result = validateSource(sourceCode, entry.rules);

    if (!result.passed) {
      allPassed = false;
      console.error(`[CONTRACT GUARD] ❌ ${entry.modulePath}:`);
      for (const violation of result.violations) {
        console.error(`   ${violation}`);
      }
    } else {
      console.log(`[CONTRACT GUARD] ✅ ${entry.modulePath}`);
    }
  }

  if (!allPassed) {
    console.error('\n[CONTRACT GUARD] ❌ Architecture contract violations detected. Exiting.\n');
    process.exit(1);
  }

  console.log('[CONTRACT GUARD] ✅ All architecture contracts passed.\n');
}
