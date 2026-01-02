"use client"

import type React from "react"

import { useMemo } from "react"
import { useApp } from "../contexts/app-context"
import { useThemeAccent } from "./theme"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, GitMerge, AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"

export default function Dashboard() {
  const { records, matches, periods, currentPeriod } = useApp()
  const theme = useThemeAccent()

  const metrics = useMemo(() => {
    const totalRecords = records.length
    const matchedRecords = records.filter((r) => r.status === "matched").length
    const unmatchedRecords = records.filter((r) => r.status === "unmatched").length
    const exceptionRecords = records.filter((r) => r.status === "exception").length

    const bankRecords = records.filter((r) => r.source === "bank")
    const cashbookRecords = records.filter((r) => r.source === "cashbook")

    const totalBankAmount = bankRecords.reduce((sum, r) => sum + r.amount, 0)
    const totalCashbookAmount = cashbookRecords.reduce((sum, r) => sum + r.amount, 0)
    const netDifference = totalBankAmount - totalCashbookAmount

    const matchRate = totalRecords > 0 ? (matchedRecords / totalRecords) * 100 : 0

    return {
      totalRecords,
      matchedRecords,
      unmatchedRecords,
      exceptionRecords,
      totalBankAmount,
      totalCashbookAmount,
      netDifference,
      matchRate,
      totalMatches: matches.length,
      openPeriods: periods.filter((p) => p.status === "open").length,
    }
  }, [records, matches, periods])

  const chartData = useMemo(() => {
    const statusData = [
      { name: "Matched", value: metrics.matchedRecords, color: "#10b981" },
      { name: "Unmatched", value: metrics.unmatchedRecords, color: "#ef4444" },
      { name: "Exceptions", value: metrics.exceptionRecords, color: "#f59e0b" },
    ]

    const sourceData = [
      { name: "Bank", amount: metrics.totalBankAmount },
      { name: "Cashbook", amount: metrics.totalCashbookAmount },
    ]

    // Trend data (mock for demo)
    const trendData = [
      { month: "Jan", matched: 85, unmatched: 15 },
      { month: "Feb", matched: 88, unmatched: 12 },
      { month: "Mar", matched: 92, unmatched: 8 },
      { month: "Apr", matched: 87, unmatched: 13 },
      { month: "May", matched: 94, unmatched: 6 },
      { month: "Jun", matched: Math.round(metrics.matchRate), unmatched: Math.round(100 - metrics.matchRate) },
    ]

    return { statusData, sourceData, trendData }
  }, [metrics])

  return (
    <div className="space-y-6">
      {/* Current Period Banner */}
      {currentPeriod && (
        <Card className={cn("border-l-4", theme.classes.accentBorder)}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{currentPeriod.name}</CardTitle>
                <CardDescription>
                  {currentPeriod.startDate} to {currentPeriod.endDate}
                </CardDescription>
              </div>
              <Badge variant={currentPeriod.status === "open" ? "default" : "secondary"}>{currentPeriod.status}</Badge>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Records"
          value={metrics.totalRecords.toLocaleString()}
          icon={<FileText className="w-5 h-5" />}
          trend={+5.2}
        />
        <MetricCard
          title="Match Rate"
          value={`${metrics.matchRate.toFixed(1)}%`}
          icon={<GitMerge className="w-5 h-5" />}
          trend={+2.1}
        />
        <MetricCard
          title="Net Difference"
          value={`$${Math.abs(metrics.netDifference).toLocaleString()}`}
          icon={metrics.netDifference >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          trend={metrics.netDifference >= 0 ? +1.2 : -1.2}
          negative={metrics.netDifference < 0}
        />
        <MetricCard
          title="Exceptions"
          value={metrics.exceptionRecords.toString()}
          icon={<AlertTriangle className="w-5 h-5" />}
          trend={-12.5}
          negative={metrics.exceptionRecords > 0}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Record Status Distribution</CardTitle>
            <CardDescription>Current reconciliation status breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              {chartData.statusData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm">
                    {item.name}: {item.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Amount Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Amount Comparison</CardTitle>
            <CardDescription>Bank vs Cashbook totals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.sourceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, "Amount"]} />
                  <Bar dataKey="amount" fill={theme.classes.accentBg.replace("bg-", "#")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Match Rate Trend</CardTitle>
          <CardDescription>Monthly reconciliation performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                <Tooltip formatter={(value) => [`${value}%`, "Rate"]} />
                <Line type="monotone" dataKey="matched" stroke="#10b981" strokeWidth={3} name="Matched" />
                <Line type="monotone" dataKey="unmatched" stroke="#ef4444" strokeWidth={3} name="Unmatched" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Matches</CardTitle>
            <CardDescription>Latest reconciliation activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {matches.slice(0, 5).map((match) => (
                <div key={match.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        match.status === "matched"
                          ? "bg-green-500"
                          : match.status === "pending"
                            ? "bg-yellow-500"
                            : "bg-red-500",
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {match.bankRecords.length} Bank ↔ {match.cashbookRecords.length} Cashbook
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {match.matchType} • {match.confidence}% confidence
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${Math.abs(match.amountDiff).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{new Date(match.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Periods</CardTitle>
            <CardDescription>Period status overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {periods.slice(0, 5).map((period) => (
                <div key={period.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {period.status === "open" ? (
                      <Clock className="w-4 h-4 text-blue-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{period.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {period.startDate} - {period.endDate}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={period.status === "open" ? "default" : "secondary"}>{period.status}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{period.totalMatched} matched</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  icon,
  trend,
  negative = false,
}: {
  title: string
  value: string
  icon: React.ReactNode
  trend?: number
  negative?: boolean
}) {
  const theme = useThemeAccent()

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className={cn("p-2 rounded-lg", theme.classes.accentBg, "bg-opacity-10")}>{icon}</div>
          {trend !== undefined && (
            <div className={cn("flex items-center gap-1 text-xs", negative ? "text-red-600" : "text-green-600")}>
              {negative ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  )
}
