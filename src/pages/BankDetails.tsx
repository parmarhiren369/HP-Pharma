import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ArrowLeft, Download } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "Deposit" | "Withdrawal";
  amount: number;
  reference?: string;
  status: string;
}

interface MonthSummary {
  month: string;
  year: number;
  monthName: string;
  opening: number;
  deposits: number;
  withdrawals: number;
  closing: number;
  transactionCount: number;
}

export default function BankDetails() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const bankId = searchParams.get("bankId");
  const bankName = searchParams.get("bankName") || "Bank Account";
  const selectedMonth = searchParams.get("month");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [opening, setOpening] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const CURRENCY = "₹";

  const money = (n: number): string => {
    const value = Number.isFinite(n) ? n : 0;
    return `${CURRENCY}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fetchTransactions = async () => {
    if (!db || !bankId) return;
    setIsLoading(true);
    try {
      // Fetch from both collections
      const [accountingTxSnap, regularTxSnap, bankAccountSnap] = await Promise.all([
        getDocs(query(collection(db, "accountingTransactions"), where("accountId", "==", bankId))),
        getDocs(query(collection(db, "transactions"), where("bankAccountId", "==", bankId))),
        getDocs(query(collection(db, "bankAccounts"), where("__name__", "==", bankId))),
      ]);

      // Get opening balance
      if (!bankAccountSnap.empty) {
        const bankData = bankAccountSnap.docs[0].data();
        setOpening(typeof bankData.opening === "number" ? bankData.opening : parseFloat(bankData.opening) || 0);
      }

      const accountingTxList = accountingTxSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          date: (data.date || "").toString(),
          description: (data.description || "").toString(),
          type: (data.type || "Deposit") as "Deposit" | "Withdrawal",
          amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
          reference: data.reference ? data.reference.toString() : undefined,
          status: (data.status || "Completed").toString(),
        } as Transaction;
      });

      const regularTxList = regularTxSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          date: (data.date || "").toString(),
          description: (data.description || "").toString(),
          type: (data.type === "Income" || data.type === "Deposit") ? "Deposit" : "Withdrawal" as "Deposit" | "Withdrawal",
          amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
          reference: data.reference ? data.reference.toString() : undefined,
          status: "Completed",
        } as Transaction;
      });

      const allTransactions = [...accountingTxList, ...regularTxList]
        .filter(t => t.status === "Completed")
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      setTransactions(allTransactions);
    } catch (error) {
      console.error("Error fetching transactions", error);
      toast({
        title: "Load failed",
        description: "Could not load transaction data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [bankId]);

  const monthSummaries = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    // Initialize all 12 months
    const monthMap = new Map<string, MonthSummary>();
    for (let month = 1; month <= 12; month++) {
      const key = `${currentYear}-${month.toString().padStart(2, "0")}`;
      monthMap.set(key, {
        month: key,
        year: currentYear,
        monthName: `${monthNames[month - 1]} ${currentYear}`,
        opening: opening,
        deposits: 0,
        withdrawals: 0,
        closing: opening,
        transactionCount: 0,
      });
    }

    // Sort transactions chronologically
    const sortedTx = [...transactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    let runningBalance = opening;

    // Process transactions and update month summaries
    sortedTx.forEach((tx) => {
      if (!tx.date) return;
      const date = new Date(tx.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      // Only process transactions from current year
      if (year !== currentYear) return;
      
      const key = `${year}-${month.toString().padStart(2, "0")}`;
      
      if (monthMap.has(key)) {
        const summary = monthMap.get(key)!;
        
        // Set opening balance for this month if first transaction
        if (summary.transactionCount === 0) {
          summary.opening = runningBalance;
        }
        
        summary.transactionCount++;

        if (tx.type === "Deposit") {
          summary.deposits += tx.amount;
          runningBalance += tx.amount;
        } else {
          summary.withdrawals += tx.amount;
          runningBalance -= tx.amount;
        }

        summary.closing = runningBalance;
      }
    });

    // Update closing/opening balances for months without transactions
    let lastBalance = opening;
    const allMonths = Array.from(monthMap.values());
    allMonths.forEach((summary) => {
      if (summary.transactionCount === 0) {
        summary.opening = lastBalance;
        summary.closing = lastBalance;
      } else {
        lastBalance = summary.closing;
      }
    });

    return allMonths;
  }, [transactions, opening]);

  const filteredTransactions = useMemo(() => {
    if (!selectedMonth) return [];
    return transactions.filter(tx => tx.date && tx.date.startsWith(selectedMonth));
  }, [transactions, selectedMonth]);

  const monthTotal = useMemo(() => {
    if (!selectedMonth) return { deposits: 0, withdrawals: 0 };
    return filteredTransactions.reduce(
      (acc, tx) => {
        if (tx.type === "Deposit") acc.deposits += tx.amount;
        else acc.withdrawals += tx.amount;
        return acc;
      },
      { deposits: 0, withdrawals: 0 }
    );
  }, [filteredTransactions, selectedMonth]);

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(bankName, 14, 20);
    doc.setFontSize(11);
    doc.text(selectedMonth ? `Transactions for ${selectedMonth}` : "Month-wise Summary", 14, 28);

    if (selectedMonth) {
      const tableData = filteredTransactions.map((tx, idx) => [
        (idx + 1).toString(),
        tx.date,
        tx.description,
        tx.type,
        money(tx.amount),
        tx.reference || "—",
      ]);

      doc.autoTable({
        startY: 35,
        head: [["#", "Date", "Description", "Type", "Amount", "Reference"]],
        body: tableData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
      });
    } else {
      const tableData = monthSummaries.map((m, idx) => [
        (idx + 1).toString(),
        m.monthName,
        money(m.opening),
        money(m.deposits),
        money(m.withdrawals),
        money(m.closing),
        m.transactionCount.toString(),
      ]);

      doc.autoTable({
        startY: 35,
        head: [["#", "Month", "Opening", "Deposits", "Withdrawals", "Closing", "Transactions"]],
        body: tableData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
      });
    }

    doc.save(`${bankName}-${selectedMonth || "summary"}.pdf`);
  };

  if (selectedMonth) {
    return (
      <>
        <AppHeader title={`${bankName} - ${selectedMonth}`} subtitle="Monthly transaction details" />
        <div className="flex-1 overflow-auto p-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="outline"
                onClick={() => navigate(`/bank-details?bankId=${bankId}&bankName=${encodeURIComponent(bankName)}`)}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Month Summary
              </Button>
              <Button onClick={downloadPDF} className="gap-2">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                <div className="text-sm text-muted-foreground">Total Deposits</div>
                <div className="text-2xl font-bold text-success">{money(monthTotal.deposits)}</div>
              </div>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="text-sm text-muted-foreground">Total Withdrawals</div>
                <div className="text-2xl font-bold text-destructive">{money(monthTotal.withdrawals)}</div>
              </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="min-w-[250px]">Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No transactions found for this month.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((tx, idx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{tx.date}</TableCell>
                        <TableCell className="font-medium">{tx.description}</TableCell>
                        <TableCell>
                          <span
                            className={
                              tx.type === "Deposit"
                                ? "rounded-full bg-success/20 text-success text-[11px] px-2 py-1 font-semibold"
                                : "rounded-full bg-destructive/20 text-destructive text-[11px] px-2 py-1 font-semibold"
                            }
                          >
                            {tx.type}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${tx.type === "Deposit" ? "text-success" : "text-destructive"}`}>
                          {money(tx.amount)}
                        </TableCell>
                        <TableCell>{tx.reference || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader title={bankName} subtitle="Month-wise transaction summary" />
      <div className="flex-1 overflow-auto p-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => navigate("/bank-book")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Bank Book
            </Button>
            <Button onClick={downloadPDF} className="gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="min-w-[200px]">Month</TableHead>
                  <TableHead className="text-right">Opening Balance</TableHead>
                  <TableHead className="text-right">Deposits</TableHead>
                  <TableHead className="text-right">Withdrawals</TableHead>
                  <TableHead className="text-right">Closing Balance</TableHead>
                  <TableHead className="text-center">Transactions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {isLoading ? "Loading..." : "No transactions found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  monthSummaries.map((m, idx) => (
                    <TableRow
                      key={m.month}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        navigate(`/bank-details?bankId=${bankId}&bankName=${encodeURIComponent(bankName)}&month=${m.month}`)
                      }
                    >
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{m.monthName}</TableCell>
                      <TableCell className="text-right">{money(m.opening)}</TableCell>
                      <TableCell className="text-right text-success font-medium">{money(m.deposits)}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">{money(m.withdrawals)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(m.closing)}</TableCell>
                      <TableCell className="text-center">
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-sm">
                          {m.transactionCount}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
