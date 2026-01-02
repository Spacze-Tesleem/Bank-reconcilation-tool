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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Download, Calendar, TrendingUp, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ReportsPage() {
  const { records, matches, periods, currentPeriod } = useApp()
  const { hasPermission } = useAuth()
  const theme = useThemeAccent()

  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod?.id || "default")
  const [reportType, setReportType] = useState("summary")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const reportData = useMemo(() => {
    const filteredRecords = records.filter((record) => {
      if (selectedPeriod && currentPeriod) {
        return record.date >= currentPeriod.startDate && record.date <= currentPeriod.endDate
      }
      if (dateFrom && dateTo) {
        return record.date >= dateFrom && record.date <= dateTo
      }
      return true
    })

    const matchedRecords = filteredRecords.filter((r) => r.status === "matched")
    const unmatchedRecords = filteredRecords.filter((r) => r.status === "unmatched")
    const exceptionRecords = filteredRecords.filter((r) => r.status === "exception")

    const bankTotal = filteredRecords.filter((r) => r.source === "bank").reduce((sum, r) => sum + r.amount, 0)
    const cashbookTotal = filteredRecords.filter((r) => r.source === "cashbook").reduce((sum, r) => sum + r.amount, 0)

    return {
      totalRecords: filteredRecords.length,
      matchedCount: matchedRecords.length,
      unmatchedCount: unmatchedRecords.length,
      exceptionCount: exceptionRecords.length,
      bankTotal,
      cashbookTotal,
      netDifference: bankTotal - cashbookTotal,
      matchRate: filteredRecords.length > 0 ? (matchedRecords.length / filteredRecords.length) * 100 : 0,
      records: filteredRecords,
      matches: matches.filter(
        (m) =>
          m.bankRecords.some((r) => filteredRecords.some((fr) => fr.id === r.id)) ||
          m.cashbookRecords.some((r) => filteredRecords.some((fr) => fr.id === r.id)),
      ),
    }
  }, [records, matches, selectedPeriod, currentPeriod, dateFrom, dateTo])

  const generatePDFReport = async () => {
    if (!hasPermission("view_reports")) return

    try {
      const { jsPDF } = await import("jspdf")
      const autoTable = (await import("jspdf-autotable")).default

      const doc = new jsPDF()

      // Header
      doc.setFontSize(20)
      doc.text("Reconciliation Report", 20, 30)

      doc.setFontSize(12)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 45)
      if (currentPeriod) {
        doc.text(`Period: ${currentPeriod.name}`, 20, 55)
      }

      // Summary
      doc.setFontSize(16)
      doc.text("Summary", 20, 75)

      const summaryData = [
        ["Total Records", reportData.totalRecords.toString()],
        ["Matched Records", reportData.matchedCount.toString()],
        ["Unmatched Records", reportData.unmatchedCount.toString()],
        ["Exception Records", reportData.exceptionCount.toString()],
        ["Match Rate", `${reportData.matchRate.toFixed(1)}%`],
        ["Bank Total", `$${reportData.bankTotal.toLocaleString()}`],
        ["Cashbook Total", `$${reportData.cashbookTotal.toLocaleString()}`],
        ["Net Difference", `$${reportData.netDifference.toLocaleString()}`],
      ]

      autoTable(doc, {
        startY: 85,
        head: [["Metric", "Value"]],
        body: summaryData,
        theme: "grid",
      })

      // Unmatched Records
      if (reportData.unmatchedCount > 0) {
        const unmatchedRecords = reportData.records.filter((r) => r.status === "unmatched")

        doc.addPage()
        doc.setFontSize(16)
        doc.text("Unmatched Records", 20, 30)

        const unmatchedData = unmatchedRecords.map((record) => [
          record.source,
          record.date,
          `$${record.amount.toLocaleString()}`,
          record.description,
          record.reference || "",
        ])

        autoTable(doc, {
          startY: 40,
          head: [["Source", "Date", "Amount", "Description", "Reference"]],
          body: unmatchedData,
          theme: "grid",
        })
      }

      doc.save(`reconciliation-report-${new Date().toISOString().split("T")[0]}.pdf`)
    } catch (error) {
      console.error("Failed to generate PDF:", error)
    }
  }

  const generateExcelReport = async () => {
    if (!hasPermission("view_reports")) return

    try {
      const XLSX = await import("xlsx")

      const wb = XLSX.utils.book_new()

      // Summary sheet
      const summaryData = [
        ["Metric", "Value"],
        ["Total Records", reportData.totalRecords],
        ["Matched Records", reportData.matchedCount],
        ["Unmatched Records", reportData.unmatchedCount],
        ["Exception Records", reportData.exceptionCount],
        ["Match Rate", `${reportData.matchRate.toFixed(1)}%`],
        ["Bank Total", reportData.bankTotal],
        ["Cashbook Total", reportData.cashbookTotal],
        ["Net Difference", reportData.netDifference],
      ]

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")

      // All records sheet
      const recordsData = [
        ["Source", "Date", "Amount", "Description", "Reference", "Status"],
        ...reportData.records.map((record) => [
          record.source,
          record.date,
          record.amount,
          record.description,
          record.reference || "",
          record.status,
        ]),
      ]

      const recordsWs = XLSX.utils.aoa_to_sheet(recordsData)
      XLSX.utils.book_append_sheet(wb, recordsWs, "All Records")

      // Matches sheet
      const matchesData = [
        ["Match ID", "Type", "Bank Records", "Cashbook Records", "Amount Diff", "Confidence"],
        ...reportData.matches.map((match) => [
          match.id,
          match.matchType,
          match.bankRecords.length,
          match.cashbookRecords.length,
          match.amountDiff,
          `${match.confidence}%`,
        ]),
      ]

      const matchesWs = XLSX.utils.aoa_to_sheet(matchesData)
      XLSX.utils.book_append_sheet(wb, matchesWs, "Matches")

      XLSX.writeFile(wb, `reconciliation-report-${new Date().toISOString().split("T")[0]}.xlsx`)
    } catch (error) {
      console.error("Failed to generate Excel:", error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Reports & Analytics
          </CardTitle>
          <CardDescription>Generate comprehensive reconciliation reports and analyze trends</CardDescription>
        </CardHeader>
      </Card>

      {/* Report Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary Report</SelectItem>
                  <SelectItem value="detailed">Detailed Report</SelectItem>
                  <SelectItem value="exceptions">Exceptions Report</SelectItem>
                  <SelectItem value="trends">Trend Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Custom Date Range</SelectItem>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={!!selectedPeriod}
              />
            </div>

            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={!!selectedPeriod}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={generatePDFReport}
              disabled={!hasPermission("view_reports")}
              className={cn("gap-2", theme.classes.accentBg, theme.classes.accentBgHover)}
            >
              <Download className="w-4 h-4" />
              Generate PDF
            </Button>
            <Button onClick={generateExcelReport} disabled={!hasPermission("view_reports")} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Generate Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{reportData.totalRecords}</p>
                    <p className="text-sm text-muted-foreground">Total Records</p>
                  </div>
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{reportData.matchedCount}</p>
                    <p className="text-sm text-muted-foreground">Matched</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-red-600">{reportData.unmatchedCount}</p>
                    <p className="text-sm text-muted-foreground">Unmatched</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{reportData.matchRate.toFixed(1)}%</p>
                    <p className="text-sm text-muted-foreground">Match Rate</p>
                  </div>
                  <Calendar className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Bank Total</p>
                  <p className="text-2xl font-bold">${reportData.bankTotal.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Cashbook Total</p>
                  <p className="text-2xl font-bold">${reportData.cashbookTotal.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Net Difference</p>
                  <p
                    className={cn(
                      "text-2xl font-bold",
                      reportData.netDifference === 0 ? "text-green-600" : "text-red-600",
                    )}
                  >
                    ${Math.abs(reportData.netDifference).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Records</CardTitle>
              <CardDescription>All records in the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.records.slice(0, 50).map((record) => (
                      <tr key={record.id} className="border-b">
                        <td className="p-2">
                          <Badge variant={record.source === "bank" ? "default" : "secondary"}>{record.source}</Badge>
                        </td>
                        <td className="p-2">{record.date}</td>
                        <td className="p-2 text-right font-mono">${record.amount.toLocaleString()}</td>
                        <td className="p-2 max-w-48 truncate">{record.description}</td>
                        <td className="p-2">
                          <Badge
                            variant={
                              record.status === "matched"
                                ? "default"
                                : record.status === "exception"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {record.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportData.records.length > 50 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Showing first 50 of {reportData.records.length} records
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exceptions">
          <Card>
            <CardHeader>
              <CardTitle>Exception Records</CardTitle>
              <CardDescription>Records requiring manual review</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.records
                  .filter((r) => r.status === "exception" || r.status === "unmatched")
                  .map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Badge variant={record.source === "bank" ? "default" : "secondary"}>{record.source}</Badge>
                        <div>
                          <p className="font-medium">${record.amount.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">{record.description}</p>
                          <p className="text-xs text-muted-foreground">{record.date}</p>
                        </div>
                      </div>
                      <Badge variant={record.status === "exception" ? "destructive" : "secondary"}>
                        {record.status}
                      </Badge>
                    </div>
                  ))}
                {reportData.records.filter((r) => r.status === "exception" || r.status === "unmatched").length ===
                  0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No exceptions found in the selected period.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
