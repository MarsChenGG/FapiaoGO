import React, { memo } from 'react'

/**
 * 打印前确认弹窗
 * 汇总：打印机名称、灰度/彩色、纸张尺寸、文件数、合并模式、一普二专
 */
const PrintConfirmModal = ({
  visible,
  settings,
  totalFiles,
  mergeMode,
  isOneNormalTwoSpecial,
  onConfirm,
  onCancel,
}) => {
  if (!visible) return null

  // 颜色模式标签
  const colorMode = settings.grayscale ? '灰度打印' : '彩色打印'

  // 纸张尺寸展示
  const paperSize = settings.paperSize || 'A4'

  return (
    <div className="modal-overlay pcm-overlay">
      <div className="pcm-panel">
        {/* 头部 */}
        <div className="pcm-header">
          <div className="pcm-header-left">
            <svg className="pcm-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <h3 className="pcm-title">打印确认</h3>
          </div>
        </div>

        {/* 配置汇总 */}
        <div className="pcm-body">
          <div className="pcm-summary">
            {/* 打印机 */}
            <div className="pcm-item">
              <span className="pcm-item-label">打印机</span>
              <span className="pcm-item-value">{settings.printerName || '默认打印机'}</span>
            </div>

            {/* 颜色模式 */}
            <div className="pcm-item">
              <span className="pcm-item-label">颜色模式</span>
              <span className={`pcm-item-value ${settings.grayscale ? 'pcm-mono' : 'pcm-color'}`}>
                {colorMode}
              </span>
            </div>

            {/* 纸张尺寸 */}
            <div className="pcm-item">
              <span className="pcm-item-label">纸张尺寸</span>
              <span className="pcm-item-value">{paperSize}</span>
            </div>

            {/* 文件数量 */}
            <div className="pcm-item">
              <span className="pcm-item-label">文件数量</span>
              <span className="pcm-item-value">{totalFiles} 个文件</span>
            </div>

            {/* 打印份数 */}
            <div className="pcm-item">
              <span className="pcm-item-label">打印份数</span>
              <span className="pcm-item-value">{settings.copies || 1} 份</span>
            </div>

            {/* 合并模式（具体模式名称，如「一页两票」） */}
            {mergeMode && settings.mergeMode && settings.mergeMode !== 'none' && (
              <div className="pcm-item">
                <span className="pcm-item-label">合并模式</span>
                <span className="pcm-item-value">
                  <span className="pcm-badge pcm-badge-merge">
                    {settings.mergeMode === 'merge2' ? '一页两票' :
                     settings.mergeMode === 'merge3' ? '一页三票' :
                     settings.mergeMode === 'merge4' ? '一页四票' :
                     settings.mergeMode}
                  </span>
                </span>
              </div>
            )}

            {/* 特殊模式（一普二专，仅在处于一普二专状态时显示） */}
            {isOneNormalTwoSpecial && (
              <div className="pcm-item">
                <span className="pcm-item-label">特殊模式</span>
                <span className="pcm-item-value">
                  <span className="pcm-badge pcm-badge-special">一普二专</span>
                </span>
              </div>
            )}

            {/* 方向 */}
            {settings.landscape && (
              <div className="pcm-item">
                <span className="pcm-item-label">纸张方向</span>
                <span className="pcm-item-value">横向</span>
              </div>
            )}
          </div>

          {/* 确认提示 */}
          <p className="pcm-hint">
            确认后，将 {totalFiles} 个文件发送到打印机
          </p>
        </div>

        {/* 底部操作 */}
        <div className="pcm-footer">
          <button className="pcm-btn pcm-btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button className="pcm-btn pcm-btn-confirm" onClick={onConfirm}>
            确认打印
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(PrintConfirmModal)