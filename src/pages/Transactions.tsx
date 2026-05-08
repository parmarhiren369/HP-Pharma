import { useEffect, useMemo, useState } from "react";
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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { 
  BookOpen, 
  Calendar,
  DollarSign,
  Pencil, 
  Plus, 
  RefreshCw, 
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet
} from "lucide-react";

type TransactionType = "Deposit" | "Withdrawal";
type TransactionStatus = "Completed" | "Pending" | "Failed";
type PaymentMethod = "Cash" | "Bank" | "UPI" | "Card" | "Cheque" | "MPESA";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber?: string;
  opening: number;
}

interface CashAccount {
  id: string;
  accountName: string;
  opening: number;
}

interface TransactionRecord {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  category: string;
  paymentMethod: PaymentMethod;
  transferCharge: number;
  accountType: "bank" | "cash";
  accountId: string;
  accountName?: string;
  reference?: string;
  notes?: string;
  status: TransactionStatus;
  createdAt?: Date;
}

const defaultFormState = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  type: "Deposit" as TransactionType,
  amount: "",
  category: "General",
  paymentMethod: "Cash" as PaymentMethod,
  transferCharge: "",
  accountType: "cash" as "bank" | "cash",
  accountId: "",
  reference: "",
  notes: "",
  status: "Completed" as TransactionStatus,
};

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Transactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);

  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRecord | null>(null);
  const [formData, setFormData] = useState(defaultFormState);

  const { toast } = useToast();

  const filtered = useMemo(() => {
    // Add opening balance entries for each account
    const openingBalanceEntries: TransactionRecord[] = [];
    
    // Add bank account opening balances - show for ALL accounts to ensure visibility
    bankAccounts.forEach((b) => {
      const openingAmount = typeof b.opening === 'number' ? b.opening : 0;
      openingBalanceEntries.push({
        id: `opening-bank-${b.id}`,
        date: "2020-01-01", // Use an early date for opening balances
        description: `Opening Balance - ${b.accountName}`,
        type: openingAmount >= 0 ? "Deposit" : "Withdrawal",
        amount: Math.abs(openingAmount),
        category: "Opening Balance",
        paymentMethod: "Bank" as PaymentMethod,
        transferCharge: 0,
        accountType: "bank",
        accountId: b.id,
        accountName: b.accountName,
        status: "Completed" as TransactionStatus,
        createdAt: new Date("2020-01-01"),
      });
    });
    
    // Add cash account opening balances - show for ALL accounts to ensure visibility
    cashAccounts.forEach((c) => {
      const openingAmount = typeof c.opening === 'number' ? c.opening : 0;
      openingBalanceEntries.push({
        id: `opening-cash-${c.id}`,
        date: "2020-01-01",
        description: `Opening Balance - ${c.accountName}`,
        type: openingAmount >= 0 ? "Deposit" : "Withdrawal",
        amount: Math.abs(openingAmount),
        category: "Opening Balance",
        paymentMethod: "Cash" as PaymentMethod,
        transferCharge: 0,
        accountType: "cash",
        accountId: c.id,
        accountName: c.accountName,
        status: "Completed" as TransactionStatus,
        createdAt: new Date("2020-01-01"),
      });
    });
    
    // Combine opening balances with transactions
    const allTransactions = [...openingBalanceEntries, ...transactions];
    
    if (!search.trim()) return allTransactions;
    const q = search.toLowerCase();
    return allTransactions.filter((t) =>
      `${t.description} ${t.category} ${t.reference ?? ""} ${t.accountName ?? ""}`.toLowerCase().includes(q)
    );
  }, [transactions, search, bankAccounts, cashAccounts]);

  const stats = useMemo(() => {
    const deposits = transactions
      .filter((t) => t.type === "Deposit" && t.status === "Completed")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const withdrawals = transactions
      .filter((t) => t.type === "Withdrawal" && t.status === "Completed")
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // Calculate actual balance for each bank account (opening + transactions)
    const totalBankBalance = bankAccounts.reduce((sum, b) => {
      const accountTxs = transactions.filter(t => t.accountId === b.id && t.status === "Completed");
      const accountDeposits = accountTxs.filter(t => t.type === "Deposit").reduce((s, t) => s + t.amount, 0);
      const accountWithdrawals = accountTxs.filter(t => t.type === "Withdrawal").reduce((s, t) => s + t.amount, 0);
      const accountBalance = (b.opening || 0) + accountDeposits - accountWithdrawals;
      return sum + accountBalance;
    }, 0);

    // Calculate actual balance for each cash account (opening + transactions)
    const totalCashBalance = cashAccounts.reduce((sum, c) => {
      const accountTxs = transactions.filter(t => t.accountId === c.id && t.status === "Completed");
      const accountDeposits = accountTxs.filter(t => t.type === "Deposit").reduce((s, t) => s + t.amount, 0);
      const accountWithdrawals = accountTxs.filter(t => t.type === "Withdrawal").reduce((s, t) => s + t.amount, 0);
      const accountBalance = (c.opening || 0) + accountDeposits - accountWithdrawals;
      return sum + accountBalance;
    }, 0);
    return {
      total: transactions.length,
      deposits,
      withdrawals,
      netBalance: deposits - withdrawals,
      totalBankBalance,
      totalCashBalance,
      bankAccountsCount: bankAccounts.length,
      cashAccountsCount: cashAccounts.length,
    };
  }, [transactions, bankAccounts, cashAccounts]);

  const money = (n: number): string => {
    const value = Number.isFinite(n) ? n : 0;
    return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fetchBankAccounts = async () => {
    const qy = query(collection(db, "bankAccounts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        accountName: (data.accountName || data.name || "").toString(),
        accountNumber: (data.accountNumber || "").toString() || undefined,
        opening: typeof data.opening === "number" ? data.opening : parseFloat(data.opening) || 0,
      } as BankAccount;
    });
    // Filter out ABC BANK, test banks, and CASH accounts
    const filteredList = list.filter((b) => {
      const name = (b.accountName || "").toUpperCase().trim();
      return name && name !== "ABC BANK" && name !== "ABC" && name !== "TEST BANK" && name !== "TEST" && name !== "CASH" && !name.includes("CASH");
    });
    console.log("Bank accounts loaded:", filteredList);
    setBankAccounts(filteredList);
  };

  const fetchCashAccounts = async () => {
    const qy = query(collection(db, "cashAccounts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        accountName: (data.accountName || data.name || "Cash").toString(),
        opening: typeof data.opening === "number" ? data.opening : parseFloat(data.opening) || 0,
      } as CashAccount;
    });
    
    // If no cash accounts exist, create a default one in database
    if (list.length === 0 && db) {
      try {
        const defaultCashRef = await addDoc(collection(db, "cashAccounts"), {
          accountName: "Cash",
          opening: 0,
          createdAt: Timestamp.now(),
        });
        list.push({
          id: defaultCashRef.id,
          accountName: "Cash",
          opening: 0,
        });
        toast({
          title: "Cash Account Created",
          description: "Default cash account has been created.",
        });
      } catch (error) {
        console.error("Error creating default cash account", error);
      }
    }
    setCashAccounts(list);
  };

  const fetchTransactions = async () => {
    const accountingSnap = await getDocs(query(collection(db, "accountingTransactions"), orderBy("createdAt", "desc")));

    const accountingList = accountingSnap.docs.map((d) => {
      const data = d.data();
      const accountName = (data.accountName || "").toString();
      const accountType = accountName.toUpperCase().includes("CASH") ? "cash" : "bank";
      return {
        id: d.id,
        date: (data.date || "").toString(),
        description: (data.description || "").toString(),
        type: (data.type || "Deposit") as TransactionType,
        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
        category: (data.category || "General").toString(),
        paymentMethod: (data.paymentMethod || "Cash") as PaymentMethod,
        transferCharge: typeof data.transferCharge === "number" ? data.transferCharge : parseFloat(data.transferCharge) || 0,
        accountType,
        accountId: (data.accountId || "").toString(),
        accountName: accountName || undefined,
        reference: (data.reference || "").toString() || undefined,
        notes: (data.notes || "").toString() || undefined,
        status: (data.status || "Completed") as TransactionStatus,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as TransactionRecord;
    });

    setTransactions(accountingList);
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
      console.log("Starting fetchAll...");
      // Fetch accounts first
      await fetchBankAccounts();
      await fetchCashAccounts();
      // Then fetch transactions
      await fetchTransactions();
      console.log("fetchAll complete");
    } catch (error) {
      console.error("Error fetching transactions", error);
      toast({
        title: "Load failed",
        description: "Could not load transactions from Firestore.",
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

  const openEdit = (row: TransactionRecord) => {
    setEditing(row);
    setFormData({
      date: row.date,
      description: row.description,
      type: row.type,
      amount: (row.amount ?? 0).toString(),
      category: row.category,
      paymentMethod: row.paymentMethod,
      transferCharge: (row.transferCharge ?? 0).toString(),
      accountType: row.accountType,
      accountId: row.accountId,
      reference: row.reference || "",
      notes: row.notes || "",
      status: row.status,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    if (!confirm("Delete this transaction?")) return;

    try {
      await deleteDoc(doc(db, "accountingTransactions", id));
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      toast({ title: "Deleted", description: "Transaction removed." });
    } catch (error) {
      console.error("Error deleting transaction", error);
      toast({
        title: "Delete failed",
        description: "Could not delete transaction.",
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

    if (!formData.date) {
      toast({ title: "Validation error", description: "Date is required.", variant: "destructive" });
      return;
    }

    if (!formData.description.trim()) {
      toast({ title: "Validation error", description: "Description is required.", variant: "destructive" });
      return;
    }

    const amount = safeNumber(formData.amount);
    if (amount <= 0) {
      toast({ title: "Validation error", description: "Amount must be greater than zero.", variant: "destructive" });
      return;
    }

    if (!formData.accountId) {
      toast({ title: "Validation error", description: "Select an account.", variant: "destructive" });
      return;
    }

    const transferCharge = safeNumber(formData.transferCharge);
    const selectedAccount = formData.accountType === "bank" 
      ? bankAccounts.find((b) => b.id === formData.accountId)
      : cashAccounts.find((c) => c.id === formData.accountId);

    const payload = {
      date: formData.date,
      description: formData.description.trim(),
      type: formData.type,
      amount,
      category: formData.category.trim() || "General",
      paymentMethod: formData.paymentMethod,
      transferCharge,
      accountType: formData.accountType,
      accountId: formData.accountId,
      accountName: selectedAccount?.accountName || "",
      reference: formData.reference.trim(),
      notes: formData.notes.trim(),
      status: formData.status,
      updatedAt: Timestamp.now(),
    };

    setIsSubmitting(true);
    try {
      const nextRecord: TransactionRecord = {
        ...(editing || {
          id: "",
          createdAt: new Date(),
        }),
        date: payload.date,
        description: payload.description,
        type: payload.type,
        amount: payload.amount,
        category: payload.category,
        paymentMethod: payload.paymentMethod,
        transferCharge: payload.transferCharge,
        accountType: payload.accountType,
        accountId: payload.accountId,
        accountName: payload.accountName || undefined,
        reference: payload.reference || undefined,
        notes: payload.notes || undefined,
        status: payload.status,
      };

      if (editing) {
        await updateDoc(doc(db, "accountingTransactions", editing.id), payload);
        setTransactions((prev) => prev.map((tx) => (tx.id === editing.id ? { ...nextRecord, id: editing.id } : tx)));
        toast({ title: "Updated", description: "Transaction updated successfully." });
      } else {
        const newDoc = await addDoc(collection(db, "accountingTransactions"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        setTransactions((prev) => [{ ...nextRecord, id: newDoc.id, createdAt: new Date() }, ...prev]);
        toast({ title: "Saved", description: "Transaction saved to Firestore." });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving transaction", error);
      toast({
        title: "Save failed",
        description: "Could not save transaction.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AppHeader title="Transaction Management" subtitle="Manage bank and cash accounts" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Bank and Cash Book Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bank Book Card */}
          <Card 
            className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/bank-book")}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Bank Book</h3>
                <p className="text-sm text-blue-100">Manage bank accounts</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-sm text-blue-100">Total Accounts</div>
                <div className="text-2xl font-bold mt-1">{stats.bankAccountsCount}</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-sm text-blue-100">Total Balance</div>
                <div className="text-2xl font-bold mt-1">{money(stats.totalBankBalance)}</div>
              </div>
            </div>
          </Card>

          {/* Cash Book Card */}
          <Card 
            className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/cash-book")}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Cash Book</h3>
                <p className="text-sm text-green-100">Manage cash accounts</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-sm text-green-100">Total Accounts</div>
                <div className="text-2xl font-bold mt-1">{stats.cashAccountsCount}</div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-sm text-green-100">Total Balance</div>
                <div className="text-2xl font-bold mt-1">{money(stats.totalCashBalance)}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Deposits"
            value={money(stats.deposits)}
            change="Credit"
            changeType="positive"
            icon={TrendingUp}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Total Withdrawals"
            value={money(stats.withdrawals)}
            change="Debit"
            changeType="negative"
            icon={TrendingDown}
            iconBgColor="bg-destructive/20"
            iconColor="text-destructive"
          />
          <StatCard
            title="Net Balance"
            value={money(stats.netBalance)}
            change={stats.netBalance >= 0 ? "Surplus" : "Deficit"}
            changeType={stats.netBalance >= 0 ? "positive" : "negative"}
            icon={DollarSign}
            iconBgColor="bg-info/20"
            iconColor="text-info"
          />
          <StatCard
            title="Total Transactions"
            value={stats.total.toString()}
            change="All entries"
            changeType="neutral"
            icon={Calendar}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
        </div>

        {/* Transactions Table */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Transactions</h3>
            <div className="text-sm text-muted-foreground">{filtered.length} records</div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <Input
              placeholder="Search description, category, reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={fetchAll} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button className="gap-2" onClick={openAdd}>
                <Plus className="w-4 h-4" />
                Add Transaction
              </Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[130px] text-right">Amount</TableHead>
                  <TableHead className="w-[130px]">Category</TableHead>
                  <TableHead className="w-[120px]">Payment Method</TableHead>
                  <TableHead className="w-[120px] text-right">Transfer Charge</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t, idx) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(t)}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{t.date}</TableCell>
                      <TableCell className="font-medium">{t.description}</TableCell>
                      <TableCell>
                        <span
                          className={
                            t.type === "Deposit"
                              ? "rounded-full bg-success/20 text-success text-[11px] px-2 py-1 font-semibold"
                              : "rounded-full bg-destructive/20 text-destructive text-[11px] px-2 py-1 font-semibold"
                          }
                        >
                          {t.type === "Deposit" ? "CREDIT" : "DEBIT"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(t.amount)}</TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell>{t.paymentMethod}</TableCell>
                      <TableCell className="text-right">
                        {t.transferCharge > 0 ? money(t.transferCharge) : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((s) => ({ ...s, date: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData((s) => ({ ...s, type: v as TransactionType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Deposit">Deposit (Credit)</SelectItem>
                    <SelectItem value="Withdrawal">Withdrawal (Debit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={(e) => setFormData((s) => ({ ...s, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData((s) => ({ ...s, category: e.target.value }))}
                  placeholder="General"
                />
              </div>

              <div className="space-y-2">
                <Label>Account Type *</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(v) =>
                    setFormData((s) => ({
                      ...s,
                      accountType: v as "bank" | "cash",
                      accountId: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Account</SelectItem>
                    <SelectItem value="cash">Cash Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Account *</Label>
                <Select value={formData.accountId} onValueChange={(v) => setFormData((s) => ({ ...s, accountId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.accountType === "bank"
                      ? bankAccounts.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.accountName} {b.accountNumber ? `(${b.accountNumber})` : ""}
                          </SelectItem>
                        ))
                      : cashAccounts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.accountName}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select
                  value={formData.paymentMethod}
                  onValueChange={(v) => setFormData((s) => ({ ...s, paymentMethod: v as PaymentMethod }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="MPESA">MPESA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transferCharge">Transfer Charge</Label>
                <Input
                  id="transferCharge"
                  type="number"
                  inputMode="decimal"
                  value={formData.transferCharge}
                  onChange={(e) => setFormData((s) => ({ ...s, transferCharge: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input
                  id="reference"
                  value={formData.reference}
                  onChange={(e) => setFormData((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="Transaction reference"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData((s) => ({ ...s, status: v as TransactionStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((s) => ({ ...s, description: e.target.value }))}
                placeholder="e.g., Advance Payment received from AL-GAWHAR"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Optional notes"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editing ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
