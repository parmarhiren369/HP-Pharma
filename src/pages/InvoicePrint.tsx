import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Printer } from "lucide-react";

const COMPANY_NAME = "Haritany pharma";
const SYSTEM_NAME = "Haritany pharma - Invoice System";
const CURRENCY = "₹";

// These can later be moved to Settings/Firestore.
const INVOICE_FROM = {
  name: COMPANY_NAME,
  pin: "—",
  address: "—",
  mobile: "—",
};

type InvoiceLineItem = {
  processedInventoryId?: string;
  name: string;
  unit: string;
  quantity: number;
  rate: number;
};

type InvoiceDoc = {
  invoiceNo: string;
  manualInvoiceNo?: string;
  cuNumber?: string;
  pin?: string;
  issueDate?: string;
  partyName?: string;
  customer?: {
    gst?: string;
    address?: string;
    phone?: string;
    email?: string;
    pin?: string;
  };
  items?: InvoiceLineItem[];
  subtotal?: number;
  taxPercent?: number;
  tax?: number;
  total?: number;
  status?: string;
  notes?: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDateTime(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateTimeWithSeconds(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} at ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `${CURRENCY} ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoicePrint() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceDoc | null>(null);

  const lineRows = useMemo(() => {
    const items = Array.isArray(invoice?.items) ? invoice?.items : [];
    return items.map((it, idx) => {
      const qty = Number(it.quantity) || 0;
      const rate = Number(it.rate) || 0;
      const amount = qty * rate;
      return { idx: idx + 1, name: it.name, unit: it.unit, qty, rate, amount };
    });
  }, [invoice?.items]);

  const subtotal = useMemo(() => {
    if (typeof invoice?.subtotal === "number") return invoice.subtotal;
    return lineRows.reduce((s, r) => s + r.amount, 0);
  }, [invoice?.subtotal, lineRows]);

  const taxAmount = useMemo(() => {
    if (typeof invoice?.tax === "number") return invoice.tax;
    const pct = typeof invoice?.taxPercent === "number" ? invoice.taxPercent : 0;
    return (subtotal * pct) / 100;
  }, [invoice?.tax, invoice?.taxPercent, subtotal]);

  const taxPercentLabel = useMemo(() => {
    const pct = typeof invoice?.taxPercent === "number" ? invoice.taxPercent : undefined;
    if (typeof pct === "number" && Number.isFinite(pct)) return `${pct}%`;
    return undefined;
  }, [invoice?.taxPercent]);

  const printedAt = useMemo(() => new Date(), []);

  const total = useMemo(() => {
    if (typeof invoice?.total === "number") return invoice.total;
    return subtotal + taxAmount;
  }, [invoice?.total, subtotal, taxAmount]);

  const taxSummaryRows = useMemo(() => {
    const pct = typeof invoice?.taxPercent === "number" && Number.isFinite(invoice.taxPercent) ? invoice.taxPercent : 16;
    return [
      { rate: `${pct}%`, taxable: subtotal, tax: taxAmount, total },
      { rate: "0%", taxable: 0, tax: 0, total: 0 },
      { rate: "Ex.", taxable: 0, tax: 0, total: 0 },
    ];
  }, [invoice?.taxPercent, subtotal, taxAmount, total]);

  useEffect(() => {
    const run = async () => {
      if (!db) {
        toast({
          title: "Database unavailable",
          description: "Firebase is not initialized. Please check your environment variables.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (!invoiceId) {
        toast({ title: "Invalid invoice", description: "Invoice id missing.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "invoices", invoiceId));
        if (!snap.exists()) {
          toast({ title: "Not found", description: "Invoice not found.", variant: "destructive" });
          setInvoice(null);
          return;
        }
        setInvoice(snap.data() as InvoiceDoc);
      } catch (e) {
        console.error("Failed to load invoice", e);
        toast({ title: "Load failed", description: "Could not load invoice.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [invoiceId, toast]);

  useEffect(() => {
    if (!isLoading && invoice) {
      // Auto-open print dialog for a one-click workflow.
      // User can cancel and still see the preview.
      setTimeout(() => window.print(), 50);
    }
  }, [isLoading, invoice]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto text-sm text-muted-foreground">Loading invoice…</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Button variant="outline" onClick={() => navigate("/invoices")}>Back</Button>
          <div className="mt-4 text-sm text-muted-foreground">Invoice not available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-6 print:p-0 text-black">
      <div className="max-w-5xl mx-auto print:max-w-none print:mx-0 print:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/invoices")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>

        <div className="p-0">
          <div className="text-center">
            <div className="text-2xl font-bold">{COMPANY_NAME}</div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="border border-black p-3 text-sm">
              <div className="text-xs font-bold uppercase">Invoice From</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-semibold">Name:</span> {INVOICE_FROM.name}
                </div>
                <div>
                  <span className="font-semibold">PIN:</span> {INVOICE_FROM.pin}
                </div>
                <div className="whitespace-pre-wrap">
                  <span className="font-semibold">Address:</span> {INVOICE_FROM.address}
                </div>
                <div>
                  <span className="font-semibold">Mobile:</span> {INVOICE_FROM.mobile}
                </div>
              </div>
            </div>

            <div className="border border-black p-3 text-sm">
              <div className="text-xs font-bold uppercase">Invoice To</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-semibold">Name:</span> {invoice.partyName || "—"}
                </div>
                <div>
                  <span className="font-semibold">PIN:</span> {invoice.customer?.pin || invoice.pin || "—"}
                </div>
                <div className="whitespace-pre-wrap">
                  <span className="font-semibold">Address:</span> {invoice.customer?.address || "—"}
                </div>
                <div>
                  <span className="font-semibold">Mobile:</span> {invoice.customer?.phone || "—"}
                </div>
              </div>
            </div>

            <div className="border border-black p-3 text-sm">
              <div className="text-xs font-bold uppercase">Invoice No</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-semibold">Invoice:</span> {invoice.invoiceNo || "—"}
                </div>
                <div>
                  <span className="font-semibold">Manual:</span> {invoice.manualInvoiceNo || "—"}
                </div>
                <div>
                  <span className="font-semibold">Date:</span> {invoice.issueDate || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <table className="w-full border-collapse border border-black text-[12px]">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1 text-left font-bold w-[60px]">SNo</th>
                  <th className="border border-black px-2 py-1 text-left font-bold">Item Description</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[110px]">Qty</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[140px]">Unit Price</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[90px]">Rate</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[170px]">Amt incl. Tax</th>
                </tr>
              </thead>
              <tbody>
                {lineRows.length === 0 ? (
                  <tr>
                    <td className="border border-black px-2 py-2" colSpan={6}>
                      No items
                    </td>
                  </tr>
                ) : (
                  lineRows.map((r) => {
                    const base = r.amount;
                    const allocTax = subtotal > 0 ? (base / subtotal) * taxAmount : 0;
                    const amtInclTax = base + allocTax;
                    return (
                      <tr key={r.idx}>
                        <td className="border border-black px-2 py-1">{r.idx}</td>
                        <td className="border border-black px-2 py-1">{r.name}</td>
                        <td className="border border-black px-2 py-1 text-right">
                          {r.qty.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="border border-black px-2 py-1 text-right">{formatMoney(r.rate)}</td>
                        <td className="border border-black px-2 py-1 text-right">{taxPercentLabel || "0%"}</td>
                        <td className="border border-black px-2 py-1 text-right">{formatMoney(amtInclTax)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col min-h-[55vh]">
            <div className="mt-auto">
              <div className="border border-black p-2">
                <div className="text-xs font-bold uppercase text-left">TAX SUMMARY</div>
                <div className="mt-2">
                  <table className="w-full border-collapse border border-black text-[11px]">
                    <thead>
                      <tr>
                        <th className="border border-black px-2 py-1 text-left font-bold">Tax Rate</th>
                        <th className="border border-black px-2 py-1 text-right font-bold">Taxable Amt</th>
                        <th className="border border-black px-2 py-1 text-right font-bold">Tax Amt</th>
                        <th className="border border-black px-2 py-1 text-right font-bold">Total Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxSummaryRows.map((r, idx) => (
                        <tr key={idx}>
                          <td className="border border-black px-2 py-1">{r.rate}</td>
                          <td className="border border-black px-2 py-1 text-right">{formatMoney(r.taxable)}</td>
                          <td className="border border-black px-2 py-1 text-right">{formatMoney(r.tax)}</td>
                          <td className="border border-black px-2 py-1 text-right">{formatMoney(r.total)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="border border-black px-2 py-1 font-bold">Totals</td>
                        <td className="border border-black px-2 py-1 text-right font-bold">{formatMoney(subtotal)}</td>
                        <td className="border border-black px-2 py-1 text-right font-bold">{formatMoney(taxAmount)}</td>
                        <td className="border border-black px-2 py-1 text-right font-bold">{formatMoney(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <Separator className="my-4 bg-black" />
              <div className="text-xs space-y-1">
                <div>This invoice was generated on {formatDateTimeWithSeconds(printedAt)}</div>
                <div>{SYSTEM_NAME}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
