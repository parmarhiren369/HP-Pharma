import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, Timestamp, writeBatch } from "firebase/firestore";
import { ArrowLeft, FilePlus } from "lucide-react";

type NoteType = "Debit" | "Credit";

interface PartyOption {
  id: string;
  name: string;
}

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function generateNoteNo(noteType: NoteType, date: string, suffix: string): string {
  const prefix = noteType === "Credit" ? "CN" : "DN";
  const ymd = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  return `${prefix}-${ymd}-${suffix}`;
}

function noteToTransactionType(noteType: NoteType): "Income" | "Expense" {
  // App-wide simplification:
  // - Debit note increases amount to receive -> Income
  // - Credit note decreases amount to receive -> Expense
  return noteType === "Debit" ? "Income" : "Expense";
}

export default function DebitCreditNoteNew() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [noteType, setNoteType] = useState<NoteType>("Debit");
  const [noteNoSuffix] = useState(() => Math.random().toString(36).slice(2, 6).toUpperCase());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyType, setPartyType] = useState<"customer" | "supplier">("customer");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [relatedInvoiceNo, setRelatedInvoiceNo] = useState("");
  const [reason, setReason] = useState("");

  const noteNo = useMemo(() => generateNoteNo(noteType, date, noteNoSuffix), [date, noteNoSuffix, noteType]);

  const partyOptions = useMemo(() => (partyType === "supplier" ? suppliers : customers), [customers, suppliers, partyType]);
  const selectedParty = useMemo(() => partyOptions.find((p) => p.id === partyId) || null, [partyOptions, partyId]);

  const fetchParties = async () => {
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
    } catch (error) {
      console.error("Error loading parties", error);
      toast({ title: "Load failed", description: "Could not load customers/suppliers.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchParties();
  }, []);

  useEffect(() => {
    setPartyId("");
  }, [partyType]);

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

    if (!partyId) {
      toast({ title: "Validation error", description: "Select a party.", variant: "destructive" });
      return;
    }

    const numericAmount = safeNumber(amount);
    if (numericAmount <= 0) {
      toast({ title: "Validation error", description: "Amount must be greater than zero.", variant: "destructive" });
      return;
    }

    if (!reason.trim()) {
      toast({ title: "Validation error", description: "Reason is required.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const notesRef = collection(db, "debitCreditNotes");

      const noteDoc = doc(notesRef);

      const trimmedRelatedInvoiceNo = relatedInvoiceNo.trim();
      const partyName = selectedParty?.name || "";

      // Save the debit/credit note
      // Note: Debit/credit notes adjust party balances but don't create bank/cash transactions
      // They are tracked separately and used in payment calculations
      batch.set(noteDoc, {
        noteType,
        noteNo,
        date,
        partyType,
        partyId,
        partyName,
        amount: numericAmount,
        relatedInvoiceNo: trimmedRelatedInvoiceNo,
        reason: reason.trim(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      await batch.commit();

      toast({ 
        title: "Saved", 
        description: `${noteType} note created successfully. This will adjust the party balance.` 
      });
      navigate("/debit-credit-notes");
    } catch (error) {
      console.error("Error saving note", error);
      toast({ title: "Save failed", description: "Could not save note.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AppHeader title="New Debit / Credit Note" subtitle="Create a new note" />

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <FilePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold">Create New Debit/Credit Note</div>
              <div className="text-sm text-muted-foreground">All fields will be stored in Firestore.</div>
            </div>
          </div>

          <Button variant="outline" className="gap-2" onClick={() => navigate("/debit-credit-notes")} disabled={isSubmitting}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Note Type</Label>
                <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
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
                <Label>Note No (Auto)</Label>
                <Input value={noteNo} readOnly />
                <p className="text-xs text-muted-foreground">Generated automatically based on Type + Date.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Party Type</Label>
                <Select value={partyType} onValueChange={(v) => setPartyType(v as "customer" | "supplier")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select party type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Party *</Label>
                <Select value={partyId} onValueChange={setPartyId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Loading..." : partyType === "customer" ? "Select customer" : "Select supplier"} />
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
                <Label htmlFor="amount">Amount *</Label>
                <Input id="amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </div>

              <div className="space-y-2 lg:col-span-3">
                <Label htmlFor="relatedInvoiceNo">Related Invoice No</Label>
                <Input id="relatedInvoiceNo" value={relatedInvoiceNo} onChange={(e) => setRelatedInvoiceNo(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this note is issued" />
            </div>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/debit-credit-notes")} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
