/**
 * Render Model Layer - 渲染模型层（WPS级架构）
 * 
 * 设计原则：
 * 1. 纯数据结构，不碰 canvas/DOM
 * 2. content-driven：以内容为中心，不是 slot-driven
 * 3. 完全确定性：创建时计算所有参数，render 阶段不做任何计算
 * 
 * 架构位置：
 * Layout Engine → Render Model（完全确定）→ Renderer → Output
 * 
 * 关键改进：
 * - transform 以 content center 为锚点，不是 slot center
 * - slot 只做定位（viewport），不参与 transform 计算
 * - 避免 DPI 漂移：transform 与 pixel space 解耦
 */

/**
 * 创建渲染模型（完全确定结构）
 * @param {object} slot - Layout 输出的槽位（viewport）
 * @param {object} item - 标准化的项目
 * @param {object} options - 渲染选项
 * @param {number} [options.rotate=0] - 旋转角度（度）
 * @param {string} [options.fitMode='fit'] - 适配模式：fit | fill | center | stretch
 * @returns {object} - 完全确定的 Render Model
 */
export function createRenderModel(slot, item, options = {}) {
  const { rotate = 0, fitMode = 'fit' } = options
  
  const contentWidth = item.meta.width
  const contentHeight = item.meta.height
    
  let scaleX = 1
  let scaleY = 1
  let offsetX = 0
  let offsetY = 0
    
  switch (fitMode) {
    case 'fit':
      scaleX = scaleY = Math.min(slot.width / contentWidth, slot.height / contentHeight)
      offsetX = (slot.width - contentWidth * scaleX) / 2
      offsetY = (slot.height - contentHeight * scaleY) / 2
      break
    case 'fill':
      scaleX = scaleY = Math.max(slot.width / contentWidth, slot.height / contentHeight)
      offsetX = (slot.width - contentWidth * scaleX) / 2
      offsetY = (slot.height - contentHeight * scaleY) / 2
      break
    case 'stretch':
      // ✅ 修正：非均匀缩放，完全填满 slot（拉伸变形）
      scaleX = slot.width / contentWidth
      scaleY = slot.height / contentHeight
      offsetX = 0
      offsetY = 0
      break
    case 'center':
    default:
      scaleX = scaleY = 1
      offsetX = (slot.width - contentWidth) / 2
      offsetY = (slot.height - contentHeight) / 2
  }
    
  const contentCenterX = contentWidth / 2
  const contentCenterY = contentHeight / 2
    
  const transformMatrix = calculateTransformMatrix(
    contentCenterX,
    contentCenterY,
    scaleX,
    scaleY,
    rotate
  )
    
  return {
    type: item.type,
    sourceId: item.id,
    slotId: slot.id,
      
    slot: {
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height
    },
      
    transform: {
      scaleX,
      scaleY,
      rotate,
      offsetX,
      offsetY,
      originX: contentCenterX,
      originY: contentCenterY,
      matrix: transformMatrix
    },
      
    contentSize: {
      width: contentWidth,
      height: contentHeight
    },
      
    sourceRect: {
      x:0,
      y:0,
      width: contentWidth,
      height: contentHeight
    },
      
    finalBounds: calculateContentBounds(contentWidth, contentHeight, scaleX, scaleY, rotate)
  }
}

/**
 * 计算变换矩阵（以 content center 为锚点）
 * @param {number} cx - content 中心 X
 * @param {number} cy - content 中心 Y
 * @param {number} scaleX - X 方向缩放比例
 * @param {number} scaleY - Y 方向缩放比例
 * @param {number} rotate - 旋转角度（度）
 * @returns {Float32Array} - 6元素变换矩阵
 */
function calculateTransformMatrix(cx, cy, scaleX, scaleY, rotate) {
  const rad = (rotate * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
    
  // ✅ 修正：非均匀缩放矩阵（b 用 scaleX，c 用 scaleY）
  const a = cos * scaleX
  const b = sin * scaleX
  const c = -sin * scaleY
  const d = cos * scaleY
  const e = cx - a * cx - c * cy
  const f = cy - b * cx - d * cy
    
  return new Float32Array([a, b, c, d, e, f])
}

/**
 * 计算内容变换后的边界（content-space）
 * @param {number} contentWidth - 内容宽度
 * @param {number} contentHeight - 内容高度
 * @param {number} scaleX - X 方向缩放比例
 * @param {number} scaleY - Y 方向缩放比例
 * @param {number} rotate - 旋转角度（度）
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function calculateContentBounds(contentWidth, contentHeight, scaleX, scaleY, rotate) {
  const scaledWidth = contentWidth * scaleX
  const scaledHeight = contentHeight * scaleY
    
  if (rotate === 0) {
    return {
      x: -scaledWidth / 2,
      y: -scaledHeight / 2,
      width: scaledWidth,
      height: scaledHeight
    }
  }
    
  const rad = (rotate * Math.PI) / 180
  const cosA = Math.abs(Math.cos(rad))
  const sinA = Math.abs(Math.sin(rad))
    
  const rotatedWidth = scaledWidth * cosA + scaledHeight * sinA
  const rotatedHeight = scaledWidth * sinA + scaledHeight * cosA
    
  return {
    x: -rotatedWidth / 2,
    y: -rotatedHeight / 2,
    width: rotatedWidth,
    height: rotatedHeight
  }
}

/**
 * 批量创建渲染模型
 * @param {Array} slots - Layout 槽位列表（viewport）
 * @param {Array} items - 标准化项目列表
 * @param {object} rotations - 旋转配置 { [itemId]: angle }
 * @param {string} fitMode - 适配模式
 * @returns {Array} - 完全确定的 Render Model 列表
 */
export function createRenderModels(slots, items, rotations = {}, fitMode = 'fit') {
  const itemMap = new Map(items.map(item => [item.id, item]))
    
  return slots.map(slot => {
    const item = itemMap.get(slot.itemId)
    if (!item) {
      return null
    }
      
    const rotate = rotations[slot.itemId] || 0
    return createRenderModel(slot, item, { rotate, fitMode })
  }).filter(Boolean)
}

/**
 * 应用变换到渲染上下文（纯 apply，不做计算）
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {object} model - Render Model（完全确定）
 */
export function applyTransformToContext(ctx, model) {
  const { slot, transform } = model
  
  ctx.save()
  
  // ✅ 修复：根据 offsetX/offsetY 将原点设在内容中心在 canvas 上的正确位置
  // 内容中心在 slot 内的像素坐标
  const contentCenterInSlotX = transform.offsetX + transform.originX * transform.scaleX
  const contentCenterInSlotY = transform.offsetY + transform.originY * transform.scaleY
  
  // 内容中心在 canvas 上的坐标
  const canvasX = slot.x + contentCenterInSlotX
  const canvasY = slot.y + contentCenterInSlotY
  
  ctx.translate(canvasX, canvasY)
  
  // 应用旋转
  if (transform.rotate) {
    ctx.rotate(transform.rotate * Math.PI / 180)
  }
  
  // 应用缩放
  ctx.scale(transform.scaleX, transform.scaleY)
}

/**
 * 恢复上下文变换
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 */
export function restoreContext(ctx) {
  ctx.restore()
}

/**
 * 渲染模型类型枚举
 */
export const RENDER_MODEL_TYPES = {
  PDF: 'pdf',
  IMAGE: 'image',
  UNKNOWN: 'unknown'
}

/**
 * 适配模式枚举
 */
export const FIT_MODES = {
  FIT: 'fit',
  FILL: 'fill',
  CENTER: 'center',
  STRETCH: 'stretch'
}
