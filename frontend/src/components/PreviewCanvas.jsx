import { useRef, useCallback, useEffect, memo } from 'react'

export default memo(function PreviewCanvas({ previewFile, displayInfo, previewCanvas, grayscale }) {
  const canvasRef = useRef(null)

  // ✅ 使用 callback ref：当 canvas DOM 节点被重建时自动重绘
  //    解决 DevTools 开合导致 displayInfo=null → 组件卸载 → canvas 销毁 → 重挂载后不重绘的问题
  const canvasCallbackRef = useCallback((node) => {
    canvasRef.current = node
    if (!node || !previewCanvas) return
    const ctx = node.getContext('2d')
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    ctx.filter = grayscale ? 'grayscale(100%)' : 'none'
    ctx.drawImage(previewCanvas, 0, 0)
  }, [previewCanvas, grayscale])

  // ✅ 当 previewCanvas 或 grayscale 变化时，重绘已存在的 canvas
  useEffect(() => {
    if (!canvasRef.current || !previewCanvas) return
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    ctx.filter = grayscale ? 'grayscale(100%)' : 'none'
    ctx.drawImage(previewCanvas, 0, 0)
  }, [previewCanvas, grayscale])

  if (!displayInfo || !previewCanvas) return null

  return (
    <div className="paper" style={{
      width: displayInfo.displayWidth,
      height: displayInfo.displayHeight,
      transition: 'width 0.2s ease, height 0.2s ease',
    }}>
      <canvas
        ref={canvasCallbackRef}
        width={previewCanvas.width}
        height={previewCanvas.height}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'crisp-edges',
        }}
      />
    </div>
  )
})
