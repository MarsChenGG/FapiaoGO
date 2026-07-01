// electron/logger.js
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const originalLog = console.log
const originalError = console.error
const originalWarn = console.warn

// 设置控制台编码为 UTF-8 (Windows)
try {
  if (process.platform === 'win32') {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' })
  }
  if (process.stdout.isTTY) {
    process.stdout.setEncoding('utf8')
  }
} catch (e) {}

// 日志保留天数
const LOG_RETENTION_DAYS = 7

class Logger {
  constructor() {
    this.logFile = null
    this.enabled = true
  }

  init() {
    if (this.logFile) return

    try {
      // 使用项目根目录下的 database/logs 文件夹
      // __dirname 是 electron 目录的绝对路径
      // 向上一级到达项目根目录
      let appRootPath = path.normalize(__dirname)
      appRootPath = path.join(appRootPath, '..')
      appRootPath = path.normalize(appRootPath)

      const logDir = path.join(appRootPath, 'database', 'logs')
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      // 清理旧日志
      this.cleanOldLogs(logDir)

      const date = new Date().toISOString().split('T')[0]
      this.logFile = path.join(logDir, `app-${date}.log`)
    } catch (e) {
      originalError('[Logger] 初始化失败:', e.message)
    }
  }

  cleanOldLogs(logDir) {
    try {
      const files = fs.readdirSync(logDir)
      const now = Date.now()
      const retentionMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000

      let deletedCount = 0
      files.forEach(file => {
        const match = file.match(/^app-(\d{4})-(\d{2})-(\d{2})\.log$/)
        if (match) {
          const [, year, month, day] = match
          const fileDate = new Date(year, month - 1, day).getTime()
          if (now - fileDate > retentionMs) {
            const filePath = path.join(logDir, file)
            fs.unlinkSync(filePath)
            deletedCount++
          }
        }
      })

      if (deletedCount > 0) {
        originalLog(`[Logger] 清理了 ${deletedCount} 个过期日志文件`)
      }
    } catch (e) {
      originalError('[Logger] 清理旧日志失败:', e.message)
    }
  }

  formatArgs(args) {
    return args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.message
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2)
        } catch (e) {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')
  }

  writeToFile(level, message) {
    if (!this.enabled || !this.logFile) return

    try {
      const timestamp = new Date().toISOString()
      const logLine = `[${timestamp}] [${level}] ${message}\n`
      fs.appendFileSync(this.logFile, logLine, 'utf8')
    } catch (e) {
      // 文件写入失败不影响主流程
      originalError('[Logger] 写入失败:', e.message)
    }
  }

  log(...args) {
    const message = this.formatArgs(args)

    // 输出到控制台
    if (process.platform === 'win32') {
      try {
        process.stdout.write(message + '\n')
      } catch (e) {
        originalLog.apply(console, args)
      }
    } else {
      originalLog.apply(console, args)
    }

    // 写入文件
    this.writeToFile('INFO', message)
  }

  error(...args) {
    const message = this.formatArgs(args)
    originalError.apply(console, args)
    this.writeToFile('ERROR', message)
  }

  warn(...args) {
    const message = this.formatArgs(args)
    originalWarn.apply(console, args)
    this.writeToFile('WARN', message)
  }

  info(...args) {
    this.log(...args)
  }

  debug(...args) {
    if (process.env.DEBUG) {
      const message = this.formatArgs(args)
      originalLog.apply(console, args)
      this.writeToFile('DEBUG', message)
    }
  }
}

const logger = new Logger()

// 不污染全局 console，导出 logger 实例
module.exports = logger