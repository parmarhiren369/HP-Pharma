import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "@/lib/firestore-shim";
import { ArrowLeft, Download, RefreshCw, Search } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Extend jsPDF to include autoTabl
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber?: string;
  opening?: number;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "Deposit" | "Withdrawal";
  amount: number;
  accountId: string;
  accountName?: string;
  reference?: string;
  status: string;
  createdAt?: Date;
}

interface AccountSummary {
  id: string;
  accountName: string;
  accountNumber?: string;
  opening: number;
  withdraw: number;
  deposit: number;
  closing: number;
}

export default function BankBook() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const CURRENCY = "₹";

  const money = (n: number): string => {
    const value = Number.isFinite(n) ? n : 0;
    return `${CURRENCY}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fetchBankAccounts = async () => {
    if (!db) return;
    const snap = await getDocs(collection(db, "bankAccounts"));
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        accountName: (data.accountName || "").toString(),
        accountNumber: data.accountNumber ? data.accountNumber.toString() : undefined,
        opening: typeof data.opening === "number" ? data.opening : parseFloat(data.opening) || 0,
      } as BankAccount;
    });
    // Filter out ABC BANK, test banks, and CASH accounts
    const filteredList = list.filter((b) => {
      const name = (b.accountName || "").toUpperCase().trim();
      return name && 
        name !== "ABC BANK" && 
        name !== "ABC" && 
        name !== "TEST BANK" && 
        name !== "TEST" &&
        name !== "CASH" &&
        !name.includes("CASH");
    });
    setAccounts(filteredList);
  };

  const fetchTransactions = async () => {
    if (!db) return;
    
    // Fetch from both collections to get all bank transactions
    const [accountingTxSnap, regularTxSnap] = await Promise.all([
      getDocs(query(collection(db, "accountingTransactions"), orderBy("date", "desc"))),
      getDocs(query(collection(db, "transactions"), orderBy("createdAt", "desc")))
    ]);
    
    const accountingTxList = accountingTxSnap.docs
      .map((d) => {
        const data = d.data();
        const accountName = (data.accountName || "").toUpperCase().trim();
        // Skip cash account transactions
        if (accountName === "CASH" || accountName.includes("CASH")) {
          return null;
        }
        return {
          id: d.id,
          date: (data.date || "").toString(),
          description: (data.description || "").toString(),
          type: (data.type || "Deposit") as "Deposit" | "Withdrawal",
          amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
          accountId: (data.accountId || "").toString(),
          accountName: data.accountName ? data.accountName.toString() : undefined,
          reference: data.reference ? data.reference.toString() : undefined,
          status: (data.status || "Completed").toString(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Transaction;
      })
      .filter((t): t is Transaction => t !== null);
    
    // Convert regular transactions to bank format
    const regularTxList = regularTxSnap.docs.map((d) => {
      const data = d.data();
      const bankAccountId = (data.bankAccountId || "").toString();
      if (!bankAccountId) return null;
      
      return {
        id: d.id,
        date: (data.date || "").toString(),
        description: (data.description || "").toString(),
        type: (data.type === "Income" || data.type === "Deposit") ? "Deposit" : "Withdrawal" as "Deposit" | "Withdrawal",
        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
        accountId: bankAccountId,
        accountName: data.bankAccountName ? data.bankAccountName.toString() : undefined,
        reference: data.reference ? data.reference.toString() : undefined,
        status: "Completed",
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as Transaction;
    }).filter(t => t !== null) as Transaction[];
    
    // Combine both lists
    const allTransactions = [...accountingTxList, ...regularTxList];
    
    // Filter to only include transactions for valid bank accounts
    const list = allTransactions.filter((t) => {
      const acc = accounts.find((a) => a.id === t.accountId);
      return acc !== undefined;
    });
    
    setTransactions(list);
  };

  const accountSummaries = useMemo(() => {
    return accounts.map((acc) => {
      const accTransactions = transactions.filter(
        (t) => t.accountId === acc.id && t.status === "Completed"
      );

      const withdraw = accTransactions
        .filter((t) => t.type === "Withdrawal")
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const deposit = accTransactions
        .filter((t) => t.type === "Deposit")
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      // Properly handle opening balance - check if it's a number (including 0)
      const opening = typeof acc.opening === 'number' ? acc.opening : 0;
      const closing = opening + deposit - withdraw;

      return {
        id: acc.id,
        accountName: acc.accountName,
        accountNumber: acc.accountNumber,
        opening,
        withdraw,
        deposit,
        closing,
      } as AccountSummary;
    });
  }, [accounts, transactions]);

  const filtered = useMemo(() => {
    if (!search.trim()) return accountSummaries;
    const q = search.toLowerCase();
    return accountSummaries.filter(
      (a) =>
        a.accountName.toLowerCase().includes(q) ||
        (a.accountNumber && a.accountNumber.toLowerCase().includes(q))
    );
  }, [accountSummaries, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, item) => ({
        opening: acc.opening + item.opening,
        withdraw: acc.withdraw + item.withdraw,
        deposit: acc.deposit + item.deposit,
        closing: acc.closing + item.closing,
      }),
      { opening: 0, withdraw: 0, deposit: 0, closing: 0 }
    );
  }, [filtered]);

  const fetchAll = async () => {
    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await fetchBankAccounts();
      await fetchTransactions();
    } catch (error) {
      console.error("Error fetching bank book data", error);
      toast({
        title: "Load failed",
        description: "Could not load bank accounts.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && transactions.length === 0) {
      fetchTransactions();
    }
  }, [accounts]);

  const downloadPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text("Bank Accounts", 14, 20);

    // Subtitle
    doc.setFontSize(11);
    doc.text("View all bank account balances", 14, 28);

    // Table
    const tableData = filtered.map((row, index) => [
      (index + 1).toString(),
      row.accountName,
      row.opening >= 0 ? money(row.opening) : `(${money(Math.abs(row.opening))})`,
      row.opening >= 0 ? "CR" : "DB",
      money(row.withdraw),
      money(row.deposit),
      row.closing >= 0 ? money(row.closing) : `(${money(Math.abs(row.closing))})`,
      row.closing >= 0 ? "CR" : "DB",
    ]);

    // Add totals row
    tableData.push([
      "",
      "Sum of: Bank Accounts",
      totals.opening >= 0 ? money(totals.opening) : `(${money(Math.abs(totals.opening))})`,
      totals.opening >= 0 ? "CR" : "DB",
      money(totals.withdraw),
      money(totals.deposit),
      totals.closing >= 0 ? money(totals.closing) : `(${money(Math.abs(totals.closing))})`,
      totals.closing >= 0 ? "CR" : "DB",
    ]);

    doc.autoTable({
      startY: 35,
      head: [["#", "ACCOUNT NAME", "OPENING(RS)", "C/D", "WITHDRAW", "DEPOSIT", "CLOSING AMOUNT", "C/D"]],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: "bold" },
      didParseCell: (data: any) => {
        // Make the last row (totals) bold
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
    });

    doc.save(`Bank_Book_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "PDF Downloaded", description: "Bank book report has been downloaded." });
  };

  return (
    <>
      <AppHeader title="Bank Accounts" subtitle="View all bank account balances" />

      <div className="flex-1 overflow-auto p-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => navigate("/transactions")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Transactions
            </Button>
            <Button onClick={downloadPDF} className="gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={fetchAll} disabled={isLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="min-w-[250px]">ACCOUNT NAME</TableHead>
                  <TableHead className="w-[150px] text-right">OPENING(RS)</TableHead>
                  <TableHead className="w-[60px] text-center">C/D</TableHead>
                  <TableHead className="w-[150px] text-right">WITHDRAW</TableHead>
                  <TableHead className="w-[150px] text-right">DEPOSIT</TableHead>
                  <TableHead className="w-[150px] text-right">CLOSING AMOUNT</TableHead>
                  <TableHead className="w-[60px] text-center">C/D</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No bank accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filtered.map((row, idx) => (
                      <TableRow 
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/bank-details?bankId=${row.id}&bankName=${encodeURIComponent(row.accountName)}`)}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          {row.accountName}
                          {row.accountNumber && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              A/C: {row.accountNumber}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.opening >= 0 ? money(row.opening) : `(${money(Math.abs(row.opening))})`}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${
                              row.opening >= 0
                                ? "bg-success/20 text-success"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {row.opening >= 0 ? "CR" : "DB"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-destructive font-medium">
                          {money(row.withdraw)}
                        </TableCell>
                        <TableCell className="text-right text-success font-medium">
                          {money(row.deposit)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {row.closing >= 0 ? money(row.closing) : `(${money(Math.abs(row.closing))})`}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${
                              row.closing >= 0
                                ? "bg-success/20 text-success"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {row.closing >= 0 ? "CR" : "DB"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">Sum of: Bank Accounts</TableCell>
                      <TableCell className="text-right">
                        {totals.opening >= 0 ? money(totals.opening) : `(${money(Math.abs(totals.opening))})`}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${
                            totals.opening >= 0
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {totals.opening >= 0 ? "CR" : "DB"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-destructive">{money(totals.withdraw)}</TableCell>
                      <TableCell className="text-right text-success">{money(totals.deposit)}</TableCell>
                      <TableCell className="text-right font-bold">
                        {totals.closing >= 0 ? money(totals.closing) : `(${money(Math.abs(totals.closing))})`}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${
                            totals.closing >= 0
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {totals.closing >= 0 ? "CR" : "DB"}
                        </span>
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
