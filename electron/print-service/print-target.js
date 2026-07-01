/**
 * print-target.js — 解决"真正打印什么文件"
 *
 * 职责：
 * - OFD → previewImage.png（Sumatra 不支持 OFD 原生打印）
 * - 其他格式 → 源文件直通
 *
 * 未来扩展：
 * - Word → PDF
 * - HTML → PDF
 */

const path = require('path');
const fs = require('fs');

/**
 * 解析 OFD 对应的预览图路径
 * @param {string} ofdPath - OFD 源文件路径
 * @returns {string|null} previewImage.png 路径，或 null
 */
function resolveOfdPreview(ofdPath) {
  // 尝试在相同目录下找同名的 .png 预览图
  const dir = path.dirname(ofdPath);
  const basename = path.basename(ofdPath, '.ofd');
  const pngPath = path.join(dir, basename + '.png');
  if (fs.existsSync(pngPath)) return pngPath;

  // 尝试在临时目录或缓存目录中查找
  const tempDir = path.join(require('os').tmpdir(), 'print626-ofd-previews');
  const cachedPng = path.join(tempDir, basename + '.png');
  if (fs.existsSync(cachedPng)) return cachedPng;

  return null;
}

/**
 * 解析真实打印目标
 *
 * @param {object} target - PrintTarget
 * @param {string} target.filePath - 源文件路径
 * @param {string} target.fileFormat - 文件格式
 * @param {string} target.printer - 打印机名称
 * @returns {object} 解析后的 PrintTarget
 * @throws {Error} 如果 OFD 尚未解析完成
 */
function resolvePrintTarget(target) {
  if (!target || !target.filePath) {
    throw new Error('PrintTarget.filePath is required');
  }

  // OFD → previewImage.png
  if (target.fileFormat === 'ofd') {
    const previewPath = resolveOfdPreview(target.filePath);
    if (previewPath && fs.existsSync(previewPath)) {
      console.log('[print-target] OFD resolved to preview PNG:', previewPath);
      return {
        ...target,
        filePath: previewPath,
        fileFormat: 'image',
      };
    }
    throw new Error('OFD 尚未解析完成，无法打印');
  }

  // 其他格式直接返回源文件
  return { ...target };
}

module.exports = { resolvePrintTarget, resolveOfdPreview };
