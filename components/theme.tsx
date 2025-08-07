"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type Accent = "emerald" | "teal" | "purple" | "amber"

type ThemeCtx = {
  accent: Accent
  setAccent: (a: Accent) => void
  classes: {
    gradient: string
    accentText: string
    accentBg: string
    accentBgHover: string
    accentBorder: string
    tintMatched: string
    tintUnmatched: string
    ripple: string
  }
}

const ThemeContext = createContext<ThemeCtx | null>(null)

const ACCENT_MAP: Record<Accent, ThemeCtx["classes"]> = {
  emerald: {
    gradient: "bg-gradient-to-tr from-emerald-500/90 via-emerald-500/80 to-teal-500/80",
    accentText: "text-emerald-700",
    accentBg: "bg-emerald-600",
    accentBgHover: "hover:bg-emerald-700",
    accentBorder: "border-emerald-100/50",
    tintMatched: "bg-emerald-50/70 dark:bg-emerald-950/20",
    tintUnmatched: "bg-rose-50/70 dark:bg-rose-950/20",
    ripple: "bg-emerald-500/30",
  },
  teal: {
    gradient: "bg-gradient-to-tr from-teal-500/90 via-teal-500/80 to-cyan-500/80",
    accentText: "text-teal-700",
    accentBg: "bg-teal-600",
    accentBgHover: "hover:bg-teal-700",
    accentBorder: "border-teal-100/50",
    tintMatched: "bg-teal-50/70 dark:bg-teal-950/20",
    tintUnmatched: "bg-orange-50/70 dark:bg-orange-950/20",
    ripple: "bg-teal-500/30",
  },
  purple: {
    gradient: "bg-gradient-to-tr from-purple-500/90 via-purple-500/80 to-fuchsia-500/80",
    accentText: "text-purple-700",
    accentBg: "bg-purple-600",
    accentBgHover: "hover:bg-purple-700",
    accentBorder: "border-purple-100/50",
    tintMatched: "bg-purple-50/70 dark:bg-purple-950/20",
    tintUnmatched: "bg-rose-50/70 dark:bg-rose-950/20",
    ripple: "bg-purple-500/30",
  },
  amber: {
    gradient: "bg-gradient-to-tr from-amber-500/90 via-amber-500/80 to-orange-500/80",
    accentText: "text-amber-700",
    accentBg: "bg-amber-600",
    accentBgHover: "hover:bg-amber-700",
    accentBorder: "border-amber-100/50",
    tintMatched: "bg-amber-50/70 dark:bg-amber-950/20",
    tintUnmatched: "bg-sky-50/70 dark:bg-sky-950/20",
    ripple: "bg-amber-500/30",
  },
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccent] = useState<Accent>("emerald")

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("recon_accent") as Accent | null) : null
    if (saved && ACCENT_MAP[saved]) setAccent(saved)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("recon_accent", accent)
  }, [accent])

  const value = useMemo<ThemeCtx>(() => {
    const classes = ACCENT_MAP[accent]
    return { accent, setAccent, classes }
  }, [accent])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeAccent() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useThemeAccent must be used within ThemeProvider")
  return ctx
}

export function ThemePicker() {
  const { accent, setAccent } = useThemeAccent()
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-white/80">Theme</span>
      <Select value={accent} onValueChange={(v: Accent) => setAccent(v)}>
        <SelectTrigger className="w-[120px] bg-white/10 text-white border-white/20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="emerald">Emerald</SelectItem>
          <SelectItem value="teal">Teal</SelectItem>
          <SelectItem value="purple">Purple</SelectItem>
          <SelectItem value="amber">Amber</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
