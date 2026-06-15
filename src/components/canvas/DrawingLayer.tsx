import { useRef, useState } from "react"

export type DrawingPath = {
  id: string
  pathData: string
  color: string
  strokeWidth: number
}

type Props = {
  drawings: DrawingPath[]
  isDrawing: boolean
  color: string
  strokeWidth: number
  onPathComplete: (pathData: string) => void
  onPathDelete: (pathId: string) => void
}

export function DrawingLayer({ drawings, isDrawing, color, strokeWidth, onPathComplete, onPathDelete }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const isPointerDown = useRef(false)
  const pathPoints = useRef<string[]>([])
  const svgRef = useRef<SVGSVGElement>(null)

  function getSVGPoint(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
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
    if (!isPointerDown.current || !isDrawing) return
    isPointerDown.current = false
    const pathData = pathPoints.current.join(" ")
    if (pathPoints.current.length > 1) {
      onPathComplete(pathData)
    }
    setCurrentPath(null)
    pathPoints.current = []
  }

  return (
    <svg
      ref={svgRef}
      className={`absolute inset-0 h-full w-full ${isDrawing ? "cursor-crosshair z-10" : "pointer-events-none z-0"}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {drawings.map(d => (
        <path
          key={d.id}
          d={d.pathData}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isDrawing ? "cursor-crosshair" : "cursor-pointer hover:opacity-50"}
          onClick={isDrawing ? undefined : () => onPathDelete(d.id)}
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
    </svg>
  )
}
