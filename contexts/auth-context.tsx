"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"

export type UserRole = "admin" | "reconciler" | "viewer"

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  permissions: string[]
}

type AuthContextType = {
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const ROLE_PERMISSIONS = {
  admin: ["read", "write", "delete", "manage_users", "close_periods", "view_audit", "export_audit"],
  reconciler: ["read", "write", "match", "unmatch", "export_data", "view_reports"],
  viewer: ["read", "view_reports"],
}

// Mock users for demo
const MOCK_USERS: User[] = [
  { id: "1", name: "Admin User", email: "admin@company.com", role: "admin", permissions: ROLE_PERMISSIONS.admin },
  {
    id: "2",
    name: "John Reconciler",
    email: "john@company.com",
    role: "reconciler",
    permissions: ROLE_PERMISSIONS.reconciler,
  },
  { id: "3", name: "Jane Viewer", email: "jane@company.com", role: "viewer", permissions: ROLE_PERMISSIONS.viewer },
]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const savedUser = localStorage.getItem("recon_user")
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    } else {
      // Auto-login as admin for demo
      setUser(MOCK_USERS[0])
      localStorage.setItem("recon_user", JSON.stringify(MOCK_USERS[0]))
    }
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    const foundUser = MOCK_USERS.find((u) => u.email === email)
    if (foundUser) {
      setUser(foundUser)
      localStorage.setItem("recon_user", JSON.stringify(foundUser))
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("recon_user")
  }

  const hasPermission = (permission: string): boolean => {
    return user?.permissions.includes(permission) ?? false
  }

  return <AuthContext.Provider value={{ user, login, logout, hasPermission }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
