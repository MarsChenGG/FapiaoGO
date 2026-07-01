/**
 * 合并模式辅助函数
 * 用于统一管理合并模式的纸张方向强制逻辑
 */

/**
 * 根据合并模式获取强制的纸张方向
 * @param {string} mergeMode - 合并模式（'none' | 'merge2' | 'merge3' | 'merge4'）
 * @param {boolean} userLandscape - 用户配置的纸张方向
 * @returns {boolean} 最终的纸张方向
 */
export function getForcedLandscape(mergeMode, userLandscape) {
  if (!mergeMode || mergeMode === 'none') {
    return userLandscape  // 不合并时，使用用户配置
  }

  const groupSize = parseInt(mergeMode.replace('merge', '')) || 2

  if (groupSize === 4) {
    return true   // merge4 强制横向
  }

  return false  // merge2、merge3 强制竖向
}

/**
 * 判断是否为合并模式
 * @param {string} mergeMode
 * @returns {boolean}
 */
export function isMergeMode(mergeMode) {
  return mergeMode && mergeMode !== 'none'
}
