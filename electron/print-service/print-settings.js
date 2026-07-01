/**
 * print-settings.js — PrintSettings → Sumatra -print-settings 参数字符串
 *
 * 纯 mapper，无副作用，可独立单元测试。
 *
 * 核心设计：
 *   - landscape 已废弃（UI 不暴露），方向由 Sumatra + disable-auto-rotation 自动处理
 *   - rotate=N 是唯一方向控制源（0/90/180/270）
 *   - rotate ≠ 0 时强制 fit='contain'（旋转改变坐标系，stretch/noscale 叠加不可控）
 *   - disable-auto-rotation 始终开启，禁止 Sumatra 自行判断
 *   - 纸张尺寸始终用标准名称（paper=a4），所有打印机一致
 *
 * PrintSettings → "disable-auto-rotation,rotate=90,fit,paper=a4,duplexlong,2x,monochrome"
 */

/**
 * 归一化 PrintSettings（纯函数，返回副本，不修改输入）
 *
 * 稳定规则：
 *   🚨 旋转优先级最高。rotate ≠ 0 时：
 *      - fit 强制 contain（旋转 + 拉伸/无缩放 = 驱动层不可控）
 *      - _lockPaper 置 true（未来任何 paper orientation 逻辑不可插入）
 *
 * @param {object} ps - 原始 PrintSettings
 * @returns {object} 归一化后的副本
 */
function normalize(ps) {
  const result = { ...ps };

  // 🚨 核心规则：旋转优先级最高
  if (result.rotation && result.rotation !== 0) {
    result.fit = 'contain';         // 缩放锁定（旋转改变坐标系）
    result._lockPaper = true;       // 语义锁定（禁止任何 paper orientation 未来插入）
  }

  return result;
}

/**
 * 将 PrintSettings 映射为 Sumatra -print-settings 参数字符串
 *
 * 参数顺序规则：
 *   1. disable-auto-rotation（始终首位，锁定驱动行为）
 *   2. rotate=N（唯一方向控制源）
 *   3. fit（缩放）
 *   4. paper（纸张尺寸）
 *   5. 其余（duplex/grayscale/copies）
 *
 * @param {object} ps - PrintSettings
 * @param {number} [ps.rotation=0] - 旋转角度: 0 | 90 | 180 | 270
 * @param {string} [ps.fit='contain'] - 适应方式: 'none' | 'contain' | 'fill'
 * @param {string} [ps.paper] - 纸张尺寸名称（A4/A5/Letter 等）
 * @param {boolean} [ps.duplex=false] - 双面打印
 * @param {boolean} [ps.grayscale=false] - 灰度打印
 * @param {number} [ps.copies=1] - 打印份数
 * @returns {string} Sumatra -print-settings 参数字符串
 *
 * @example
 * // 无旋转
 * buildPrintSettings({ fit: 'contain', paper: 'A4' })
 * // → "disable-auto-rotation,fit,paper=a4"
 *
 * @example
 * // 旋转 90°
 * buildPrintSettings({ rotation: 90, fit: 'contain', paper: 'A4' })
 * // → "disable-auto-rotation,rotate=90,fit,paper=a4"
 */
function buildPrintSettings(ps) {
  const normalized = normalize(ps);
  const parts = [];

  // 1. 禁止 Sumatra 自动旋转（始终首位，锁定驱动行为，所有格式通用）
  parts.push('disable-auto-rotation');

  // 2. 内容旋转（唯一方向控制源）
  if (normalized.rotation && normalized.rotation !== 0) {
    parts.push(`rotate=${normalized.rotation}`);
  }

  // 3. 适应方式
  switch (normalized.fit || 'contain') {
    case 'fill':
      parts.push('stretch');
      break;
    case 'none':
      parts.push('noscale');
      break;
    case 'contain':
    default:
      parts.push('fit');
      break;
  }

  // 纸张尺寸：始终使用标准名称，不搞宽高互换
  if (normalized.paper) {
    parts.push(`paper=${normalized.paper.toLowerCase()}`);
  }

  // 双面打印
  if (normalized.duplex) {
    // 第一版统一用 duplexlong，未来支持 duplexshort
    parts.push('duplexlong');
  }

  // 灰度打印
  if (normalized.grayscale) {
    parts.push('monochrome');
  }

  // 份数
  if (normalized.copies && normalized.copies > 1) {
    parts.push(`${normalized.copies}x`);
  }

  // margin 暂不映射（TODO: 打印边距由打印机驱动控制）

  return parts.join(',');
}

module.exports = { buildPrintSettings, normalize };
