import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  writeBatch,
} from "@/lib/firestore-shim";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  HandCoins,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";

type InvoiceTxStatus = "Paid" | "Partially Paid" | "Unpaid";

type PaymentDirection = "In" | "Out";
type PaymentMethod = "Cash" | "UPI" | "Bank" | "Bank Transfer" | "Card" | "Cheque";
type PaymentStatus = "Completed" | "Pending" | "Failed";

interface PaymentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  direction: PaymentDirection;
  partyType: "customer" | "supplier" | "other";
  partyId?: string;
  partyName?: string;
  invoiceId?: string;
  invoiceNo?: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  bankAccountId?: string;
  bankAccountName?: string;
  cashAccountId?: string;
  cashAccountName?: string;
  bankTransferCharge?: number;
  accountingTxId?: string;
  bankChargeTxId?: string;
  acctAccountingTxId?: string; // ID for accountingTransactions collection entry
  acctBankChargeTxId?: string; // ID for accountingTransactions collection bank charge entry
  notes?: string;
  status: PaymentStatus;
  createdAt?: Date;
}

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber?: string;
}

interface CashAccount {
  id: string;
  accountName: string;
}

interface PartyOption {
  id: string;
  name: string;
  opening?: number;
}

type PartyType = "customer" | "supplier";

type InvoiceStatus = string;

interface InvoiceRecord {
  id: string;
  invoiceNo: string;
  manualInvoiceNo?: string;
  partyType: PartyType;
  partyId: string;
  partyName: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  status?: InvoiceStatus;
}

type NoteType = "Debit" | "Credit";

interface NoteRecord {
  id: string;
  noteType: NoteType;
  noteNo: string;
  date: string;
  partyType: PartyType;
  partyId: string;
  partyName: string;
  amount: number;
  relatedInvoiceNo?: string;
  reason?: string;
}

