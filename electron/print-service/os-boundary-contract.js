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

// ─── JSDoc types for documentation / IDE autocomplete ────────────

/**
 * @typedef {Object} PrintJob
 * @property {string} pdfPath - 已生成的 PDF 文件绝对路径
 * @property {string} paperSize - 纸张尺寸
 * @property {'portrait'|'landscape'} orientation - 打印方向
 * @property {string} [printerName] - 目标打印机名称（可选）
 * @property {{ widthMM: number, heightMM: number }} [customPaper] - 自定义纸张宽/高（mm）
 * @property {string} createdAt - 创建时间戳
 */

/**
 * @typedef {Object} OsPrintResult
 * @property {number|null} jobId - OS 报告的任务 ID（可能为 null）
 * @property {'submitted'|'failed'} status - 执行状态
 * @property {string} [error] - 错误信息（仅 status === 'failed'）
 */

/**
 * @typedef {Object} PrintJobEmitter
 * @property {(job: PrintJob) => Promise<OsPrintResult>} emit - 发出 PrintJob
 */

/**
 * @typedef {Object} OsLauncherContract
 * @property {(job: PrintJob) => Promise<OsPrintResult>} accept - 接收 PrintJob
 * @property {() => boolean} verifyIntegrity - 启动时验证完整性
 */

/**
 * @typedef {Object} PrintEvent
 * @property {'print-job-created'} type - 事件类型
 * @property {PrintJob} job - 打印任务
 * @property {string} timestamp - 时间戳
 */

// ─── Exports: just type documentation; consumers use dynamic checks ──

module.exports = {
  // No runtime exports — contract is enforced by runtime validation
}
