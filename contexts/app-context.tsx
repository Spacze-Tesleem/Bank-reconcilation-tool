"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useAuth } from "./auth-context"

export type RecordStatus = "matched" | "unmatched" | "pending" | "exception" | "suggested"

export type FinancialRecord = {
  id: string
  source: "bank" | "cashbook"
  date: string
  amount: number
  description: string
  reference?: string // Used for Document No in Navision
  documentNo?: string // Specific for NAV
  category?: string
  status: RecordStatus
  matchedWith?: string[]
  confidence?: number // AI confidence score
  matchReason?: string // Explanation for suggestion
  tags?: string[] // Added tags for better categorization
  notes?: string // Added notes for audit trail
  uploadId: string
  createdAt: string
  updatedAt: string
}

export type MatchPair = {
  id: string
  bankRecords: FinancialRecord[]
  cashbookRecords: FinancialRecord[]
  matchType: "auto" | "manual" | "suggested"
  confidence: number
  amountDiff: number
  dateDiff: number
  status: "matched" | "pending" | "exception"
  reason?: string
  createdAt: string
  createdBy: string
}

export type ReconciliationPeriod = {
  id: string
  name: string
  startDate: string
  endDate: string
  openingBalance: number
  closingBalance: number
  status: "open" | "closed" | "draft"
  totalMatched: number
  totalUnmatched: number
  createdAt: string
  closedAt?: string
  closedBy?: string
}

export type AuditLog = {
  id: string
  userId: string
  userName: string
  action: string
  entity: string
  entityId: string
  changes: Record<string, any>
  timestamp: string
  ipAddress?: string
}

export type UploadTemplate = {
  id: string
  name: string
  description: string
  source: "bank" | "cashbook"
  columnMapping: Record<string, string>
  dateFormat: string
  createdAt: string
  createdBy: string
}

