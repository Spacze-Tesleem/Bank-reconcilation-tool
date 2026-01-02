"use client"

import { useState, useMemo } from "react"
import { useApp } from "../contexts/app-context"
import { useAuth } from "../contexts/auth-context"
import { useThemeAccent } from "./theme"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { History, Search, Download, Filter, Shield, User, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AuditLogs() {
  const { auditLogs } = useApp()
  const { hasPermission } = useAuth()
  const theme = useThemeAccent()

  const [searchTerm, setSearchTerm] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [entityFilter, setEntityFilter] = useState("all")
  const [userFilter, setUserFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const filteredLogs = useMemo(() => {
    let filtered = auditLogs

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (log) =>
          log.action.toLowerCase().includes(term) ||
          log.entity.toLowerCase().includes(term) ||
          log.userName.toLowerCase().includes(term) ||
          log.entityId.toLowerCase().includes(term),
      )
    }

    if (actionFilter !== "all") {
      filtered = filtered.filter((log) => log.action === actionFilter)
    }

    if (entityFilter !== "all") {
      filtered = filtered.filter((log) => log.entity === entityFilter)
    }

    if (userFilter !== "all") {
      filtered = filtered.filter((log) => log.userId === userFilter)
    }

    if (dateFrom) {
      filtered = filtered.filter((log) => log.timestamp >= dateFrom)
    }

    if (dateTo) {
      filtered = filtered.filter((log) => log.timestamp <= dateTo + "T23:59:59")
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [auditLogs, searchTerm, actionFilter, entityFilter, userFilter, dateFrom, dateTo])

  const uniqueActions = [...new Set(auditLogs.map((log) => log.action))]
  const uniqueEntities = [...new Set(auditLogs.map((log) => log.entity))]
  const uniqueUsers = [...new Set(auditLogs.map((log) => ({ id: log.userId, name: log.userName })))]

  const exportLogs = () => {
    if (!hasPermission("export_audit")) return

    const csvData = filteredLogs.map((log) => ({
      Timestamp: new Date(log.timestamp).toLocaleString(),
      User: log.userName,
      Action: log.action,
      Entity: log.entity,
      "Entity ID": log.entityId,
      Changes: JSON.stringify(log.changes),
      "IP Address": log.ipAddress || "N/A",
    }))

    const csv = [
      Object.keys(csvData[0]).join(","),
      ...csvData.map((row) =>
        Object.values(row)
          .map((val) => `"${val}"`)
          .join(","),
      ),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!hasPermission("view_audit")) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>You don't have permission to view audit logs.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case "CREATE":
        return "bg-green-100 text-green-800"
      case "UPDATE":
        return "bg-blue-100 text-blue-800"
      case "DELETE":
        return "bg-red-100 text-red-800"
      case "IMPORT":
        return "bg-purple-100 text-purple-800"
      case "EXPORT":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Audit Trail
              </CardTitle>
              <CardDescription>Complete history of user actions and system changes</CardDescription>
            </div>
            <Button onClick={exportLogs} disabled={!hasPermission("export_audit")} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Logs
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {uniqueActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {uniqueEntities.map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {entity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>User</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant="secondary">{filteredLogs.length} logs found</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("")
                setActionFilter("all")
                setEntityFilter("all")
                setUserFilter("all")
                setDateFrom("")
                setDateTo("")
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredLogs.slice(0, 100).map((log) => (
              <div key={log.id} className="flex items-start gap-4 p-4 border rounded-lg">
                <div className="flex-shrink-0">
                  <div className={cn("px-2 py-1 rounded text-xs font-medium", getActionColor(log.action))}>
                    {log.action}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{log.userName}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">{log.entity}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground font-mono">{log.entityId}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    {log.ipAddress && (
                      <>
                        <span>•</span>
                        <span>{log.ipAddress}</span>
                      </>
                    )}
                  </div>

                  {Object.keys(log.changes).length > 0 && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                      <strong>Changes:</strong>
                      <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(log.changes, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filteredLogs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No audit logs found matching the current filters.
              </div>
            )}

            {filteredLogs.length > 100 && (
              <div className="text-center py-4 text-muted-foreground">
                Showing first 100 of {filteredLogs.length} logs. Use filters to narrow results.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
