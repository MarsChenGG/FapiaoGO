/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  AST CONTRACT SCANNER — Semantic-Level Architecture Enforcement ║
 * ║                                                                  ║
 * ║  Upgrades contract enforcement from regex/text matching         ║
 * ║  to AST-level semantic analysis.                                 ║
 * ║                                                                  ║
 * ║  Detects computation INTENT, not keyword occurrence.            ║
 * ║                                                                  ║
 * ║  Usage:                                                          ║
 * ║    npx ts-node electron/architecture/ast-contract-scanner.ts     ║
 * ║                                                                  ║
 * ║  Exit: 0 = clean, 1 = semantic violations found                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { RENDERER_REGISTRY, RegisteredRenderer, RendererRole } from './semantic-renderer-registry';

// ─── Semantic Pattern Definitions ──────────────────────────────────

/**
 * Layout-like type patterns: parameter types that indicate
 * the function consumes layout data.
 */
const LAYOUT_TYPE_PATTERNS: ReadonlyArray<string> = [
  'LayoutSnapshot',
  'LayoutElement',
  'layout',
  'LayoutModel',
];

/**
 * HTML-like return type patterns: return types that indicate
 * the function produces markup/rendering output.
 */
const HTML_RETURN_PATTERNS: ReadonlyArray<string> = [
  'string',      // HTML is returned as string
  'Buffer',      // PDF/PNG is returned as Buffer
  'HtmlOutput',
  'PreviewArtifact',
  'PrintResult',
];

/**
 * Template/rendering body patterns: AST node kinds that indicate
 * template construction, string concatenation, or DOM manipulation.
 */
const TEMPLATE_BODY_KINDS: ReadonlyArray<ts.SyntaxKind> = [
  ts.SyntaxKind.TemplateExpression,     // `${...}`
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxSelfClosingElement,
  ts.SyntaxKind.TaggedTemplateExpression,
  ts.SyntaxKind.BinaryExpression,       // string concatenation via +
];

// ─── TypeScript Program Setup ──────────────────────────────────────

function createProgram(filePaths: string[]): ts.Program {
  return ts.createProgram(filePaths, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
}

function findTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Semantic Detection Rules ──────────────────────────────────────

interface DetectedFunction {
  readonly functionName: string;
  readonly filePath: string;
  readonly inferredRole: RendererRole;
  readonly reason: string;
}

interface RuleViolation {
  readonly rule: string;
  readonly filePath: string;
  readonly functionName: string;
  readonly reason: string;
}

/**
 * Rule 1: Layout Interpreter Uniqueness
 *
 * Find ALL function definitions that transform layout data → HTML/markup.
 * There must be EXACTLY ONE (renderLayoutToHTML).
 */
function detectLayoutInterpreters(
  program: ts.Program
): { functions: DetectedFunction[]; violations: RuleViolation[] } {
  const functions: DetectedFunction[] = [];
  const violations: RuleViolation[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const fileName = path.relative(process.cwd(), sourceFile.fileName).replace(/\\/g, '/');

    // Skip node_modules and non-project files
    if (fileName.includes('node_modules') || fileName.startsWith('..')) continue;

    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      // Function declarations: function foo(...) { ... }
      if (ts.isFunctionDeclaration(node) && node.name) {
        const result = analyzeFunction(node, sourceFile, fileName);
        if (result.inferredRole === 'layout-interpreter') {
          functions.push(result);
        }
      }

      // Variable declarations: const foo = (...) => { ... }
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer && (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))) {
            const funcNode = decl.initializer as ts.FunctionLikeDeclaration;
            // Create a pseudo function declaration for analysis
            const result = analyzeFunctionLike(
              funcNode,
              sourceFile,
              fileName,
              decl.name.getText(sourceFile)
            );
            if (result.inferredRole === 'layout-interpreter') {
              functions.push(result);
            }
          }
        }
      }

      // Method declarations in classes
      if (ts.isMethodDeclaration(node) && node.name) {
        const result = analyzeMethod(node, sourceFile, fileName);
        if (result.inferredRole === 'layout-interpreter') {
          functions.push(result);
        }
      }

      ts.forEachChild(node, visit);
    });
  }

  // Check uniqueness: only registered layout interpreters allowed
  const registeredInterpreters = RENDERER_REGISTRY
    .filter((r) => r.role === 'layout-interpreter')
    .map((r) => r.functionName);

  for (const fn of functions) {
    if (!registeredInterpreters.includes(fn.functionName)) {
      violations.push({
        rule: 'LAYOUT_INTERPRETER_UNIQUENESS',
        filePath: fn.filePath,
        functionName: fn.functionName,
        reason: `Unregistered layout interpreter detected: ${fn.reason}`,
      });
    }
  }

  return { functions, violations };
}

