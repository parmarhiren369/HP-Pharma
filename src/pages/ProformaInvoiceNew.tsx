import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { addDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import { ArrowLeft, Check, ChevronsUpDown, FileText, Plus, Trash2 } from "lucide-react";

type ProformaInvoiceStatus = "Approved" | "In Process";

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

interface PartyOption {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gst?: string;
}

interface ProformaInvoiceFormState {
  proformaInvoiceNo: string;
  manualProformaInvoiceNo: string;
  partyId: string;
  issueDate: string;
  subtotal: string;
  taxPercent: string;
  status: ProformaInvoiceStatus;
  notes: string;
}

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function generateSystemProformaInvoiceNo(date: string): string {
  const ymd = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PI-${ymd}-${suffix}`;
}

export default function ProformaInvoiceNew() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [processedInventoryOptions, setProcessedInventoryOptions] = useState<ProcessedInventoryOption[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<ProformaInvoiceFormState>({
    proformaInvoiceNo: "",
    manualProformaInvoiceNo: "",
    partyId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    subtotal: "",
    taxPercent: "0",
    status: "In Process",
    notes: "",
  });

  const [lineItems, setLineItems] = useState<ProformaInvoiceLineItem[]>([]);

  const selectedCustomer = useMemo(() => customers.find((p) => p.id === formData.partyId) || null, [customers, formData.partyId]);

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

  const computedTaxAmount = useMemo(() => {
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
    const pct = safeNumber(formData.taxPercent);
    return Math.max(0, (computedSubtotal * pct) / 100);
  }, [computedSubtotal, formData.taxPercent, lineItems]);

  const computedTotal = useMemo(() => {
    return Math.max(0, computedSubtotal + computedTaxAmount);
  }, [computedSubtotal, computedTaxAmount]);

  const fetchOptions = async () => {
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
      const [customersSnap, processedInvSnap] = await Promise.all([
        getDocs(collection(db, "customers")),
        getDocs(collection(db, "processedInventory")),
      ]);

      const customersList = customersSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: (data.name || "").toString(),
            address: (data.address || "").toString() || undefined,
            phone: (data.phone || "").toString() || undefined,
            email: (data.email || "").toString() || undefined,
            gst: (data.gst || "").toString() || undefined,
          } as PartyOption;
        })
        .filter((x) => x.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      const processedList = processedInvSnap.docs
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

      setCustomers(customersList);
      setProcessedInventoryOptions(processedList);
    } catch (error) {
      console.error("Error loading proformaInvoice options", error);
      toast({ title: "Load failed", description: "Could not load customers/suppliers/items.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    setFormData((s) => {
      if (s.proformaInvoiceNo) return s;
      return { ...s, proformaInvoiceNo: generateSystemProformaInvoiceNo(s.issueDate) };
    });
  }, []);

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

    if (!formData.proformaInvoiceNo.trim()) {
      toast({ title: "Validation error", description: "ProformaInvoice number is required.", variant: "destructive" });
      return;
    }

    if (!formData.manualProformaInvoiceNo.trim()) {
      toast({ title: "Validation error", description: "Manual proformaInvoice number is required.", variant: "destructive" });
      return;
    }

    if (!formData.partyId) {
      toast({ title: "Validation error", description: "Select a customer.", variant: "destructive" });
      return;
    }

    const taxPercent = safeNumber(formData.taxPercent);
    const effectiveTaxPercent = lineItems.length ? 0 : taxPercent;
    if (computedSubtotal < 0 || effectiveTaxPercent < 0 || computedTaxAmount < 0) {
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
      .filter((it) => it.processedInventoryId && it.name && it.quantity > 0);

    if (lineItems.length > 0 && sanitizedItems.length === 0) {
      toast({
        title: "Validation error",
        description: "Please select processed inventory item(s) and enter quantity.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      proformaInvoiceNo: formData.proformaInvoiceNo.trim(),
      manualProformaInvoiceNo: formData.manualProformaInvoiceNo.trim(),
      partyType: "customer" as const,
      partyId: formData.partyId,
      partyName: selectedCustomer?.name || "",
      customer: {
        address: selectedCustomer?.address || "",
        phone: selectedCustomer?.phone || "",
        email: selectedCustomer?.email || "",
        gst: selectedCustomer?.gst || "",
      },
      issueDate: formData.issueDate,
      items: sanitizedItems,
      subtotal: computedSubtotal,
      taxPercent: effectiveTaxPercent,
      tax: computedTaxAmount,
      total: computedTotal,
      status: formData.status,
      notes: formData.notes.trim(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    setIsSubmitting(true);
    try {
      // Proforma invoices do NOT deduct from inventory
      await addDoc(collection(db, "proformaInvoices"), payload);

      toast({ title: "Saved", description: "Proforma Invoice saved successfully (no inventory deducted)." });
      navigate("/proforma-invoices");
    } catch (error) {
      console.error("Error saving proformaInvoice", error);
      const msg = error instanceof Error ? error.message : "Could not save proformaInvoice.";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AppHeader title="New Proforma Invoice" subtitle="Create proforma invoice" />

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold">Create New Proforma Invoice</div>
              <div className="text-sm text-muted-foreground">This will be stored in Firestore.</div>
            </div>
          </div>

          <Button variant="outline" className="gap-2" onClick={() => navigate("/proforma-invoices")} disabled={isSubmitting}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proformaInvoiceNo">System ProformaInvoice No</Label>
                <Input id="proformaInvoiceNo" value={formData.proformaInvoiceNo} readOnly disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manualProformaInvoiceNo">Manual ProformaInvoice No *</Label>
                <Input
                  id="manualProformaInvoiceNo"
                  value={formData.manualProformaInvoiceNo}
                  onChange={(e) => setFormData((s) => ({ ...s, manualProformaInvoiceNo: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Customer *</Label>
                <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerPickerOpen}
                      className="w-full justify-between"
                      disabled={isLoading}
                    >
                      {selectedCustomer?.name || (isLoading ? "Loading..." : "Select customer")}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search customer..." />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          {customers.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setFormData((s) => ({ ...s, partyId: c.id }));
                                setCustomerPickerOpen(false);
                              }}
                            >
                              <Check className={"mr-2 h-4 w-4 " + (formData.partyId === c.id ? "opacity-100" : "opacity-0")} />
                              {c.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date (ProformaInvoice)</Label>
                <Input id="issueDate" type="date" value={formData.issueDate} onChange={(e) => setFormData((s) => ({ ...s, issueDate: e.target.value }))} />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-semibold mb-3">Customer Details</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST No</Label>
                <Input value={selectedCustomer?.gst || ""} readOnly disabled={!selectedCustomer} />
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={selectedCustomer?.phone || ""} readOnly disabled={!selectedCustomer} />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={selectedCustomer?.email || ""} readOnly disabled={!selectedCustomer} />
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea value={selectedCustomer?.address || ""} readOnly disabled={!selectedCustomer} />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="font-semibold">Items (from Processed Inventory)</div>
                <div className="text-sm text-muted-foreground">Add items; subtotal auto-calculates</div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  setLineItems((prev) => [
                    ...prev,
                    { processedInventoryId: "", name: "", unit: "pcs", quantity: 1, rate: 0, taxType: "CGST / SGST", tax: 0 },
                  ])
                }
              >
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>

            {lineItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">No items added. You can still enter subtotal manually below.</div>
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
                      <TableHead className="w-[60px]" />
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
                            <Select value={it.unit} onValueChange={(v) => setLineItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unit: v } : x)))}>
                              <SelectTrigger className="w-[80px]">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pcs">pcs</SelectItem>
                                <SelectItem value="kg">kg</SelectItem>
                                <SelectItem value="gm">gm</SelectItem>
                                <SelectItem value="ltr">ltr</SelectItem>
                                <SelectItem value="ml">ml</SelectItem>
                                <SelectItem value="box">box</SelectItem>
                              </SelectContent>
                            </Select>
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="font-semibold mb-3">Other Details</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData((s) => ({ ...s, status: v as ProformaInvoiceStatus }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="In Process">In Process</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData((s) => ({ ...s, notes: e.target.value }))} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label>Total</Label>
                <Input value={computedTotal.toString()} readOnly />
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/proforma-invoices")} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Proforma Invoice"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
