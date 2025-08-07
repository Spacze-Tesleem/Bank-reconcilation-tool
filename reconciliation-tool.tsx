"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download, Settings2, RefreshCw, TableIcon, Info, Filter, Search, LayoutList, Minus, Plus, Bell, FileDown, FileSpreadsheetIcon as ExcelIcon, FileText } from 'lucide-react'
import Papa from "papaparse"
import RippleContainer from "./components/ripple"
import { ThemePicker, useThemeAccent } from "./components/theme"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type RawRow = Record<string, string | number | null | undefined>

type Mapping = {
  mode: "amount" | "debitcredit"
  date: string
  amount?: string
  debit?: string
  credit?: string
  description?: string
  signConvention?: "credit-positive" | "debit-positive"
}

type Source = "bank" | "cashbook"

type MappedRow = {
  id: string
  source: Source
  index: number
  dateStr: string
  dateISO: string // yyyy-mm-dd
  amount: number
  description: string
  raw: RawRow
}

type MatchPair = {
  id: string
  bank?: MappedRow
  cashbook?: MappedRow
  matched: boolean
  amountDiff: number // bank - cashbook
  dateDiffDays: number
}

type ParseResult = {
  headers: string[]
  rows: RawRow[]
}

type ReconcileSettings = {
  amountTolerance: number
  dateWindowDays: number
  dateFormat: "auto" | "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy"
  currency: string
  strategy: "strict" | "smart"
}

const DEFAULT_SETTINGS: ReconcileSettings = {
  amountTolerance: 0,
  dateWindowDays: 0,
  dateFormat: "auto",
  currency: "USD",
  strategy: "smart",
}

function useCurrencyFormatter(code: string) {
  return useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code })
    } catch {
      return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
  }, [code])
}

function readCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      complete: (results) => {
        const { data, meta, errors } = results as unknown as { data: RawRow[]; meta: { fields?: string[] }; errors: any[] }
        if (errors && errors.length > 0) {
          reject(new Error(errors[0]?.message || "Failed to parse CSV"))
          return
        }
        const headers = (meta.fields || Object.keys(data[0] || {})).map((h) => (h || "").toString())
        resolve({ headers, rows: data })
      },
      error: (err) => reject(err),
    })
  })
}

function detectMapping(headers: string[]): Mapping {
  const lowered = headers.map((h) => (h || "").toLowerCase())
  const pick = (cands: string[], fallback = "") => {
    for (const c of cands) {
      const idx = lowered.findIndex((h) => h.includes(c))
      if (idx !== -1) return headers[idx]
    }
    return fallback || headers[0] || ""
  }
  const date = pick(["date", "posted", "txn date", "transaction date", "value date"])
  const amount = pick(["amount", "amt", "value"])
  const debit = pick(["debit", "withdrawal", "dr"], "")
  const credit = pick(["credit", "deposit", "cr"], "")
  const description = pick(["description", "details", "narration", "memo", "payee", "particulars"])
  const mode: Mapping["mode"] = amount ? "amount" : "debitcredit"
  return { mode, date, amount, debit, credit, description, signConvention: "credit-positive" }
}