/**
 * Rule 2: Dual Rendering Path Detection
 *
 * Detect any function that takes layout-like input and produces
 * text/html output, outside of the registered renderers.
 */
function detectDualRenderingPaths(
  program: ts.Program
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const fileName = path.relative(process.cwd(), sourceFile.fileName).replace(/\\/g, '/');
    if (fileName.includes('node_modules') || fileName.startsWith('..')) continue;

    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      // Check function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const hasLayoutInput = hasLayoutLikeParameter(node, sourceFile);
        const hasHtmlOutput = hasHtmlLikeReturn(node, sourceFile);

        if (hasLayoutInput && hasHtmlOutput) {
          const fnName = node.name.getText(sourceFile);
          const isRegistered = RENDERER_REGISTRY.some((r) => r.functionName === fnName);

          if (!isRegistered) {
            violations.push({
              rule: 'DUAL_RENDERING_PATH',
              filePath: fileName,
              functionName: fnName,
              reason: `Function takes layout input → produces text output, but is not in the renderer registry`,
            });
          }
        }
      }

      // Check arrow functions assigned to variables
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const funcLike = decl.initializer as ts.FunctionLikeDeclaration;
            const hasLayoutInput = hasLayoutLikeParamInSignature(funcLike, sourceFile);
            const hasHtmlOutput = hasHtmlLikeReturnInSignature(funcLike, sourceFile);
            const fnName = decl.name.getText(sourceFile);

            if (hasLayoutInput && hasHtmlOutput) {
              const isRegistered = RENDERER_REGISTRY.some((r) => r.functionName === fnName);
              if (!isRegistered) {
                violations.push({
                  rule: 'DUAL_RENDERING_PATH',
                  filePath: fileName,
                  functionName: fnName,
                  reason: `Arrow/function expression with layout→text transform detected`,
                });
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    });
  }

  return violations;
}

/**
 * Rule 3: Hidden Interpreter Detection
 *
 * Detect function bodies that construct templates/build DOM/serialize
 * from layout-like fields, even without explicit layout type imports.
 */
function detectHiddenInterpreters(
  program: ts.Program
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const fileName = path.relative(process.cwd(), sourceFile.fileName).replace(/\\/g, '/');
    if (fileName.includes('node_modules') || fileName.startsWith('..')) continue;

    // Skip known renderer files
    const knownFiles = RENDERER_REGISTRY.map((r) => r.modulePath);
    if (knownFiles.some((kf) => fileName.includes(kf))) continue;

    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        const body = node.body;
        if (body && containsTemplateConstruction(body, sourceFile)) {
          const fnName = ts.isFunctionDeclaration(node) && node.name
            ? node.name.getText(sourceFile)
            : ts.isMethodDeclaration(node) && node.name
              ? node.name.getText(sourceFile)
              : '<anonymous>';

          violations.push({
            rule: 'HIDDEN_INTERPRETER',
            filePath: fileName,
            functionName: fnName,
            reason: `Function body contains template/DOM construction patterns suggesting hidden rendering logic`,
          });
        }
      }

      ts.forEachChild(node, visit);
    });
  }

  return violations;
}

// ─── AST Analysis Helpers ──────────────────────────────────────────

function analyzeFunction(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  fileName: string
): DetectedFunction {
  const functionName = node.name ? node.name.getText(sourceFile) : '<anonymous>';

  // Check parameters for layout-like types
  const hasLayoutInput = hasLayoutLikeParameter(node, sourceFile);

  // Check return type for HTML-like output
  const hasHtmlOutput = hasHtmlLikeReturn(node, sourceFile);

  // Check body for template construction
  const hasTemplateBody = node.body ? containsTemplateConstruction(node.body, sourceFile) : false;

  let inferredRole: RendererRole = 'neutral';
  let reason = 'No rendering role detected';

  if (hasLayoutInput && (hasHtmlOutput || hasTemplateBody)) {
    inferredRole = 'layout-interpreter';
    reason = hasTemplateBody
      ? 'Layout input + template construction body'
      : 'Layout input + HTML-like return type';
  } else if (hasLayoutInput && !hasHtmlOutput) {
    reason = 'Layout input, no HTML output detected';
  } else if (hasHtmlOutput && !hasLayoutInput) {
    reason = 'HTML output, no layout input detected';
  }

  return { functionName, filePath: fileName, inferredRole, reason };
}

