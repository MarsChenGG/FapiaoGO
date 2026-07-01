import { useMemo, useState, useEffect } from 'react'
import { BACKEND_URL } from '../config'
import { isMergeMode, isFailedFile } from '../utils'

/**
 * 文件统计信息 hook
 * 
 * 优化点：
 * 1. 单次 O(n) 遍历替代 O(4n) 多次遍历
 * 2. _parsedAmount 缓存到 fileObj 上，避免每次遍历都做 replace 正则
 * 3. 中文大写金额通过后端 API 异步获取
 */
export function useFileStats({ files, mergeMode }) {
  const fileStats = useMemo(() => {
    let totalAmount = 0
    let printableCount = 0
    let hasFailedFiles = false
    let failedFilesCount = 0

    for (const f of files) {
      // 金额：每次重新计算（不缓存到文件对象，避免解析后 stale cache）
      const amountStr = (f.amount || '').replace(/[¥￥,]/g, '')
      const parsed = parseFloat(amountStr) || 0
      totalAmount += parsed

      // 可打印计数
      if (f.printPath && (f.status === 'parsed' || f.status === 'error')) {
        if (!((f.fileFormat === 'ofd') && !f.previewImage)) {
          printableCount++
        }
      }

      // 失败文件
      if (isFailedFile(f)) {
        hasFailedFiles = true
        failedFilesCount++
      }
    }

    // mergeMode 下 printableCount 需要根据合并数量计算页数
    let finalPrintableCount = printableCount
    if (isMergeMode(mergeMode)) {
      const mergeSize = parseInt(mergeMode?.replace('merge', '')) || 2
      finalPrintableCount = Math.ceil(printableCount / mergeSize)
    }

    return {
      totalAmount,
      printableCount: finalPrintableCount,
      hasFailedFiles,
      failedFilesCount,
    }
  }, [files, mergeMode])

  const { totalAmount, printableCount, hasFailedFiles, failedFilesCount } = fileStats

  // 金额格式化
  const totalAmountStr = totalAmount.toFixed(2)
  const totalAmountInt = totalAmountStr.split('.')[0]
  const totalAmountDecimal = totalAmountStr.split('.')[1]

  // 中文大写金额
  const [chineseAmount, setChineseAmount] = useState('零元整')

  useEffect(() => {
    if (totalAmount === 0) {
      setChineseAmount('零元整')
      return
    }
    let cancelled = false
    fetch(`${BACKEND_URL}/api/to_chinese_amount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: totalAmount }),
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.success) setChineseAmount(data.chinese) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [totalAmount])

  return {
    totalAmount,
    printableCount,
    hasFailedFiles,
    failedFilesCount,
    totalAmountStr,
    totalAmountInt,
    totalAmountDecimal,
    chineseAmount,
  }
}
