/**
 * detectOrientation.js — 文档方向检测
 *
 * 职责：
 *   统一判断文档的天然方向（横向/纵向），仅用于预览画布方向决策。
 *   不参与打印决策，打印层永远由 disable-auto-rotation + fit + paper 锁定。
 *
 * 支持的文件类型：
 *   PDF  — _pdfPageWidth / _pdfPageHeight（usePreview 在加载时提取，轻量，无 Canvas 渲染）
 *   图片 — naturalWidth / naturalHeight
 *   OFD  — 后端 previewImage 的宽高（同图片逻辑）
 *
 * @param {object} file - 文件对象
 * @param {string} [file._fileFormat] - 文件格式 ('pdf' | 'image' | 'ofd')
 * @param {number} [file._pdfPageWidth] - PDF 第一页宽度（usePreview 加载时提取）
 * @param {number} [file._pdfPageHeight] - PDF 第一页高度
 * @param {number} [file._imageWidth] - 图片/OFD 宽度
 * @param {number} [file._imageHeight] - 图片/OFD 高度
 * @param {number} [file.previewWidth] - OFD 预览图宽度
 * @param {number} [file.previewHeight] - OFD 预览图高度
 * @returns {'portrait' | 'landscape'}
 */
export function detectDocumentOrientation(file) {
  if (!file) return 'portrait'

  // PDF：从加载时提取的页面尺寸判断
  if (file._pdfPageWidth > 0 && file._pdfPageHeight > 0) {
    return file._pdfPageWidth > file._pdfPageHeight ? 'landscape' : 'portrait'
  }

  // 图片 / OFD previewImage
  const w = file._imageWidth || file.previewWidth || 0
  const h = file._imageHeight || file.previewHeight || 0
  if (w > 0 && h > 0) {
    return w > h ? 'landscape' : 'portrait'
  }

  return 'portrait'
}
