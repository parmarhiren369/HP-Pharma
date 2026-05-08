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
} from "@/lib/firestore-shim";
import { FileMinus, FilePlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

type NoteType = "Debit" | "Credit";

interface NoteRecord {
  id: string;
  noteType: NoteType;
  noteNo: string;
  date: string; // YYYY-MM-DD
  partyType: "customer" | "supplier";
  partyId: string;
  partyName: string;
  amount: number;
  relatedInvoiceNo: string;
  reason: string;
  transactionId?: string;
  createdAt?: Date;
}

interface PartyOption {
  id: string;
  name: string;
}

const defaultFormState = {
  noteType: "Debit" as NoteType,
  noteNo: "",
  date: new Date().toISOString().slice(0, 10),
  partyType: "customer" as NoteRecord["partyType"],
  partyId: "",
  amount: "",
  relatedInvoiceNo: "",
  reason: "",
};

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function noteToTransactionType(noteType: NoteType): "Income" | "Expense" {
  return noteType === "Debit" ? "Income" : "Expense";
}

export default function DebitCreditNotes() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);

  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoteRecord | null>(null);
  const [formData, setFormData] = useState(defaultFormState);

  const { toast } = useToast();

  const partyOptions = useMemo(() => (formData.partyType === "supplier" ? suppliers : customers), [customers, suppliers, formData.partyType]);
  const selectedParty = useMemo(() => partyOptions.find((p) => p.id === formData.partyId), [partyOptions, formData.partyId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) => `${n.noteNo} ${n.partyName} ${n.relatedInvoiceNo} ${n.noteType}`.toLowerCase().includes(q));
  }, [notes, search]);

  const stats = useMemo(() => {
    const debitTotal = notes.filter((n) => n.noteType === "Debit").reduce((sum, n) => sum + (n.amount || 0), 0);
    const creditTotal = notes.filter((n) => n.noteType === "Credit").reduce((sum, n) => sum + (n.amount || 0), 0);
    return {
      total: notes.length,
      debitTotal,
      creditTotal,
      net: debitTotal - creditTotal,
    };
  }, [notes]);

  const exportRows = useMemo(
    () =>
      filtered.map((n) => ({
        Type: n.noteType,
        "Note No": n.noteNo,
        Date: n.date,
        Party: n.partyName,
        Amount: n.amount,
        "Invoice No": n.relatedInvoiceNo,
        Reason: n.reason,
      })),
    [filtered]
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

  const fetchNotes = async () => {
    const qy = query(collection(db, "debitCreditNotes"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qy);
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        noteType: (data.noteType || "Debit") as NoteType,
        noteNo: (data.noteNo || "").toString(),
        date: (data.date || "").toString(),
        partyType: (data.partyType || "customer") as NoteRecord["partyType"],
        partyId: (data.partyId || "").toString(),
        partyName: (data.partyName || "").toString(),
        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount) || 0,
        relatedInvoiceNo: (data.relatedInvoiceNo || "").toString(),
        reason: (data.reason || "").toString(),
        transactionId: (data.transactionId || "").toString() || undefined,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as NoteRecord;
    });
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
      await Promise.all([fetchParties(), fetchNotes()]);
    } catch (error) {
      console.error("Error fetching debit/credit notes", error);
      toast({
        title: "Load failed",
        description: "Could not load debit/credit notes from Firestore.",
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

  const openEdit = (row: NoteRecord) => {
    setEditing(row);
    setFormData({
      noteType: row.noteType,
      noteNo: row.noteNo,
      date: row.date,
      partyType: row.partyType,
      partyId: row.partyId,
      amount: (row.amount ?? 0).toString(),
      relatedInvoiceNo: row.relatedInvoiceNo,
      reason: row.reason,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    if (!confirm("Delete this note?")) return;

    try {
      await deleteDoc(doc(db, "debitCreditNotes", id));
      toast({ title: "Deleted", description: "Note removed." });
      fetchNotes();
    } catch (error) {
      console.error("Error deleting note", error);
      toast({
        title: "Delete failed",
        description: "Could not delete note.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editing) {
      toast({
        title: "Create note",
        description: "Use Add Note to open the full-page create form.",
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

    if (!formData.noteNo.trim()) {
      toast({ title: "Validation error", description: "Note number is required.", variant: "destructive" });
      return;
    }

    if (!formData.partyId) {
      toast({ title: "Validation error", description: "Select a party.", variant: "destructive" });
      return;
    }

    const amount = safeNumber(formData.amount);
    if (amount <= 0) {
      toast({ title: "Validation error", description: "Amount must be greater than zero.", variant: "destructive" });
      return;
    }

    if (!formData.reason.trim()) {
      toast({ title: "Validation error", description: "Reason is required.", variant: "destructive" });
      return;
    }

    const payload = {
      noteType: formData.noteType,
      noteNo: formData.noteNo.trim(),
      date: formData.date,
      partyType: formData.partyType,
      partyId: formData.partyId,
      partyName: selectedParty?.name || "",
      amount,
      relatedInvoiceNo: formData.relatedInvoiceNo.trim(),
      reason: formData.reason.trim(),
      updatedAt: Timestamp.now(),
    };

    setIsSubmitting(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "debitCreditNotes", editing.id), payload);
        toast({ title: "Updated", description: "Note updated successfully." });
      } else {
        await addDoc(collection(db, "debitCreditNotes"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        toast({ title: "Saved", description: "Note saved successfully." });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchNotes();
    } catch (error) {
      console.error("Error saving note", error);
      toast({
        title: "Save failed",
        description: "Could not save note.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "noteType",
        header: "Type",
        render: (n: NoteRecord) => (
          <span className={n.noteType === "Debit" ? "text-warning font-medium" : "text-success font-medium"}>
            {n.noteType}
          </span>
        ),
      },
      { key: "noteNo", header: "Note No" },
      { key: "date", header: "Date" },
      { key: "partyName", header: "Party" },
      {
        key: "amount",
        header: "Amount",
        render: (n: NoteRecord) => <span className="font-medium">₹{(n.amount || 0).toLocaleString("en-IN")}</span>,
      },
      { key: "relatedInvoiceNo", header: "Invoice No" },
      { key: "reason", header: "Reason" },
      {
        key: "actions",
        header: "Actions",
        render: (n: NoteRecord) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(n)}>
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" className="gap-1" onClick={() => handleDelete(n.id)}>
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      <AppHeader title="Debit / Credit Notes" subtitle="Manage debit and credit notes" />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Notes"
            value={stats.total.toString()}
            change={"All notes"}
            changeType="neutral"
            icon={FilePlus}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="Debit"
            value={`₹${stats.debitTotal.toLocaleString("en-IN")}`}
            change={""}
            changeType="neutral"
            icon={FilePlus}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
          <StatCard
            title="Credit"
            value={`₹${stats.creditTotal.toLocaleString("en-IN")}`}
            change={""}
            changeType="positive"
            icon={FileMinus}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Net"
            value={`₹${stats.net.toLocaleString("en-IN")}`}
            change={stats.net >= 0 ? "Net debit" : "Net credit"}
            changeType={stats.net >= 0 ? "neutral" : "positive"}
            icon={FileMinus}
            iconBgColor="bg-secondary"
            iconColor="text-foreground"
          />
        </div>

        <Card className="p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search note no, party, invoice..."
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
              <ExportExcelButton rows={exportRows} fileName="debit-credit-notes" sheetName="Notes" label="Export" variant="outline" />
              <Button className="gap-2" onClick={() => navigate("/debit-credit-notes/new")}>
                <Plus className="w-4 h-4" />
                Add Note
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
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.noteType} onValueChange={(v) => setFormData((s) => ({ ...s, noteType: v as NoteType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Debit">Debit Note</SelectItem>
                    <SelectItem value="Credit">Credit Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="noteNo">Note No</Label>
                <Input id="noteNo" value={formData.noteNo} onChange={(e) => setFormData((s) => ({ ...s, noteNo: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={formData.date} onChange={(e) => setFormData((s) => ({ ...s, date: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label>Party Type</Label>
                <Select value={formData.partyType} onValueChange={(v) => setFormData((s) => ({ ...s, partyType: v as NoteRecord["partyType"], partyId: "" }))}>
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
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" inputMode="decimal" value={formData.amount} onChange={(e) => setFormData((s) => ({ ...s, amount: e.target.value }))} placeholder="0" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="relatedInvoiceNo">Related Invoice No</Label>
                <Input
                  id="relatedInvoiceNo"
                  value={formData.relatedInvoiceNo}
                  onChange={(e) => setFormData((s) => ({ ...s, relatedInvoiceNo: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" value={formData.reason} onChange={(e) => setFormData((s) => ({ ...s, reason: e.target.value }))} placeholder="Explain why this note is issued" />
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
