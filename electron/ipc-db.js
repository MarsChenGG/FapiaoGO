'use strict'

/**
 * @deprecated 数据库 IPC 已废弃。
 * 数据操作已迁移至 Python 后端 HTTP API。
 * 保留此文件以防止意外引用。
 */

const logger = require('./logger')

/**
 * @deprecated 不再注册任何数据库 IPC handler
 */
function registerDbHandlers() {
  logger.log('[ipc-db] registerDbHandlers() 已废弃，数据操作已迁移至后端 HTTP API')
}

module.exports = { registerDbHandlers }
