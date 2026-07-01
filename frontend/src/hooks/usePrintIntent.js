/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  usePrintIntent — Frontend Print Consumer Hook                 ║
 * ║                                                                  ║
 * ║  FRONTEND ARCHITECTURE POSITION:                                 ║
 * ║  Pure consumer of PrintJob intents.                              ║
 * ║  NEVER touches execution, OS processes, or binary paths.        ║
 * ║                                                                  ║
 * ║  PRINT INPUT CONTRACT:                                           ║
 * ║  Input: { canvasBuffer, paperSize, orientation }                ║
 * ║  ❌ filePath / previewFile.path are FORBIDDEN as print input    ║
 * ║                                                                  ║
 * ║  Flow:                                                           ║
 * ║  canvasBuffer → IPC generate-print-pdf → pdfPath                ║
 * ║  → IPC submit-print-job → PrintService → OsLauncherBridge       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { useState, useCallback, useRef } from 'react'

/**
 * Intent-level job status — NOT OS execution status.
 */
export const INTENT_STATUS = {
  IDLE: 'idle',
  SUBMITTED: 'submitted',
  DISPATCHED: 'dispatched',
}

/**
 * @param {object} electronAPI - Electron IPC bridge ref
 * @returns {object} print intent state + actions
 */
export function usePrintIntent(electronAPI) {
  const [intentState, setIntentState] = useState({
    status: INTENT_STATUS.IDLE,
    submittedAt: null,
    jobCount: 0,
    message: '',
  })

  const batchRef = useRef([])

  /**
   * Submit a print job from a rendered canvas buffer.
   *
   * @param {Object} printInput
   * @param {Uint8Array} printInput.canvasBuffer - PNG from canvasToUint8Array
   * @param {string} printInput.paperSize
   * @param {string} printInput.orientation
   * @param {string} [printInput.printerName] - 目标打印机名称（可选）
   * @param {{ widthMM: number, heightMM: number }} [printInput.customPaper] - 自定义纸张尺寸（可选）
   */
  const submitPrintIntent = useCallback(async ({ canvasBuffer, paperSize, orientation, printerName, customPaper }) => {
    const api = electronAPI?.current
    if (!api) {
      setIntentState((prev) => ({
        ...prev, status: INTENT_STATUS.IDLE, message: 'No electron API available',
      }))
      return { success: false, message: 'Electron API 不可用' }
    }

    try {
      // Step 1: canvasBuffer → PDF (main process via IPC)
      const pdfResult = await api.generatePdfFromCanvas(canvasBuffer, paperSize, orientation, customPaper)
      if (!pdfResult?.success) {
        const msg = pdfResult?.error || 'PDF 生成失败'
        setIntentState((prev) => ({
          ...prev, status: INTENT_STATUS.IDLE,
          message: msg,
        }))
        return { success: false, message: msg }
      }

      // Step 2: PDF → PrintService
      const printJob = {
        filePath: pdfResult.pdfPath,
        paperSize,
        orientation,
        printerName,
        customPaper,
      }

      const result = await api.submitPrintJob(printJob)

      if (result?.jobCreated) {
        setIntentState({
          status: INTENT_STATUS.SUBMITTED,
          submittedAt: result.createdAt || new Date().toISOString(),
          jobCount: batchRef.current.length + 1,
          message: '打印任务已提交',
        })
        return { success: true, message: '打印任务已提交' }
      }

      const msg = result?.error || '提交失败'
      setIntentState((prev) => ({
        ...prev, status: INTENT_STATUS.IDLE,
        message: msg,
      }))
      return { success: false, message: msg }
    } catch (err) {
      const msg = err?.message || '提交异常'
      setIntentState((prev) => ({
        ...prev, status: INTENT_STATUS.IDLE,
        message: msg,
      }))
      return { success: false, message: msg }
    }
  }, [electronAPI])

  const markDispatched = useCallback(() => {
    setIntentState((prev) => ({
      ...prev, status: INTENT_STATUS.DISPATCHED, message: '已发送至打印系统',
    }))
  }, [])

  const resetIntent = useCallback(() => {
    batchRef.current = []
    setIntentState({ status: INTENT_STATUS.IDLE, submittedAt: null, jobCount: 0, message: '' })
  }, [])

  return { intentState, submitPrintIntent, markDispatched, resetIntent, INTENT_STATUS }
}

export default usePrintIntent
