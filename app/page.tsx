"use client"

import { ThemeProvider } from "../components/theme"
import Component from "../reconciliation-tool"

export default function Page() {
  return (
    <ThemeProvider>
      <Component />
    </ThemeProvider>
  )
}