const defaultFormState = {
  date: new Date().toISOString().slice(0, 10),
  direction: "In" as PaymentDirection,
  partyType: "customer" as PaymentRecord["partyType"],
  partyId: "",
  partyName: "",
  invoiceId: "",
  amount: "",
  method: "Cash" as PaymentMethod,
  reference: "",
  bankAccountId: "",
  bankTransferCharge: "",
  notes: "",
  status: "Completed" as PaymentStatus,
};

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function partyShortCode(name: string): string {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  if (!first) return "";

  const lettersOnly = first.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (lettersOnly.startsWith("AL")) return "AL";
  return lettersOnly.slice(0, 3);
}

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);

  const [activePartyType, setActivePartyType] = useState<PartyType>("customer");
  const [partySearch, setPartySearch] = useState("");
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false);
  const [filterOutstandingOnly, setFilterOutstandingOnly] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [formData, setFormData] = useState(defaultFormState);

  const { toast } = useToast();

  const partyOptions = useMemo(() => {
    if (formData.partyType === "supplier") return suppliers;
    if (formData.partyType === "customer") return customers;
    return [];
  }, [customers, suppliers, formData.partyType]);

  const selectedParty = useMemo(() => {
    if (formData.partyType === "other") return { id: "", name: formData.partyName.trim() };
    return partyOptions.find((p) => p.id === formData.partyId);
  }, [formData.partyId, formData.partyName, formData.partyType, partyOptions]);

  const CURRENCY = "₹";

  const amountText = (n: number): string => {
    const value = Number.isFinite(n) ? n : 0;
    return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const rupees = (n: number): string => `${CURRENCY}${amountText(n)}`;
  const money = (n: number): string => rupees(n);

  const formatDate = (value?: string): string => {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    const dd = `${dt.getDate()}`.padStart(2, "0");
    const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
    return `${dd}/${mm}/${dt.getFullYear()}`;
  };

  const isOverdueInvoice = (inv: InvoiceRecord): boolean => {
    if ((inv.status || "").toLowerCase() === "paid") return false;
    if ((inv.status || "").toLowerCase() === "overdue") return true;
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due < today;
  };

  const activeParties = useMemo(() => (activePartyType === "customer" ? customers : suppliers), [activePartyType, customers, suppliers]);

  const partySummaries = useMemo(() => {
    const completedPayments = payments.filter((p) => p.status === "Completed");
    return activeParties
      .map((p) => {
        // For suppliers (purchases), include all invoices; for customers, only include "Approved" invoices
        const partyInvoices = invoices.filter((x) => {
          if (x.partyType !== activePartyType || x.partyId !== p.id) return false;
          if (activePartyType === "supplier") return true; // Include all purchases for suppliers
          return x.status === "Approved"; // Only approved invoices for customers
        });
        const partyNotes = notes.filter((x) => x.partyType === activePartyType && x.partyId === p.id);
        const partyPayments = completedPayments.filter((x) => x.partyType === activePartyType && x.partyId === p.id);

        const opening = Number(p.opening) || 0;
        const totalInvoiced = partyInvoices.reduce((sum, x) => sum + (x.total || 0), 0);

        const creditAdjustments = partyNotes.filter((n) => n.noteType === "Credit").reduce((sum, n) => sum + (n.amount || 0), 0);
        const debitAdjustments = partyNotes.filter((n) => n.noteType === "Debit").reduce((sum, n) => sum + (n.amount || 0), 0);

        const settledDirection: PaymentDirection = activePartyType === "customer" ? "In" : "Out";
        const settled = partyPayments
          .filter((x) => x.direction === settledDirection)
          .reduce((sum, x) => sum + (x.amount || 0), 0);

        // Calculate how much of negative opening balance has been applied to invoices (for display only)
        let openingBalanceApplied = 0;
        if (opening < 0) {
          const absOpening = Math.abs(opening);
          let remainingCredit = absOpening;
          for (const inv of partyInvoices) {
            const invTotal = Number(inv.total) || 0;
            if (remainingCredit <= 0) break;
            const appliedToThisInvoice = Math.min(remainingCredit, invTotal);
            openingBalanceApplied += appliedToThisInvoice;
            remainingCredit -= appliedToThisInvoice;
          }
        }

        const balance = opening + totalInvoiced + debitAdjustments - creditAdjustments - settled;

        const overdueInvoicesTotal = partyInvoices.filter(isOverdueInvoice).reduce((sum, x) => sum + (x.total || 0), 0);
        const overdueOutstanding = Math.min(Math.max(0, balance), overdueInvoicesTotal);

        return {
          id: p.id,
          name: p.name,
          opening,
          totalInvoiced,
          settled,
          displaySettled: settled + openingBalanceApplied,
          creditAdjustments,
          debitAdjustments,
          balance,
          overdueOutstanding,
          invoices: partyInvoices,
          notes: partyNotes,
          payments: partyPayments,
        };
      })
      .filter((x) => x.name);
  }, [activeParties, activePartyType, invoices, notes, payments]);

  const topStats = useMemo(() => {
    const totalOutstanding = partySummaries.reduce((sum, x) => sum + Math.max(0, x.balance), 0);
    const overdueAmount = partySummaries.reduce((sum, x) => sum + x.overdueOutstanding, 0);
    const activeCount = partySummaries.filter((x) => x.opening !== 0 || x.totalInvoiced > 0 || x.settled > 0 || x.creditAdjustments > 0 || x.debitAdjustments > 0).length;
    return { totalOutstanding, overdueAmount, activeCount };
  }, [partySummaries]);

  const visiblePartySummaries = useMemo(() => {
    let list = partySummaries;

    if (filterOverdueOnly) list = list.filter((p) => p.overdueOutstanding > 0);
    if (filterOutstandingOnly) list = list.filter((p) => p.balance > 0);

    if (!partySearch.trim()) return list;
    const q = partySearch.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [filterOutstandingOnly, filterOverdueOnly, partySearch, partySummaries]);

  const fetchParties = async () => {
    const [customersSnap, suppliersSnap] = await Promise.all([
      getDocs(collection(db, "customers")),
      getDocs(collection(db, "suppliers")),
    ]);

    const customersList = customersSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: (data.name || "").toString(),
          opening: typeof data.opening === "number" ? data.opening : parseFloat(data.opening) || 0,
        };
      })
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const suppliersList = suppliersSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: (data.name || "").toString(),
          opening: typeof data.opening === "number" ? data.opening : parseFloat(data.opening) || 0,
        };
      })
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    setCustomers(customersList);
    setSuppliers(suppliersList);
  };

  const fetchPayments = async () => {
    const qy = query(collection(db, "payments"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        date: (data.date || "").toString(),
        direction: (data.direction || "In") as PaymentDirection,
        partyType: (data.partyType || "customer") as PaymentRecord["partyType"],
        partyId: (data.partyId || "").toString() || undefined,
        partyName: (data.partyName || "").toString() || undefined,
        invoiceId: (data.invoiceId || "").toString() || undefined,
        invoiceNo: (data.invoiceNo || "").toString() || undefined,
        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
        method: ((data.method || "Cash") as PaymentMethod) || "Cash",
        reference: (data.reference || "").toString(),
        bankAccountId: (data.bankAccountId || "").toString() || undefined,
        bankAccountName: (data.bankAccountName || "").toString() || undefined,
        cashAccountId: (data.cashAccountId || "").toString() || undefined,
        cashAccountName: (data.cashAccountName || "").toString() || undefined,
        bankTransferCharge:
          typeof data.bankTransferCharge === "number" ? data.bankTransferCharge : parseFloat(data.bankTransferCharge) || 0,
        accountingTxId: (data.accountingTxId || "").toString() || undefined,
        bankChargeTxId: (data.bankChargeTxId || "").toString() || undefined,
        acctAccountingTxId: (data.acctAccountingTxId || "").toString() || undefined,
        acctBankChargeTxId: (data.acctBankChargeTxId || "").toString() || undefined,
        notes: (data.notes || "").toString() || undefined,
        status: (data.status || "Completed") as PaymentStatus,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as PaymentRecord;
    });
    setPayments(list);
  };

  const fetchBankAccounts = async () => {
    const qy = query(collection(db, "bankAccounts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          accountName: (data.accountName || data.name || "").toString(),
          accountNumber: (data.accountNumber || "").toString() || undefined,
        } as BankAccount;
      })
      .filter((b) => b.accountName);
    setBankAccounts(list);
  };

  const fetchCashAccounts = async () => {
    const qy = query(collection(db, "cashAccounts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          accountName: (data.accountName || data.name || "").toString(),
        } as CashAccount;
      })
      .filter((c) => c.accountName);
    setCashAccounts(list);
  };

  const fetchInvoices = async () => {
    const [invoicesSnap, purchasesSnap] = await Promise.all([
      getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "purchases")),
    ]);
    
    const invoicesList = invoicesSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          invoiceNo: (data.invoiceNo || "").toString(),
          manualInvoiceNo: (data.manualInvoiceNo || "").toString() || undefined,
          partyType: ((data.partyType || "customer") as PartyType) || "customer",
          partyId: (data.partyId || "").toString(),
          partyName: (data.partyName || "").toString(),
          issueDate: (data.issueDate || "").toString(),
          dueDate: (data.dueDate || "").toString() || undefined,
          total: typeof data.total === "number" ? data.total : parseFloat(data.total) || 0,
          status: (data.status || "").toString() || undefined,
        } as InvoiceRecord;
      })
      .filter((x) => x.invoiceNo && x.partyId);
    
    // Convert purchases to invoice format for suppliers
    const purchasesList = purchasesSnap.docs
      .map((d) => {
        const data = d.data();
        const supplierId = (data.supplierId || "").toString();
        const supplierName = (data.supplierName || "").toString();
        if (!supplierId || !supplierName) return null;
        
        return {
          id: d.id,
          invoiceNo: (data.invoiceNo || "").toString(),
          manualInvoiceNo: undefined,
          partyType: "supplier" as PartyType,
          partyId: supplierId,
          partyName: supplierName,
          issueDate: (data.date || "").toString(),
          dueDate: undefined,
          total: typeof data.totalPrice === "number" ? data.totalPrice : parseFloat(data.totalPrice) || 0,
          status: "Unpaid",
        } as InvoiceRecord;
      })
      .filter((x) => x !== null) as InvoiceRecord[];
    
    setPurchases(purchasesSnap.docs.map(d => ({id: d.id, ...d.data()})));
    setInvoices([...invoicesList, ...purchasesList]);
  };

  const fetchNotes = async () => {
    const qy = query(collection(db, "debitCreditNotes"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          noteType: (data.noteType || "Debit") as NoteType,
          noteNo: (data.noteNo || "").toString(),
          date: (data.date || "").toString(),
          partyType: (data.partyType || "customer") as PartyType,
          partyId: (data.partyId || "").toString(),
          partyName: (data.partyName || "").toString(),
          amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
          relatedInvoiceNo: (data.relatedInvoiceNo || "").toString() || undefined,
          reason: (data.reason || "").toString() || undefined,
        } as NoteRecord;
      })
      .filter((x) => x.noteNo && x.partyId);
    setNotes(list);
  };

  const fetchAll = async () => {
    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await Promise.all([fetchParties(), fetchPayments(), fetchInvoices(), fetchNotes(), fetchBankAccounts(), fetchCashAccounts()]);
    } catch (error) {
      console.error("Error fetching payments", error);
      toast({
        title: "Load failed",
        description: "Could not load payments/invoices/notes from Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setFormData({
      ...defaultFormState,
      date: new Date().toISOString().slice(0, 10),
    });
  };

  const openAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openAddForParty = (partyType: PartyType, partyId: string, partyName: string) => {
    resetForm();
    setFormData((s) => ({
      ...s,
      partyType,
      partyId,
      partyName,
      invoiceId: "",
      direction: partyType === "customer" ? "In" : "Out",
    }));
    setIsDialogOpen(true);
  };

  // Helper to calculate actual remaining amount for an invoice (accounting for opening balance credit)
  const calculateInvoiceRemaining = (inv: InvoiceRecord, partyId: string, partyType: PartyType): number => {
    const norm = (v: unknown) => (v ?? "").toString().trim().toLowerCase();
    const systemInvoiceNo = inv.invoiceNo;
    const manualInvoiceNo = inv.manualInvoiceNo;
    
    // Calculate notes adjustments
    const relatedNotes = notes.filter((n) => {
      const invNo = norm(n.relatedInvoiceNo);
      const sys = norm(systemInvoiceNo);
      const man = norm(manualInvoiceNo);
      return (sys && invNo === sys) || (man && invNo === man);
    });
    
    const debitAdjust = relatedNotes.filter((n) => n.noteType === "Debit").reduce((sum, n) => sum + (n.amount || 0), 0);
    const creditAdjust = relatedNotes.filter((n) => n.noteType === "Credit").reduce((sum, n) => sum + (n.amount || 0), 0);
    
    const baseTotal = inv.total || 0;
    const adjustedTotal = Math.max(0, baseTotal + debitAdjust - creditAdjust);
    
    // Calculate actual payments for this invoice
    const settledDirection: PaymentDirection = partyType === "customer" ? "In" : "Out";
    const relatedPayments = payments.filter((p) => {
      if (p.status !== "Completed") return false;
      if (p.direction !== settledDirection) return false;
      if (p.partyType !== partyType || p.partyId !== partyId) return false;
      
      // Match by invoice ID or reference
      if (p.invoiceId && p.invoiceId === inv.id) return true;
      const ref = norm(p.reference);
      if (!ref) return false;
      const sys = norm(systemInvoiceNo);
      const man = norm(manualInvoiceNo);
      return (sys && ref.includes(sys)) || (man && ref.includes(man));
    });
    
    const paidAmount = relatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Calculate opening balance credit applied to this invoice
    const party = (partyType === "customer" ? customers : suppliers).find(p => p.id === partyId);
    const opening = Number(party?.opening) || 0;
    let openingCreditApplied = 0;
    
    if (opening < 0) {
      // Get all invoices for this party sorted by date
      const partyInvoices = invoices
        .filter((x) => x.partyType === partyType && x.partyId === partyId)
        .sort((a, b) => (a.issueDate || "").localeCompare(b.issueDate || ""));
      
      let remainingCredit = Math.abs(opening);
      for (const pinv of partyInvoices) {
        if (remainingCredit <= 0) break;
        if (pinv.id === inv.id) {
          openingCreditApplied = Math.min(remainingCredit, adjustedTotal);
          break;
        }
        // Apply credit to earlier invoices
        const pinvTotal = Number(pinv.total) || 0;
        const creditUsed = Math.min(remainingCredit, pinvTotal);
        remainingCredit -= creditUsed;
      }
    }
    
    return Math.max(0, adjustedTotal - paidAmount - openingCreditApplied);
  };

  const toggleParty = (partyId: string) => {
    setOpenPartyId((cur) => (cur === partyId ? null : partyId));
  };

  const buildPartyInvoiceHistoryRows = (summary: (typeof partySummaries)[number]) => {
    type InvoiceHistoryRow = {
      rowType: "opening" | "invoice";
      invoiceId: string;
      date: string;
      type: string;
      invoiceNo: string;
      amountPaid: number;
      amountRemaining: number;
      totalAmount: number;
      status: InvoiceTxStatus;
    };

    const norm = (v: unknown) => (v ?? "").toString().trim().toLowerCase();

    const byDateAsc = [...summary.invoices].sort((a, b) => (a.issueDate || "").localeCompare(b.issueDate || ""));

    const notesByInvoiceNo = new Map<string, { debit: number; credit: number }>();
    for (const n of summary.notes) {
      const invNo = norm(n.relatedInvoiceNo);
      if (!invNo) continue;
      const cur = notesByInvoiceNo.get(invNo) || { debit: 0, credit: 0 };
      if (n.noteType === "Debit") cur.debit += Number(n.amount) || 0;
      else cur.credit += Number(n.amount) || 0;
      notesByInvoiceNo.set(invNo, cur);
    }

    const settledDirection: PaymentDirection = activePartyType === "customer" ? "In" : "Out";
    const relevantPayments = summary.payments.filter((p) => p.direction === settledDirection);

    const paymentMatchesInvoice = (
      payment: PaymentRecord,
      invoiceId: string,
      systemInvoiceNo: string,
      manualInvoiceNo?: string
    ): boolean => {
      if (payment.invoiceId && invoiceId && payment.invoiceId === invoiceId) return true;
      const ref = norm(payment.reference);
      if (!ref) return false;
      const sys = norm(systemInvoiceNo);
      const man = norm(manualInvoiceNo);
      return (sys && ref.includes(sys)) || (man && ref.includes(man));
    };

    const noteAdjustForInvoice = (systemInvoiceNo: string, manualInvoiceNo?: string) => {
      const sysKey = norm(systemInvoiceNo);
      const manKey = norm(manualInvoiceNo);
      const a = sysKey ? notesByInvoiceNo.get(sysKey) : undefined;
      const b = manKey ? notesByInvoiceNo.get(manKey) : undefined;
      return {
        debit: (a?.debit || 0) + (b?.debit || 0),
        credit: (a?.credit || 0) + (b?.credit || 0),
      };
    };

    const rows: InvoiceHistoryRow[] = [];

    const opening = Number(summary.opening) || 0;
    
    // Track available credit from negative opening balance (customer owes us less / we owe supplier less)
    let availableCredit = opening < 0 ? Math.abs(opening) : 0;
    
    if (opening !== 0) {
      const openingAmount = Math.abs(opening);
      rows.push({
        rowType: "opening",
        invoiceId: `opening-${summary.id}`,
        date: "",
        type: "Opening Balance",
        invoiceNo: "—",
        amountPaid: opening < 0 ? openingAmount : 0,
        amountRemaining: opening > 0 ? openingAmount : 0,
        totalAmount: openingAmount,
        status: opening < 0 ? "Paid" : "Unpaid",
      });
    }

    byDateAsc.forEach((inv) => {
      const systemInvoiceNo = (inv.invoiceNo || "").toString();
      const manualInvoiceNo = inv.manualInvoiceNo;
      const displayInvoiceNo = manualInvoiceNo || systemInvoiceNo;

      const noteAdjust = noteAdjustForInvoice(systemInvoiceNo, manualInvoiceNo);
      const baseTotal = Number(inv.total) || 0;
      const adjustedTotal = Math.max(0, baseTotal + noteAdjust.debit - noteAdjust.credit);

      const paidRaw = relevantPayments
        .filter((p) => paymentMatchesInvoice(p, inv.id, systemInvoiceNo, manualInvoiceNo))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      // Apply available credit from negative opening balance first, then actual payments
      let creditApplied = 0;
      if (availableCredit > 0) {
        creditApplied = Math.min(availableCredit, adjustedTotal);
        availableCredit -= creditApplied;
      }
      
      const paid = Math.min(adjustedTotal, Math.max(0, paidRaw + creditApplied));

      const amountRemaining = Math.max(0, adjustedTotal - paid);
      const status: InvoiceTxStatus = amountRemaining <= 0 ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";

      const typeLabel = activePartyType === "customer" ? "Invoice (Sale)" : "Invoice (Purchase)";

      rows.push({
        rowType: "invoice",
        invoiceId: inv.id,
        date: inv.issueDate || inv.dueDate || "",
        type: typeLabel,
        invoiceNo: displayInvoiceNo,
        amountPaid: paid,
        amountRemaining,
        totalAmount: adjustedTotal,
        status,
      } as InvoiceHistoryRow);
    });

    return rows;
  };

  const buildPartyTransactions = (summary: (typeof partySummaries)[number]) => {
    type TxRow = { date: string; kind: string; ref: string; amount: number };
    const rows: TxRow[] = [];

    const opening = Number(summary.opening) || 0;
    if (opening !== 0) {
      rows.push({
        date: "",
        kind: "Opening Balance",
        ref: "—",
        amount: opening,
      });
    }

    for (const inv of summary.invoices) {
      rows.push({
        date: inv.issueDate || inv.dueDate || "",
        kind: "Invoice",
        ref: inv.invoiceNo,
        amount: Number(inv.total) || 0,
      });
    }

    for (const n of summary.notes) {
      const sign = n.noteType === "Debit" ? 1 : -1;
      rows.push({
        date: n.date || "",
        kind: n.noteType === "Debit" ? "Debit Note" : "Credit Note",
        ref: n.noteNo || n.relatedInvoiceNo || "",
        amount: (Number(n.amount) || 0) * sign,
      });
    }

    for (const p of summary.payments) {
      const sign =
        activePartyType === "customer"
          ? p.direction === "In"
            ? -1
            : 1
          : p.direction === "Out"
            ? -1
            : 1;
      rows.push({
        date: p.date || "",
        kind: p.direction === "In" ? "Payment In" : "Payment Out",
        ref: p.reference || p.method,
        amount: (Number(p.amount) || 0) * sign,
      });
    }

    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return rows;
  };


  const [printParty, setPrintParty] = useState<(typeof partySummaries)[number] | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => setPrintParty(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const renderPartyStatement = (summary: (typeof partySummaries)[number]) => {
    const partyLabel = activePartyType === "customer" ? "Customer" : "Supplier";
    const amountDue = Math.max(0, summary.balance);
    const opening = summary.opening;
    const totalInvoiced = summary.totalInvoiced;
    const settled = summary.settled;
    const creditAdj = summary.creditAdjustments;
    const debitAdj = summary.debitAdjustments;
    const now = new Date();

    // Calculate aging buckets based on invoice due dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let current = 0;
    let days1to30 = 0;
    let days31to60 = 0;
    let days61to90 = 0;
    let days90plus = 0;

    summary.invoices.forEach((inv) => {
      if (!inv.dueDate || (inv.status || "").toLowerCase() === "paid") return;
      
      const dueDate = new Date(inv.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysPast = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = inv.total || 0;

      if (daysPast <= 0) {
        current += amount;
      } else if (daysPast <= 30) {
        days1to30 += amount;
      } else if (daysPast <= 60) {
        days31to60 += amount;
      } else if (daysPast <= 90) {
        days61to90 += amount;
      } else {
        days90plus += amount;
      }
    });

    return (
      <div className="p-6 text-black">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground">
              {now.toLocaleString("en-IN")}
            </div>
            <div className="text-lg font-bold uppercase">Haritany pharma</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold">Statement - {summary.name}</div>
            <div className="text-sm font-semibold">Account Statement</div>
            <div className="border border-black px-3 py-1 text-xs font-semibold inline-block">
              {formatDate(now.toISOString())}
            </div>
          </div>
        </div>

        <div className="mt-3 border border-black">
          <div className="p-3 text-xs">
            <div className="font-semibold">To</div>
            <div className="mt-1 font-bold uppercase">{summary.name}</div>
            <div className="text-[10px] text-muted-foreground">{partyLabel}</div>
          </div>
        </div>

        <div className="mt-3 border border-black">
          <div className="grid grid-cols-2 text-[11px]">
            <div className="p-2 border-r border-black">
              <div className="text-muted-foreground">Outstanding Amount</div>
              <div className="font-semibold text-xs">{rupees(amountDue)}</div>
            </div>
            <div className="p-2">
              <div className="text-muted-foreground">Overdue Amount</div>
              <div className="font-semibold text-xs">{rupees(summary.overdueOutstanding)}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 border border-black">
          <div className="grid grid-cols-4 text-[11px] font-semibold bg-muted/20 border-b border-black">
            <div className="p-2 border-r border-black">Date</div>
            <div className="p-2 border-r border-black">Transaction</div>
            <div className="p-2 border-r border-black text-right">Amount</div>
            <div className="p-2 text-right">Balance</div>
          </div>
          <div className="text-xs">
            <div className="grid grid-cols-4 border-b border-black">
              <div className="p-2 border-r border-black">—</div>
              <div className="p-2 border-r border-black">Opening Balance</div>
              <div className="p-2 border-r border-black text-right">{rupees(opening)}</div>
              <div className="p-2 text-right">{rupees(opening)}</div>
            </div>
            <div className="grid grid-cols-4 border-b border-black">
              <div className="p-2 border-r border-black">—</div>
              <div className="p-2 border-r border-black">Total Invoiced</div>
              <div className="p-2 border-r border-black text-right">{rupees(totalInvoiced)}</div>
              <div className="p-2 text-right">{rupees(opening + totalInvoiced)}</div>
            </div>
            {debitAdj > 0 && (
              <div className="grid grid-cols-4 border-b border-black">
                <div className="p-2 border-r border-black">—</div>
                <div className="p-2 border-r border-black">Debit Adjustments</div>
                <div className="p-2 border-r border-black text-right">{rupees(debitAdj)}</div>
                <div className="p-2 text-right">{rupees(opening + totalInvoiced + debitAdj)}</div>
              </div>
            )}
            {creditAdj > 0 && (
              <div className="grid grid-cols-4 border-b border-black">
                <div className="p-2 border-r border-black">—</div>
                <div className="p-2 border-r border-black">Credit Adjustments</div>
                <div className="p-2 border-r border-black text-right">-{rupees(creditAdj)}</div>
                <div className="p-2 text-right">{rupees(opening + totalInvoiced + debitAdj - creditAdj)}</div>
              </div>
            )}
            <div className="grid grid-cols-4 border-b border-black">
              <div className="p-2 border-r border-black">—</div>
              <div className="p-2 border-r border-black">Payments Settled</div>
              <div className="p-2 border-r border-black text-right">-{rupees(settled)}</div>
              <div className="p-2 text-right font-semibold">{rupees(opening + totalInvoiced + debitAdj - creditAdj - settled)}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 border border-black">
          <div className="grid grid-cols-6 text-[10px] font-semibold bg-muted/20 border-b border-black">
            <div className="p-2 border-r border-black">Current</div>
            <div className="p-2 border-r border-black">1-30 Days</div>
            <div className="p-2 border-r border-black">31-60 Days</div>
            <div className="p-2 border-r border-black">61-90 Days</div>
            <div className="p-2 border-r border-black">90+ Days</div>
            <div className="p-2 text-right">Outstanding</div>
          </div>
          <div className="grid grid-cols-6 text-xs">
            <div className="p-2 border-r border-black text-right">{rupees(current)}</div>
            <div className="p-2 border-r border-black text-right">{rupees(days1to30)}</div>
            <div className="p-2 border-r border-black text-right">{rupees(days31to60)}</div>
            <div className="p-2 border-r border-black text-right">{rupees(days61to90)}</div>
            <div className="p-2 border-r border-black text-right">{rupees(days90plus)}</div>
            <div className="p-2 text-right font-semibold">{rupees(amountDue)}</div>
          </div>
        </div>

        <div className="mt-4 text-[10px] text-muted-foreground text-center">
          Generated on {now.toLocaleString("en-IN")} | Total Invoices: {summary.invoices.length} | Total Payments: {summary.payments.length}
        </div>
      </div>
    );
  };

  const openEdit = (row: PaymentRecord) => {
    setEditing(row);
    setFormData({
      date: row.date,
      direction: row.direction,
      partyType: row.partyType,
      partyId: row.partyId || "",
      partyName: row.partyName || "",
      invoiceId: row.invoiceId || "",
      amount: (row.amount ?? 0).toString(),
      method: row.method === "Bank" ? "Bank Transfer" : row.method,
      reference: row.reference,
      bankAccountId: row.bankAccountId || "",
      bankTransferCharge: (row.bankTransferCharge ?? 0).toString(),
      notes: row.notes || "",
      status: row.status,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    if (!confirm("Delete this payment?")) return;

    const existing = payments.find((p) => p.id === id);

    try {
      if (existing?.acctAccountingTxId) {
        await deleteDoc(doc(db, "accountingTransactions", existing.acctAccountingTxId));
      }
      if (existing?.acctBankChargeTxId) {
        await deleteDoc(doc(db, "accountingTransactions", existing.acctBankChargeTxId));
      }
      await deleteDoc(doc(db, "payments", id));
      setPayments((prev) => prev.filter((payment) => payment.id !== id));
      toast({ title: "Deleted", description: "Payment removed." });
    } catch (error) {
      console.error("Error deleting payment", error);
      toast({
        title: "Delete failed",
        description: "Could not delete payment.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    const amount = safeNumber(formData.amount);
    if (amount <= 0) {
      toast({ title: "Validation error", description: "Amount must be greater than zero.", variant: "destructive" });
      return;
    }

    // Validate amount doesn't exceed invoice remaining balance
    if (formData.invoiceId) {
      if (formData.invoiceId === "OPENING_BALANCE") {
        // Validate opening balance settlement
        const party = (formData.partyType === "customer" ? customers : suppliers).find(p => p.id === formData.partyId);
        const opening = Number(party?.opening) || 0;
        const maxAmount = Math.abs(opening);
        if (amount > maxAmount) {
          toast({ 
            title: "Validation error", 
            description: `Payment amount (${rupees(amount)}) exceeds the opening balance (${rupees(maxAmount)}).`, 
            variant: "destructive" 
          });
          return;
        }
      } else {
        const inv = invoices.find((x) => x.id === formData.invoiceId);
        if (inv) {
          const remainingAmount = calculateInvoiceRemaining(inv, formData.partyId, formData.partyType);
          if (amount > remainingAmount) {
            toast({ 
              title: "Validation error", 
              description: `Payment amount (${rupees(amount)}) exceeds the remaining balance (${rupees(remainingAmount)}) for this invoice.`, 
              variant: "destructive" 
            });
            return;
          }
        }
      }
    }

    const isBankTransfer = formData.method === "Bank" || formData.method === "Bank Transfer";
    if (isBankTransfer && !formData.bankAccountId) {
      toast({ title: "Validation error", description: "Select a bank account for bank transfer.", variant: "destructive" });
      return;
    }

    if (formData.partyType !== "other" && !formData.partyId) {
      toast({ title: "Validation error", description: "Select a party.", variant: "destructive" });
      return;
    }

    if (formData.partyType === "other" && !formData.partyName.trim()) {
      toast({ title: "Validation error", description: "Party name is required.", variant: "destructive" });
      return;
    }

    const resolvedDirection: PaymentDirection =
      formData.partyType === "supplier" ? "Out" : "In";

    const selectedInvoice = (formData.invoiceId && formData.invoiceId !== "OPENING_BALANCE") 
      ? invoices.find((x) => x.id === formData.invoiceId) 
      : undefined;
    const selectedBank = formData.bankAccountId ? bankAccounts.find((b) => b.id === formData.bankAccountId) : undefined;
    const selectedCash = formData.method === "Cash" && cashAccounts.length > 0 ? cashAccounts[0] : undefined;

    const bankTransferCharge = safeNumber(formData.bankTransferCharge);

    const payload = {
      date: formData.date,
      direction: resolvedDirection,
      partyType: formData.partyType,
      partyId: formData.partyType === "other" ? "" : formData.partyId,
      partyName: selectedParty?.name || "",
      invoiceId: selectedInvoice?.id || "",
      invoiceNo: selectedInvoice ? (selectedInvoice.manualInvoiceNo || selectedInvoice.invoiceNo || "") : (formData.invoiceId === "OPENING_BALANCE" ? "Opening Balance" : ""),
      amount,
      method: (formData.method === "Bank" ? "Bank Transfer" : formData.method) as PaymentMethod,
      reference: formData.reference.trim(),
      bankAccountId: selectedBank?.id || "",
      bankAccountName: selectedBank?.accountName || "",
      cashAccountId: selectedCash?.id || "",
      cashAccountName: selectedCash?.accountName || "",
      bankTransferCharge: isBankTransfer ? bankTransferCharge : 0,
      notes: formData.notes.trim(),
      status: formData.status,
      updatedAt: Timestamp.now(),
    };

    const needsBankTx =
      payload.status === "Completed" &&
      (payload.method === "Bank" || payload.method === "Bank Transfer") &&
      !!payload.bankAccountId;

    const needsCashTx =
      payload.status === "Completed" &&
      payload.method === "Cash" &&
      !!payload.cashAccountId;

    const needsBankChargeTx = needsBankTx && (payload.bankTransferCharge || 0) > 0;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const now = Timestamp.now();

      if (editing) {
        const paymentRef = doc(db, "payments", editing.id);

        let nextAcctAccountingTxId = editing.acctAccountingTxId || "";
        let nextAcctBankChargeTxId = editing.acctBankChargeTxId || "";

        if (needsBankTx) {
          // Handle accountingTransactions collection entry
          if (!nextAcctAccountingTxId) {
            const acctTxRef = doc(collection(db, "accountingTransactions"));
            nextAcctAccountingTxId = acctTxRef.id;
            batch.set(acctTxRef, {
              date: payload.date,
              description: `Payment ${payload.direction === "In" ? "Received" : "Paid"} - ${payload.partyName || ""}`,
              type: payload.direction === "In" ? "Deposit" : "Withdrawal",
              amount: payload.amount,
              accountId: payload.bankAccountId,
              accountName: payload.bankAccountName,
              reference: payload.reference || "",
              status: "Completed",
              category: "Payments",
              paymentMethod: payload.method,
              createdAt: now,
            });
          } else {
            batch.update(doc(db, "accountingTransactions", nextAcctAccountingTxId), {
              date: payload.date,
              description: `Payment ${payload.direction === "In" ? "Received" : "Paid"} - ${payload.partyName || ""}`,
              type: payload.direction === "In" ? "Deposit" : "Withdrawal",
              amount: payload.amount,
              accountId: payload.bankAccountId,
              accountName: payload.bankAccountName,
              reference: payload.reference || "",
              status: "Completed",
              category: "Payments",
              paymentMethod: payload.method,
            });
          }
        } else if (nextAcctAccountingTxId) {
          batch.delete(doc(db, "accountingTransactions", nextAcctAccountingTxId));
          nextAcctAccountingTxId = "";
        }

        if (needsCashTx) {
          // Handle accountingTransactions collection entry for cash book tracking
          if (!nextAcctAccountingTxId) {
            const acctCashTxRef = doc(collection(db, "accountingTransactions"));
            nextAcctAccountingTxId = acctCashTxRef.id;
            batch.set(acctCashTxRef, {
              date: payload.date,
              description: `Payment ${payload.direction === "In" ? "Received" : "Paid"} - ${payload.partyName || ""}`,
              type: payload.direction === "In" ? "Deposit" : "Withdrawal",
              amount: payload.amount,
              accountId: payload.cashAccountId,
              accountName: payload.cashAccountName,
              reference: payload.reference || "",
              status: "Completed",
              category: "Payments",
              paymentMethod: "Cash",
              createdAt: now,
            });
          } else {
            batch.update(doc(db, "accountingTransactions", nextAcctAccountingTxId), {
              date: payload.date,
              description: `Payment ${payload.direction === "In" ? "Received" : "Paid"} - ${payload.partyName || ""}`,
              type: payload.direction === "In" ? "Deposit" : "Withdrawal",
              amount: payload.amount,
              accountId: payload.cashAccountId,
              accountName: payload.cashAccountName,
              reference: payload.reference || "",
              status: "Completed",
              category: "Payments",
              paymentMethod: "Cash",
            });
          }
        } else if (!needsBankTx && nextAcctAccountingTxId) {
          batch.delete(doc(db, "accountingTransactions", nextAcctAccountingTxId));
          nextAcctAccountingTxId = "";
        }

        if (needsBankChargeTx) {
          // Handle accountingTransactions collection entry for bank charges
          if (!nextAcctBankChargeTxId) {
            const acctChargeRef = doc(collection(db, "accountingTransactions"));
            nextAcctBankChargeTxId = acctChargeRef.id;
            batch.set(acctChargeRef, {
              date: payload.date,
              description: `Bank charges - ${payload.partyName || ""}`,
              type: "Withdrawal",
              amount: payload.bankTransferCharge || 0,
              accountId: payload.bankAccountId,
              accountName: payload.bankAccountName,
              reference: payload.reference || "",
              status: "Completed",
              category: "Bank Charges",
              paymentMethod: payload.method,
              createdAt: now,
            });
          } else {
            batch.update(doc(db, "accountingTransactions", nextAcctBankChargeTxId), {
              date: payload.date,
              description: `Bank charges - ${payload.partyName || ""}`,
              type: "Withdrawal",
              amount: payload.bankTransferCharge || 0,
              accountId: payload.bankAccountId,
              accountName: payload.bankAccountName,
              reference: payload.reference || "",
              status: "Completed",
              category: "Bank Charges",
              paymentMethod: payload.method,
            });
          }
        } else if (nextAcctBankChargeTxId) {
          batch.delete(doc(db, "accountingTransactions", nextAcctBankChargeTxId));
          nextAcctBankChargeTxId = "";
        }

        batch.update(paymentRef, {
          ...payload,
          acctAccountingTxId: nextAcctAccountingTxId,
          acctBankChargeTxId: nextAcctBankChargeTxId,
        });

        await batch.commit();
        setPayments((prev) =>
          prev.map((payment) =>
            payment.id === editing.id
              ? {
                  ...payment,
                  ...payload,
                  acctAccountingTxId: nextAcctAccountingTxId || undefined,
                  acctBankChargeTxId: nextAcctBankChargeTxId || undefined,
                }
              : payment,
          ),
        );
        toast({ title: "Updated", description: "Payment updated." });
      } else {
        const paymentRef = doc(collection(db, "payments"));
        let acctAccountingTxId = "";
        let acctBankChargeTxId = "";

        if (needsBankTx) {
          // Create entry in accountingTransactions for bank book tracking
          const acctTxRef = doc(collection(db, "accountingTransactions"));
          acctAccountingTxId = acctTxRef.id;
          batch.set(acctTxRef, {
            date: payload.date,
            description: `Payment ${payload.direction === "In" ? "Received" : "Paid"} - ${payload.partyName || ""}`,
            type: payload.direction === "In" ? "Deposit" : "Withdrawal",
            amount: payload.amount,
            accountId: payload.bankAccountId,
            accountName: payload.bankAccountName,
            reference: payload.reference || "",
            status: "Completed",
            category: "Payments",
            paymentMethod: payload.method,
            createdAt: now,
          });
        }

        if (needsCashTx) {
          // Create entry in accountingTransactions for cash book tracking
          const acctCashTxRef = doc(collection(db, "accountingTransactions"));
          acctAccountingTxId = acctCashTxRef.id;
          batch.set(acctCashTxRef, {
            date: payload.date,
            description: `Payment ${payload.direction === "In" ? "Received" : "Paid"} - ${payload.partyName || ""}`,
            type: payload.direction === "In" ? "Deposit" : "Withdrawal",
            amount: payload.amount,
            accountId: payload.cashAccountId,
            accountName: payload.cashAccountName,
            reference: payload.reference || "",
            status: "Completed",
            category: "Payments",
            paymentMethod: "Cash",
            createdAt: now,
          });
        }

        if (needsBankChargeTx) {
          // Create entry in accountingTransactions for bank book tracking
          const acctChargeRef = doc(collection(db, "accountingTransactions"));
          acctBankChargeTxId = acctChargeRef.id;
          batch.set(acctChargeRef, {
            date: payload.date,
            description: `Bank charges - ${payload.partyName || ""}`,
            type: "Withdrawal",
            amount: payload.bankTransferCharge || 0,
            accountId: payload.bankAccountId,
            accountName: payload.bankAccountName,
            reference: payload.reference || "",
            status: "Completed",
            category: "Bank Charges",
            paymentMethod: payload.method,
            createdAt: now,
          });
        }

        batch.set(paymentRef, {
          ...payload,
          acctAccountingTxId,
          acctBankChargeTxId,
          createdAt: now,
        });

        await batch.commit();
        setPayments((prev) => [
          {
            id: paymentRef.id,
            ...payload,
            acctAccountingTxId: acctAccountingTxId || undefined,
            acctBankChargeTxId: acctBankChargeTxId || undefined,
            createdAt: new Date(),
          },
          ...prev,
        ]);
        toast({ title: "Saved", description: "Payment saved to Firestore." });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving payment", error);
      toast({
        title: "Save failed",
        description: "Could not save payment.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { overflow: hidden !important; }
          * { scrollbar-width: none; }
          *::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
        }
      `}</style>

      <div className="print-only">
        {printParty ? renderPartyStatement(printParty) : null}
      </div>

      <div className="no-print">
        <AppHeader title="Payments" subtitle="Track payments received and paid" />

        <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total outstanding"
            value={money(topStats.totalOutstanding)}
            change={activePartyType === "customer" ? "To receive" : "To pay"}
            changeType="neutral"
            icon={Wallet}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
          <StatCard
            title="Overdue amount"
            value={money(topStats.overdueAmount)}
            change="Past due"
            changeType="negative"
            icon={Clock}
            iconBgColor="bg-destructive/20"
            iconColor="text-destructive"
          />
          <StatCard
            title="Active parties"
            value={topStats.activeCount}
            change={activePartyType === "customer" ? "Customers" : "Suppliers"}
            changeType="neutral"
            icon={Users}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={activePartyType === "customer" ? "default" : "outline"}
                onClick={() => {
                  setActivePartyType("customer");
                  setOpenPartyId(null);
                }}
              >
                Customers
              </Button>
              <Button
                type="button"
                variant={activePartyType === "supplier" ? "default" : "outline"}
                onClick={() => {
                  if (activePartyType === "supplier") {
                    navigate("/purchases");
                  } else {
                    setActivePartyType("supplier");
                    setOpenPartyId(null);
                  }
                }}
              >
                Suppliers
              </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                  placeholder={activePartyType === "customer" ? "Search customers..." : "Search suppliers..."}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={() => setFiltersOpen((v) => !v)}>
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
                <Button variant="outline" className="gap-2" onClick={fetchAll} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {filtersOpen ? (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={filterOverdueOnly ? "default" : "outline"} onClick={() => setFilterOverdueOnly((v) => !v)}>
                Overdue only
              </Button>
              <Button type="button" variant={filterOutstandingOnly ? "default" : "outline"} onClick={() => setFilterOutstandingOnly((v) => !v)}>
                Outstanding only
              </Button>
              {(filterOverdueOnly || filterOutstandingOnly) ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFilterOverdueOnly(false);
                    setFilterOutstandingOnly(false);
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {visiblePartySummaries.map((p) => {
            const isOpen = openPartyId === p.id;
            const settledLabel = activePartyType === "customer" ? "Received" : "Paid";
            const dueLabel = activePartyType === "customer" ? "To Receive" : "To Pay";
            const invoiceRows = isOpen ? buildPartyInvoiceHistoryRows(p) : [];

            const accentClass =
              p.overdueOutstanding > 0
                ? "border-l-[hsl(var(--destructive))]"
                : p.balance > 0
                  ? "border-l-[hsl(var(--warning))]"
                  : p.balance < 0
                    ? "border-l-[hsl(var(--success))]"
                    : "border-l-transparent";

            const isActive =
              p.opening !== 0 || p.totalInvoiced > 0 || p.displaySettled > 0 || p.creditAdjustments > 0 || p.debitAdjustments > 0;

            const shortCode = partyShortCode(p.name);

            return (
              <div key={p.id} className={`px-4 py-4 border-l-4 ${accentClass}`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleParty(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleParty(p.id);
                    }
                  }}
                  className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between cursor-pointer select-none rounded-lg -mx-2 px-2 py-1 hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-1 h-8 w-8 rounded-lg border bg-background flex items-center justify-center shrink-0">
                      <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-extrabold tracking-wide uppercase truncate">{p.name}</div>
                        {shortCode ? (
                          <span className="text-xs font-semibold text-muted-foreground">{shortCode}</span>
                        ) : null}
                        {isActive ? (
                          <span className="rounded-full bg-info/20 text-info text-[11px] px-2 py-0.5 font-semibold">
                            ACTIVE
                          </span>
                        ) : null}
                        {p.overdueOutstanding > 0 ? (
                          <span className="rounded-full bg-destructive/10 text-destructive text-[11px] px-2 py-0.5 font-semibold">
                            OVERDUE
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                        {p.opening !== 0 ? (
                          <div className="text-muted-foreground">
                            Opening Balance: <span className="text-foreground font-medium">{money(p.opening)}</span>
                          </div>
                        ) : null}
                        <div className="text-muted-foreground">
                          Total Invoiced: <span className="text-foreground font-medium">{money(p.totalInvoiced)}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {settledLabel}: <span className="font-medium text-success">{money(p.displaySettled)}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Returns/Adjustments: <span className="font-medium text-info">{money(p.creditAdjustments)}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {dueLabel}: <span className={`font-semibold ${p.balance < 0 ? 'text-success' : 'text-warning'}`}>{money(p.balance)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        flushSync(() => setPrintParty(p));
                        window.print();
                      }}
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddForParty(activePartyType, p.id, p.name);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add Payment
                    </Button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-4 rounded-md border overflow-x-auto bg-background" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/20">
                      <div className="text-sm font-medium">Transaction History</div>
                      <div className="text-xs text-muted-foreground">Balance: {money(p.balance)}</div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Date</TableHead>
                          <TableHead className="w-[160px]">Type</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                          <TableHead className="w-[180px]">Invoice Number</TableHead>
                          <TableHead className="w-[170px] text-right">Amount Paid Till Now</TableHead>
                          <TableHead className="w-[170px] text-right">Amount Remaining</TableHead>
                          <TableHead className="w-[140px] text-right">Total Amount</TableHead>
                          <TableHead className="w-[140px]">Status</TableHead>
                          <TableHead className="w-[160px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-muted-foreground">
                              No transactions found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          invoiceRows.map((r) => {
                            if (r.rowType === "opening") {
                              return (
                                <TableRow key={r.invoiceId}>
                                  <TableCell>{r.date || "—"}</TableCell>
                                  <TableCell>{r.type}</TableCell>
                                  <TableCell></TableCell>
                                  <TableCell className="font-medium">{r.invoiceNo || "—"}</TableCell>
                                  <TableCell className="text-right font-medium text-success">{money(r.amountPaid)}</TableCell>
                                  <TableCell className="text-right font-medium text-warning">{money(r.amountRemaining)}</TableCell>
                                  <TableCell className="text-right font-medium">{money(r.totalAmount)}</TableCell>
                                  <TableCell>
                                    <span
                                      className={
                                        r.status === "Paid"
                                          ? "rounded-full bg-success/20 text-success text-[11px] px-2 py-0.5 font-semibold"
                                          : "rounded-full bg-secondary text-secondary-foreground text-[11px] px-2 py-0.5 font-semibold"
                                      }
                                    >
                                      {r.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                                </TableRow>
                              );
                            }

                            const isInvoiceExpanded = expandedInvoiceIds.has(r.invoiceId);

                            // Get payments for this invoice
                            const norm = (v: unknown) => (v ?? "").toString().trim().toLowerCase();
                            const inv = p.invoices.find(i => i.id === r.invoiceId);
                            const systemInvoiceNo = inv?.invoiceNo || "";
                            const manualInvoiceNo = inv?.manualInvoiceNo;

                            const settledDirection: PaymentDirection = activePartyType === "customer" ? "In" : "Out";
                            const invoicePayments = p.payments
                              .filter((payment) => {
                                if (payment.direction !== settledDirection) return false;
                                if (payment.status !== "Completed") return false;

                                // Match by invoice ID or reference
                                if (payment.invoiceId && payment.invoiceId === r.invoiceId) return true;
                                const ref = norm(payment.reference);
                                if (!ref) return false;
                                const sys = norm(systemInvoiceNo);
                                const man = norm(manualInvoiceNo);
                                return (sys && ref.includes(sys)) || (man && ref.includes(man));
                              })
                              .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

                            // Calculate cumulative amounts
                            let cumulative = 0;
                            const paymentsWithCumulative = invoicePayments.map((payment) => {
                              cumulative += payment.amount || 0;
                              return { ...payment, cumulative };
                            });

                            return (
                              <>
                                <TableRow key={r.invoiceId}>
                                  <TableCell>{r.date || "—"}</TableCell>
                                  <TableCell>{r.type}</TableCell>
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedInvoiceIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(r.invoiceId)) {
                                            next.delete(r.invoiceId);
                                          } else {
                                            next.add(r.invoiceId);
                                          }
                                          return next;
                                        });
                                      }}
                                    >
                                      {isInvoiceExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TableCell>
                                  <TableCell className="font-medium">{r.invoiceNo || "—"}</TableCell>
                                  <TableCell className="text-right font-medium text-success">{money(r.amountPaid)}</TableCell>
                                  <TableCell className="text-right font-medium text-warning">{money(r.amountRemaining)}</TableCell>
                                  <TableCell className="text-right font-medium">{money(r.totalAmount)}</TableCell>
                                  <TableCell>
                                    <span
                                      className={
                                        r.status === "Paid"
                                          ? "rounded-full bg-success/20 text-success text-[11px] px-2 py-0.5 font-semibold"
                                          : r.status === "Partially Paid"
                                            ? "rounded-full bg-warning/20 text-warning text-[11px] px-2 py-0.5 font-semibold"
                                            : "rounded-full bg-secondary text-secondary-foreground text-[11px] px-2 py-0.5 font-semibold"
                                      }
                                    >
                                      {r.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const url = new URL(`/invoices/${r.invoiceId}/print`, window.location.origin).toString();
                                          const w = window.open(url, "_blank", "noopener,noreferrer");
                                          if (!w) {
                                            toast({
                                              title: "Popup blocked",
                                              description: "Please allow popups to print the invoice.",
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                      >
                                        Print
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>

                                {isInvoiceExpanded && (
                                  <TableRow>
                                    <TableCell colSpan={10} className="bg-muted/30 p-0">
                                      <div className="p-4">
                                        <div className="text-sm font-semibold mb-3">
                                          Payment & Adjustment Details for {r.invoiceNo}
                                        </div>
                                        <div className="rounded-md border bg-background">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="w-[50px]">#</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Method</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                                <TableHead className="text-right">Transfer Charge</TableHead>
                                                <TableHead className="text-right">Cumulative</TableHead>
                                                <TableHead>Notes</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Print</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {paymentsWithCumulative.length === 0 ? (
                                                <TableRow>
                                                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                                                    No payments found for this invoice.
                                                  </TableCell>
                                                </TableRow>
                                              ) : (
                                                paymentsWithCumulative.map((payment, idx) => (
                                                  <TableRow key={payment.id}>
                                                    <TableCell>{idx + 1}</TableCell>
                                                    <TableCell>{payment.date}</TableCell>
                                                    <TableCell>{payment.method}</TableCell>
                                                    <TableCell>{payment.reference || "—"}</TableCell>
                                                    <TableCell className="text-right font-medium">
                                                      {money(payment.amount || 0)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                      {payment.bankTransferCharge && payment.bankTransferCharge > 0
                                                        ? money(payment.bankTransferCharge)
                                                        : "—"}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-success">
                                                      {money(payment.cumulative)}
                                                    </TableCell>
                                                    <TableCell>{payment.notes || "—"}</TableCell>
                                                    <TableCell>
                                                      <span
                                                        className={
                                                          payment.status === "Completed"
                                                            ? "rounded-full bg-success/20 text-success text-[11px] px-2 py-0.5 font-semibold"
                                                            : payment.status === "Pending"
                                                              ? "rounded-full bg-warning/20 text-warning text-[11px] px-2 py-0.5 font-semibold"
                                                              : "rounded-full bg-destructive/20 text-destructive text-[11px] px-2 py-0.5 font-semibold"
                                                        }
                                                      >
                                                        {payment.status}
                                                      </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          flushSync(() => setPrintPayment(payment));
                                                          window.print();
                                                        }}
                                                      >
                                                        Print
                                                      </Button>
                                                    </TableCell>
                                                  </TableRow>
                                                ))
                                              )}
                                              {paymentsWithCumulative.length > 0 && (
                                                <TableRow className="bg-muted/20 font-semibold">
                                                  <TableCell colSpan={4} className="text-right">
                                                    Total: {paymentsWithCumulative.length} payment{paymentsWithCumulative.length !== 1 ? 's' : ''}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    Total Received: {money(cumulative)}
                                                  </TableCell>
                                                  <TableCell colSpan={5}></TableCell>
                                                </TableRow>
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            );
            })}

            {visiblePartySummaries.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No parties found.</div>
            ) : null}
          </div>
        </div>
      </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Payment" : "Add Payment"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Invoice</Label>
              <Select
                value={formData.invoiceId || undefined}
                onValueChange={(v) => {
                  setFormData((s) => ({
                    ...s,
                    invoiceId: v,
                    reference:
                      v
                        ? (() => {
                            if (v === "OPENING_BALANCE") {
                              return "Opening Balance Settlement";
                            }
                            const inv = invoices.find((x) => x.id === v);
                            return (inv?.manualInvoiceNo || inv?.invoiceNo || s.reference).toString();
                          })()
                        : s.reference,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {/* Opening Balance Settlement Option */}
                  {(() => {
                    const party = (formData.partyType === "customer" ? customers : suppliers).find(p => p.id === formData.partyId);
                    const opening = Number(party?.opening) || 0;
                    if (opening !== 0) {
                      const openingAmount = Math.abs(opening);
                      return (
                        <SelectItem key="OPENING_BALANCE" value="OPENING_BALANCE">
                          Opening Balance Settlement — Amount: {money(openingAmount)}
                        </SelectItem>
                      );
                    }
                    return null;
                  })()}
                  
                  {invoices
                    .filter((inv) => inv.partyType === formData.partyType && inv.partyId === formData.partyId)
                    .map((inv) => {
                      const systemInvoiceNo = inv.invoiceNo;
                      const manualInvoiceNo = inv.manualInvoiceNo;
                      const displayLabel = manualInvoiceNo 
                        ? `${systemInvoiceNo} (${manualInvoiceNo})`
                        : systemInvoiceNo;
                      
                      // Calculate notes adjustments
                      const norm = (v: unknown) => (v ?? "").toString().trim().toLowerCase();
                      const relatedNotes = notes.filter((n) => {
                        const invNo = norm(n.relatedInvoiceNo);
                        const sys = norm(systemInvoiceNo);
                        const man = norm(manualInvoiceNo);
                        return (sys && invNo === sys) || (man && invNo === man);
                      });
                      
                      const debitAdjust = relatedNotes.filter((n) => n.noteType === "Debit").reduce((sum, n) => sum + (n.amount || 0), 0);
                      const creditAdjust = relatedNotes.filter((n) => n.noteType === "Credit").reduce((sum, n) => sum + (n.amount || 0), 0);
                      
                      const baseTotal = inv.total || 0;
                      const adjustedTotal = Math.max(0, baseTotal + debitAdjust - creditAdjust);
                      
                      const remainingAmount = calculateInvoiceRemaining(inv, formData.partyId, formData.partyType);
                      
                      return (
                        <SelectItem key={inv.id} value={inv.id}>
                          {displayLabel} — Total: {money(adjustedTotal)} | Remaining: {money(remainingAmount)}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">
                  {formData.partyType === "supplier" || formData.direction === "Out" ? "Paid Amount *" : "Received Amount *"}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    
                    // Calculate remaining amount if invoice is selected
                    if (formData.invoiceId) {
                      if (formData.invoiceId === "OPENING_BALANCE") {
                        // Handle opening balance settlement
                        const party = (formData.partyType === "customer" ? customers : suppliers).find(p => p.id === formData.partyId);
                        const opening = Number(party?.opening) || 0;
                        const maxAmount = Math.abs(opening);
                        
                        const inputNum = parseFloat(inputValue) || 0;
                        if (inputNum > maxAmount) {
                          setFormData((s) => ({ ...s, amount: maxAmount.toString() }));
                          toast({
                            title: "Amount limited",
                            description: `Maximum amount you can enter is ${rupees(maxAmount)} (opening balance).`,
                            variant: "default",
                          });
                          return;
                        }
                      } else {
                        const inv = invoices.find((x) => x.id === formData.invoiceId);
                        if (inv) {
                          const remainingAmount = calculateInvoiceRemaining(inv, formData.partyId, formData.partyType);
                          
                          // Limit input to remaining amount
                          const inputNum = parseFloat(inputValue) || 0;
                          if (inputNum > remainingAmount) {
                            setFormData((s) => ({ ...s, amount: remainingAmount.toString() }));
                            toast({
                              title: "Amount limited",
                              description: `Maximum amount you can enter is ${rupees(remainingAmount)} (remaining balance for this invoice).`,
                              variant: "default",
                            });
                            return;
                          }
                        }
                      }
                    }
                    
                    setFormData((s) => ({ ...s, amount: inputValue }));
                  }}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Payment Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((s) => ({ ...s, date: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select
                  value={formData.method}
                  onValueChange={(v) => {
                    const next = v as PaymentMethod;
                    setFormData((s) => ({
                      ...s,
                      method: next,
                      bankAccountId: next === "Bank" || next === "Bank Transfer" ? s.bankAccountId : "",
                      bankTransferCharge: next === "Bank" || next === "Bank Transfer" ? s.bankTransferCharge : "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference">Payment Reference</Label>
                <Input
                  id="reference"
                  value={formData.reference}
                  onChange={(e) => setFormData((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="Cheque number, transaction ID, etc."
                />
              </div>

              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Select
                  value={formData.bankAccountId}
                  onValueChange={(v) => setFormData((s) => ({ ...s, bankAccountId: v }))}
                  disabled={!(formData.method === "Bank" || formData.method === "Bank Transfer")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.accountName}{b.accountNumber ? ` (•••• ${b.accountNumber.replace(/\s+/g, "").slice(-4)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankTransferCharge">Bank Transfer Charge</Label>
                <Input
                  id="bankTransferCharge"
                  type="number"
                  inputMode="decimal"
                  value={formData.bankTransferCharge}
                  onChange={(e) => setFormData((s) => ({ ...s, bankTransferCharge: e.target.value }))}
                  placeholder="0.00"
                  disabled={!(formData.method === "Bank" || formData.method === "Bank Transfer")}
                />
                <div className="text-xs text-muted-foreground">
                  Transfer charges are tracked but not included in balance calculations.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData((s) => ({ ...s, notes: e.target.value }))} placeholder="Optional notes" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editing ? "Update Payment" : "Save Payment"}
              </Button>
            </DialogFooter>
          </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
