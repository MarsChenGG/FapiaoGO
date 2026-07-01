/**
 * Canvas 工具函数 - 仅用于辅助操作，不参与 Layout 计算
 * 
 * 设计原则：
 * 1. boundsCache 仅用于 debug/调试目的，禁止用于生产路径
 * 2. 不允许影响 layout 计算
 * 3. rotate 使用纯 transform matrix，禁止 bitmap 重绘或强制缩放
 * 4. DPI 统一由 renderers.js 管理，此处不做 DPR scaling
 */

const boundsCache = new WeakMap()

export function invalidateBoundsCache(canvas) {
  boundsCache.delete(canvas)
}

/**
 * 查找画布内容的实际边界（去除空白区域）
 * @param {HTMLCanvasElement} canvas - 源画布
 * @returns {{x: number, y: number, width: number, height: number, empty?: boolean}} - 内容边界
 * 
 * ⚠️ WARNING: 此函数为 CPU 密集型操作，仅用于 debug/crop hint
 * - A4 300 DPI ≈ 870万像素，会阻塞主线程 50~300ms
 * - 禁止用于生产 pipeline、打印流程、批量处理
 */
export function findContentBounds(canvas) {
  console.warn('[canvasUtils] findContentBounds is for DEBUG only!')
  
  if (boundsCache.has(canvas)) {
    return boundsCache.get(canvas)
  }

  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const THRESHOLD = 250

  const isContent = (x, y) => {
    const i = (y * width + x) * 4
    if (data[i + 3] < 10) return false
    return data[i] < THRESHOLD || data[i + 1] < THRESHOLD || data[i + 2] < THRESHOLD
  }

  let top = -1
  outer_top: for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (isContent(x, y)) { top = y; break outer_top }

  if (top === -1) {
    const empty = { x: 0, y: 0, width: 0, height: 0, empty: true }
    boundsCache.set(canvas, empty)
    return empty
  }

  let bottom = -1
  outer_bottom: for (let y = height - 1; y >= top; y--)
    for (let x = 0; x < width; x++)
      if (isContent(x, y)) { bottom = y; break outer_bottom }

  let left = -1
  outer_left: for (let x = 0; x < width; x++)
    for (let y = top; y <= bottom; y++)
      if (isContent(x, y)) { left = x; break outer_left }

  let right = -1
  outer_right: for (let x = width - 1; x >= left; x--)
    for (let y = top; y <= bottom; y++)
      if (isContent(x, y)) { right = x; break outer_right }

  const pad = 2
  const rx = Math.max(0, left - pad)
  const ry = Math.max(0, top - pad)
  const rr = Math.min(width - 1, right + pad)
  const rb = Math.min(height - 1, bottom + pad)
  const bounds = { x: rx, y: ry, width: rr - rx + 1, height: rb - ry + 1 }

  boundsCache.set(canvas, bounds)
  return bounds
}

/**
 * 将画布内容按指定角度旋转（纸张固定，内容自适应）
 * @param {HTMLCanvasElement} sourceCanvas - 源画布（只读，不修改）
 * @param {number} angle - 旋转角度（度）
 * @returns {HTMLCanvasElement} - 旋转后的新画布
 * 
 * ✅ 设计原则：
 * - 纸张尺寸固定不变，内容旋转后等比缩放居中放置
 * - 不做 bitmap 重绘，保持 DPI 保真度
 * - 不修改纸张方向，只有内容旋转
 */
export function rotateContentOnPaper(sourceCanvas, angle) {
  if (sourceCanvas.width === 0 || sourceCanvas.height === 0) {
    return sourceCanvas
  }

  if (angle == null || angle === 0) return sourceCanvas
  if (typeof angle !== 'number' || isNaN(angle)) {
    return sourceCanvas
  }

  // ✅ 纸张尺寸固定不变
  const result = document.createElement('canvas')
  result.width = sourceCanvas.width
  result.height = sourceCanvas.height

  const ctx = result.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, result.width, result.height)

  const rad = (angle * Math.PI) / 180

  // 计算旋转后内容的包围盒尺寸
  const cosA = Math.abs(Math.cos(rad))
  const sinA = Math.abs(Math.sin(rad))
  const rotatedW = sourceCanvas.width * cosA + sourceCanvas.height * sinA
  const rotatedH = sourceCanvas.width * sinA + sourceCanvas.height * cosA

  // 缩放旋转后内容，使其完整放入纸张
  const scale = Math.min(result.width / rotatedW, result.height / rotatedH)

  ctx.save()
  ctx.translate(result.width / 2, result.height / 2)
  ctx.rotate(rad)
  ctx.scale(scale, scale)
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2)
  ctx.restore()

  return result
}

/**
 * 清空画布
 * @param {HTMLCanvasElement} canvas - 目标画布
 * @param {string} [color='#ffffff'] - 背景色
 */
export function clearCanvas(canvas, color = '#ffffff') {
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}