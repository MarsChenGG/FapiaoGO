import { useState, useCallback, useRef } from 'react'
import { getFileFormat } from '../utils'
import { generateFileKey } from '../utils/fileHelpers'

export function useRenamePack({ files, settings, setFiles, parseFiles, electronAPIRef }) {
  const [packing, setPacking] = useState(false)
  const [packProgress, setPackProgress] = useState({ current: 0, total: 0 })
  const [packResult, setPackResult] = useState(null)
  const [renamePreviewVisible, setRenamePreviewVisible] = useState(false)
  const [renamePreviewFiles, setRenamePreviewFiles] = useState([])
  const [renameResult, setRenameResult] = useState(null)
  const [alertModal, setAlertModal] = useState(null)

  // ============================
  // 重命名
  // ============================
  const handleRename = useCallback(async () => {
    const ipc = electronAPIRef.current?.ipcRenderer
    if (!ipc) return

    const filesToRename = files.filter(f => f.status === 'parsed')
    if (filesToRename.length === 0) {
      setAlertModal({
        visible: true,
        title: '提示',
        message: '没有可重命名的发票，请先解析完成',
        type: 'warning',
      })
      return
    }

    // 生成新文件名
    const renameSettings = settings.renameSettings || {}
    const fields = renameSettings.fields || []
    const separator = renameSettings.separator || '_'
    const showIndex = renameSettings.showIndex ?? false
    const showPrefix = renameSettings.showPrefix ?? false

    if (fields.length === 0) {
      setRenameResult({ success: false, error: '重命名规则未设置，请到设置中设置重命名规则' })
      setRenamePreviewVisible(true)
      return
    }

    const getFieldValue = (field, file, index) => {
      const key = field.key
      let text = ''

      if (showIndex) text += (index + 1) + '.'
      if (showPrefix) {
        const defMap = {
          kprq: { label: '开票日期' },
          fphm: { label: '发票号码' },
          fpfs: { label: '发票份数' },
          fplx: { label: '发票类型' },
          jym: { label: '校验码' },
          kpr: { label: '开票人' },
          cus: { label: '自定义' },
        }
        text += (defMap[key]?.label || key) + ':'
      }

      if (key === 'kprq') {
        const fmt = field.dateFormat || 'YYYY年MM月DD日'
        const dateStr = file.invoiceDate || '20250101'
        const fmtMap = {
          'YYYYMMDD': dateStr,
          'YYYY年MM月DD日': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1年$2月$3日'),
          'YYYY年MM月DD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1年$2月$3'),
          'YYYY-MM-DD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
          'YYYY.MM.DD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'),
          'YYYY/MM/DD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1/$2/$3'),
          'MM月DD日': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$2月$3日'),
          'MM-DD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$2-$3'),
          'MMDD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$2$3'),
          'MM/DD': dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$2/$3'),
        }
        text += fmtMap[fmt] || dateStr
      } else if (key === 'cus') {
        text += field.customText || '自定义内容'
      } else if (key === 'fphm') {
        text += file.invoiceNumber || ''
      } else if (key === 'fpfs') {
        text += '1'
      } else if (key === 'fplx') {
        text += file.invoiceType || ''
      } else if (key === 'jym') {
        text += file.invoiceFields?.jym || ''
      } else if (key === 'kpr') {
        text += file.invoiceFields?.kpr || ''
      } else {
        text += ''
      }

      return text
    }

    const previewFiles = filesToRename.map((f, fileIndex) => {
      let newName = ''
      const parts = fields.map((field, fieldIndex) => getFieldValue(field, f, fileIndex)).filter(Boolean)
      newName = parts.join(separator) + '.pdf'

      return {
        key: f.key,
        originalName: f.name,
        newName,
        conflict: false,
        fileFormat: f.fileFormat || 'pdf',
        invoiceNumber: f.invoiceNumber || '',
        invoiceType: f.invoiceType || '',
        amount: f.amount || '',
        invoiceDate: f.invoiceDate || '',
        rawText: f.rawText || '',
        gmfmc: f.invoiceFields?.gmfmc || '',
        xsfmc: f.invoiceFields?.xsfmc || '',
        xmmc: f.invoiceFields?.xmmc || '',
        note: f.invoiceFields?.note || '',
      }
    })

    // 检测文件名冲突
    const nameCount = {}
    previewFiles.forEach(file => {
      nameCount[file.newName] = (nameCount[file.newName] || 0) + 1
    })
    
    // 标记冲突文件
    previewFiles.forEach(file => {
      if (nameCount[file.newName] > 1) {
        file.conflict = true
      }
    })

    setRenamePreviewFiles(previewFiles)
    setRenamePreviewVisible(true)
  }, [files, settings, electronAPIRef])

  const handleRenameConfirm = useCallback(async (selectedKeys) => {
    const ipc = electronAPIRef.current?.ipcRenderer
    if (!ipc) return

    setPacking(true)
    setPackProgress({ current: 0, total: selectedKeys.length })

    const onProgress = (event, progress) => { setPackProgress(progress) }
    ipc.on('rename-progress', onProgress)

    try {
      const filesToRename = files.filter(f => selectedKeys.includes(f.key) && f.status === 'parsed')
      const filesWithValidPath = filesToRename.filter(f => {
        const p = f.printPath || f.path || ''
        return p.match(/^[a-zA-Z]:\\|^\\\\/)
      })
      const invalidPathFiles = filesToRename.filter(f => {
        const p = f.printPath || f.path || ''
        return !p.match(/^[a-zA-Z]:\\|^\\\\/)
      })

      if (invalidPathFiles.length > 0) {
        setAlertModal({
          visible: true,
          title: '路径错误',
          message: `有 ${invalidPathFiles.length} 个文件无法获取真实路径：\n${invalidPathFiles.map(f => f.name).join('\n')}`,
          type: 'warning',
        })
      }
      if (filesWithValidPath.length === 0) { setPacking(false); return }

      const filesToRenameWithPath = filesWithValidPath.map(f => ({
        key: f.key,
        originalPath: f.printPath || f.path,
        invoiceFields: f.invoiceFields || {
          type: f.invoiceType || '',
          fphm: f.invoiceNumber || '',
          kprq: f.invoiceDate || '',
          gmfmc: '',
          gmfsh: '',
          xsfmc: '',
          xsfsh: '',
          amountJe: '',
          amountSe: '',
          amountHj: f.amount || '',
          amountHjDx: '',
          note: '',
          skr: '',
          fhr: '',
          kpr: '',
        },
      }))

      const renameSettings = settings.renameSettings || {}
      const result = await ipc.invoke('rename-invoices', {
        files: filesToRenameWithPath,
        renameSettings,
      })
      ipc.removeListener('rename-progress', onProgress)
      setPacking(false)

      if (result.success) {
        if (result.renamedFiles && result.renamedFiles.length > 0) {
          const newFiles = result.renamedFiles.map((file, i) => ({
            key: generateFileKey(`renamed_${file.newPath}_${i}`),
            name: file.newName, path: file.newPath, printPath: file.newPath,
            status: 'parsing', invoiceType: '', invoiceNumber: '', amount: '',
            invoiceDate: '', newName: '', parseMethod: '',
            fileFormat: getFileFormat(file.newName), previewImage: null,
            invoiceFields: null,
            originalPath: filesToRenameWithPath[i].originalPath,
          }))

          // 构建本地事务追踪：记录本次操作创建的文件 key 和已搬移的旧路径
          // 使用局部变量而非 React state 标记，避免并发调用时标记串扰
          const transactionKeys = new Set(newFiles.map(f => f.key))
          const succeededOldPaths = new Set(
            filesToRenameWithPath
              .filter((f, i) => result.renamedFiles[i] && !result.renamedFiles[i].partialSuccess)
              .map(f => f.originalPath)
          )

          // 先添加新文件，等待解析完成后再删除旧文件
          setFiles(prev => [...prev, ...newFiles])

          // 等待解析完成
          try {
            await parseFiles(newFiles)

            // 解析成功后，原子性删除本次重命名的旧文件引用
            // 使用 succeededOldPaths（局部变量）而非遍历 React state 标记，避免并发干扰
            setFiles(prev => prev.filter(f =>
              !succeededOldPaths.has(f.path) && !succeededOldPaths.has(f.printPath)
            ))
          } catch (parseError) {
            console.error('重命名后解析失败:', parseError)
            // 精准回滚：仅移除本次事务创建的新文件，保留所有旧文件
            // 使用 transactionKeys（局部变量）精确定位，替代之前依赖 originalPath 字段的方式
            setFiles(prev => prev.filter(f => !transactionKeys.has(f.key)))
          }
        }
        const partialFiles = (result.renamedFiles || []).filter(f => f.partialSuccess)
        setRenameResult({
          success: true,
          renamed: result.renamed,
          failed: result.failed,
          partialCount: partialFiles.length,
        })
      } else {
        setRenameResult({ success: false, error: result.error })
      }
    } catch (error) {
      ipc.removeListener('rename-progress', onProgress)
      setPacking(false)
      setRenameResult({ success: false, error: error.message })
    }
  }, [files, parseFiles, settings, setFiles, electronAPIRef])

  // ============================
  // 打包
  // ============================
  const handlePack = useCallback(async () => {
    const ipc = electronAPIRef.current?.ipcRenderer
    if (!ipc) return

    const parsedFiles = files.filter(f => f.status === 'parsed')
    if (parsedFiles.length === 0) {
      setAlertModal({
        visible: true,
        title: '提示',
        message: '没有可打包的文件',
        type: 'warning',
      })
      return
    }

    setPacking(true)
    setPackResult(null)
    setPackProgress({ current: 0, total: parsedFiles.length, stage: '准备中', currentFile: '' })

    const onProgress = (event, progress) => {
      setPackProgress(prev => ({ ...prev, ...progress, stage: progress.stage || prev.stage || '' }))
    }
    ipc.on('pack-progress', onProgress)

    try {
      const filesToPack = parsedFiles.map(f => ({
        name: f.name, path: f.path, printPath: f.printPath, newName: f.newName,
        invoiceFields: f.invoiceFields || {
          type: f.invoiceType || '',
          fphm: f.invoiceNumber || '', kprq: f.invoiceDate || '',
          gmfmc: '', gmfsh: '', xsfmc: '', xsfsh: '',
          amountJe: '', amountSe: '',
          amountHj: f.amount || '', amountHjDx: '',
          note: '', skr: '', fhr: '', kpr: '',
        },
      }))

      const packSettings = settings.packSettings || {}
      const renameSettings = settings.renameSettings || {}

      const result = await ipc.invoke('pack-invoices', {
        files: filesToPack,
        packSettings,
        renameSettings,
      })
      ipc.removeListener('pack-progress', onProgress)

      if (result.success || result.error === '用户取消选择') {
        const keepOriginal = packSettings.packKeepOriginal ?? true
        const newResult = { ...result, success: result.success || false, keepOriginal }
        setPackResult(newResult)
        setPacking(false)

        // 打包成功且不保留原件时，清除当前列表
        if (result.success && !keepOriginal) {
          setFiles([])
        }
      } else {
        setPackResult({ ...result, success: false })
      }
    } catch (error) {
      ipc.removeListener('pack-progress', onProgress)
      setPackResult({ success: false, error: error.message })
    }
  }, [files, settings, electronAPIRef])

  const closeAlert = useCallback(() => setAlertModal(null), [])

  return {
    packing, setPacking,
    packProgress, setPackProgress,
    packResult, setPackResult,
    renamePreviewVisible, setRenamePreviewVisible,
    renamePreviewFiles, setRenamePreviewFiles,
    renameResult, setRenameResult,
    alertModal, closeAlert,
    handleRename, handleRenameConfirm, handlePack,
  }
}
