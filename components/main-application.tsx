"use client"

import { useState } from "react"
import { useAuth } from "../contexts/auth-context"
import { useThemeAccent } from "./theme"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Upload, GitMerge, User, Shield, LogOut, FileText, History, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import Dashboard from "./dashboard"
import FileUpload from "./file-upload"
import ReconciliationWorkspace from "./reconciliation-workspace"
import ReportsPage from "./reports-page"
import AdminSettings from "./admin-settings"
import AuditLogs from "./audit-logs"
import LoginForm from "./login-form"

export default function MainApplication() {
  const { user, logout, hasPermission } = useAuth()
  const theme = useThemeAccent()
  const [activeTab, setActiveTab] = useState("dashboard")

  if (!user) {
    return <LoginForm />
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3, permission: "read" },
    { id: "upload", label: "Upload", icon: Upload, permission: "write" },
    { id: "reconcile", label: "Reconcile", icon: GitMerge, permission: "read" },
    { id: "reports", label: "Reports", icon: FileText, permission: "view_reports" },
    { id: "audit", label: "Audit", icon: History, permission: "view_audit" },
    { id: "settings", label: "Settings", icon: Settings, permission: "manage_users" },
  ].filter((tab) => hasPermission(tab.permission))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Card className={cn("mb-6 shadow-lg rounded-none border-0 text-white", theme.classes.gradient)}>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <GitMerge className="w-6 h-6" />
              Financial Reconciliation System
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-white/80">
                <User className="w-4 h-4" />
                <span className="text-sm">{user.name}</span>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span className="text-xs capitalize">{user.role}</span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="bg-white/10 hover:bg-white/20 border-white/20 text-white"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 mb-6">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard />
          </TabsContent>

          <TabsContent value="upload">
            <FileUpload />
          </TabsContent>

          <TabsContent value="reconcile">
            <ReconciliationWorkspace />
          </TabsContent>

          <TabsContent value="reports">
            <ReportsPage />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogs />
          </TabsContent>

          <TabsContent value="settings">
            <AdminSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
