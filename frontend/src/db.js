// frontend/src/db.js
// 数据操作通过 HTTP API 调用 Python 后端（不再走 Electron IPC）

import { BACKEND_URL } from './config'

const API = BACKEND_URL || 'http://localhost:5000'

/**
 * 统一的 DB 错误对象
 */
function dbError(message, code = 'DB_ERROR') {
  return { __error: true, message, code }
}

/**
 * 检查返回值是否为 DB 错误对象
 */
function isDbError(res) {
  return res && typeof res === 'object' && res.__error === true
}

/**
 * 通用 HTTP 请求封装
 */
async function api(path, options = {}) {
  try {
    const url = `${API}${path}`
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const data = await res.json()
    if (data.success === false) {
      console.error(`[DB] ${path} 失败:`, data.error)
      return dbError(data.error, 'API_ERROR')
    }
    return data.data !== undefined ? data.data : data
  } catch (err) {
    console.error(`[DB] ${path} 网络错误:`, err.message)
    return dbError(err.message, 'NETWORK_ERROR')
  }
}

/**
 * GET 请求（自动拼接查询参数）
 */
async function apiGet(path, params = {}) {
  const qs = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      qs.set(key, val)
    }
  }
  const qsStr = qs.toString()
  return api(qsStr ? `${path}?${qsStr}` : path)
}

export const db = {
  /** 获取数据库文件路径 */
  getPath() {
    return apiGet('/api/db/path')
  },

  /** 搜索发票 */
  search(filters = {}) {
    return apiGet('/api/db/search', filters)
  },

  /** 获取单条发票 */
  get(id) {
    return apiGet(`/api/db/invoice/${id}`)
  },

  /** 统计汇总 */
  statistics() {
    return apiGet('/api/db/statistics')
  },

  /** 软删除 */
  deleteInvoice(id) {
    return api(`/api/db/invoice/${id}`, { method: 'DELETE' })
  },

  /** 恢复软删除 */
  restoreInvoice(id) {
    return api(`/api/db/invoice/${id}/restore`, { method: 'POST' })
  },

  /** 更新标签/分类/备注等字段 */
  update(id, fields) {
    return api(`/api/db/invoice/${id}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    })
  },

  /** 去重检查 */
  findDuplicates(number) {
    return apiGet(`/api/db/duplicates/${encodeURIComponent(number)}`)
  },

  /** 插入或更新发票记录（按 hash 去重） */
  upsert(row) {
    return api('/api/db/upsert', {
      method: 'POST',
      body: JSON.stringify(row),
    })
  },

  /** 读取配置 */
  getConfig(key) {
    return apiGet('/api/config/get', { key })
  },

  /** 写入配置 */
  setConfig(key, value) {
    return api(`/api/config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  },

  /** 通用 SELECT 查询（已废弃，使用 search 替代） */
  query(_sql, _params = []) {
    console.warn('[DB] query() 已废弃，请使用 search() 替代')
    return Promise.resolve([])
  },

  /** 通用写入（已废弃，使用具体方法替代） */
  run(_sql, _params = []) {
    console.warn('[DB] run() 已废弃，请使用 upsert/update/deleteInvoice 替代')
    return Promise.resolve({ changes: 0 })
  },
}

// 导出错误检查工具供调用方使用
export { isDbError, dbError }
