import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "@/lib/firestore-shim";
import { saveAs } from "file-saver";
import { ArrowLeftRight, FileDown, FileText, Landmark, RefreshCw } from "lucide-react";

type TransactionType = "Income" | "Expense" | "Deposit" | "Withdrawal";

interface AccountingTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  paymentMethod?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  receiver?: string;
  createdAt?: Date;
}

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  initialBalance: number;
  createdAt?: Date;
}

const rupees = (value: number) => `₹${(value || 0).toLocaleString("en-IN")}`;

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBankNumber(accountNumber: string) {
  const digits = (accountNumber || "").replace(/\s+/g, "").trim();
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

function escapeCsv(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeHtml(value: unknown): string {
  const s = String(value ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function Accounting() {
  const [transactions, setTransactions] = useState<AccountingTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isManageBanksOpen, setIsManageBanksOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    accountName: "",
    accountNumber: "",
    initialBalance: "0",
  });

  const [isSelfTransferOpen, setIsSelfTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromBankId: "",
    toBankId: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    description: "Self transfer",
  });

  const { toast } = useToast();

  const fetchTransactions = async () => {
    const qy = query(collection(db, "accountingTransactions"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        date: (data.date || "").toString(),
        description: (data.description || "").toString(),
        category: (data.category || "General").toString(),
        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
        type: (data.type || "Income") as TransactionType,
        paymentMethod: (data.paymentMethod || "").toString() || undefined,
        bankAccountId: (data.bankAccountId || (data.accountId || "")).toString() || undefined,
        bankAccountName: (data.bankAccountName || (data.accountName || "")).toString() || undefined,
        receiver: (data.receiver || data.partyName || "").toString() || undefined,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as AccountingTransaction;
    });
    setTransactions(list);
  };

  const fetchBankAccounts = async () => {
    const qy = query(collection(db, "bankAccounts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        accountName: (data.accountName || data.name || "").toString(),
        accountNumber: (data.accountNumber || "").toString(),
        initialBalance:
          typeof data.opening === "number"
            ? data.opening
            : typeof data.initialBalance === "number"
              ? data.initialBalance
              : typeof data.openingBalance === "number"
                ? data.openingBalance
                : parseFloat(data.opening ?? data.initialBalance ?? data.openingBalance) || 0,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as BankAccount;
    });
    // Filter out ABC BANK and other test banks
    const filteredList = list.filter((b) => {
      const name = (b.accountName || "").toUpperCase().trim();
      return name && name !== "ABC BANK" && name !== "ABC" && name !== "TEST BANK" && name !== "TEST";
    });
    setBankAccounts(filteredList);
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
      await Promise.all([fetchBankAccounts(), fetchTransactions()]);
    } catch (error) {
      console.error("Error loading accounting data", error);
      toast({
        title: "Load failed",
        description: "Could not load bank accounts/transactions from Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const incomeTotal = useMemo(
    () => transactions.filter((t) => t.type === "Income" || t.type === "Deposit").reduce((sum, t) => sum + (t.amount || 0), 0),
    [transactions]
  );

  const expenseTotal = useMemo(
    () => transactions.filter((t) => t.type === "Expense" || t.type === "Withdrawal").reduce((sum, t) => sum + (t.amount || 0), 0),
    [transactions]
  );

  const netBalance = useMemo(() => incomeTotal - expenseTotal, [incomeTotal, expenseTotal]);

  const bankBalanceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const bank of bankAccounts) {
      map.set(bank.id, bank.initialBalance || 0);
    }
    for (const t of transactions) {
      if (!t.bankAccountId) continue;
      if (!map.has(t.bankAccountId)) map.set(t.bankAccountId, 0);
      const prev = map.get(t.bankAccountId) ?? 0;
      // Handle both "Income"/"Deposit" as positive and "Expense"/"Withdrawal" as negative
      const isPositive = t.type === "Income" || t.type === "Deposit";
      const delta = isPositive ? (t.amount || 0) : -(t.amount || 0);
      map.set(t.bankAccountId, prev + delta);
    }
    return map;
  }, [bankAccounts, transactions]);

  const openManageBanks = () => {
    setBankForm({ accountName: "", accountNumber: "", initialBalance: "0" });
    setIsManageBanksOpen(true);
  };

  const openSelfTransfer = () => {
    setTransferForm({
      fromBankId: bankAccounts[0]?.id || "",
      toBankId: bankAccounts[1]?.id || "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      description: "Self transfer",
    });
    setIsSelfTransferOpen(true);
  };

  const createBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    const accountName = bankForm.accountName.trim();
    const accountNumber = bankForm.accountNumber.trim();
    const initialBalance = safeNumber(bankForm.initialBalance);

    if (!accountName) {
      toast({ title: "Missing account name", description: "Please enter bank account name.", variant: "destructive" });
      return;
    }
    if (!accountNumber) {
      toast({ title: "Missing account number", description: "Please enter account number.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "bankAccounts"), {
        accountName,
        accountNumber,
        opening: initialBalance,
        createdAt: Timestamp.now(),
      });
      toast({ title: "Bank added", description: "Bank account created successfully." });
      setIsManageBanksOpen(false);
      fetchBankAccounts();
    } catch (error) {
      console.error("Error creating bank account", error);
      toast({ title: "Create failed", description: "Could not create bank account.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createSelfTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    const amount = safeNumber(transferForm.amount);
    if (!transferForm.fromBankId || !transferForm.toBankId) {
      toast({ title: "Select banks", description: "Please select From and To bank accounts.", variant: "destructive" });
      return;
    }
    if (transferForm.fromBankId === transferForm.toBankId) {
      toast({ title: "Invalid transfer", description: "From and To bank cannot be same.", variant: "destructive" });
      return;
    }
    if (amount <= 0) {
      toast({ title: "Invalid amount", description: "Transfer amount must be greater than 0.", variant: "destructive" });
      return;
    }
    if (!transferForm.date) {
      toast({ title: "Missing date", description: "Please select a date.", variant: "destructive" });
      return;
    }

    const fromBank = bankAccounts.find((b) => b.id === transferForm.fromBankId);
    const toBank = bankAccounts.find((b) => b.id === transferForm.toBankId);
    if (!fromBank || !toBank) {
      toast({ title: "Bank not found", description: "Please refresh and try again.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const transferId = `TRF-${Date.now()}`;
      await Promise.all([
        addDoc(collection(db, "transactions"), {
          date: transferForm.date,
          description: transferForm.description || `Self transfer to ${toBank.accountName}`,
          category: "Self Transfer",
          amount,
          type: "Expense",
          status: "Completed",
          reference: transferId,
          partyType: "other",
          partyName: toBank.accountName,
          receiver: toBank.accountName,
          paymentMethod: "Bank Transfer",
          bankAccountId: fromBank.id,
          bankAccountName: fromBank.accountName,
          createdAt: Timestamp.now(),
        }),
        addDoc(collection(db, "transactions"), {
          date: transferForm.date,
          description: transferForm.description || `Self transfer from ${fromBank.accountName}`,
          category: "Self Transfer",
          amount,
          type: "Income",
          status: "Completed",
          reference: transferId,
          partyType: "other",
          partyName: fromBank.accountName,
          receiver: fromBank.accountName,
          paymentMethod: "Bank Transfer",
          bankAccountId: toBank.id,
          bankAccountName: toBank.accountName,
          createdAt: Timestamp.now(),
        }),
      ]);

      toast({ title: "Transfer created", description: "Self transfer recorded successfully." });
      setIsSelfTransferOpen(false);
      fetchTransactions();
    } catch (error) {
      console.error("Error creating self transfer", error);
      toast({ title: "Transfer failed", description: "Could not create transfer.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadCsv = () => {
    const headers = [
      "Date",
      "Description",
      "Category",
      "Type",
      "Payment Method",
      "Bank Account",
      "Standard Receiver",
      "Amount",
    ];

    const rows = transactions.map((t) => {
      const bankName =
        t.bankAccountName ||
        (t.bankAccountId ? bankAccounts.find((b) => b.id === t.bankAccountId)?.accountName : "") ||
        "";
      const paymentMethod = t.paymentMethod || (t.bankAccountId ? "Bank" : "");
      return [
        t.date,
        t.description,
        t.category,
        t.type,
        paymentMethod,
        bankName,
        t.receiver || "",
        t.amount,
      ].map(escapeCsv);
    });

    const csv = [headers.map(escapeCsv).join(","), ...rows.map((r) => r.join(","))].join("\n");
    saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), `accounting-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadPdf = () => {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      toast({ title: "Popup blocked", description: "Please allow popups to export PDF.", variant: "destructive" });
      return;
    }

    const rowsHtml = transactions
      .map((t) => {
        const bankName =
          t.bankAccountName ||
          (t.bankAccountId ? bankAccounts.find((b) => b.id === t.bankAccountId)?.accountName : "") ||
          "";
        const paymentMethod = t.paymentMethod || (t.bankAccountId ? "Bank" : "");
        const isPositive = t.type === "Income" || t.type === "Deposit";
        const amount = `${isPositive ? "+" : "-"}${rupees(t.amount)}`;
        return `
          <tr>
            <td>${escapeHtml(t.date)}</td>
            <td>${escapeHtml(t.description)}</td>
            <td>${escapeHtml(t.category)}</td>
            <td>${escapeHtml(t.type)}</td>
            <td>${escapeHtml(paymentMethod)}</td>
            <td>${escapeHtml(bankName)}</td>
            <td>${escapeHtml(t.receiver || "")}</td>
            <td style="text-align:right">${escapeHtml(amount)}</td>
          </tr>
        `;
      })
      .join("");

    win.document.write(`
      <html>
        <head>
          <title>Transaction History</title>
          <style>
            body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 20px; }
            h1 { font-size: 18px; margin: 0 0 10px; }
            .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
            th { background: #f5f5f5; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Transaction History</h1>
          <div class="meta">Generated on ${new Date().toLocaleString()}</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Payment Method</th>
                <th>Bank Account</th>
                <th>Standard Receiver</th>
                <th style="text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <>
      <AppHeader title="Accounting" subtitle="Bank accounts, transfers, and transaction history" />

      <div className="flex-1 overflow-auto p-6">
        {/* Bank Accounts */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Bank Accounts</h2>
              <p className="text-sm text-muted-foreground">Manage bank accounts and balances</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={openSelfTransfer}
                disabled={bankAccounts.length < 2}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Self Transfer
              </Button>
              <Button
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                onClick={openManageBanks}
              >
                <Landmark className="w-4 h-4" />
                Manage Bank Accounts
              </Button>
              <Button variant="outline" className="gap-2" onClick={fetchAll} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="p-6">
            {bankAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No bank accounts yet. Click “Manage Bank Accounts” to add one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bankAccounts.map((b) => {
                  const bal = bankBalanceById.get(b.id) ?? 0;
                  const balClass = bal < 0 ? "text-destructive" : "text-success";
                  const balText = `${bal < 0 ? "-" : ""}${rupees(Math.abs(bal))}`;
                  return (
                    <div key={b.id} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold tracking-wide text-foreground uppercase truncate">
                            {b.accountName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{formatBankNumber(b.accountNumber)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Current Balance</div>
                          <div className={`text-lg font-bold ${balClass}`}>{balText}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Totals Cards */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-destructive/10 p-5">
                <div className="text-sm text-muted-foreground">Total Expense</div>
                <div className="text-2xl font-bold text-destructive mt-1">{rupees(expenseTotal)}</div>
              </div>
              <div className="rounded-xl border border-border bg-success/10 p-5">
                <div className="text-sm text-muted-foreground">Total Income</div>
                <div className="text-2xl font-bold text-success mt-1">{rupees(incomeTotal)}</div>
              </div>
              <div className="rounded-xl border border-border bg-blue-600/10 p-5">
                <div className="text-sm text-muted-foreground">Net Balance</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">{rupees(netBalance)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Transaction History</h2>
              <p className="text-sm text-muted-foreground">All entries with bank & payment details</p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2" onClick={downloadCsv}>
                <FileDown className="w-4 h-4" />
                Download CSV
              </Button>
              <Button variant="outline" className="gap-2" onClick={downloadPdf}>
                <FileText className="w-4 h-4" />
                Download PDF
              </Button>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-xl border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="min-w-[220px]">Description</TableHead>
                    <TableHead className="whitespace-nowrap">Category</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">Payment Method</TableHead>
                    <TableHead className="min-w-[160px]">Bank Account</TableHead>
                    <TableHead className="min-w-[160px]">Standard Receiver</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => {
                      const isPositive = t.type === "Income" || t.type === "Deposit";
                      const amountClass = isPositive ? "text-success" : "text-destructive";
                      const bankName =
                        t.bankAccountName ||
                        (t.bankAccountId ? bankAccounts.find((b) => b.id === t.bankAccountId)?.accountName : "") ||
                        "";
                      const paymentMethod = t.paymentMethod || (t.bankAccountId ? "Bank" : "");
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">{t.date || "-"}</TableCell>
                          <TableCell className="font-medium">{t.description || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">{t.category || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">{t.type}</TableCell>
                          <TableCell className="whitespace-nowrap">{paymentMethod || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">{bankName || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">{t.receiver || "-"}</TableCell>
                          <TableCell className={`text-right font-semibold whitespace-nowrap ${amountClass}`}>
                            {isPositive ? "+" : "-"}{rupees(t.amount)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      {/* Manage Bank Accounts Dialog */}
      <Dialog open={isManageBanksOpen} onOpenChange={setIsManageBanksOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Bank Accounts</DialogTitle>
          </DialogHeader>

          <form onSubmit={createBankAccount} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input
                  value={bankForm.accountName}
                  onChange={(e) => setBankForm((s) => ({ ...s, accountName: e.target.value }))}
                  placeholder="e.g. HDFC Current"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm((s) => ({ ...s, accountNumber: e.target.value }))}
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label>Initial Balance</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={bankForm.initialBalance}
                  onChange={(e) => setBankForm((s) => ({ ...s, initialBalance: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsManageBanksOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Bank Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Self Transfer Dialog */}
      <Dialog open={isSelfTransferOpen} onOpenChange={setIsSelfTransferOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Self Transfer</DialogTitle>
          </DialogHeader>

          <form onSubmit={createSelfTransfer} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Bank</Label>
                <Select value={transferForm.fromBankId} onValueChange={(v) => setTransferForm((s) => ({ ...s, fromBankId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To Bank</Label>
                <Select value={transferForm.toBankId} onValueChange={(v) => setTransferForm((s) => ({ ...s, toBankId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm((s) => ({ ...s, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={transferForm.date}
                  onChange={(e) => setTransferForm((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={transferForm.description}
                onChange={(e) => setTransferForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Self transfer"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSelfTransferOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || bankAccounts.length < 2}>
                {isSubmitting ? "Creating..." : "Create Transfer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
