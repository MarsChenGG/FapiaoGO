import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.icon}>⚠️</div>
            <h2 style={styles.title}>出错了</h2>
            <p style={styles.message}>
              应用程序遇到意外错误，请尝试刷新页面或联系支持。
            </p>
            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>错误详情</summary>
                <pre style={styles.errorText}>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <pre style={styles.errorText}>{this.state.errorInfo.componentStack}</pre>
                )}
              </details>
            )}
            <div style={styles.actions}>
              <button onClick={this.handleReset} style={styles.btnSecondary}>
                重试
              </button>
              <button onClick={this.handleReload} style={styles.btnPrimary}>
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--bg, #f5f6f8)',
    padding: '20px',
    fontFamily:
      "'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    background: 'var(--white, #ffffff)',
    borderRadius: '12px',
    padding: '48px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
  },
  icon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text, #1a1d27)',
    marginBottom: '12px',
  },
  message: {
    fontSize: '14px',
    color: 'var(--text-2, #4a5568)',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  details: {
    textAlign: 'left',
    marginBottom: '24px',
    padding: '12px',
    background: 'var(--surface, #f7f8fa)',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'var(--text-2, #4a5568)',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: '500',
    marginBottom: '8px',
  },
  errorText: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '11px',
    color: 'var(--danger, #f06b6b)',
    marginTop: '8px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  btnSecondary: {
    padding: '8px 24px',
    borderRadius: '8px',
    border: '1px solid var(--border, #e2e5ea)',
    background: 'transparent',
    color: 'var(--text, #1a1d27)',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  btnPrimary: {
    padding: '8px 24px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--accent, #3b6cf5)',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
}

export default ErrorBoundary
