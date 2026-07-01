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

const fs = require('fs');
const path = require('path');

// ─── Guard Definitions ─────────────────────────────────────────────

/**
 * PrintService Guard Rules
 *
 * PrintService must:
 * - Never import LayoutSnapshot
 * - Never import renderLayoutToHTML
 * - Never import PreviewService
 * - Never contain render/href/html layout logic (require or import)
 * - Never require(execFile / child_process / spawn)
 * - Never contain sumatraPath / getSumatraPath (binary resolution)
 */
const PRINT_SERVICE_GUARD_RULES = [
  { pattern: /LayoutSnapshot/,                              message: '[FATAL VIOLATION] PrintService cannot reference LayoutSnapshot' },
  { pattern: /renderLayoutToHTML/,                          message: '[FATAL VIOLATION] PrintService cannot reference renderLayoutToHTML' },
  { pattern: /preview-service/,                             message: '[FATAL VIOLATION] PrintService cannot require from preview-service' },
  { pattern: /PreviewService/,                              message: '[FATAL VIOLATION] PrintService cannot reference PreviewService' },
  { pattern: /\bexecFile\b/,                                message: '[FATAL VIOLATION] PrintService cannot call execFile' },
  { pattern: /\bchild_process\b/,                           message: '[FATAL VIOLATION] PrintService cannot require child_process' },
  { pattern: /\bspawn\b/,                                   message: '[FATAL VIOLATION] PrintService cannot call spawn' },
  { pattern: /sumatraPath/,                                 message: '[FATAL VIOLATION] PrintService cannot reference sumatraPath' },
  { pattern: /getSumatraPath/,                              message: '[FATAL VIOLATION] PrintService cannot reference getSumatraPath' },
  { pattern: /webContents\.print\b/,                        message: '[FATAL VIOLATION] PrintService cannot call webContents.print' },
  { pattern: /BrowserWindow/,                               message: '[FATAL VIOLATION] PrintService cannot use BrowserWindow' },
];

/**
 * PreviewService Guard Rules
 */
const PREVIEW_SERVICE_GUARD_RULES = [
  { pattern: /print-service/,                               message: '[FATAL VIOLATION] PreviewService cannot require from print-service' },
  { pattern: /\bPrintService\b/,                            message: '[FATAL VIOLATION] PreviewService cannot reference PrintService' },
  { pattern: /SumatraPDF/,                                  message: '[FATAL VIOLATION] PreviewService cannot reference SumatraPDF' },
  { pattern: /\bexecFile\b/,                                message: '[FATAL VIOLATION] PreviewService cannot call execFile' },
  { pattern: /\bchild_process\b/,                           message: '[FATAL VIOLATION] PreviewService cannot require child_process' },
];

// ─── Guard Registry ────────────────────────────────────────────────

const GUARD_REGISTRY = [
  { modulePath: 'print-service/PrintService.js', rules: PRINT_SERVICE_GUARD_RULES },
  { modulePath: 'preview-service/PreviewService.ts', rules: PREVIEW_SERVICE_GUARD_RULES },
];

// ─── Core Validation Logic ─────────────────────────────────────────

/**
 * Validate a module's source code against its guard rules.
 * @param {string} sourceCode - The raw source code of the module
 * @param {Array} rules - The guard rules to check against
 * @returns {{ passed: boolean, violations: string[] }}
 */
function validateSource(sourceCode, rules) {
  const violations = [];

  for (const rule of rules) {
    if (rule.pattern instanceof RegExp) {
      if (rule.pattern.test(sourceCode)) {
        violations.push(rule.message);
      }
    } else if (typeof rule.pattern === 'string' && sourceCode.includes(rule.pattern)) {
      violations.push(rule.message);
    }
  }

  return { passed: violations.length === 0, violations };
}

/**
 * Find a module's source file on disk.
 * @param {string} modulePath
 * @returns {string|null}
 */
function findModuleSource(modulePath) {
  const candidates = [path.join(__dirname, '..', modulePath)];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app', 'electron', modulePath));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Run contract validation for a specific module.
 * Called at module import time. If violations found, process exits immediately.
 *
 * @param {string} moduleName - Human-readable name for error messages
 * @param {string} modulePath - Relative path from electron/ to the module file
 */
function validateContract(moduleName, modulePath) {
  const entry = GUARD_REGISTRY.find((g) => g.modulePath === modulePath);
  if (!entry) {
    console.warn(`[CONTRACT GUARD] No guard rules registered for: ${moduleName}`);
    return;
  }

  const sourceFile = findModuleSource(modulePath);

  if (!sourceFile) {
    // In production (packaged), source files may not be readable.
    console.log(`[CONTRACT GUARD] Source file not found for ${moduleName} — skipping runtime check (production mode)`);
    return;
  }

  let sourceCode;
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
 * Should be called once during app initialization.
 */
function validateAllContracts() {
  console.log('[CONTRACT GUARD] Running architecture contract validation...');

  let allPassed = true;

  for (const entry of GUARD_REGISTRY) {
    const sourceFile = findModuleSource(entry.modulePath);

    if (!sourceFile) {
      console.log(`[CONTRACT GUARD] ⚠️  Cannot find source for ${entry.modulePath} — skipping`);
      continue;
    }

    let sourceCode;
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

module.exports = { validateContract, validateAllContracts };
