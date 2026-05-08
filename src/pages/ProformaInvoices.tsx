import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportExcelButton } from "@/components/ExportExcelButton";
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
import { FileText, IndianRupee, Pencil, Plus, Printer, RefreshCw, Trash2, FileCheck } from "lucide-react";

type ProformaInvoiceStatus = "Approved" | "In Process" | "Paid" | "Pending" | "Overdue";

interface ProcessedInventoryOption {
  id: string;
  name: string;
  unit?: string;
}

interface ProformaInvoiceLineItem {
  processedInventoryId: string;
  name: string;
  unit: string;
  quantity: number;
  rate: number;
  taxType?: "CGST / SGST" | "IGST";
  tax?: number;
}

interface ProformaInvoiceRecord {
  id: string;
  proformaInvoiceNo: string;
  partyType: "customer" | "supplier";
  partyId: string;
  partyName: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  items?: ProformaInvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: ProformaInvoiceStatus;
  notes?: string;
  createdAt?: Date;
}

interface PartyOption {
  id: string;
  name: string;
}

const defaultFormState = {
  proformaInvoiceNo: "",
  partyType: "customer" as ProformaInvoiceRecord["partyType"],
  partyId: "",
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date().toISOString().slice(0, 10),
  subtotal: "",
  tax: "0",
  status: "Pending" as ProformaInvoiceStatus,
  notes: "",
};

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export default function ProformaInvoices() {
  const navigate = useNavigate();
  const [proformaInvoices, setProformaInvoices] = useState<ProformaInvoiceRecord[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
  const [processedInventoryOptions, setProcessedInventoryOptions] = useState<ProcessedInventoryOption[]>([]);

  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProformaInvoiceRecord | null>(null);
  const [formData, setFormData] = useState(defaultFormState);
  const [lineItems, setLineItems] = useState<ProformaInvoiceLineItem[]>([]);

  const { toast } = useToast();

  const partyOptions = useMemo(() => (formData.partyType === "supplier" ? suppliers : customers), [customers, suppliers, formData.partyType]);
  const selectedParty = useMemo(() => partyOptions.find((p) => p.id === formData.partyId), [partyOptions, formData.partyId]);

  const processedInventoryById = useMemo(() => {
    const map = new Map<string, ProcessedInventoryOption>();
    for (const it of processedInventoryOptions) map.set(it.id, it);
    return map;
  }, [processedInventoryOptions]);

  const computedSubtotal = useMemo(() => {
    if (lineItems.length) {
      return lineItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
    }
    return safeNumber(formData.subtotal);
  }, [formData.subtotal, lineItems]);

  const computedTax = useMemo(() => {
    if (lineItems.length) {
      return Math.max(
        0,
        lineItems.reduce((sum, it) => {
          const base = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
          const pct = Number(it.tax) || 0;
          return sum + (base * pct) / 100;
        }, 0)
      );
    }
    return Math.max(0, safeNumber(formData.tax));
  }, [formData.tax, lineItems]);

  const computedTotal = useMemo(() => {
    const subtotal = computedSubtotal;
    const tax = computedTax;
    return Math.max(0, subtotal + tax);
  }, [computedSubtotal, computedTax]);

  const filtered = useMemo(() => {
    if (!search.trim()) return proformaInvoices;
    const q = search.toLowerCase();
    return proformaInvoices.filter((i) => `${i.proformaInvoiceNo} ${i.partyName} ${i.status}`.toLowerCase().includes(q));
  }, [proformaInvoices, search]);

  const stats = useMemo(() => {
    const total = proformaInvoices.reduce((sum, i) => sum + (i.total || 0), 0);
    const pendingTotal = proformaInvoices
      .filter((i) => i.status === "Pending" || i.status === "Overdue")
      .reduce((sum, i) => sum + (i.total || 0), 0);
    const paidTotal = proformaInvoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + (i.total || 0), 0);

    return {
      count: proformaInvoices.length,
      total,
      pendingCount: proformaInvoices.filter((i) => i.status === "Pending" || i.status === "Overdue").length,
      pendingTotal,
      paidTotal,
    };
  }, [proformaInvoices]);

  const exportRows = useMemo(
    () =>
      filtered.map((i) => ({
        "System ProformaInvoice": i.proformaInvoiceNo,
        "Manual ProformaInvoice": (i as any).manualProformaInvoiceNo || "",
        "CU Number": i.cuNumber || "",
        Date: i.issueDate,
        Party: i.partyName,
        PIN: i.pin || "",
        Items: (i.items || [])
          .map((x) => {
            const resolved = x.processedInventoryId ? processedInventoryById.get(x.processedInventoryId) : undefined;
            const name = resolved?.name || x.name;
            const unit = resolved?.unit || x.unit;
            return `${name} (${x.quantity} ${unit})`;
          })
          .join(", "),
        "Total Amount": i.total,
        Status: i.status,
        Notes: i.notes || "",
      })),
    [filtered, processedInventoryById]
  );

  const fetchParties = async () => {
    const [customersSnap, suppliersSnap] = await Promise.all([
      getDocs(collection(db, "customers")),
      getDocs(collection(db, "suppliers")),
    ]);

    const customersList = customersSnap.docs
      .map((d) => ({ id: d.id, name: (d.data().name || "").toString() }))
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const suppliersList = suppliersSnap.docs
      .map((d) => ({ id: d.id, name: (d.data().name || "").toString() }))
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    setCustomers(customersList);
    setSuppliers(suppliersList);
  };

  const fetchProcessedInventoryOptions = async () => {
    const snap = await getDocs(collection(db, "processedInventory"));
    const list = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: (data.name || "").toString(),
          unit: (data.unit || "").toString() || undefined,
        } as ProcessedInventoryOption;
      })
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    setProcessedInventoryOptions(list);
  };

  const fetchProformaInvoices = async () => {
    const qy = query(collection(db, "proformaInvoices"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();

      const rawItems = Array.isArray(data.items) ? data.items : [];
      const items: ProformaInvoiceLineItem[] = rawItems
        .map((it: any) => {
          const quantity = typeof it.quantity === "number" ? it.quantity : parseFloat(it.quantity) || 0;
          const rate = typeof it.rate === "number" ? it.rate : parseFloat(it.rate) || 0;
          return {
            processedInventoryId: (it.processedInventoryId || "").toString(),
            name: (it.name || "").toString(),
            unit: (it.unit || "").toString() || "pcs",
            quantity,
            rate,
          } as ProformaInvoiceLineItem;
        })
        .filter((it: ProformaInvoiceLineItem) => it.name);

      return {
        id: d.id,
        proformaInvoiceNo: (data.proformaInvoiceNo || "").toString(),
        partyType: (data.partyType || "customer") as ProformaInvoiceRecord["partyType"],
        partyId: (data.partyId || "").toString(),
        partyName: (data.partyName || "").toString(),
        issueDate: (data.issueDate || "").toString(),
        dueDate: (data.dueDate || "").toString(),
        items,
        subtotal: typeof data.subtotal === "number" ? data.subtotal : parseFloat(data.subtotal) || 0,
        tax: typeof data.tax === "number" ? data.tax : parseFloat(data.tax) || 0,
        total: typeof data.total === "number" ? data.total : parseFloat(data.total) || 0,
        status: (data.status || "Pending") as ProformaInvoiceStatus,
        notes: (data.notes || "").toString() || undefined,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as ProformaInvoiceRecord;
    });
    setProformaInvoices(list);
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
      await Promise.all([fetchParties(), fetchProcessedInventoryOptions(), fetchProformaInvoices()]);
    } catch (error) {
      console.error("Error fetching proformaInvoices", error);
      toast({
        title: "Load failed",
        description: "Could not load proformaInvoices from Firestore.",
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
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      tax: "0",
    });
    setLineItems([]);
  };

  const openEdit = (row: ProformaInvoiceRecord) => {
    setEditing(row);
    setFormData({
      proformaInvoiceNo: row.proformaInvoiceNo,

      partyType: row.partyType,
      partyId: row.partyId,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      subtotal: (row.subtotal ?? 0).toString(),
      tax: (row.tax ?? 0).toString(),
      status: row.status,
      notes: row.notes || "",
    });
    setLineItems(row.items || []);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    if (!confirm("Delete this proformaInvoice?")) return;

    try {
      await deleteDoc(doc(db, "proformaInvoices", id));
      toast({ title: "Deleted", description: "ProformaInvoice removed." });
      fetchProformaInvoices();
    } catch (error) {
      console.error("Error deleting proformaInvoice", error);
      toast({
        title: "Delete failed",
        description: "Could not delete proformaInvoice.",
        variant: "destructive",
      });
    }
  };

  const handleConvertToInvoice = async (proformaInvoice: ProformaInvoiceRecord) => {
    if (!db) return;
    if (!confirm("Convert this proforma invoice to a regular invoice?")) return;

    try {
      // Get the next invoice number
      const invoicesSnap = await getDocs(collection(db, "invoices"));
      const invoiceNo = `INV-${String(invoicesSnap.size + 1).padStart(6, "0")}`;

      // Create the invoice
      await addDoc(collection(db, "invoices"), {
        invoiceNo,
        manualInvoiceNo: proformaInvoice.proformaInvoiceNo, // Use proforma number as manual number
        partyType: proformaInvoice.partyType,
        partyId: proformaInvoice.partyId,
        partyName: proformaInvoice.partyName,
        issueDate: proformaInvoice.issueDate,
        dueDate: proformaInvoice.dueDate,
        items: proformaInvoice.items || [],
        subtotal: proformaInvoice.subtotal,
        tax: proformaInvoice.tax,
        total: proformaInvoice.total,
        status: "Unpaid",
        notes: `Converted from proforma invoice ${proformaInvoice.proformaInvoiceNo}${proformaInvoice.notes ? "\n" + proformaInvoice.notes : ""}`,
        createdAt: Timestamp.now(),
      });

      toast({
        title: "Converted",
        description: `Proforma invoice converted to Invoice ${invoiceNo}`,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editing) {
      toast({
        title: "Create proformaInvoice",
        description: "Use Add ProformaInvoice to open the full-page create form.",
      });
      return;
    }

    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.proformaInvoiceNo.trim()) {
      toast({ title: "Validation error", description: "ProformaInvoice number is required.", variant: "destructive" });
      return;
    }

    if (!formData.partyId) {
      toast({ title: "Validation error", description: "Select a party.", variant: "destructive" });
      return;
    }

    const subtotal = computedSubtotal;
    const tax = computedTax;
    if (subtotal < 0 || tax < 0) {
      toast({ title: "Validation error", description: "Amounts cannot be negative.", variant: "destructive" });
      return;
    }

    const sanitizedItems: ProformaInvoiceLineItem[] = lineItems
      .map((it) => ({
        processedInventoryId: (it.processedInventoryId || "").toString(),
        name: (it.name || "").toString(),
        unit: (it.unit || "").toString() || "pcs",
        quantity: Number(it.quantity) || 0,
        rate: Number(it.rate) || 0,
        taxType: it.taxType || "CGST / SGST",
        tax: Math.max(0, Number(it.tax) || 0),
      }))
      .filter((it) => it.name && it.quantity > 0);

    const payload = {
      proformaInvoiceNo: formData.proformaInvoiceNo.trim(),
      partyType: formData.partyType,
      partyId: formData.partyId,
      partyName: selectedParty?.name || "",
      issueDate: formData.issueDate,
      dueDate: formData.dueDate,
      items: sanitizedItems,
      subtotal,
      tax,
      total: computedTotal,
      status: formData.status,
      notes: formData.notes.trim(),
      updatedAt: Timestamp.now(),
    };

    setIsSubmitting(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "proformaInvoices", editing.id), payload);
        toast({ title: "Updated", description: "ProformaInvoice updated." });
      } else {
        await addDoc(collection(db, "proformaInvoices"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        toast({ title: "Saved", description: "ProformaInvoice saved to Firestore." });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchProformaInvoices();
    } catch (error) {
      console.error("Error saving proformaInvoice", error);
      toast({
        title: "Save failed",
        description: "Could not save proformaInvoice.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(
    () => [
      { key: "proformaInvoiceNo", header: "System ProformaInvoice" },
      { key: "issueDate", header: "Date" },
      { key: "partyName", header: "Customer" },
      {
        key: "quantity",
        header: "Quantity",
        render: (i: ProformaInvoiceRecord) => {
          const totalQty = (i.items || []).reduce((sum, x) => sum + (x.quantity || 0), 0);
          return <span className="font-medium">{totalQty.toFixed(2)}</span>;
        },
      },
      {
        key: "items",
        header: "Items",
        render: (i: ProformaInvoiceRecord) => {
          const label = (i.items || [])
            .map((x) => {
              const resolved = x.processedInventoryId ? processedInventoryById.get(x.processedInventoryId) : undefined;
              const name = resolved?.name || x.name;
              const unit = resolved?.unit || x.unit;
              return `${name} (${x.quantity} ${unit})`;
            })
            .join(", ");
          return <span className="text-sm text-muted-foreground">{label || "—"}</span>;
        },
      },
      {
        key: "total",
        header: "Total Amount",
        render: (i: ProformaInvoiceRecord) => <span className="font-medium">₹{(i.total || 0).toLocaleString("en-IN")}</span>,
      },
      { key: "status", header: "Status" },
      {
        key: "actions",
        header: "Actions",
        render: (i: ProformaInvoiceRecord) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(`/proformaInvoices/${i.id}/print`, "_blank", "noopener,noreferrer")}
              title="Print"
            >
              <Printer className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => handleConvertToInvoice(i)}
              title="Convert to Invoice"
            >
              <FileCheck className="w-4 h-4" />
              Convert
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(i)}>
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" className="gap-1" onClick={() => handleDelete(i.id)}>
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [processedInventoryById]
  );

  return (
    <>
      <AppHeader title="Proforma Invoices" subtitle="Create and manage proforma invoices" />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="ProformaInvoices"
            value={stats.count.toString()}
            change={"All proformaInvoices"}
            changeType="neutral"
            icon={FileText}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="Total"
            value={`₹${stats.total.toLocaleString("en-IN")}`}
            change={""}
            changeType="neutral"
            icon={IndianRupee}
            iconBgColor="bg-secondary"
            iconColor="text-foreground"
          />
          <StatCard
            title="Pending"
            value={`${stats.pendingCount}`}
            change={`₹${stats.pendingTotal.toLocaleString("en-IN")}`}
            changeType="negative"
            icon={FileText}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
          <StatCard
            title="Paid"
            value={`₹${stats.paidTotal.toLocaleString("en-IN")}`}
            change={""}
            changeType="positive"
            icon={IndianRupee}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
        </div>

        <Card className="p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search proforma invoice no, party, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-96"
              />
              <Button variant="outline" className="gap-2" onClick={fetchAll} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <ExportExcelButton rows={exportRows} fileName="proforma_invoices" sheetName="Proforma Invoices" label="Export" variant="outline" />
              <Button className="gap-2" onClick={() => navigate("/proforma-invoices/new")}>
                <Plus className="w-4 h-4" />
                New Proforma Invoice
              </Button>
            </div>
          </div>
        </Card>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4">
            <DataTable data={filtered} columns={columns} keyField="id" onRowClick={openEdit} />
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit ProformaInvoice</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proformaInvoiceNo">System ProformaInvoice</Label>
                <Input id="proformaInvoiceNo" value={formData.proformaInvoiceNo} onChange={(e) => setFormData((s) => ({ ...s, proformaInvoiceNo: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData((s) => ({ ...s, status: v as ProformaInvoiceStatus }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Party Type</Label>
                <Select
                  value={formData.partyType}
                  onValueChange={(v) => setFormData((s) => ({ ...s, partyType: v as ProformaInvoiceRecord["partyType"], partyId: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Party</Label>
                <Select value={formData.partyId} onValueChange={(v) => setFormData((s) => ({ ...s, partyId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={formData.partyType === "customer" ? "Select customer" : "Select supplier"} />
                  </SelectTrigger>
                  <SelectContent>
                    {partyOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input id="issueDate" type="date" value={formData.issueDate} onChange={(e) => setFormData((s) => ({ ...s, issueDate: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" type="date" value={formData.dueDate} onChange={(e) => setFormData((s) => ({ ...s, dueDate: e.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Items (from Processed Inventory)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLineItems((prev) => [
                        ...prev,
                        { processedInventoryId: "", name: "", unit: "pcs", quantity: 1, rate: 0, taxType: "CGST / SGST", tax: 0 },
                      ])
                    }
                  >
                    Add Item
                  </Button>
                </div>

                {lineItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No items added. You can still enter subtotal manually.</div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[260px]">Item</TableHead>
                          <TableHead className="w-[90px] text-right">Qty</TableHead>
                          <TableHead className="w-[80px]">Unit</TableHead>
                          <TableHead className="w-[110px] text-right">Rate</TableHead>
                          <TableHead className="w-[140px]">Type</TableHead>
                          <TableHead className="w-[110px] text-right">TAX (%)</TableHead>
                          <TableHead className="w-[110px] text-right">CGST (%)</TableHead>
                          <TableHead className="w-[110px] text-right">SGST (%)</TableHead>
                          <TableHead className="w-[110px] text-right">IGST (%)</TableHead>
                          <TableHead className="w-[120px] text-right">Tax Amt</TableHead>
                          <TableHead className="w-[130px] text-right">Amount</TableHead>
                          <TableHead className="w-[80px]" />
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {lineItems.map((it, idx) => {
                          const baseAmount = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
                          const taxPercent = Number(it.tax) || 0;
                          const type = it.taxType || "CGST / SGST";
                          const cgstPercent = type === "CGST / SGST" ? taxPercent / 2 : 0;
                          const sgstPercent = type === "CGST / SGST" ? taxPercent / 2 : 0;
                          const igstPercent = type === "IGST" ? taxPercent : 0;
                          const taxAmount = (baseAmount * taxPercent) / 100;
                          const amount = baseAmount + taxAmount;

                          return (
                            <TableRow key={idx}>
                              <TableCell className="align-top">
                                <Select
                                  value={it.processedInventoryId}
                                  onValueChange={(v) => {
                                    const selected = processedInventoryOptions.find((o) => o.id === v);
                                    setLineItems((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? {
                                              ...x,
                                              processedInventoryId: v,
                                              name: selected?.name || x.name,
                                              unit: selected?.unit || x.unit || "pcs",
                                            }
                                          : x
                                      )
                                    );
                                  }}
                                >
                                  <SelectTrigger className="min-w-[240px]">
                                    <SelectValue placeholder="Select processed item" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {processedInventoryOptions.map((o) => (
                                      <SelectItem key={o.id} value={o.id}>
                                        {o.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input
                                  className="w-[90px] text-right"
                                  type="number"
                                  inputMode="decimal"
                                  value={String(it.quantity)}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setLineItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: Number.isFinite(v) ? v : 0 } : x)));
                                  }}
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input className="w-[80px]" value={it.unit} readOnly />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input
                                  className="w-[110px] text-right"
                                  type="number"
                                  inputMode="decimal"
                                  value={String(it.rate)}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setLineItems((prev) => prev.map((x, i) => (i === idx ? { ...x, rate: Number.isFinite(v) ? v : 0 } : x)));
                                  }}
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Select value={type} onValueChange={(v) => setLineItems((prev) => prev.map((x, i) => (i === idx ? { ...x, taxType: v as any } : x)))}>
                                  <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="CGST / SGST">CGST / SGST</SelectItem>
                                    <SelectItem value="IGST">IGST</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>

                              <TableCell className="align-top">
                                <Input
                                  className="w-[110px] text-right"
                                  type="number"
                                  inputMode="decimal"
                                  value={String(it.tax ?? 0)}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setLineItems((prev) => prev.map((x, i) => (i === idx ? { ...x, tax: Number.isFinite(v) ? v : 0 } : x)));
                                  }}
                                />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input className="w-[110px] text-right bg-muted" value={cgstPercent.toFixed(2)} readOnly />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input className="w-[110px] text-right bg-muted" value={sgstPercent.toFixed(2)} readOnly />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input className="w-[110px] text-right bg-muted" value={igstPercent.toFixed(2)} readOnly />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input className="w-[120px] text-right bg-muted" value={taxAmount.toFixed(2)} readOnly />
                              </TableCell>

                              <TableCell className="align-top">
                                <Input className="w-[130px] text-right bg-muted" value={amount.toFixed(2)} readOnly />
                              </TableCell>

                              <TableCell className="align-top">
                                <Button type="button" variant="destructive" size="sm" onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}>
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtotal">Subtotal</Label>
                <Input
                  id="subtotal"
                  type="number"
                  inputMode="decimal"
                  value={computedSubtotal.toString()}
                  onChange={(e) => setFormData((s) => ({ ...s, subtotal: e.target.value }))}
                  placeholder="0"
                  readOnly={lineItems.length > 0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax">Tax</Label>
                <Input
                  id="tax"
                  type="number"
                  inputMode="decimal"
                  value={(lineItems.length ? computedTax : formData.tax).toString()}
                  onChange={(e) => {
                    if (lineItems.length) return;
                    setFormData((s) => ({ ...s, tax: e.target.value }));
                  }}
                  placeholder="0"
                  readOnly={lineItems.length > 0}
                />
              </div>

              <div className="space-y-2">
                <Label>Total</Label>
                <Input value={computedTotal.toString()} readOnly />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData((s) => ({ ...s, notes: e.target.value }))} placeholder="Optional notes" />
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
                {isSubmitting ? "Saving..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
