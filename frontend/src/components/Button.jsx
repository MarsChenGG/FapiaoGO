/**
 * Button — 统一按钮组件
 *
 * variant : 'primary' | 'ghost' | 'outline' | 'danger' | 'icon' | 'win'
 * size    : 'sm' | 'md' | 'lg'
 * 其余 props 透传到 <button>
 */
import { memo, forwardRef } from 'react'

const Button = memo(forwardRef(function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}, ref) {
  const cls = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    icon && !children ? 'btn--icon-only' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button ref={ref} className={cls} {...props}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children && <span className="btn-text">{children}</span>}
    </button>
  )
}))

export default Button
