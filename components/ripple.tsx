"use client"

import { useRef, useState } from "react"

type Ripple = {
  key: number
  x: number
  y: number
  size: number
}

type RippleProps = {
  children: React.ReactNode
  className?: string
  colorClass?: string // e.g., "bg-emerald-500/30"
}

export default function RippleContainer({ children, className = "", colorClass = "bg-emerald-500/30" }: RippleProps) {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const cntRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef(0)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = cntRef.current?.getBoundingClientRect()
    if (!rect) return
    const size = Math.max(rect.width, rect.height)
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2
    const key = keyRef.current++
    setRipples((prev) => [...prev, { key, x, y, size }])
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.key !== key))
    }, 550)
  }

  return (
    <div ref={cntRef} className={`relative overflow-hidden ${className}`} onPointerDown={onPointerDown}>
      {children}
      <style jsx>{`
        .ripple {
          position: absolute;
          border-radius: 9999px;
          transform: scale(0);
          animation: ripple 500ms ease-out forwards;
          pointer-events: none;
        }
        @keyframes ripple {
          0% { transform: scale(0); opacity: 0.4; }
          100% { transform: scale(2.75); opacity: 0; }
        }
      `}</style>
      {ripples.map((r) => (
        <span
          key={r.key}
          className={`ripple ${colorClass}`}
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </div>
  )
}
