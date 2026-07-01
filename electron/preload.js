// preload.js
const { contextBridge, ipcRenderer, webUtils } = require('electron')

// IPC 通道白名单（精确匹配）
const ALLOWED_SEND = ['open-settings-window', 'close-settings-window', 'window-minimize', 'window-maximize', 'window-close', 'window-drag-start', 'window-drag-move', 'window-drag-end', 'settings-changed']
const ALLOWED_INVOKE = [
  'load-print-settings', 'save-print-settings', 'get-printers',
  'read-file', 'get-file-stats', 'open-file-dialog', 'open-folder-dialog',
  'rename-invoices', 'pack-invoices',
  'resize-settings-window', 'select-folder', 'select-save-path',
  'window-is-maximized',
  'scan-dropped-paths',
  'submit-print-job',
  'generate-print-pdf',
  'print-file-direct',
  'print-merged-images',
  'print-source-file',
]

// IPC 通道前缀白名单（前缀匹配）
// 注意：db: 前缀已移除，数据操作改为 HTTP API 调用后端
const ALLOWED_INVOKE_PREFIXES = []

const ALLOWED_ON = ['print-progress', 'settings-window-closed', 'context-menu-files', 'rename-progress', 'pack-progress', 'excel-progress', 'settings-changed', 'print-job-completed', 'print-job-failed']

/** 检查通道是否允许（精确匹配或前缀匹配） */
function isAllowedInvoke(channel) {
  if (ALLOWED_INVOKE.includes(channel)) return true
  return ALLOWED_INVOKE_PREFIXES.some(prefix => channel.startsWith(prefix))
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 核心：使用 webUtils 获取真实路径
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch (e) {
      console.error('[preload] getFilePath error:', e)
      return ''
    }
  },

  // 打印 API（新管线）
  submitPrintJob: (payload) => {
    return ipcRenderer.invoke('submit-print-job', payload)
  },

  // Canvas → PDF → Print
  generatePdfFromCanvas: (canvasBuffer, paperSize, orientation, customPaper) => {
    return ipcRenderer.invoke('generate-print-pdf', { canvasBuffer, paperSize, orientation, customPaper })
  },

  ipcRenderer: {
    send: (channel, data) => {
      if (ALLOWED_SEND.includes(channel)) {
        ipcRenderer.send(channel, data)
      } else {
        console.warn(`[preload] Blocked send to unallowed channel: ${channel}`)
      }
    },
    on: (channel, func) => {
      if (ALLOWED_ON.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(event, ...args))
      } else {
        console.warn(`[preload] Blocked on unallowed channel: ${channel}`)
      }
    },
    invoke: (channel, ...args) => {
      if (isAllowedInvoke(channel)) {
        return ipcRenderer.invoke(channel, ...args)
      } else {
        console.warn(`[preload] Blocked invoke to unallowed channel: ${channel}`)
        return Promise.reject(new Error(`Channel not allowed: ${channel}`))
      }
    },
    removeListener: (channel, func) => {
      ipcRenderer.removeListener(channel, func)
    }
  },

  // 窗口控制 API
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
})
