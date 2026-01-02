"use client"

import { useState } from "react"
import { useAuth } from "../contexts/auth-context"
import { useApp } from "../contexts/app-context"
import { useThemeAccent } from "./theme"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Settings, Database, Shield, Trash2, Plus, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import type { User, UserRole } from "../contexts/auth-context"

// Mock users for demo
const mockUsers: User[] = [
  {
    id: "1",
    name: "Admin User",
    email: "admin@company.com",
    role: "admin",
    permissions: ["read", "write", "delete", "manage_users", "close_periods", "view_audit", "export_audit"],
  },
  {
    id: "2",
    name: "John Reconciler",
    email: "john@company.com",
    role: "reconciler",
    permissions: ["read", "write", "match", "unmatch", "export_data", "view_reports"],
  },
  { id: "3", name: "Jane Viewer", email: "jane@company.com", role: "viewer", permissions: ["read", "view_reports"] },
]

export default function AdminSettings() {
  const { user, hasPermission } = useAuth()
  const { records, matches, periods, templates, logAction } = useApp()
  const theme = useThemeAccent()

  const [users, setUsers] = useState<User[]>(mockUsers)
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "viewer" as UserRole })
  const [systemSettings, setSystemSettings] = useState({
    autoMatchTolerance: 0,
    dateTolerance: 0,
    defaultCurrency: "USD",
    retentionDays: 365,
    enableAuditLog: true,
  })

  if (!hasPermission("manage_users")) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>You don't have permission to access admin settings.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) return

    const rolePermissions = {
      admin: ["read", "write", "delete", "manage_users", "close_periods", "view_audit", "export_audit"],
      reconciler: ["read", "write", "match", "unmatch", "export_data", "view_reports"],
      viewer: ["read", "view_reports"],
    }

    const user: User = {
      id: `user_${Date.now()}`,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      permissions: rolePermissions[newUser.role],
    }

    setUsers((prev) => [...prev, user])
    setNewUser({ name: "", email: "", role: "viewer" })
    logAction("CREATE", "user", user.id, { name: user.name, email: user.email, role: user.role })
  }

  const handleDeleteUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId))
    logAction("DELETE", "user", userId)
  }

  const handleUpdateRole = (userId: string, newRole: UserRole) => {
    const rolePermissions = {
      admin: ["read", "write", "delete", "manage_users", "close_periods", "view_audit", "export_audit"],
      reconciler: ["read", "write", "match", "unmatch", "export_data", "view_reports"],
      viewer: ["read", "view_reports"],
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole, permissions: rolePermissions[newRole] } : u)),
    )
    logAction("UPDATE", "user", userId, { role: newRole })
  }

  const handleSaveSettings = () => {
    logAction("UPDATE", "system_settings", "global", systemSettings)
    alert("Settings saved successfully")
  }

  const clearAllData = () => {
    if (confirm("Are you sure you want to clear all data? This action cannot be undone.")) {
      localStorage.clear()
      window.location.reload()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Admin Settings
          </CardTitle>
          <CardDescription>Manage users, system configuration, and data</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="system">System Settings</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          {/* Add New User */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add New User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={newUser.name}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="email@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(v: UserRole) => setNewUser((prev) => ({ ...prev, role: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="reconciler">Reconciler</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddUser}
                    className={cn("gap-2", theme.classes.accentBg, theme.classes.accentBgHover)}
                  >
                    <Plus className="w-4 h-4" />
                    Add User
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </div>
                      <Badge
                        variant={u.role === "admin" ? "default" : u.role === "reconciler" ? "secondary" : "outline"}
                      >
                        {u.role}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={u.role} onValueChange={(v: UserRole) => handleUpdateRole(u.id, v)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="reconciler">Reconciler</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {u.id !== user?.id && (
                        <Button size="sm" variant="outline" onClick={() => handleDeleteUser(u.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Auto-Match Amount Tolerance</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={systemSettings.autoMatchTolerance}
                      onChange={(e) =>
                        setSystemSettings((prev) => ({ ...prev, autoMatchTolerance: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date Tolerance (days)</Label>
                    <Input
                      type="number"
                      value={systemSettings.dateTolerance}
                      onChange={(e) =>
                        setSystemSettings((prev) => ({ ...prev, dateTolerance: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Default Currency</Label>
                    <Select
                      value={systemSettings.defaultCurrency}
                      onValueChange={(v) => setSystemSettings((prev) => ({ ...prev, defaultCurrency: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data Retention (days)</Label>
                    <Input
                      type="number"
                      value={systemSettings.retentionDays}
                      onChange={(e) =>
                        setSystemSettings((prev) => ({ ...prev, retentionDays: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              </div>
              <Button
                onClick={handleSaveSettings}
                className={cn("gap-2", theme.classes.accentBg, theme.classes.accentBgHover)}
              >
                <Save className="w-4 h-4" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          {/* Data Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{records.length}</p>
                    <p className="text-sm text-muted-foreground">Records</p>
                  </div>
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{matches.length}</p>
                    <p className="text-sm text-muted-foreground">Matches</p>
                  </div>
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{periods.length}</p>
                    <p className="text-sm text-muted-foreground">Periods</p>
                  </div>
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{templates.length}</p>
                    <p className="text-sm text-muted-foreground">Templates</p>
                  </div>
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Data Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Management</CardTitle>
              <CardDescription>Manage application data and storage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Data management actions are irreversible. Please ensure you have backups before proceeding.
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-4">
                <Button variant="destructive" onClick={clearAllData} className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Clear All Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