type AppContextType = {
  records: FinancialRecord[]
  matches: MatchPair[]
  periods: ReconciliationPeriod[]
  auditLogs: AuditLog[]
  templates: UploadTemplate[]
  currentPeriod: ReconciliationPeriod | null
  addRecords: (records: FinancialRecord[]) => void
  updateRecord: (id: string, updates: Partial<FinancialRecord>) => void
  deleteRecord: (id: string) => void
  createMatch: (bankIds: string[], cashbookIds: string[], type: "auto" | "manual" | "suggested") => void
  removeMatch: (matchId: string) => void
  createPeriod: (period: Omit<ReconciliationPeriod, "id" | "createdAt">) => void
  closePeriod: (periodId: string) => void
  saveTemplate: (template: Omit<UploadTemplate, "id" | "createdAt" | "createdBy">) => void
  bulkUpdateRecords: (ids: string[], updates: Partial<FinancialRecord>) => void // Added bulk update
  logAction: (action: string, entity: string, entityId: string, changes?: Record<string, any>) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [matches, setMatches] = useState<MatchPair[]>([])
  const [periods, setPeriods] = useState<ReconciliationPeriod[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [templates, setTemplates] = useState<UploadTemplate[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<ReconciliationPeriod | null>(null)

  // Load data from localStorage on mount
  useEffect(() => {
    const savedRecords = localStorage.getItem("recon_records")
    const savedMatches = localStorage.getItem("recon_matches")
    const savedPeriods = localStorage.getItem("recon_periods")
    const savedAuditLogs = localStorage.getItem("recon_audit_logs")
    const savedTemplates = localStorage.getItem("recon_templates")
    const savedCurrentPeriod = localStorage.getItem("recon_current_period")

    if (savedRecords) setRecords(JSON.parse(savedRecords))
    if (savedMatches) setMatches(JSON.parse(savedMatches))
    if (savedPeriods) setPeriods(JSON.parse(savedPeriods))
    if (savedAuditLogs) setAuditLogs(JSON.parse(savedAuditLogs))
    if (savedTemplates) setTemplates(JSON.parse(savedTemplates))
    if (savedCurrentPeriod) setCurrentPeriod(JSON.parse(savedCurrentPeriod))
  }, [])

  // Save to localStorage when data changes
  useEffect(() => {
    localStorage.setItem("recon_records", JSON.stringify(records))
  }, [records])

  useEffect(() => {
    localStorage.setItem("recon_matches", JSON.stringify(matches))
  }, [matches])

  useEffect(() => {
    localStorage.setItem("recon_periods", JSON.stringify(periods))
  }, [periods])

  useEffect(() => {
    localStorage.setItem("recon_audit_logs", JSON.stringify(auditLogs))
  }, [auditLogs])

  useEffect(() => {
    localStorage.setItem("recon_templates", JSON.stringify(templates))
  }, [templates])

  useEffect(() => {
    localStorage.setItem("recon_current_period", JSON.stringify(currentPeriod))
  }, [currentPeriod])

  const logAction = (action: string, entity: string, entityId: string, changes?: Record<string, any>) => {
    if (!user) return

    const log: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      userName: user.name,
      action,
      entity,
      entityId,
      changes: changes || {},
      timestamp: new Date().toISOString(),
      ipAddress: "127.0.0.1", // Mock IP
    }

    setAuditLogs((prev) => [log, ...prev])
  }

  const addRecords = (newRecords: FinancialRecord[]) => {
    setRecords((prev) => [...prev, ...newRecords])
    logAction("CREATE", "records", "bulk", { count: newRecords.length })
  }

  const updateRecord = (id: string, updates: Partial<FinancialRecord>) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r)))
    logAction("UPDATE", "record", id, updates)
  }

  const bulkUpdateRecords = (ids: string[], updates: Partial<FinancialRecord>) => {
    setRecords((prev) =>
      prev.map((r) => (ids.includes(r.id) ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r)),
    )
    logAction("BULK_UPDATE", "records", "multiple", { ids, updates })
  }

  const deleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id))
    logAction("DELETE", "record", id)
  }

  const createMatch = (bankIds: string[], cashbookIds: string[], type: "auto" | "manual" | "suggested") => {
    const bankRecords = records.filter((r) => bankIds.includes(r.id))
    const cashbookRecords = records.filter((r) => cashbookIds.includes(r.id))

    const match: MatchPair = {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bankRecords,
      cashbookRecords,
      matchType: type,
      confidence: type === "manual" ? 100 : type === "suggested" ? 75 : 85,
      amountDiff:
        bankRecords.reduce((sum, r) => sum + r.amount, 0) - cashbookRecords.reduce((sum, r) => sum + r.amount, 0),
      dateDiff: 0, // Calculate based on dates
      status: "matched",
      createdAt: new Date().toISOString(),
      createdBy: user?.id || "unknown",
    }

    setMatches((prev) => [...prev, match])

    // Update record statuses
    const allIds = [...bankIds, ...cashbookIds]
    setRecords((prev) =>
      prev.map((r) =>
        allIds.includes(r.id) ? { ...r, status: "matched" as RecordStatus, matchedWith: [match.id] } : r,
      ),
    )

    logAction("CREATE", "match", match.id, { bankIds, cashbookIds, type })
  }

  const removeMatch = (matchId: string) => {
    const match = matches.find((m) => m.id === matchId)
    if (!match) return

    setMatches((prev) => prev.filter((m) => m.id !== matchId))

    // Update record statuses back to unmatched
    const allRecordIds = [...match.bankRecords.map((r) => r.id), ...match.cashbookRecords.map((r) => r.id)]
    setRecords((prev) =>
      prev.map((r) =>
        allRecordIds.includes(r.id) ? { ...r, status: "unmatched" as RecordStatus, matchedWith: undefined } : r,
      ),
    )

    logAction("DELETE", "match", matchId)
  }

  const createPeriod = (periodData: Omit<ReconciliationPeriod, "id" | "createdAt">) => {
    const period: ReconciliationPeriod = {
      ...periodData,
      id: `period_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    }

    setPeriods((prev) => [...prev, period])
    setCurrentPeriod(period)
    logAction("CREATE", "period", period.id, periodData)
  }

  const closePeriod = (periodId: string) => {
    setPeriods((prev) =>
      prev.map((p) =>
        p.id === periodId
          ? { ...p, status: "closed" as const, closedAt: new Date().toISOString(), closedBy: user?.id }
          : p,
      ),
    )
    logAction("UPDATE", "period", periodId, { status: "closed" })
  }

  const saveTemplate = (templateData: Omit<UploadTemplate, "id" | "createdAt" | "createdBy">) => {
    const template: UploadTemplate = {
      ...templateData,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      createdBy: user?.id || "unknown",
    }

    setTemplates((prev) => [...prev, template])
    logAction("CREATE", "template", template.id, templateData)
  }

  return (
    <AppContext.Provider
      value={{
        records,
        matches,
        periods,
        auditLogs,
        templates,
        currentPeriod,
        addRecords,
        updateRecord,
        deleteRecord,
        createMatch,
        removeMatch,
        createPeriod,
        closePeriod,
        saveTemplate,
        bulkUpdateRecords,
        logAction,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error("useApp must be used within AppProvider")
  return context
}
