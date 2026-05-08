import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, deleteDoc, doc, getDocs, orderBy, query, addDoc, Timestamp } from "@/lib/firestore-shim";
import { Calendar, DollarSign, FileText, Filter, Plus, RefreshCw, Search, Trash2, FileCheck, Printer } from "lucide-react";

interface QuotationRecord {
  id: string;
  quotationNo: string;
  manualQuotationNo?: string;
  partyType: "customer" | "supplier";
  partyId: string;
  partyName: string;
  issueDate: string;
  validUntil?: string;
  total: number;
  status?: string;
  lineItems?: any[];
  notes?: string;
  createdAt?: Date;
}

export default function Quotations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const CURRENCY = "₹";

  const money = (n: number): string => {
    const value = Number.isFinite(n) ? n : 0;
    return `${CURRENCY}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return quotations;
    const q = search.toLowerCase();
    return quotations.filter(
      (inv) =>
        inv.quotationNo.toLowerCase().includes(q) ||
        (inv.manualQuotationNo && inv.manualQuotationNo.toLowerCase().includes(q)) ||
        inv.partyName.toLowerCase().includes(q)
    );
  }, [quotations, search]);

  const stats = useMemo(() => {
    const total = quotations.length;
    const totalValue = quotations.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const pending = quotations.filter((inv) => !inv.status || inv.status.toLowerCase() === "pending").length;
    const approved = quotations.filter((inv) => inv.status && inv.status.toLowerCase() === "approved").length;

    return { total, totalValue, pending, approved };
  }, [quotations]);

  const fetchQuotations = async () => {
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
      const q = query(collection(db, "quotations"), orderBy("issueDate", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          quotationNo: (data.quotationNo || "").toString(),
          manualQuotationNo: data.manualQuotationNo ? data.manualQuotationNo.toString() : undefined,
          partyType: (data.partyType || "customer") as "customer" | "supplier",
          partyId: (data.partyId || "").toString(),
          partyName: (data.partyName || "").toString(),
          issueDate: (data.issueDate || "").toString(),
          validUntil: data.validUntil ? data.validUntil.toString() : undefined,
          total: typeof data.total === "number" ? data.total : parseFloat(data.total) || 0,
          status: data.status ? data.status.toString() : undefined,
          lineItems: data.items || data.lineItems || [],
          notes: data.notes ? data.notes.toString() : undefined,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as QuotationRecord;
      });
      setQuotations(list);
    } catch (error) {
      console.error("Error fetching quotations", error);
      toast({
        title: "Load failed",
        description: "Could not load quotations.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const handleDelete = async (id: string) => {
    if (!db) return;
    if (!confirm("Delete this quotation?")) return;

    try {
      await deleteDoc(doc(db, "quotations", id));
      toast({ title: "Deleted", description: "Quotation removed." });
      fetchQuotations();
    } catch (error) {
      console.error("Error deleting quotation", error);
      toast({
        title: "Delete failed",
        description: "Could not delete quotation.",
        variant: "destructive",
      });
    }
  };

  const handleConvertToProformaInvoice = async (quotation: QuotationRecord) => {
    if (!db) return;

    try {
      // Get the latest proforma invoice number
      const q = query(collection(db, "proformaInvoices"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      
      let nextNumber = 1;
      if (snap.docs.length > 0) {
        const lastDoc = snap.docs[0].data();
        const lastNum = lastDoc.proformaInvoiceNo || "PI-0";
        const match = lastNum.match(/PI-(\d+)/);
        if (match) nextNumber = parseInt(match[1], 10) + 1;
      }

      const proformaInvoiceNo = `PI-${String(nextNumber).padStart(4, "0")}`;

      // Create the proforma invoice
      await addDoc(collection(db, "proformaInvoices"), {
        proformaInvoiceNo,
        partyType: quotation.partyType,
        partyId: quotation.partyId,
        partyName: quotation.partyName,
        issueDate: quotation.issueDate,
        items: quotation.lineItems || [],
        subtotal: quotation.total,
        total: quotation.total,
        status: "In Process",
        notes: `Converted from quotation ${quotation.manualQuotationNo || quotation.quotationNo}${quotation.notes ? "\n" + quotation.notes : ""}`,
        createdAt: Timestamp.now(),
      });

      toast({
        title: "Converted",
        description: `Quotation converted to Proforma Invoice ${proformaInvoiceNo}`,
      });

      navigate("/proforma-invoices");
    } catch (error) {
      console.error("Error converting to proforma invoice", error);
      toast({
        title: "Conversion failed",
        description: "Could not convert to proforma invoice.",
        variant: "destructive",
      });
    }
  };

  const handleConvertToInvoice = async (quotation: QuotationRecord) => {
    if (!db) return;

    try {
      // Get the latest invoice number
      const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      
      let nextNumber = 1;
      if (snap.docs.length > 0) {
        const lastDoc = snap.docs[0].data();
        const lastNum = lastDoc.invoiceNo || "INV-0";
        const match = lastNum.match(/INV-(\d+)/);
        if (match) nextNumber = parseInt(match[1], 10) + 1;
      }

      const invoiceNo = `INV-${String(nextNumber).padStart(4, "0")}`;

      // Create the invoice
      await addDoc(collection(db, "invoices"), {
        invoiceNo,
        partyType: quotation.partyType,
        partyId: quotation.partyId,
        partyName: quotation.partyName,
        issueDate: quotation.issueDate,
        items: quotation.lineItems || [],
        subtotal: quotation.total,
        total: quotation.total,
        status: "Unpaid",
        notes: `Converted from quotation ${quotation.manualQuotationNo || quotation.quotationNo}${quotation.notes ? "\n" + quotation.notes : ""}`,
        createdAt: Timestamp.now(),
      });

      toast({
        title: "Converted",
        description: `Quotation converted to Invoice ${invoiceNo}`,
      });

      navigate("/invoices");
    } catch (error) {
      console.error("Error converting to invoice", error);
      toast({
        title: "Conversion failed",
        description: "Could not convert to invoice.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <AppHeader title="Quotations" subtitle="Manage price quotations" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Quotations"
            value={stats.total.toString()}
            change="All quotations"
            changeType="neutral"
            icon={FileText}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="Total Value"
            value={money(stats.totalValue)}
            change="Quotation value"
            changeType="positive"
            icon={DollarSign}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Pending"
            value={stats.pending.toString()}
            change="Awaiting approval"
            changeType="neutral"
            icon={Calendar}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
          <StatCard
            title="Approved"
            value={stats.approved.toString()}
            change="Confirmed quotations"
            changeType="positive"
            icon={Filter}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">All Quotations</h3>
            <div className="text-sm text-muted-foreground">{filtered.length} records</div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search quotations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={fetchQuotations} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button className="gap-2" onClick={() => navigate("/quotations/new")}>
                <Plus className="w-4 h-4" />
                New Quotation
              </Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="w-[140px]">Quotation No</TableHead>
                  <TableHead className="min-w-[180px]">Customer/Supplier</TableHead>
                  <TableHead className="w-[120px]">Issue Date</TableHead>
                  <TableHead className="w-[120px]">Valid Until</TableHead>
                  <TableHead className="w-[140px] text-right">Total Amount</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No quotations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((quot, idx) => (
                    <TableRow key={quot.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">
                        {quot.manualQuotationNo || quot.quotationNo}
                        {quot.manualQuotationNo && (
                          <div className="text-xs text-muted-foreground">{quot.quotationNo}</div>
                        )}
                      </TableCell>
                      <TableCell>{quot.partyName}</TableCell>
                      <TableCell>{quot.issueDate}</TableCell>
                      <TableCell>{quot.validUntil || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{money(quot.total)}</TableCell>
                      <TableCell>
                        <span
                          className={
                            !quot.status || quot.status.toLowerCase() === "pending"
                              ? "rounded-full bg-warning/20 text-warning text-[11px] px-2 py-1 font-semibold"
                              : "rounded-full bg-success/20 text-success text-[11px] px-2 py-1 font-semibold"
                          }
                        >
                          {quot.status || "PENDING"}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-muted-foreground">Actions:</div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/quotations/${quot.id}/print`)}
                              title="Print Quotation"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConvertToProformaInvoice(quot)}
                              title="Convert to Proforma Invoice"
                            >
                              <FileCheck className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConvertToInvoice(quot)}
                              title="Convert to Invoice"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(quot.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
    </>
  );
}