function toISODate(input: string, fmt: ReconcileSettings["dateFormat"]): { iso: string; dateStr: string } | null {
  const s = (input || "").toString().trim()
  if (!s) return null
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const fromParts = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (isNaN(dt.getTime())) return null
    return { iso: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`, dateStr: `${pad(d)}/${pad(m)}/${dt.getUTCFullYear()}` }
  }
  if (fmt === "yyyy-mm-dd") {
    const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/)
    if (!m) return null
    return fromParts(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))
  }
  if (fmt === "dd/mm/yyyy") {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (!m) return null
    return fromParts(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10))
  }
  if (fmt === "mm/dd/yyyy") {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (!m) return null
    return fromParts(parseInt(m[3], 10), parseInt(m[1], 10), parseInt(m[2], 10))
  }
  const ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/)
  if (ymd) return fromParts(parseInt(ymd[1], 10), parseInt(ymd[2], 10), parseInt(ymd[3], 10))
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return fromParts(parseInt(dmy[3], 10), parseInt(dmy[2], 10), parseInt(dmy[1], 10))
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) return fromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
  return null
}

function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "number") return Math.round(raw * 100) / 100
  const s = raw.toString().trim()
  if (!s) return null
  const cleaned = s.replace(/[^0-9\-\.\,]/g, "")
  let normalized = cleaned
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/,/g, "")
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  }
  const n = parseFloat(normalized)
  return isNaN(n) ? null : Math.round(n * 100) / 100
}

function daysBetween(iso1: string, iso2: string): number {
  const a = new Date(iso1 + "T00:00:00Z").getTime()
  const b = new Date(iso2 + "T00:00:00Z").getTime()
  return Math.round(Math.abs(a - b) / 86400000)
}

function normalizeRows(rows: RawRow[], map: Mapping, src: Source, settings: ReconcileSettings): MappedRow[] {
  const out: MappedRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {}
    const dateVal = (r[map.date] ?? "").toString()
    const descVal = (r[map.description || ""] ?? "").toString()
    const parsedDate = toISODate(dateVal, settings.dateFormat)
    if (!parsedDate) continue

    let amount: number | null = null
    if (map.mode === "amount" && map.amount) {
      amount = parseAmount(r[map.amount] as any)
    } else if (map.mode === "debitcredit" && (map.debit || map.credit)) {
      const debit = parseAmount(r[map.debit || ""] as any) || 0
      const credit = parseAmount(r[map.credit || ""] as any) || 0
      amount = map.signConvention === "credit-positive" ? credit - debit : debit - credit
      amount = Math.round(amount * 100) / 100
    }
    if (amount === null) continue

    out.push({
      id: `${src}-${i}`,
      source: src,
      index: i,
      dateStr: parsedDate.dateStr,
      dateISO: parsedDate.iso,
      amount,
      description: descVal || "",
      raw: r,
    })
  }
  return out
}

/* Validation */

type ValidationIssue = { type: "error" | "warning"; message: string }
type ValidationReport = {
  ok: boolean
  issues: ValidationIssue[]
  stats: { totalRows: number; invalidDate: number; invalidAmount: number; emptyRows: number }
}

function validateDataset(parsed: ParseResult | null, mapping: Mapping | null, settings: ReconcileSettings): ValidationReport | null {
  if (!parsed || !mapping) return null
  const issues: ValidationIssue[] = []
  const required = ["date"]
  if (mapping.mode === "amount") required.push("amount")
  else required.push("debit", "credit")

  const missing = required.filter((key) => {
    const col = (mapping as any)[key] as string | undefined
    return !col || !parsed.headers.includes(col)
  })
  if (missing.length) {
    issues.push({ type: "error", message: `Missing required columns: ${missing.join(", ")}` })
  }

  let invalidDate = 0
  let invalidAmount = 0
  let emptyRows = 0
  const sample = parsed.rows.slice(0, Math.min(parsed.rows.length, 1000))
  for (const r of sample) {
    const dv = (r[mapping.date] ?? "").toString()
    const dateOk = !!toISODate(dv, settings.dateFormat)
    if (!dateOk) invalidDate++
    let amountOk = false
    if (mapping.mode === "amount" && mapping.amount) {
      amountOk = parseAmount(r[mapping.amount] as any) !== null
    } else if (mapping.mode === "debitcredit") {
      const d = parseAmount(r[mapping.debit || ""] as any)
      const c = parseAmount(r[mapping.credit || ""] as any)
      amountOk = d !== null || c !== null
    }
    if (!amountOk) invalidAmount++
    if (!dv && Object.values(r).every((v) => v === "" || v === null || v === undefined)) emptyRows++
  }
  const totalRows = sample.length || 1
  const dateErrPct = (invalidDate / totalRows) * 100
  const amtErrPct = (invalidAmount / totalRows) * 100
  if (dateErrPct > 10) issues.push({ type: "warning", message: `High invalid date rate: ${invalidDate}/${totalRows} rows. Check Date format.` })
  if (amtErrPct > 10) issues.push({ type: "warning", message: `High invalid amount rate: ${invalidAmount}/${totalRows} rows. Check Amount mapping.` })
  const ok = issues.every((i) => i.type === "warning") && missing.length === 0
  return { ok, issues, stats: { totalRows, invalidDate, invalidAmount, emptyRows } }
}

/* Matching + Summary */

function descriptionScore(a: string, b: string) {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 50
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  const union = ta.size + tb.size - common
  const jaccard = union === 0 ? 0 : common / union
  return Math.round((1 - jaccard) * 50)
}
function tokenize(s: string) {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  )
}
function summarize(bank: MappedRow[], cashbook: MappedRow[], pairs: MatchPair[]) {
  const matchedPairs = pairs.filter((p) => p.matched).length
  const unmatchedBank = pairs.filter((p) => !p.matched && p.bank && !p.cashbook).length
  const unmatchedCash = pairs.filter((p) => !p.matched && p.cashbook && !p.bank).length
  const round2 = (n: number) => Math.round(n * 100) / 100
  const totalBank = round2(bank.reduce((sum, r) => sum + r.amount, 0))
  const totalCash = round2(cashbook.reduce((sum, r) => sum + r.amount, 0))
  const netDiff = round2(totalBank - totalCash)
  const unmatchedBankAmount = round2(pairs.filter((p) => !p.matched && p.bank && !p.cashbook).reduce((sum, p) => sum + (p.bank?.amount || 0), 0))
  const unmatchedCashAmount = round2(pairs.filter((p) => !p.matched && p.cashbook && !p.bank).reduce((sum, p) => sum + (p.cashbook?.amount || 0), 0))
  return {
    totals: {
      bankCount: bank.length,
      cashbookCount: cashbook.length,
      matchedPairs,
      unmatchedBank,
      unmatchedCash,
      totalBank,
      totalCash,
      netDiff,
      unmatchedBankAmount,
      unmatchedCashAmount,
    },
  }
}
function reconcileSmart(bank: MappedRow[], cash: MappedRow[], settings: ReconcileSettings) {
  const bankSorted = [...bank].sort((a, b) => (a.dateISO === b.dateISO ? a.amount - b.amount : a.dateISO.localeCompare(b.dateISO)))
  const cashSorted = [...cash].sort((a, b) => (a.dateISO === b.dateISO ? a.amount - b.amount : a.dateISO.localeCompare(b.dateISO)))
  const usedCash = new Set<number>()
  const pairs: MatchPair[] = []
  const tol = settings.amountTolerance
  const window = settings.dateWindowDays

  for (let i = 0; i < bankSorted.length; i++) {
    const b = bankSorted[i]
    let bestJ = -1
    let bestScore = Number.POSITIVE_INFINITY
    let bestAmountDiff = 0
    let bestDateDiff = 0

    for (let j = 0; j < cashSorted.length; j++) {
      if (usedCash.has(j)) continue
      const c = cashSorted[j]
      const amountDiff = Math.round((b.amount - c.amount) * 100) / 100
      const dateDiff = daysBetween(b.dateISO, c.dateISO)
      if (Math.abs(amountDiff) <= tol && dateDiff <= window) {
        const descScore = descriptionScore(b.description, c.description)
        const score = dateDiff * 1000 + Math.abs(amountDiff) * 100 + descScore
        if (score < bestScore) {
          bestScore = score
          bestJ = j
          bestAmountDiff = amountDiff
          bestDateDiff = dateDiff
        }
      }
    }

    if (bestJ !== -1) {
      const c = cashSorted[bestJ]
      usedCash.add(bestJ)
      pairs.push({ id: `pair-${b.id}-${c.id}`, bank: b, cashbook: c, matched: true, amountDiff: bestAmountDiff, dateDiffDays: bestDateDiff })
    } else {
      pairs.push({ id: `pair-${b.id}-none`, bank: b, matched: false, amountDiff: b.amount, dateDiffDays: 0 })
    }
  }

  for (let j = 0; j < cashSorted.length; j++) {
    if (!usedCash.has(j)) {
      const c = cashSorted[j]
      pairs.push({ id: `pair-none-${c.id}`, cashbook: c, matched: false, amountDiff: -c.amount, dateDiffDays: 0 })
    }
  }

  pairs.sort((p1, p2) => {
    const d1 = p1.bank?.dateISO || p1.cashbook?.dateISO || ""
    const d2 = p2.bank?.dateISO || p2.cashbook?.dateISO || ""
    if (d1 !== d2) return d1.localeCompare(d2)
    const a1 = p1.bank?.amount ?? p1.cashbook?.amount ?? 0
    const a2 = p2.bank?.amount ?? p2.cashbook?.amount ?? 0
    return a1 - a2
  })

  const stats = summarize(bankSorted, cashSorted, pairs)
  return { pairs, stats }
}

/* Export helpers */

async function exportExcel(pairs: MatchPair[], filename = "reconciliation.xlsx") {
  const XLSX = await import("xlsx")
  const rows = pairs.map((p) => ({
    MatchStatus: p.matched ? "Matched" : p.bank ? "Unmatched (Bank)" : "Unmatched (Cashbook)",
    BankDate: p.bank?.dateISO || "",
    BankAmount: p.bank?.amount ?? "",
    BankDescription: p.bank?.description || "",
    CashbookDate: p.cashbook?.dateISO || "",
    CashbookAmount: p.cashbook?.amount ?? "",
    CashbookDescription: p.cashbook?.description || "",
    AmountDifference: p.amountDiff,
    DateDiffDays: p.dateDiffDays,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Reconciliation")
  XLSX.writeFile(wb, filename)
}

async function exportPDF(pairs: MatchPair[], filename = "reconciliation.pdf") {
  const { jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  doc.setFontSize(14)
  doc.text("Bank Reconciliation", 40, 40)
  const rows = pairs.map((p) => [
    p.matched ? "Matched" : p.bank ? "Bank only" : "Cashbook only",
    p.bank?.dateISO || "",
    p.bank?.amount?.toFixed(2) || "",
    p.bank?.description || "",
    p.cashbook?.dateISO || "",
    p.cashbook?.amount?.toFixed(2) || "",
    p.cashbook?.description || "",
    p.amountDiff.toFixed(2),
  ])
  autoTable(doc, {
    startY: 60,
    head: [["Status", "Bank Date", "Bank Amount", "Bank Desc", "Cash Date", "Cash Amount", "Cash Desc", "Δ Amount"]],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 185, 129] },
  })
  doc.save(filename)
}

function downloadCSV(pairs: MatchPair[], filename = "reconciliation.csv") {
  const rows = pairs.map((p) => ({
    MatchStatus: p.matched ? "Matched" : p.bank ? "Unmatched (Bank)" : "Unmatched (Cashbook)",
    BankDate: p.bank?.dateISO || "",
    BankAmount: p.bank?.amount?.toFixed(2) || "",
    BankDescription: p.bank?.description || "",
    CashbookDate: p.cashbook?.dateISO || "",
    CashbookAmount: p.cashbook?.amount?.toFixed(2) || "",
    CashbookDescription: p.cashbook?.description || "",
    AmountDifference: p.amountDiff.toFixed(2),
    DateDiffDays: p.dateDiffDays,
  }))
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/* Pagination */

function usePagination<T>(items: T[], pageSize = 50) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const data = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])
  const next = useCallback(() => setPage((p) => Math.min(pageCount, p + 1)), [pageCount])
  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), [])
  const go = useCallback((p: number) => setPage(Math.min(Math.max(1, p), pageCount)), [pageCount])
  return { page, pageCount, data, next, prev, go, setPage }
}

/* Component */

type StatusFilter = "all" | "matched" | "bank-only" | "cashbook-only"
type Density = "comfortable" | "compact"
type SortKey = "date-asc" | "date-desc" | "amount-asc" | "amount-desc"

export default function Component() {
  const { toast } = useToast()
  const theme = useThemeAccent()

  // Files
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [cashFile, setCashFile] = useState<File | null>(null)

  // Parse + mapping
  const [bankParsed, setBankParsed] = useState<ParseResult | null>(null)
  const [cashParsed, setCashParsed] = useState<ParseResult | null>(null)
  const [bankMap, setBankMap] = useState<Mapping | null>(null)
  const [cashMap, setCashMap] = useState<Mapping | null>(null)
  const [bankValidation, setBankValidation] = useState<ValidationReport | null>(null)
  const [cashValidation, setCashValidation] = useState<ValidationReport | null>(null)

  // Settings
  const [settings, setSettings] = useState<ReconcileSettings>(DEFAULT_SETTINGS)

  // Data
  const [bankRows, setBankRows] = useState<MappedRow[]>([])
  const [cashRows, setCashRows] = useState<MappedRow[]>([])
  const [pairs, setPairs] = useState<MatchPair[]>([])
  const [stats, setStats] = useState<ReturnType<typeof summarize> | null>(null)

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(50)
  const [density, setDensity] = useState<Density>("comfortable")
  const [sortKey, setSortKey] = useState<SortKey>("date-asc")
  const [dateStart, setDateStart] = useState<string>("")
  const [dateEnd, setDateEnd] = useState<string>("")
  const [amountMin, setAmountMin] = useState<string>("")
  const [amountMax, setAmountMax] = useState<string>("")

  const bankInputRef = useRef<HTMLInputElement>(null)
  const cashInputRef = useRef<HTMLInputElement>(null)
  const formatter = useCurrencyFormatter(settings.currency)

  const resetAll = () => {
    setBankFile(null); setCashFile(null)
    setBankParsed(null); setCashParsed(null)
    setBankMap(null); setCashMap(null)
    setBankValidation(null); setCashValidation(null)
    setSettings(DEFAULT_SETTINGS)
    setBankRows([]); setCashRows([])
    setPairs([]); setStats(null)
    setLoading(false); setError(null)
    setSearch(""); setStatusFilter("all")
    setDensity("comfortable"); setPageSize(50)
    setSortKey("date-asc"); setDateStart(""); setDateEnd(""); setAmountMin(""); setAmountMax("")
    if (bankInputRef.current) bankInputRef.current.value = ""
    if (cashInputRef.current) cashInputRef.current.value = ""
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: Source) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null); setLoading(true)
    try {
      const parsed = await readCsv(f)
      if (!parsed.headers.length) throw new Error("No headers found in CSV.")
      if (type === "bank") {
        setBankFile(f); setBankParsed(parsed)
        const m = detectMapping(parsed.headers); setBankMap(m)
      } else {
        setCashFile(f); setCashParsed(parsed)
        const m = detectMapping(parsed.headers); setCashMap(m)
      }
      toast({ title: "File loaded", description: `${f.name} parsed successfully.` })
    } catch (err: any) {
      setError(err?.message || "Failed to parse CSV")
      toast({ title: "Parse error", description: err?.message || "Failed to parse CSV", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // Real-time validation when parsed or mapping/settings change
  useEffect(() => {
    const rep = validateDataset(bankParsed, bankMap, settings)
    setBankValidation(rep)
  }, [bankParsed, bankMap, settings])
  useEffect(() => {
    const rep = validateDataset(cashParsed, cashMap, settings)
    setCashValidation(rep)
  }, [cashParsed, cashMap, settings])

  const canMap = bankParsed && cashParsed
  const canReconcile = canMap && bankMap && cashMap && (bankValidation?.ok ?? true) && (cashValidation?.ok ?? true)

  const runReconcile = () => {
    if (!canReconcile) {
      toast({ title: "Validation required", description: "Resolve validation errors before reconciling.", variant: "destructive" })
      return
    }
    setError(null)
    try {
      const bn = normalizeRows(bankParsed!.rows, bankMap!, "bank", settings)
      const cn = normalizeRows(cashParsed!.rows, cashMap!, "cashbook", settings)
      setBankRows(bn); setCashRows(cn)
      const res = reconcileSmart(bn, cn, settings)
      setPairs(res.pairs); setStats(res.stats); pagination.setPage(1)

      // Notifications and suggestions
      if (res.stats.totals.unmatchedBank + res.stats.totals.unmatchedCash > 0) {
        toast({
          title: "Discrepancies found",
          description: "Some entries are unmatched. Try increasing date window or amount tolerance, or verify sign conventions.",
          variant: "default",
        })
      } else {
        toast({ title: "Reconciliation complete", description: "All entries matched." })
      }
      if (res.stats.totals.netDiff !== 0) {
        toast({
          title: "Net difference detected",
          description: `Net difference is ${formatter.format(res.stats.totals.netDiff)}.`,
        })
      }
    } catch (err: any) {
      setError(err?.message || "Failed to reconcile")
      toast({ title: "Reconcile error", description: err?.message || "Failed to reconcile", variant: "destructive" })
    }
  }

  // Filtering + search + date/amount range + status
  const filteredPairs = useMemo(() => {
    const minAmt = amountMin ? Number(amountMin) : null
    const maxAmt = amountMax ? Number(amountMax) : null
    const parseDate = (s: string) => (s ? new Date(s + "T00:00:00Z").getTime() : null)
    const startMs = parseDate(dateStart)
    const endMs = parseDate(dateEnd)

    let base = pairs.filter((p) => {
      // status
      if (statusFilter === "matched" && !p.matched) return false
      if (statusFilter === "bank-only" && !(p.bank && !p.cashbook && !p.matched)) return false
      if (statusFilter === "cashbook-only" && !(p.cashbook && !p.bank && !p.matched)) return false

      // date range: consider both sides; include if either date is within range
      const dates = [p.bank?.dateISO, p.cashbook?.dateISO].filter(Boolean) as string[]
      const dateOk =
        !startMs && !endMs
          ? true
          : dates.some((d) => {
              const t = new Date(d + "T00:00:00Z").getTime()
              if (startMs && t < startMs) return false
              if (endMs && t > endMs) return false
              return true
            })
      if (!dateOk) return false

      // amount range: consider amounts on each side
      const amts = [p.bank?.amount, p.cashbook?.amount].filter((v) => typeof v === "number") as number[]
      const amtOk =
        minAmt === null && maxAmt === null
          ? true
          : amts.some((a) => {
              if (minAmt !== null && a < minAmt) return false
              if (maxAmt !== null && a > maxAmt) return false
              return true
            })
      if (!amtOk) return false

      return true
    })

    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter((p) => {
        const texts = [
          p.bank?.description || "",
          p.cashbook?.description || "",
          p.bank?.dateISO || "",
          p.cashbook?.dateISO || "",
          (p.bank?.amount ?? "").toString(),
          (p.cashbook?.amount ?? "").toString(),
        ]
        return texts.some((t) => t.toLowerCase().includes(q))
      })
    }

    // Sorting
    const sorted = [...base].sort((a, b) => {
      const dateA = a.bank?.dateISO || a.cashbook?.dateISO || ""
      const dateB = b.bank?.dateISO || b.cashbook?.dateISO || ""
      const amtA = a.bank?.amount ?? a.cashbook?.amount ?? 0
      const amtB = b.bank?.amount ?? b.cashbook?.amount ?? 0
      switch (sortKey) {
        case "date-asc": return dateA.localeCompare(dateB)
        case "date-desc": return dateB.localeCompare(dateA)
        case "amount-asc": return amtA - amtB
        case "amount-desc": return amtB - amtA
      }
    })
    return sorted
  }, [pairs, statusFilter, search, dateStart, dateEnd, amountMin, amountMax, sortKey])

  const pagination = usePagination(filteredPairs, pageSize)

  const matchedCount = stats?.totals.matchedPairs ?? 0
  const unmatchedBankCount = stats?.totals.unmatchedBank ?? 0
  const unmatchedCashCount = stats?.totals.unmatchedCash ?? 0
  const totalPairs = pairs.length
  const matchedPct = totalPairs ? Math.round((matchedCount / totalPairs) * 100) : 0

  const densityRow = density === "compact" ? "h-10" : "h-14"
  const densityCell = density === "compact" ? "py-2" : "py-4"

  return (
    <main className="mx-auto w-full max-w-7xl p-4 md:p-8">
      {/* App Bar */}
      <Card className={cn("mb-6 shadow-lg rounded-2xl border-0 text-white", theme.classes.gradient)}>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
                <TableIcon className="w-6 h-6" />
                Bank Reconciliation
              </CardTitle>
              <CardDescription className="text-white/80">{'Upload, validate, map, and reconcile with smart matching.'}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <ThemePicker />
              <Button variant="secondary" className="bg-white/10 hover:bg-white/20 border-white/20 text-white" onClick={resetAll}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button
                className="bg-white text-emerald-700 hover:bg-emerald-50"
                disabled={!canReconcile || loading}
                onClick={runReconcile}
                aria-disabled={!canReconcile || loading}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", loading ? "animate-spin" : "")} />
                Reconcile
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Upload + Mapping */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SurfaceCard title="Bank Statement" description="Upload a CSV and map the columns." icon={<FileSpreadsheet className={cn("w-5 h-5", theme.classes.accentText)} />} borderClass={theme.classes.accentBorder}>
          <Uploader id="bank-file" file={bankFile} parsed={bankParsed} inputRef={bankInputRef} onFileChange={(e) => onFileChange(e, "bank")} />
          {bankParsed && bankMap && (
            <MappingEditor title="Map columns" parsed={bankParsed} mapping={bankMap} onChange={setBankMap} />
          )}
          <ValidationPanel report={bankValidation} label="Bank CSV" />
        </SurfaceCard>

        <SurfaceCard title="Cashbook" description="Upload a CSV and map the columns." icon={<FileSpreadsheet className={cn("w-5 h-5", theme.classes.accentText)} />} borderClass={theme.classes.accentBorder}>
          <Uploader id="cash-file" file={cashFile} parsed={cashParsed} inputRef={cashInputRef} onFileChange={(e) => onFileChange(e, "cashbook")} />
          {cashParsed && cashMap && (
            <MappingEditor title="Map columns" parsed={cashParsed} mapping={cashMap} onChange={setCashMap} />
          )}
          <ValidationPanel report={cashValidation} label="Cashbook CSV" />
        </SurfaceCard>
      </div>

      {/* Settings */}
      <Card className={cn("mt-6 shadow-md rounded-2xl", theme.classes.accentBorder, "border")}>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Settings2 className={cn("w-5 h-5", theme.classes.accentText)} />
            Reconciliation Settings
          </CardTitle>
          <CardDescription>Smart matching prioritizes closest dates and amounts within your constraints.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-7">
          <div className="grid gap-1.5">
            <Label htmlFor="tol">Amount tolerance</Label>
            <div className="flex items-center gap-2">
              <Input id="tol" type="number" step="0.01" value={settings.amountTolerance} onChange={(e) => setSettings((s) => ({ ...s, amountTolerance: Number(e.target.value || 0) }))} />
              <span className="text-sm text-muted-foreground">absolute</span>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="window">Date window (days)</Label>
            <Input id="window" type="number" value={settings.dateWindowDays} onChange={(e) => setSettings((s) => ({ ...s, dateWindowDays: Math.max(0, Number(e.target.value || 0)) }))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Date format</Label>
            <Select value={settings.dateFormat} onValueChange={(v: ReconcileSettings["dateFormat"]) => setSettings((s) => ({ ...s, dateFormat: v }))}>
              <SelectTrigger><SelectValue placeholder="Auto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                <SelectItem value="dd/mm/yyyy">DD/MM/YYYY</SelectItem>
                <SelectItem value="mm/dd/yyyy">MM/DD/YYYY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" placeholder="e.g., USD, EUR" value={settings.currency} onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value.toUpperCase().slice(0, 3) }))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Strategy</Label>
            <Select value={settings.strategy} onValueChange={(v: "strict" | "smart") => setSettings((s) => ({ ...s, strategy: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">Smart</SelectItem>
                <SelectItem value="strict">Strict</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <Button className={cn("gap-2", theme.classes.accentBg, theme.classes.accentBgHover)} disabled={!canReconcile || loading} onClick={runReconcile} aria-disabled={!canReconcile || loading} title={!canReconcile ? "Resolve validation and map both files" : "Run reconciliation"}>
              <RefreshCw className={cn("w-4 h-4", loading ? "animate-spin" : "")} />
              Reconcile
            </Button>
            <Button variant="outline" className="gap-2" onClick={resetAll}>
              <RefreshCw className="w-4 h-4" />
              Reset
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              Validation must pass before reconciliation.
            </div>
          </div>
          {error && (
            <div className="md:col-span-7 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2">{error}</div>
          )}
        </CardContent>
      </Card>

      {/* Summary + Notifications */}
      {stats && (
        <div className="mt-6 grid gap-6 md:grid-cols-7">
          <Card className={cn("md:col-span-3 shadow-md rounded-2xl", theme.classes.accentBorder, "border")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Reconciliation Summary</CardTitle>
              <CardDescription>Overall status of matched vs unmatched entries.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Matched pairs</div>
                <div className="font-semibold">{matchedCount} / {totalPairs}</div>
              </div>
              <Progress value={matchedPct} className="h-2" />
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Bank entries" value={stats.totals.bankCount.toString()} />
                <Metric label="Cashbook entries" value={stats.totals.cashbookCount.toString()} />
                <Metric label="Unmatched (Bank)" value={stats.totals.unmatchedBank.toString()} tone="rose" />
                <Metric label="Unmatched (Cashbook)" value={stats.totals.unmatchedCash.toString()} tone="rose" />
              </div>
              {(stats.totals.unmatchedBank + stats.totals.unmatchedCash > 0 || stats.totals.netDiff !== 0) && (
                <Alert>
                  <Bell className="h-4 w-4" />
                  <AlertTitle>Suggestions</AlertTitle>
                  <AlertDescription>
                    Try increasing the date window or amount tolerance. If using Debit/Credit, verify sign convention. Consider searching by description for manual review.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className={cn("md:col-span-4 shadow-md rounded-2xl", theme.classes.accentBorder, "border")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Amount Discrepancies</CardTitle>
              <CardDescription>Totals and net differences.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Metric label="Bank total" value={formatter.format(stats.totals.totalBank)} />
              <Metric label="Cashbook total" value={formatter.format(stats.totals.totalCash)} />
              <Metric label="Net difference (Bank - Cashbook)" value={formatter.format(stats.totals.netDiff)} tone={stats.totals.netDiff === 0 ? "emerald" : "amber"} />
              <Metric label="Unmatched Bank total" value={formatter.format(stats.totals.unmatchedBankAmount)} tone="rose" />
              <Metric label="Unmatched Cashbook total" value={formatter.format(stats.totals.unmatchedCashAmount)} tone="rose" />
              <div className="flex items-center flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => downloadCSV(pairs, "reconciliation_all.csv")} disabled={pairs.length === 0}>
                  <FileText className="w-4 h-4" />
                  CSV
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => exportExcel(pairs, "reconciliation.xlsx")} disabled={pairs.length === 0}>
                  <ExcelIcon className="w-4 h-4" />
                  Excel
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => exportPDF(pairs, "reconciliation.pdf")} disabled={pairs.length === 0}>
                  <FileDown className="w-4 h-4" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => exportExcel(pairs.filter((p) => !p.matched), "reconciliation_unmatched.xlsx")}
                  disabled={pairs.length === 0}
                >
                  <ExcelIcon className="w-4 h-4" />
                  Unmatched (Excel)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar: Filters + Sort + Density */}
      {pairs.length > 0 && (
        <Card className={cn("mt-6 shadow-md rounded-2xl", theme.classes.accentBorder, "border")}>
          <CardContent className="py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                  <Filter className={cn("w-4 h-4", theme.classes.accentText)} />
                  <Segmented
                    options={[
                      { key: "all", label: "All" },
                      { key: "matched", label: "Matched" },
                      { key: "bank-only", label: "Bank only" },
                      { key: "cashbook-only", label: "Cashbook only" },
                    ]}
                    value={statusFilter}
                    onChange={(v) => { setStatusFilter(v as StatusFilter); pagination.setPage(1) }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                    <Input className="pl-8 w-[240px]" placeholder="Search description, amount, date..." value={search} onChange={(e) => { setSearch(e.target.value); pagination.setPage(1) }} />
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-2">
                    <LayoutList className="w-4 h-4 text-muted-foreground" />
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); pagination.setPage(1) }}>
                      <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground">Sort</Label>
                    <Select value={sortKey} onValueChange={(v: SortKey) => setSortKey(v)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date-asc">Date ↑</SelectItem>
                        <SelectItem value="date-desc">Date ↓</SelectItem>
                        <SelectItem value="amount-asc">Amount ↑</SelectItem>
                        <SelectItem value="amount-desc">Amount ↓</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="grid gap-1.5">
                  <Label>Date start</Label>
                  <Input type="date" value={dateStart} onChange={(e) => { setDateStart(e.target.value); pagination.setPage(1) }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Date end</Label>
                  <Input type="date" value={dateEnd} onChange={(e) => { setDateEnd(e.target.value); pagination.setPage(1) }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Min amount</Label>
                  <Input type="number" step="0.01" placeholder="e.g., 0" value={amountMin} onChange={(e) => { setAmountMin(e.target.value); pagination.setPage(1) }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Max amount</Label>
                  <Input type="number" step="0.01" placeholder="e.g., 1000" value={amountMax} onChange={(e) => { setAmountMax(e.target.value); pagination.setPage(1) }} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="rounded-full">{filteredPairs.length} results</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant={density === "comfortable" ? "default" : "outline"} size="sm" onClick={() => setDensity("comfortable")} className="gap-1">
                    <Plus className="w-3 h-3" />
                    Cozy
                  </Button>
                  <Button variant={density === "compact" ? "default" : "outline"} size="sm" onClick={() => setDensity("compact")} className="gap-1">
                    <Minus className="w-3 h-3" />
                    Compact
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Table */}
      {pairs.length > 0 ? (
        <Card className={cn("mt-4 shadow-lg rounded-2xl", theme.classes.accentBorder, "border")}>
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Comparison
                  <Badge variant="outline" className="rounded-full">{pairs.length} rows</Badge>
                </CardTitle>
                <CardDescription>Organized by date and amount. Matched rows are tinted; unmatched highlighted.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Matched</Badge>
                <Badge className="bg-rose-600 hover:bg-rose-600">Unmatched</Badge>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pageCount}</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={pagination.prev} disabled={pagination.page === 1}>Prev</Button>
                <Button variant="outline" size="sm" onClick={pagination.next} disabled={pagination.page === pagination.pageCount}>Next</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableCaption>{'Reconciled entries grouped by date and amount'}</TableCaption>
              <TableHeader className="bg-neutral-50 sticky top-0 z-10">
                <TableRow className={densityRow}>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Description (Bank)</TableHead>
                  <TableHead className="w-[140px] text-right">Amount (Bank)</TableHead>
                  <TableHead className="w-[120px] text-center">Status</TableHead>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Description (Cashbook)</TableHead>
                  <TableHead className="w-[140px] text-right">Amount (Cashbook)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.data.map((p) => {
                  const isMatched = p.matched
                  const rowTint = isMatched ? theme.classes.tintMatched : theme.classes.tintUnmatched
                  const borderTint = isMatched ? "border-emerald-500" : "border-rose-500"
                  return (
                    <RippleContainer key={p.id} className="rounded-lg" colorClass={theme.classes.ripple}>
                      <TableRow className={cn(densityRow, "border-l-4 transition-colors", rowTint, borderTint)}>
                        <TableCell className={cn("font-medium", densityCell)}>{p.bank?.dateISO || <span className="text-muted-foreground">{'—'}</span>}</TableCell>
                        <TableCell className={cn(densityCell)}>
                          <div className="flex items-center gap-2">
                            <span>{p.bank?.description || <span className="text-muted-foreground">{'—'}</span>}</span>
                            {isMatched && p.dateDiffDays > 0 && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">{p.dateDiffDays}d</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", densityCell)}>
                          {p.bank ? formatter.format(p.bank.amount) : <span className="text-muted-foreground">{'—'}</span>}
                        </TableCell>
                        <TableCell className={cn("text-center", densityCell)}>
                          {isMatched ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="w-4 h-4" /> Matched
                            </span>
                          ) : p.bank && !p.cashbook ? (
                            <span className="inline-flex items-center gap-1 text-rose-700">
                              <AlertTriangle className="w-4 h-4" /> Bank only
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700">
                              <AlertTriangle className="w-4 h-4" /> Cashbook only
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={cn("font-medium", densityCell)}>{p.cashbook?.dateISO || <span className="text-muted-foreground">{'—'}</span>}</TableCell>
                        <TableCell className={cn(densityCell)}>
                          <div className="flex items-center gap-2">
                            <span>{p.cashbook?.description || <span className="text-muted-foreground">{'—'}</span>}</span>
                            {isMatched && Math.abs(p.amountDiff) > 0 && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                                {formatter.format(Math.abs(p.amountDiff))}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", densityCell)}>
                          {p.cashbook ? formatter.format(p.cashbook.amount) : <span className="text-muted-foreground">{'—'}</span>}
                        </TableCell>
                      </TableRow>
                    </RippleContainer>
                  )
                })}
              </TableBody>
            </Table>
            <div className="mt-3 text-sm text-muted-foreground">
              Showing {pagination.data.length} of {filteredPairs.length} filtered rows. Total pairs: {pairs.length}.
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={cn("mt-6 shadow-md rounded-2xl", theme.classes.accentBorder, "border")}>
          <CardContent className="py-10 text-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Upload className={cn("w-6 h-6", theme.classes.accentText)} />
              <div className="text-sm">
                Upload both CSVs, map columns (choose Amount or Debit/Credit), resolve validation, adjust settings, then click Reconcile.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

/* Subcomponents */

function SurfaceCard({
  title, description, icon, children, borderClass,
}: { title: string; description: string; icon?: React.ReactNode; children: React.ReactNode; borderClass?: string }) {
  return (
    <Card className={cn("shadow-md rounded-2xl border", borderClass || "border-neutral-200")}>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function Uploader({
  id, file, parsed, inputRef, onFileChange,
}: { id: string; file: File | null; parsed: ParseResult | null; inputRef: React.RefObject<HTMLInputElement>; onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>CSV File</Label>
      <div className="flex items-center gap-2">
        <Input id={id} ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFileChange} />
        <Button variant="outline" onClick={() => inputRef.current?.click()} className="gap-2">
          <Upload className="w-4 h-4" />
          Browse
        </Button>
      </div>
      {file && <div className="text-sm text-muted-foreground">Selected: {file.name}</div>}
      {parsed && <div className="text-xs text-muted-foreground">Detected {parsed.rows.length} rows • {parsed.headers.length} columns</div>}
    </div>
  )
}

function MappingEditor({
  title, parsed, mapping, onChange,
}: { title: string; parsed: ParseResult; mapping: Mapping; onChange: (m: Mapping) => void }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label>Date</Label>
          <Select value={mapping.date} onValueChange={(v) => onChange({ ...mapping, date: v })}>
            <SelectTrigger aria-label="Date column"><SelectValue placeholder="Date column" /></SelectTrigger>
            <SelectContent>
              {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h || "(empty header)"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Label>Amount mapping</Label>
          <div className="rounded-lg border p-3 mt-1.5">
            <RadioGroup value={mapping.mode} onValueChange={(v: "amount" | "debitcredit") => onChange({ ...mapping, mode: v })} className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="amount" id="amount-mode" />
                <span>Single Amount column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="debitcredit" id="dc-mode" />
                <span>Debit/Credit columns</span>
              </label>
            </RadioGroup>

            {mapping.mode === "amount" ? (
              <div className="mt-3 grid gap-1.5">
                <Select value={mapping.amount || ""} onValueChange={(v) => onChange({ ...mapping, amount: v })}>
                  <SelectTrigger aria-label="Amount column"><SelectValue placeholder="Amount column" /></SelectTrigger>
                  <SelectContent>
                    {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h || "(empty header)"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>Debit</Label>
                  <Select value={mapping.debit || ""} onValueChange={(v) => onChange({ ...mapping, debit: v })}>
                    <SelectTrigger aria-label="Debit column"><SelectValue placeholder="Debit col" /></SelectTrigger>
                    <SelectContent>
                      {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h || "(empty header)"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Credit</Label>
                  <Select value={mapping.credit || ""} onValueChange={(v) => onChange({ ...mapping, credit: v })}>
                    <SelectTrigger aria-label="Credit column"><SelectValue placeholder="Credit col" /></SelectTrigger>
                    <SelectContent>
                      {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h || "(empty header)"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Sign</Label>
                  <Select value={mapping.signConvention || "credit-positive"} onValueChange={(v: "credit-positive" | "debit-positive") => onChange({ ...mapping, signConvention: v })}>
                    <SelectTrigger aria-label="Sign convention"><SelectValue placeholder="Sign convention" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit-positive">Credits positive</SelectItem>
                      <SelectItem value="debit-positive">Debits positive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Description</Label>
          <Select value={mapping.description || ""} onValueChange={(v) => onChange({ ...mapping, description: v })}>
            <SelectTrigger aria-label="Description column"><SelectValue placeholder="Description column" /></SelectTrigger>
            <SelectContent>
              {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h || "(empty header)"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs text-muted-foreground mb-1">Preview (first 5 rows)</div>
        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {parsed.headers.slice(0, 6).map((h) => <TableHead key={h}>{h || "(empty header)"}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.rows.slice(0, 5).map((r, idx) => (
                <TableRow key={idx}>
                  {parsed.headers.slice(0, 6).map((h) => <TableCell key={h}>{String(r[h] ?? "")}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function ValidationPanel({ report, label }: { report: ValidationReport | null; label: string }) {
  if (!report) return null
  const sevClass = report.issues.some((i) => i.type === "error")
    ? "bg-rose-50 border-rose-200"
    : report.issues.length
    ? "bg-amber-50 border-amber-200"
    : "bg-emerald-50 border-emerald-200"
  return (
    <div className={cn("rounded-xl border p-3", sevClass)}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label} validation</div>
        <div className="text-xs text-muted-foreground">
          Rows: {report.stats.totalRows} • Invalid dates: {report.stats.invalidDate} • Invalid amounts: {report.stats.invalidAmount}
        </div>
      </div>
      {report.issues.length ? (
        <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
          {report.issues.map((i, idx) => (
            <li key={idx} className={i.type === "error" ? "text-rose-700" : "text-amber-700"}>
              {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> No validation issues detected.
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" | "rose" }) {
  const toneClasses =
    tone === "emerald"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : tone === "rose"
      ? "bg-rose-50 border-rose-200"
      : "bg-neutral-50 border-neutral-200"
  return (
    <div className={cn("rounded-xl border p-3", toneClasses)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-neutral-100 p-1 border border-neutral-200">
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={cn("px-3 py-1.5 text-sm rounded-full transition-colors", active ? "bg-white shadow-sm text-emerald-700" : "text-neutral-600 hover:text-neutral-900")}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
