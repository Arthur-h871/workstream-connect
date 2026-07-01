import { useRef, useState } from "react"
import { useViewport } from "@xyflow/react"

export type DrawingPath = {
  id: string
  pathData: string
  color: string
  strokeWidth: number
}

type Props = {
  drawings: DrawingPath[]
  isDrawing: boolean
  isErasing: boolean
  color: string
  strokeWidth: number
  onPathComplete: (pathData: string) => void
  onPathDelete: (pathId: string) => void
}

export function DrawingLayer({ drawings, isDrawing, isErasing, color, strokeWidth, onPathComplete, onPathDelete }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const isPointerDown = useRef(false)
  const pathPoints = useRef<string[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const { x, y, zoom } = useViewport()

  function getSVGPoint(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - x) / zoom,
      y: (e.clientY - rect.top - y) / zoom,
    }
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (isErasing) {
      e.preventDefault()
      isPointerDown.current = true
      return
    }
    if (!isDrawing) return
    e.preventDefault()
    const pt = getSVGPoint(e)
    if (!pt) return
    isPointerDown.current = true
    pathPoints.current = [`M ${pt.x} ${pt.y}`]
    setCurrentPath(`M ${pt.x} ${pt.y}`)
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!isDrawing || !isPointerDown.current) return
    const pt = getSVGPoint(e)
    if (!pt) return
    pathPoints.current.push(`L ${pt.x} ${pt.y}`)
    setCurrentPath(pathPoints.current.join(" "))
  }

  function handleMouseUp() {
    if (!isPointerDown.current) return
    isPointerDown.current = false
    if (isErasing) return
    if (!isDrawing) return
    const pathData = pathPoints.current.join(" ")
    if (pathPoints.current.length > 1) {
      onPathComplete(pathData)
    }
    setCurrentPath(null)
    pathPoints.current = []
  }

  const interactive = isDrawing || isErasing

  return (
    <svg
      ref={svgRef}
      className={`absolute inset-0 h-full w-full ${
        interactive
          ? `z-10 ${isErasing ? "cursor-cell" : "cursor-crosshair"}`
          : "pointer-events-none z-0"
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g transform={`translate(${x},${y}) scale(${zoom})`}>
        {drawings.map(d => (
          <path
            key={d.id}
            d={d.pathData}
            stroke={d.color}
            strokeWidth={d.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isErasing ? "cursor-cell hover:opacity-30" : ""}
            onClick={isErasing ? () => onPathDelete(d.id) : undefined}
            onMouseEnter={isErasing ? () => { if (isPointerDown.current) onPathDelete(d.id) } : undefined}
          />
        ))}
        {currentPath && (
          <path
            d={currentPath}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
    </svg>
  )
}