function analyzeFunctionLike(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  fileName: string,
  name: string
): DetectedFunction {
  const hasLayoutInput = hasLayoutLikeParamInSignature(node, sourceFile);
  const hasHtmlOutput = hasHtmlLikeReturnInSignature(node, sourceFile);
  const hasTemplateBody = 'body' in node && node.body
    ? containsTemplateConstruction(node.body as ts.Block, sourceFile)
    : false;

  let inferredRole: RendererRole = 'neutral';
  let reason = 'No rendering role detected';

  if (hasLayoutInput && (hasHtmlOutput || hasTemplateBody)) {
    inferredRole = 'layout-interpreter';
    reason = 'Layout input + HTML output pattern';
  }

  return { functionName: name, filePath: fileName, inferredRole, reason };
}

function analyzeMethod(
  node: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  fileName: string
): DetectedFunction {
  const methodName = node.name.getText(sourceFile);
  const className = findEnclosingClassName(node, sourceFile);
  const fullName = className ? `${className}.${methodName}` : methodName;

  const hasLayoutInput = hasLayoutLikeParameter(node as ts.FunctionLikeDeclaration, sourceFile);
  const hasHtmlOutput = hasHtmlLikeReturn(node as ts.FunctionLikeDeclaration, sourceFile);
  const hasTemplateBody = node.body ? containsTemplateConstruction(node.body, sourceFile) : false;

  let inferredRole: RendererRole = 'neutral';
  let reason = 'No rendering role detected';

  if (hasLayoutInput && (hasHtmlOutput || hasTemplateBody)) {
    inferredRole = 'layout-interpreter';
    reason = 'Method with layout→HTML transformation';
  }

  return { functionName: fullName, filePath: fileName, inferredRole, reason };
}

// ─── Parameter/Return Analysis ─────────────────────────────────────

function hasLayoutLikeParameter(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  return hasLayoutLikeParamInSignature(node, sourceFile);
}

function hasLayoutLikeParamInSignature(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  for (const param of node.parameters) {
    if (param.type) {
      const typeText = param.type.getText(sourceFile);
      if (LAYOUT_TYPE_PATTERNS.some((p) => typeText.includes(p))) {
        return true;
      }
    }
  // Also check parameter name for layout-like patterns (excluding hash/version/ref)
  if (param.name) {
    const nameText = param.name.getText(sourceFile);
    // layoutSnapshot, layoutModel, layoutDoc, elements → true
    // layoutHash, layoutVersion, layoutRef → false (these are IDs, not layout data)
    if (/\blayout(?!Hash|Version|Ref|Id|Key)\w*$/i.test(nameText) && nameText !== 'layoutHash') {
      return true;
    }
    if (/^elements$/i.test(nameText)) {
      return true;
    }
  }
  }
  return false;
}

function hasHtmlLikeReturn(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  return hasHtmlLikeReturnInSignature(node, sourceFile);
}

function hasHtmlLikeReturnInSignature(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  if (node.type) {
    const returnTypeText = node.type.getText(sourceFile);
    if (HTML_RETURN_PATTERNS.some((p) => returnTypeText.includes(p))) {
      return true;
    }
  }
  return false;
}

// ─── Body Analysis ─────────────────────────────────────────────────

