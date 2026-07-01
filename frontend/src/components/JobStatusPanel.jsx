/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  JobStatusPanel — Intent-Level Status Display                  ║
 * ║                                                                  ║
 * ║  Shows ONLY: submitted / dispatched                             ║
 * ║  Shows NEVER: spooler / printer hardware / OS execution state   ║
 * ║                                                                  ║
 * ║  FRONTEND ARCHITECTURE POSITION:                                ║
 * ║  Consumer of PrintJob intent metadata.                          ║
 * ║  Does not interact with OS, binary, or execution in any form.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React from 'react'
import { INTENT_STATUS } from '../hooks/usePrintIntent'

/**
 * @param {object} props
 * @param {object} props.intentState - from usePrintIntent hook
 * @param {function} props.onDismiss - close the panel
 */
const JobStatusPanel = ({ intentState, onDismiss }) => {
  const { status, submittedAt, message } = intentState

  if (status === INTENT_STATUS.IDLE) return null

  const statusConfig = {
    [INTENT_STATUS.SUBMITTED]: {
      icon: '📤',
      label: '已提交',
      className: 'intent-submitted',
    },
    [INTENT_STATUS.DISPATCHED]: {
      icon: '✅',
      label: '已发送',
      className: 'intent-dispatched',
    },
  }

  const config = statusConfig[status] || statusConfig[INTENT_STATUS.SUBMITTED]

  return (
    <div className={`job-status-panel ${config.className}`}>
      <div className="job-status-content">
        <span className="job-status-icon">{config.icon}</span>
        <div className="job-status-info">
          <span className="job-status-label">{config.label}</span>
          {message && <span className="job-status-msg">{message}</span>}
          {submittedAt && (
            <span className="job-status-time">
              {new Date(submittedAt).toLocaleTimeString('zh-CN')}
            </span>
          )}
        </div>
      </div>
      <button className="job-status-dismiss" onClick={onDismiss} title="关闭">
        ×
      </button>
    </div>
  )
}

export default JobStatusPanel
