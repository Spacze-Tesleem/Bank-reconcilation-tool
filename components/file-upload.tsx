"use client"

import type React from "react"

import { useState, useRef } from "react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Upload, FileSpreadsheet, Save, Eye, AlertTriangle, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Papa from "papaparse"
import type { FinancialRecord, UploadTemplate } from "../contexts/app-context"

type ParsedData = {
  headers: string[]
  rows: any[][]
  preview: any[]
}

export default function FileUpload() {
  const { addRecords, templates, saveTemplate, logAction } = useApp()
  const { user, hasPermission } = useAuth()
  const theme = useThemeAccent()

  const [activeTab, setActiveTab] = useState("upload")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [source, setSource] = useState<"bank" | "cashbook">("bank")
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [dateFormat, setDateFormat] = useState("auto")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setError("")
    setLoading(true)

    try {
      if (file.name.endsWith(".xlsx")) {
        await parseExcelFile(file)
      } else {
        await parseCSVFile(file)
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse file")
    } finally {
      setLoading(false)
    }
  }

  const parseCSVFile = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => {
          const data = results.data as any[][]
          const headers = data[0] || []
          const rows = data.slice(1)
          const preview = rows.slice(0, 10).map((row) => {
            const obj: any = {}
            headers.forEach((header, index) => {
              obj[header] = row[index] || ""
            })
            return obj
          })

          setParsedData({ headers, rows, preview })
          initializeColumnMapping(headers)
          resolve()
        },
        error: (error) => reject(error),
      })
    })
  }

  const parseExcelFile = async (file: File): Promise<void> => {
    const XLSX = await import("xlsx")
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    const headers = data[0] || []
    const rows = data.slice(1)
    const preview = rows.slice(0, 10).map((row) => {
      const obj: any = {}
      headers.forEach((header, index) => {
        obj[header] = row[index] || ""
      })
      return obj
    })

    setParsedData({ headers, rows, preview })
    initializeColumnMapping(headers)
  }

  const initializeColumnMapping = (headers: string[]) => {
    const mapping: Record<string, string> = {}

    // Auto-detect common columns
    headers.forEach((header) => {
      const lower = header.toLowerCase()
      if (lower.includes("date")) mapping.date = header
      else if (lower.includes("amount") || lower.includes("value")) mapping.amount = header
      else if (lower.includes("description") || lower.includes("detail")) mapping.description = header
      else if (lower.includes("reference") || lower.includes("ref")) mapping.reference = header
      else if (lower.includes("debit")) mapping.debit = header
      else if (lower.includes("credit")) mapping.credit = header
    })

    setColumnMapping(mapping)
  }

  const handleImport = async () => {
    if (!parsedData || !hasPermission("write")) return

    setLoading(true)
    try {
      const records: FinancialRecord[] = parsedData.rows
        .map((row, index) => {
          const record: any = {}
          Object.entries(columnMapping).forEach(([field, column]) => {
            const columnIndex = parsedData.headers.indexOf(column)
            if (columnIndex !== -1) {
              record[field] = row[columnIndex]
            }
          })

          // Parse amount
          let amount = 0
          if (record.amount) {
            amount = Number.parseFloat(record.amount.toString().replace(/[^0-9.-]/g, "")) || 0
          } else if (record.debit && record.credit) {
            const debit = Number.parseFloat(record.debit.toString().replace(/[^0-9.-]/g, "")) || 0
            const credit = Number.parseFloat(record.credit.toString().replace(/[^0-9.-]/g, "")) || 0
            amount = credit - debit
          }

          return {
            id: `${source}_${Date.now()}_${index}`,
            source,
            date: record.date || "",
            amount,
            description: record.description || "",
            reference: record.reference || "",
            category: record.category || "",
            status: "unmatched" as const,
            uploadId: `upload_${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        })
        .filter((record) => record.date && record.amount !== 0)

      addRecords(records)
      logAction("IMPORT", "records", "bulk", {
        source,
        count: records.length,
        filename: selectedFile?.name,
      })

      // Reset form
      setSelectedFile(null)
      setParsedData(null)
      setColumnMapping({})
      if (fileInputRef.current) fileInputRef.current.value = ""

      alert(`Successfully imported ${records.length} records`)
    } catch (err: any) {
      setError(err.message || "Failed to import records")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = () => {
    if (!templateName || !hasPermission("write")) return

    saveTemplate({
      name: templateName,
      description: templateDescription,
      source,
      columnMapping,
      dateFormat,
    })

    setTemplateName("")
    setTemplateDescription("")
    alert("Template saved successfully")
  }

  const handleLoadTemplate = (template: UploadTemplate) => {
    setSource(template.source)
    setColumnMapping(template.columnMapping)
    setDateFormat(template.dateFormat)
  }

  const requiredFields = ["date", "amount", "description"]
  const mappedFields = Object.keys(columnMapping)
  const missingFields = requiredFields.filter((field) => !mappedFields.includes(field))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            File Upload & Import
          </CardTitle>
          <CardDescription>
            Import financial data from CSV or Excel files with intelligent column mapping
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload">Upload & Map</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          {/* File Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Select File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Source</Label>
                  <Select value={source} onValueChange={(v: "bank" | "cashbook") => setSource(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Statement</SelectItem>
                      <SelectItem value="cashbook">Cashbook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date Format</Label>
                  <Select value={dateFormat} onValueChange={setDateFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                      <SelectItem value="dd/mm/yyyy">DD/MM/YYYY</SelectItem>
                      <SelectItem value="mm/dd/yyyy">MM/DD/YYYY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>File (CSV or Excel)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileSelect}
                    disabled={loading}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Browse
                  </Button>
                </div>
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Column Mapping */}
          {parsedData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Map Columns</CardTitle>
                <CardDescription>Map your file columns to the required fields</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {["date", "amount", "description", "reference", "debit", "credit"].map((field) => (
                    <div key={field} className="space-y-2">
                      <Label className="flex items-center gap-2">
                        {field.charAt(0).toUpperCase() + field.slice(1)}
                        {requiredFields.includes(field) && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </Label>
                      <Select
                        value={columnMapping[field] || "none"}
                        onValueChange={(value) => setColumnMapping((prev) => ({ ...prev, [field]: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {parsedData.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {missingFields.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Missing required fields: {missingFields.join(", ")}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setShowPreview(true)} disabled={!parsedData}>
                    <Eye className="w-4 h-4 mr-2" />
                    Preview Data
                  </Button>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Save className="w-4 h-4 mr-2" />
                        Save as Template
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Save Mapping Template</DialogTitle>
                        <DialogDescription>Save this column mapping for future uploads</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Template Name</Label>
                          <Input
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="e.g., Bank ABC Format"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            value={templateDescription}
                            onChange={(e) => setTemplateDescription(e.target.value)}
                            placeholder="Optional description"
                          />
                        </div>
                        <Button onClick={handleSaveTemplate} disabled={!templateName}>
                          Save Template
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Button */}
          {parsedData && missingFields.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">3. Import Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleImport}
                    disabled={loading || !hasPermission("write")}
                    className={cn(theme.classes.accentBg, theme.classes.accentBgHover)}
                  >
                    {loading ? "Importing..." : `Import ${parsedData.rows.length} Records`}
                  </Button>
                  <div className="text-sm text-muted-foreground">Records will be imported as {source} entries</div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saved Templates</CardTitle>
              <CardDescription>Reuse column mappings for consistent imports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{template.name}</h4>
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">{template.source}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(template.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleLoadTemplate(template)}>
                        Load
                      </Button>
                      {hasPermission("delete") && (
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates saved yet. Create one by saving a column mapping.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Data Preview</DialogTitle>
            <DialogDescription>Preview of the first 10 rows with current mapping</DialogDescription>
          </DialogHeader>
          {parsedData && (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.preview.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row[columnMapping.date] || "-"}</TableCell>
                      <TableCell>{row[columnMapping.amount] || "-"}</TableCell>
                      <TableCell>{row[columnMapping.description] || "-"}</TableCell>
                      <TableCell>{row[columnMapping.reference] || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