function containsTemplateConstruction(
  node: ts.Node,
  sourceFile: ts.SourceFile
): boolean {
  let found = false;

  function check(node: ts.Node) {
    if (found) return;

    // Template literals: `html...`
    if (ts.isTemplateExpression(node) || ts.isTaggedTemplateExpression(node)) {
      const text = node.getText(sourceFile);
      if (/<html|<div|<body|<style|class=/.test(text)) {
        found = true;
        return;
      }
    }

    // String literals containing HTML
    if (ts.isStringLiteral(node)) {
      const text = node.text;
      if (/<html|<div|<body|<style/.test(text)) {
        found = true;
        return;
      }
    }

    // String concatenation with HTML-like content
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const text = node.getText(sourceFile);
      if (/(<html|<div|position|style\s*=)/.test(text)) {
        found = true;
        return;
      }
    }

    // Return statement with string/template expression
    if (ts.isReturnStatement(node) && node.expression) {
      const exprText = node.expression.getText(sourceFile);
      if (/(TemplateExpression|TaggedTemplate|`.*html|createElement)/.test(exprText)) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, check);
  }

  check(node);
  return found;
}

function findEnclosingClassName(
  node: ts.Node,
  sourceFile: ts.SourceFile
): string | null {
  let current = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current) && current.name) {
      return current.name.getText(sourceFile);
    }
    current = current.parent;
  }
  return null;
}

// ─── Main Scanner ──────────────────────────────────────────────────

interface ScanReport {
  readonly passed: boolean;
  readonly layoutInterpreters: DetectedFunction[];
  readonly dualPathViolations: RuleViolation[];
  readonly hiddenInterpreterViolations: RuleViolation[];
  readonly registryViolations: RuleViolation[];
}

function runFullScan(electronDir: string): ScanReport {
  const files = findTsFiles(electronDir);
  const program = createProgram(files);

  const { functions: layoutInterpreters, violations: registryViolations } =
    detectLayoutInterpreters(program);

  const dualPathViolations = detectDualRenderingPaths(program);
  const hiddenInterpreterViolations = detectHiddenInterpreters(program);

  const allViolations = [
    ...registryViolations,
    ...dualPathViolations,
    ...hiddenInterpreterViolations,
  ];

  return {
    passed: allViolations.length === 0,
    layoutInterpreters,
    dualPathViolations,
    hiddenInterpreterViolations,
    registryViolations,
  };
}

// ─── CLI Entry Point ───────────────────────────────────────────────

function main() {
  const electronDir = path.resolve(__dirname, '..');

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  AST CONTRACT SCANNER — Semantic-Level Analysis      ║');
  console.log('║  Single Rendering Contract Enforcement               ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const report = runFullScan(electronDir);

  // ── Rule 1: Layout Interpreter Uniqueness ──
  console.log('─── Rule 1: Layout Interpreter Uniqueness ───');
  console.log(`Detected layout interpreters: ${report.layoutInterpreters.length}`);
  for (const fn of report.layoutInterpreters) {
    const isRegistered = RENDERER_REGISTRY.some((r) => r.functionName === fn.functionName);
    const icon = isRegistered ? '✅' : '❌ UNREGISTERED';
    console.log(`  ${icon} ${fn.functionName} (${fn.filePath})`);
    console.log(`     Role: ${fn.inferredRole} | ${fn.reason}`);
  }

  if (report.registryViolations.length > 0) {
    console.log('\n  ❌ REGISTRY VIOLATIONS:');
    for (const v of report.registryViolations) {
      console.log(`     ${v.functionName} in ${v.filePath}: ${v.reason}`);
    }
  }

  // ── Rule 2: Dual Rendering Path ──
  console.log('\n─── Rule 2: Dual Rendering Path Detection ───');
  if (report.dualPathViolations.length === 0) {
    console.log('  ✅ No unregistered layout→text paths detected');
  } else {
    console.log(`  ❌ ${report.dualPathViolations.length} violation(s):`);
    for (const v of report.dualPathViolations) {
      console.log(`     ${v.functionName} in ${v.filePath}: ${v.reason}`);
    }
  }

  // ── Rule 3: Hidden Interpreter ──
  console.log('\n─── Rule 3: Hidden Interpreter Detection ───');
  if (report.hiddenInterpreterViolations.length === 0) {
    console.log('  ✅ No hidden rendering logic detected');
  } else {
    console.log(`  ❌ ${report.hiddenInterpreterViolations.length} violation(s):`);
    for (const v of report.hiddenInterpreterViolations) {
      console.log(`     ${v.functionName} in ${v.filePath}: ${v.reason}`);
    }
  }

  // ── Final verdict ──
  console.log('\n═══════════════════════════════════════════════════════');
  if (report.passed) {
    console.log('✅ ALL AST CONTRACTS PASSED');
    console.log('   Single Rendering Contract is semantically enforced.');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log('❌ AST CONTRACT VIOLATIONS DETECTED');
    console.log('   See: electron/architecture/ARCHITECTURE_LOCK.md');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}

main();
