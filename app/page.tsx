"use client"

import { ThemeProvider } from "../components/theme"
import { AppProvider } from "../contexts/app-context"
import { AuthProvider } from "../contexts/auth-context"
import MainApplication from "../components/main-application"

export default function Page() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <MainApplication />
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
