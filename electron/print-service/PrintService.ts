/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ARCHITECTURE PHASE: OS TRUST DELEGATION                        ║
 * ║                                                                  ║
 * ║  JS DOMAIN = Rendering only.                                     ║
 * ║  JavaScript 永远不能成为 execution authority。                    ║
 * ║                                                                  ║
 * ║  ❌ 不再使用 execFile                                            ║
 * ║  ❌ 不再持有 this.sumatraPath                                    ║
 * ║  ❌ 不再设计 JS 层 binary path                                   ║
 * ║  ❌ 不再尝试"保护执行调用点"                                      ║
 * ║  ❌ 不再扩展 contract-guard / AST scanner 到执行层               ║
 * ║                                                                  ║
 * ║  ✅ JS 只生成 PDF 并发出 PrintJob 事件                           ║
 * ║  ✅ OS 签名 launcher 负责执行                                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * SINGLE RENDERING CONTRACT:
 * - LayoutSnapshot → renderLayoutToHTML() → HTML → PDF
 * - PrintService 只消费预生成的 PDF file path
 * - PrintService 不调用任何 OS process
 * - PrintService 发出 PrintJob 事件，由 OS launcher 消费
 */

import * as fs from 'fs';
import type { PrintJob, PrintJobEmitter, OsPrintResult } from './os-boundary-contract';

// CONTRACT: Single Rendering Pipeline compliant
// CONTRACT: OS Trust Delegation compliant
// This module is guarded by: electron/architecture/contract-guard.ts

import { validateContract } from '../architecture/contract-guard';

// ✅ Validate architecture contract at import time (FATAL if violated)
validateContract('PrintService', 'print-service/PrintService.ts');

// ─── 类型定义 ─────────────────────────────────────────────────────

/**
 * PrintPayload: JS 域可以持有的唯一打印输入。
 *
 * 只包含数据描述 — 不包含执行路径、binary 引用、OS process 参数。
 */
export type PrintPayload = Readonly<{
  /** 预生成的 PDF 文件绝对路径（由上层渲染管道产生） */
  readonly filePath: string;
  /** 目标打印机名称（可选） */
  readonly printerName?: string;
  /** 纸张尺寸 */
  readonly paperSize: string;
  /** 打印方向 */
  readonly orientation: 'portrait' | 'landscape';
}>;

/**
 * PrintResult: JS 域的打印结果 — 只表示事件已发出，不表示打印已执行。
 *
 * JS 不知道打印是否成功。
 * JS 不知道 spooler 状态。
 * JS 不知道文件是否被消费。
 * JS 只知道 PrintJob 已被创建并移交 OS domain。
 */
export type PrintResult = Readonly<{
  /** 是否成功创建 PrintJob 并移交 */
  readonly jobCreated: boolean;
  /** PrintJob 创建时间 */
  readonly createdAt: string;
  /** OS domain 返回结果（仅用于审计日志） */
  readonly osResult?: OsPrintResult;
  /** 错误信息 */
  readonly error?: string;
}>;

// ─── Print Service ────────────────────────────────────────────────

/**
 * PrintService — JS 渲染域的唯一打印出口
 *
 * 职责：
 * 1. 验证 PDF 文件存在且具有 .pdf 扩展名
 * 2. 构造 PrintJob（数据描述，不包含执行参数）
 * 3. 通过 PrintJobEmitter 将 PrintJob 移交 OS domain
 *
 * ❌ 禁止：
 * - execFile
 * - child_process
 * - binary path resolution
 * - SumatraPDF path
 * - SumatraPDF execution
 * - any OS process invocation
 * - this.sumatraPath
 * - getSumatraPath()
 */
export class PrintService {
  private readonly emitter: PrintJobEmitter;

  /**
   * @param emitter — PrintJobEmitter 实例。
   *   生产环境中由 Electron main process 提供（通过 IPC 桥接 OS launcher）。
   *   测试环境中可以是 mock / stub。
   */
  constructor(emitter: PrintJobEmitter) {
    this.emitter = emitter;
  }

  /**
   * 创建 PrintJob 并移交 OS domain。
   *
   * JS 域只做：
   * 1. 验证输入
   * 2. 构造 PrintJob
   * 3. 发出事件
   *
   * 语义要求：
   * ❌ 不知道是否成功打印
   * ❌ 不知道 spooler 状态
   * ❌ 不知道文件是否被消费
   * ❌ 不做任何 OS process 调用
   */
  async submit(payload: PrintPayload): Promise<PrintResult> {
    console.log('[PRINT] new pipeline invoked');
    // ── Step 1: 验证输入（JS domain validation only）──
    if (!payload.filePath) {
      return this.fail('filePath is required');
    }

    if (!payload.filePath.toLowerCase().endsWith('.pdf')) {
      return this.fail('filePath must be a .pdf file');
    }

    if (!fs.existsSync(payload.filePath)) {
      return this.fail(`PDF file not found: ${payload.filePath}`);
    }

    if (!payload.paperSize) {
      return this.fail('paperSize is required');
    }

    // ── Step 2: 构造 PrintJob ──
    const printJob: PrintJob = {
      pdfPath: payload.filePath,
      paperSize: payload.paperSize,
      orientation: payload.orientation,
      printerName: payload.printerName,
      createdAt: new Date().toISOString(),
    };

    // ── Step 3: 移交 OS domain ──
    try {
      const osResult = await this.emitter.emit(printJob);
      return {
        jobCreated: true,
        createdAt: printJob.createdAt,
        osResult,
      };
    } catch (err: any) {
      return this.fail(`OS domain error: ${err?.message || 'unknown'}`);
    }
  }

  private fail(error: string): PrintResult {
    return {
      jobCreated: false,
      createdAt: new Date().toISOString(),
      error,
    };
  }
}

export default PrintService;
