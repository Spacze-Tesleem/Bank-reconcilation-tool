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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  GitMerge,
  Unlink,
  Search,
  Eye,
  Download,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Info,
  Tag,
  StickyNote,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ViewMode = "all" | "matched" | "unmatched" | "exceptions" | "suggestions"
type MatchingMode = "auto" | "manual" | "suggested"

export default function ReconciliationWorkspace() {
  const { records, matches, createMatch, removeMatch, updateRecord, bulkUpdateRecords, logAction } = useApp()
  const { hasPermission } = useAuth()
  const theme = useThemeAccent()

  const [viewMode, setViewMode] = useState<ViewMode>("all")
  const [matchingMode, setMatchingMode] = useState<MatchingMode>("auto")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRecords, setSelectedRecords] = useState<string[]>([])
  const [visibleColumns, setVisibleColumns] = useState({
    date: true,
    amount: true,
    description: true,
    reference: true,
    status: true,
    source: true,
  })
  const [amountTolerance, setAmountTolerance] = useState(0)
  const [dateTolerance, setDateTolerance] = useState(0)
  const [showMatchingSettings, setShowMatchingSettings] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const [bulkTagValue, setBulkTagValue] = useState("")
  const [bulkNoteValue, setBulkNoteValue] = useState("")

  const filteredRecords = useMemo(() => {
    let filtered = records

    // Filter by view mode
    if (viewMode === "matched") {
      filtered = filtered.filter((r) => r.status === "matched")
    } else if (viewMode === "unmatched") {
      filtered = filtered.filter((r) => r.status === "unmatched")
    } else if (viewMode === "exceptions") {
      filtered = filtered.filter((r) => r.status === "exception")
    } else if (viewMode === "suggestions") {
      filtered = records.filter((r) => selectedRecords.includes(r.id))
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.description.toLowerCase().includes(term) ||
          r.reference?.toLowerCase().includes(term) ||
          r.amount.toString().includes(term) ||
          r.date.includes(term),
      )
    }

    return filtered
  }, [records, viewMode, searchTerm, selectedRecords])

  const bankRecords = filteredRecords.filter((r) => r.source === "bank")
  const cashbookRecords = filteredRecords.filter((r) => r.source === "cashbook")

  const handleRecordSelect = (recordId: string, checked: boolean) => {
    if (checked) {
      setSelectedRecords((prev) => [...prev, recordId])
    } else {
      setSelectedRecords((prev) => prev.filter((id) => id !== recordId))
    }
  }

  const handleAutoMatch = () => {
    if (!hasPermission("match")) return

    const unmatchedBank = bankRecords.filter((r) => r.status === "unmatched")
    const unmatchedCashbook = cashbookRecords.filter((r) => r.status === "unmatched")

    unmatchedBank.forEach((bankRecord) => {
      const potentialMatches = unmatchedCashbook.filter((cashRecord) => {
        const amountDiff = Math.abs(bankRecord.amount - cashRecord.amount)
        const dateDiff =
          Math.abs(new Date(bankRecord.date).getTime() - new Date(cashRecord.date).getTime()) / (1000 * 60 * 60 * 24)

        return amountDiff <= amountTolerance && dateDiff <= dateTolerance
      })

      if (potentialMatches.length === 1) {
        createMatch([bankRecord.id], [potentialMatches[0].id], "auto")
      }
    })

    logAction("AUTO_MATCH", "records", "bulk", { tolerance: { amount: amountTolerance, date: dateTolerance } })
  }

  const handleManualMatch = () => {
    if (!hasPermission("match") || selectedRecords.length < 2) return

    const selectedBankRecords = selectedRecords.filter((id) => records.find((r) => r.id === id)?.source === "bank")
    const selectedCashbookRecords = selectedRecords.filter(
      (id) => records.find((r) => r.id === id)?.source === "cashbook",
    )

    if (selectedBankRecords.length > 0 && selectedCashbookRecords.length > 0) {
      createMatch(selectedBankRecords, selectedCashbookRecords, "manual")
      setSelectedRecords([])
    }
  }

  const handleUnmatch = (matchId: string) => {
    if (!hasPermission("unmatch")) return
    removeMatch(matchId)
  }

  const handleBulkTag = () => {
    if (!bulkTagValue || selectedRecords.length === 0) return
    const currentRecords = records.filter((r) => selectedRecords.includes(r.id))

    bulkUpdateRecords(selectedRecords, {
      tags: [...new Set([...(currentRecords[0]?.tags || []), bulkTagValue])],
    })
    setBulkTagValue("")
  }

  const handleBulkNote = () => {
    if (!bulkNoteValue || selectedRecords.length === 0) return
    bulkUpdateRecords(selectedRecords, { notes: bulkNoteValue })
    setBulkNoteValue("")
  }

  const handleMarkException = (recordId: string) => {
    if (!hasPermission("write")) return
    updateRecord(recordId, { status: "exception" })
  }

  const exportData = () => {
    if (!hasPermission("export_data")) return

    const csvData = filteredRecords.map((record) => ({
      Source: record.source,
      Date: record.date,
      Amount: record.amount,
      Description: record.description,
      Reference: record.reference || "",
      Status: record.status,
      "Match ID": record.matchedWith?.[0] || "",
    }))

    const csv = [Object.keys(csvData[0]).join(","), ...csvData.map((row) => Object.values(row).join(","))].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `reconciliation_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "matched":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case "exception":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case "pending":
        return <Clock className="w-4 h-4 text-blue-500" />
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300" />
    }
  }

  // Helper functions for AI matching logic
  const extractDocNumbers = (description: string): string[] => {
    // Common NAV document patterns: INV-12345, PO9876, 2024/001
    const patterns = [/[A-Z]{2,3}-\d{4,}/g, /[A-Z]{2,3}\d{4,}/g, /\d{4,}\/\d{2,}/g, /\b\d{5,}\b/g]
    const found = patterns.flatMap((p) => description.match(p) || [])
    return Array.from(new Set(found))
  }

  const calculateStringSimilarity = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2
    const shorter = s1.length > s2.length ? s2 : s1
    if (longer.length === 0) return 1.0
    return (longer.length - editDistance(longer, shorter)) / longer.length
  }

  const editDistance = (s1: string, s2: string): number => {
    s1 = s1.toLowerCase()
    s2 = s2.toLowerCase()
    const costs = []
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j
        else {
          if (j > 0) {
            let newValue = costs[j - 1]
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
            costs[j - 1] = lastValue
            lastValue = newValue
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue
    }
    return costs[s2.length]
  }

  const runAISuggestions = () => {
    setIsAnalyzing(true)
    setTimeout(() => {
      const unmatchedBank = records.filter((r) => r.source === "bank" && r.status === "unmatched")
      const unmatchedCash = records.filter((r) => r.source === "cashbook" && r.status === "unmatched")

      const newSuggestions: any[] = []

      unmatchedBank.forEach((bank) => {
        const bankDocNos = extractDocNumbers(bank.description)

        unmatchedCash.forEach((cash) => {
          let score = 0
          const reasons: string[] = []

          // 1. Amount Similarity (Highest Weight)
          const amountDiff = Math.abs(bank.amount - cash.amount)
          if (amountDiff === 0) {
            score += 60
            reasons.push("Exact amount match")
          } else if (amountDiff < 0.1) {
            score += 40
            reasons.push("Negligible amount difference")
          }

          // 2. Date Proximity
          const dateDiff = Math.abs(new Date(bank.date).getTime() - new Date(cash.date).getTime()) / (1000 * 3600 * 24)
          if (dateDiff === 0) {
            score += 20
            reasons.push("Same transaction date")
          } else if (dateDiff <= 3) {
            score += 10
            reasons.push(`Close date (${Math.ceil(dateDiff)} days)`)
          }

          // 3. Document Number Matching (NAV Specific)
          const cashDocNos = extractDocNumbers(cash.description || cash.reference || "")
          const commonDocs = bankDocNos.filter((doc) => cashDocNos.includes(doc))
          if (commonDocs.length > 0) {
            score += 30
            reasons.push(`Reference match: ${commonDocs.join(", ")}`)
          }

          // 4. Fuzzy Description Similarity
          const textSim = calculateStringSimilarity(bank.description, cash.description)
          if (textSim > 0.8) {
            score += 15
            reasons.push("Highly similar descriptions")
          }

          if (score >= 40) {
            newSuggestions.push({
              id: `suggest_${Date.now()}_${Math.random()}`,
              bank,
              cash,
              confidence: Math.min(score, 100),
              reasons,
            })
          }
        })
      })

      setSuggestions(newSuggestions.sort((a, b) => b.confidence - a.confidence))
      setIsAnalyzing(false)
    }, 1500)
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-full bg-primary/10">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">AI Reconciliation Engine</CardTitle>
                <CardDescription className="text-base">
                  Intelligent matching for Microsoft Dynamics NAV (Navision)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={runAISuggestions}
                disabled={isAnalyzing}
                className="bg-primary hover:bg-primary/90 text-white shadow-lg transition-all"
              >
                {isAnalyzing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing...
                  </div>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Run AI Analysis
                  </>
                )}
              </Button>
              <Dialog open={showMatchingSettings} onOpenChange={setShowMatchingSettings}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Matching Settings</DialogTitle>
                    <DialogDescription>Configure automatic matching tolerances</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Amount Tolerance</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={amountTolerance}
                        onChange={(e) => setAmountTolerance(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date Tolerance (days)</Label>
                      <Input
                        type="number"
                        value={dateTolerance}
                        onChange={(e) => setDateTolerance(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" size="sm" onClick={exportData}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>

              <Select value={viewMode} onValueChange={(v: ViewMode) => setViewMode(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Records</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                  <SelectItem value="exceptions">Exceptions</SelectItem>
                  <SelectItem value="suggestions">Suggestions</SelectItem>
                </SelectContent>
              </Select>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    Columns
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Column Visibility</DialogTitle>
                    <DialogDescription>Choose which columns to display</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {Object.entries(visibleColumns).map(([column, visible]) => (
                      <div key={column} className="flex items-center space-x-2">
                        <Checkbox
                          id={column}
                          checked={visible}
                          onCheckedChange={(checked) => setVisibleColumns((prev) => ({ ...prev, [column]: !!checked }))}
                        />
                        <Label htmlFor={column} className="capitalize">
                          {column}
                        </Label>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex items-center gap-2">
              {selectedRecords.length > 0 && (
                <div className="flex items-center gap-2 mr-2">
                  <Badge variant="secondary" className="h-8">
                    {selectedRecords.length} selected
                  </Badge>

                  <div className="flex items-center border rounded-md px-2 h-9 bg-background">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground mr-2" />
                    <Input
                      placeholder="Add tag..."
                      className="border-0 h-7 w-24 p-0 focus-visible:ring-0 text-xs"
                      value={bulkTagValue}
                      onChange={(e) => setBulkTagValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleBulkTag()}
                    />
                  </div>

                  <div className="flex items-center border rounded-md px-2 h-9 bg-background">
                    <StickyNote className="w-3.5 h-3.5 text-muted-foreground mr-2" />
                    <Input
                      placeholder="Add note..."
                      className="border-0 h-7 w-32 p-0 focus-visible:ring-0 text-xs"
                      value={bulkNoteValue}
                      onChange={(e) => setBulkNoteValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleBulkNote()}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleAutoMatch}
                disabled={!hasPermission("match")}
                className={cn("gap-2", theme.classes.accentBg, theme.classes.accentBgHover)}
              >
                <GitMerge className="w-4 h-4" />
                Auto Match
              </Button>

              <Button
                onClick={handleManualMatch}
                disabled={!hasPermission("match") || selectedRecords.length < 2}
                variant="outline"
              >
                Manual Match
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Tabs defaultValue="split" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 border">
          <TabsTrigger value="split">Standard Workspace</TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-2">
            AI Suggestions
            {suggestions.length > 0 && (
              <Badge variant="default" className="bg-primary text-white text-[10px] h-4 px-1">
                {suggestions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="matches">Reconciled</TabsTrigger>
        </TabsList>

        <TabsContent value="split" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bank Records */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bank Records ({bankRecords.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        {visibleColumns.date && <TableHead>Date</TableHead>}
                        {visibleColumns.amount && <TableHead>Amount</TableHead>}
                        {visibleColumns.description && <TableHead>Description</TableHead>}
                        {visibleColumns.status && <TableHead>Status</TableHead>}
                        <TableHead className="w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankRecords.map((record) => (
                        <TableRow
                          key={record.id}
                          className={cn(
                            record.status === "matched" && theme.classes.tintMatched,
                            record.status === "exception" && "bg-yellow-50",
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={(checked) => handleRecordSelect(record.id, !!checked)}
                            />
                          </TableCell>
                          {visibleColumns.date && <TableCell>{record.date}</TableCell>}
                          {visibleColumns.amount && (
                            <TableCell className="font-mono">${record.amount.toLocaleString()}</TableCell>
                          )}
                          {visibleColumns.description && (
                            <TableCell className="max-w-48 truncate">{record.description}</TableCell>
                          )}
                          {visibleColumns.status && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(record.status)}
                                <span className="capitalize text-sm">{record.status}</span>
                              </div>
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {record.status === "matched" && hasPermission("unmatch") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const match = matches.find((m) => m.bankRecords.some((r) => r.id === record.id))
                                    if (match) handleUnmatch(match.id)
                                  }}
                                >
                                  <Unlink className="w-3 h-3" />
                                </Button>
                              )}
                              {record.status === "unmatched" && hasPermission("write") && (
                                <Button size="sm" variant="ghost" onClick={() => handleMarkException(record.id)}>
                                  <AlertTriangle className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Cashbook Records */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cashbook Records ({cashbookRecords.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        {visibleColumns.date && <TableHead>Date</TableHead>}
                        {visibleColumns.amount && <TableHead>Amount</TableHead>}
                        {visibleColumns.description && <TableHead>Description</TableHead>}
                        {visibleColumns.status && <TableHead>Status</TableHead>}
                        <TableHead className="w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashbookRecords.map((record) => (
                        <TableRow
                          key={record.id}
                          className={cn(
                            record.status === "matched" && theme.classes.tintMatched,
                            record.status === "exception" && "bg-yellow-50",
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={(checked) => handleRecordSelect(record.id, !!checked)}
                            />
                          </TableCell>
                          {visibleColumns.date && <TableCell>{record.date}</TableCell>}
                          {visibleColumns.amount && (
                            <TableCell className="font-mono">${record.amount.toLocaleString()}</TableCell>
                          )}
                          {visibleColumns.description && (
                            <TableCell className="max-w-48 truncate">{record.description}</TableCell>
                          )}
                          {visibleColumns.status && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(record.status)}
                                <span className="capitalize text-sm">{record.status}</span>
                              </div>
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {record.status === "matched" && hasPermission("unmatch") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const match = matches.find((m) => m.cashbookRecords.some((r) => r.id === record.id))
                                    if (match) handleUnmatch(match.id)
                                  }}
                                >
                                  <Unlink className="w-3 h-3" />
                                </Button>
                              )}
                              {record.status === "unmatched" && hasPermission("write") && (
                                <Button size="sm" variant="ghost" onClick={() => handleMarkException(record.id)}>
                                  <AlertTriangle className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {suggestions.length === 0 ? (
              <Card className="border-dashed flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <Info className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No active suggestions</h3>
                <p className="text-muted-foreground max-w-sm">
                  Run AI Analysis to find potential matches between bank statements and NAV records.
                </p>
              </Card>
            ) : (
              suggestions.map((suggestion) => (
                <Card
                  key={suggestion.id}
                  className="overflow-hidden border-l-4 border-l-primary group transition-all hover:shadow-md"
                >
                  <div className="flex items-stretch">
                    <div className="flex-1 p-4 grid grid-cols-2 gap-8">
                      {/* Bank Side */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 border-blue-200"
                          >
                            Bank Statement
                          </Badge>
                          <span className="text-xs text-muted-foreground">{suggestion.bank.date}</span>
                        </div>
                        <p className="text-sm font-medium leading-none">{suggestion.bank.description}</p>
                        <p className="text-lg font-mono font-bold">${suggestion.bank.amount.toLocaleString()}</p>
                      </div>

                      {/* Cashbook Side */}
                      <div className="space-y-2 border-l pl-8">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-bold text-green-600 bg-green-50 border-green-200"
                          >
                            NAV Record
                          </Badge>
                          <span className="text-xs text-muted-foreground">{suggestion.cash.date}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium leading-none">{suggestion.cash.description}</p>
                          {suggestion.cash.reference && (
                            <Badge variant="secondary" className="text-[10px]">
                              {suggestion.cash.reference}
                            </Badge>
                          )}
                        </div>
                        <p className="text-lg font-mono font-bold">${suggestion.cash.amount.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* AI Scoring Sidebar */}
                    <div className="w-72 bg-muted/30 border-l p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-muted-foreground">Match Confidence</span>
                          <span
                            className={cn(
                              "text-sm font-bold",
                              suggestion.confidence > 80 ? "text-green-600" : "text-yellow-600",
                            )}
                          >
                            {suggestion.confidence}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 mb-4">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              suggestion.confidence > 80 ? "bg-green-500" : "bg-yellow-500",
                            )}
                            style={{ width: `${suggestion.confidence}%` }}
                          />
                        </div>
                        <div className="space-y-1">
                          {suggestion.reasons.map((reason: string, i: number) => (
                            <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                              {reason}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          className="flex-1 bg-primary text-white"
                          onClick={() => {
                            createMatch([suggestion.bank.id], [suggestion.cash.id], "suggested")
                            setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-2"
                          onClick={() => setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))}
                        >
                          <Unlink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="combined">
          <Card>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      {visibleColumns.source && <TableHead>Source</TableHead>}
                      {visibleColumns.date && <TableHead>Date</TableHead>}
                      {visibleColumns.amount && <TableHead>Amount</TableHead>}
                      {visibleColumns.description && <TableHead>Description</TableHead>}
                      {visibleColumns.reference && <TableHead>Reference</TableHead>}
                      {visibleColumns.status && <TableHead>Status</TableHead>}
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => (
                      <TableRow
                        key={record.id}
                        className={cn(
                          record.status === "matched" && theme.classes.tintMatched,
                          record.status === "exception" && "bg-yellow-50",
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRecords.includes(record.id)}
                            onCheckedChange={(checked) => handleRecordSelect(record.id, !!checked)}
                          />
                        </TableCell>
                        {visibleColumns.source && (
                          <TableCell>
                            <Badge variant={record.source === "bank" ? "default" : "secondary"}>{record.source}</Badge>
                          </TableCell>
                        )}
                        {visibleColumns.date && <TableCell>{record.date}</TableCell>}
                        {visibleColumns.amount && (
                          <TableCell className="font-mono">${record.amount.toLocaleString()}</TableCell>
                        )}
                        {visibleColumns.description && (
                          <TableCell className="max-w-48 truncate">{record.description}</TableCell>
                        )}
                        {visibleColumns.reference && <TableCell>{record.reference || "-"}</TableCell>}
                        {visibleColumns.status && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(record.status)}
                              <span className="capitalize text-sm">{record.status}</span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {record.status === "matched" && hasPermission("unmatch") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const match = matches.find(
                                    (m) =>
                                      m.bankRecords.some((r) => r.id === record.id) ||
                                      m.cashbookRecords.some((r) => r.id === record.id),
                                  )
                                  if (match) handleUnmatch(match.id)
                                }}
                              >
                                <Unlink className="w-3 h-3" />
                              </Button>
                            )}
                            {record.status === "unmatched" && hasPermission("write") && (
                              <Button size="sm" variant="ghost" onClick={() => handleMarkException(record.id)}>
                                <AlertTriangle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches">
          <Card>
            <CardHeader>
              <CardTitle>Match Pairs ({matches.length})</CardTitle>
              <CardDescription>View and manage matched record pairs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {matches.map((match) => (
                  <div key={match.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={match.matchType === "auto" ? "default" : "secondary"}>{match.matchType}</Badge>
                        <span className="text-sm text-muted-foreground">{match.confidence}% confidence</span>
                        {match.amountDiff !== 0 && (
                          <Badge variant="outline">Diff: ${Math.abs(match.amountDiff).toLocaleString()}</Badge>
                        )}
                      </div>
                      {hasPermission("unmatch") && (
                        <Button size="sm" variant="outline" onClick={() => handleUnmatch(match.id)}>
                          <Unlink className="w-4 h-4 mr-2" />
                          Unmatch
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-sm mb-2">Bank Records</h4>
                        <div className="space-y-2">
                          {match.bankRecords.map((record) => (
                            <div key={record.id} className="text-sm p-2 bg-blue-50 rounded">
                              <div className="font-medium">${record.amount.toLocaleString()}</div>
                              <div className="text-muted-foreground">{record.description}</div>
                              <div className="text-xs text-muted-foreground">{record.date}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm mb-2">Cashbook Records</h4>
                        <div className="space-y-2">
                          {match.cashbookRecords.map((record) => (
                            <div key={record.id} className="text-sm p-2 bg-green-50 rounded">
                              <div className="font-medium">${record.amount.toLocaleString()}</div>
                              <div className="text-muted-foreground">{record.description}</div>
                              <div className="text-xs text-muted-foreground">{record.date}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {matches.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No matches found. Use auto-match or manually select records to create matches.
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
