import React from 'react'

/**
 * 统一提示弹框组件
 * 替换原生 alert()，保持与现有 Modal 组件风格一致
 */
const AlertModal = ({
  visible,
  title = '提示',
  message,
  type = 'info', // 'info' | 'warning'
  onClose,
}) => {
  if (!visible) return null

  const iconColor = type === 'warning' ? 'var(--warning)' : 'var(--accent)'

  return (
    <div className="modal-overlay am-overlay">
      <div className="am-panel">
        {/* 头部 */}
        <div className="am-header">
          <div className="am-header-left">
            <svg
              className="am-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke={iconColor}
              strokeWidth="2"
            >
              {type === 'warning' ? (
                <>
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <circle cx="12" cy="12" r="10" />
                </>
              ) : (
                <>
                  <path d="M12 16h.01" />
                  <path d="M12 8v4" />
                  <circle cx="12" cy="12" r="10" />
                </>
              )}
            </svg>
            <h3 className="am-title">{title}</h3>
          </div>
        </div>

        {/* 消息正文 */}
        <div className="am-body">{message}</div>

        {/* 底部操作 */}
        <div className="am-footer">
          <button className="pc-btn solid" onClick={onClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertModal