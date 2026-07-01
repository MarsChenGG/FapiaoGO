/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ARCHITECTURE PHASE: OS TRUST DELEGATION                        ║
 * ║                                                                  ║
 * ║  JS DOMAIN = Rendering only                                     ║
 * ║  OS DOMAIN = Execution only                                      ║
 * ║                                                                  ║
 * ║  JavaScript 永远不能成为 execution authority。                    ║
 * ║  JS 不调用 execFile，不持有 binary path，不启动 OS process。       ║
 * ║  JS 只生成 PDF 并发出 PrintJob 事件。                             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * OS BOUNDARY CONTRACT
 *
 * JS Domain (untrusted execution environment)
 *   LayoutSnapshot → HTML → PDF → PrintJob event
 *
 * OS Domain (trusted execution environment)
 *   Launcher.exe (signed) → verify binary → SumatraPDF → spooler
 */

// ─── PrintJob — JS Domain Output / OS Domain Input ────────────────

/**
 * PrintJob: JS 域的唯一输出，OS 域的唯一输入。
 *
 * JS 不调用 execFile，不选择 binary，不持有 executable path。
 * JS 只描述"什么文件需要被打印，以什么参数"。
 * OS 签名 launcher 负责执行。
 */
export type PrintJob = Readonly<{
  /** 已生成的 PDF 文件绝对路径 */
  readonly pdfPath: string;
  /** 纸张尺寸 */
  readonly paperSize: string;
  /** 打印方向 */
  readonly orientation: 'portrait' | 'landscape';
  /** 目标打印机名称（可选） */
  readonly printerName?: string;
  /** 创建时间戳 */
  readonly createdAt: string;
}>;

/**
 * OsPrintResult: OS 域返回的执行结果。
 *
 * JS 域不解析、不验证、不推断此结果。
 * 此类型仅用于 logging / audit trail。
 */
export type OsPrintResult = Readonly<{
  /** OS 报告的任务 ID（可能为 null） */
  readonly jobId: number | null;
  /** 执行状态 */
  readonly status: 'submitted' | 'failed';
  /** 错误信息（仅 status === 'failed'） */
  readonly error?: string;
}>;

// ─── PrintJob Emitter — JS 域唯一出口 ────────────────────────────

/**
 * PrintJobEmitter: JS 域与 OS 域之间的唯一接口。
 *
 * JS 域调用 emit(printJob)，OS launcher 消费此事件。
 * JS 不关心 launcher 如何实现（签名验证、路径选择、进程启动）。
 */
export interface PrintJobEmitter {
  /**
   * 发出 PrintJob，将执行权移交给 OS trusted launcher。
   *
   * @returns OsPrintResult — 仅用于 logging，不影响业务逻辑
   */
  emit(job: PrintJob): Promise<OsPrintResult>;
}

// ─── OS Launcher Contract (概念接口，不由 JS 实现) ────────────────

/**
 * OS Trusted Launcher Contract
 *
 * 此接口定义了 OS 签名 launcher 的职责边界。
 * 它不是 JS 接口 — JS 不实现它。
 * 它是系统边界定义。
 *
 * Launcher 必须是:
 * - OS native binary (.exe)
 * - Authenticode 签名
 * - 由 OS 在进程启动时验证完整性
 * - 负责验证 SumatraPDF.exe 的完整性
 * - 负责与 Windows Spooler 交互
 *
 * JS 域不能：
 * - 实现 launcher
 * - 验证 launcher
 * - 选择 launcher
 * - 控制 launcher 的行为
 */
export interface OsLauncherContract {
  /** Launcher 接收来自 JS 域的 PrintJob */
  readonly accept: (job: PrintJob) => Promise<OsPrintResult>;

  /** Launcher 在启动时由 OS 验证自身完整性 */
  readonly verifyIntegrity: () => boolean;
}

// ─── Event-Based Bridge（JS ← → OS 通信契约）─────────────────────

/**
 * PrintEvent: JS 域发出的打印事件。
 *
 * OS launcher 监听此事件通道。
 * JS 只负责 emit，不负责确认 launcher 是否收到。
 */
export type PrintEvent = Readonly<{
  readonly type: 'print-job-created';
  readonly job: PrintJob;
  readonly timestamp: string;
}>;

export default {
  // Re-export for external consumption
};
