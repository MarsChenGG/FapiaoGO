import React, { useMemo, useState } from 'react'

/**
 * 智能打包管理器
 * 包含进度监控、配置界面和结果管理
 */
const PackProgressModal = ({
  visible,
  progress,       // { current, total, stage, currentFile }
  result,         // null | { success, packed, failed, archivePath, fallbackToZip }
  onCancel,
  onClose,
}) => {
  const [showConfig, setShowConfig] = useState(false)

  const stats = useMemo(() => {
    if (!progress) return { pct: 0, current: 0, total: 0, stage: '' }
    const { current = 0, total = 0, stage = '' } = progress
    const pct = total > 0 ? Math.round((current / total) * 100) : 0
    return { pct, current, total, stage }
  }, [progress])

  if (!visible) return null

  const isDone = result !== null

  return (
    <div className="modal-overlay pk-overlay">
      <div className="pk-panel">
        {/* 头部 */}
        <div className="pk-header">
          <div className="pk-header-left">
            <h3 className="pk-title">
              {isDone
                ? (result.success ? '打包完成' : '打包失败')
                : '正在打包'}
            </h3>
          </div>
          {!isDone && (
            <div className="pk-header-actions">
              <button
                className={`pk-config-btn ${showConfig ? 'active' : ''}`}
                onClick={() => setShowConfig(!showConfig)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="2.5" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
                </svg>
                配置
              </button>
            </div>
          )}
        </div>

        {/* 进度区域 */}
        {!isDone ? (
          <>
            <div className="pk-progress-section">
              <div className="pk-ring-row">
                <div className="pk-progress-ring-wrap">
                  <svg className="pk-ring" viewBox="0 0 72 72">
                    <circle className="pk-ring-track" cx="36" cy="36" r="30" />
                    <circle
                      className="pk-ring-fill"
                      cx="36" cy="36" r="30"
                      strokeDasharray={`${stats.pct * 1.884} 188.4`}
                    />
                  </svg>
                  <div className="pk-ring-center">
                    <span className="pk-ring-pct">{stats.pct}%</span>
                  </div>
                </div>
                <div className="pk-stage-info">
                  <span className="pk-stage-label">当前阶段</span>
                  <span className="pk-stage-value">{stats.stage || '准备中'}</span>
                </div>
              </div>
              <div className="pk-bar-track">
                <div className="pk-bar-fill" style={{ width: `${stats.pct}%` }} />
              </div>
              <div className="pk-progress-detail">
                <span className="pk-progress-file">{progress?.currentFile || ''}</span>
                <span className="pk-progress-count">{stats.current}/{stats.total}</span>
              </div>
            </div>

            {/* 配置面板 */}
            {showConfig && (
              <div className="pk-config-panel">
                <div className="pk-config-row">
                  <span className="pk-config-label">打包格式</span>
                  <span className="pk-config-value">自动（7-Zip &gt; ZIP）</span>
                </div>
                <div className="pk-config-row">
                  <span className="pk-config-label">输出目录</span>
                  <span className="pk-config-value">默认（用户选择）</span>
                </div>
                <div className="pk-config-row">
                  <span className="pk-config-label">文件数量</span>
                  <span className="pk-config-value">{stats.total} 个</span>
                </div>
              </div>
            )}
          </>
        ) : (
          /* 完成状态 */
          <div className="pk-result-section">
            {result.success ? (
              <>
                <div className="pk-result-icon success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="5,13 10,18 19,5" />
                  </svg>
                </div>
                <div className="pk-result-stats">
                  <div className="pk-result-stat">
                    <span className="pk-result-val">{result.packed}</span>
                    <span className="pk-result-label">成功</span>
                  </div>
                  <div className="pk-result-stat">
                    <span className={`pk-result-val ${result.failed > 0 ? 'error' : ''}`}>{result.failed}</span>
                    <span className="pk-result-label">失败</span>
                  </div>
                </div>
                {result.archivePath && (
                  <div className="pk-result-path">
                    <span className="pk-result-path-label">输出路径</span>
                    <span className="pk-result-path-value" title={result.archivePath}>{result.archivePath}</span>
                  </div>
                )}
                {result.fallbackToZip && (
                  <div className="pk-result-notice">未检测到 7-Zip/WinRAR，已降级为 ZIP 格式</div>
                )}
                {/* 提醒：不保留原件时，列表已清除 */}
                {!result.keepOriginal && (
                  <div className="pk-result-notice">不保留原件，当前列表已清除，请到压缩包中查看。</div>
                )}
              </>
            ) : (
              <>
                <div className="pk-result-icon error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
                <div className="pk-result-msg">{result.error}</div>
              </>
            )}
          </div>
        )}

        {/* 底部操作 */}
        <div className="pk-footer">
          {isDone ? (
            <button className="pc-btn solid" onClick={onClose}>关闭</button>
          ) : (
            <button className="pc-btn outline" onClick={onCancel}>取消打包</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PackProgressModal