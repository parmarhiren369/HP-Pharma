import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Printer } from "lucide-react";

const COMPANY_NAME = "Haritany pharma";
const SYSTEM_NAME = "Haritany pharma - Quotation System";
const CURRENCY = "₹";

const QUOTATION_FROM = {
  name: COMPANY_NAME,
  pin: "—",
  address: "—",
  mobile: "—",
};

type QuotationLineItem = {
  name: string;
  unit: string;
  quantity: number;
  rate: number;
};

type QuotationDoc = {
  quotationNo: string;
  manualQuotationNo?: string;
  issueDate?: string;
  validUntil?: string;
  partyName?: string;
  partyType: "customer" | "supplier";
  lineItems?: QuotationLineItem[];
  total?: number;
  status?: string;
  notes?: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDateTimeWithSeconds(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} at ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `${CURRENCY} ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuotationPrint() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [quotation, setQuotation] = useState<QuotationDoc | null>(null);

  const lineRows = useMemo(() => {
    const items = Array.isArray(quotation?.lineItems) ? quotation?.lineItems : [];
    return items.map((it, idx) => {
      const qty = Number(it.quantity) || 0;
      const rate = Number(it.rate) || 0;
      const amount = qty * rate;
      return { idx: idx + 1, name: it.name, unit: it.unit, qty, rate, amount };
    });
  }, [quotation?.lineItems]);

  const total = useMemo(() => {
    if (typeof quotation?.total === "number") return quotation.total;
    return lineRows.reduce((s, r) => s + r.amount, 0);
  }, [quotation?.total, lineRows]);

  const printedAt = useMemo(() => new Date(), []);

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

      if (!quotationId) {
        toast({ title: "Invalid quotation", description: "Quotation id missing.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "quotations", quotationId));
        if (!snap.exists()) {
          toast({ title: "Not found", description: "Quotation not found.", variant: "destructive" });
          setQuotation(null);
          return;
        }
        const data = snap.data();
        // Read from 'items' field (how quotations are saved) or fallback to 'lineItems'
        const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.lineItems) ? data.lineItems : [];
        const mappedData = {
          ...data,
          lineItems: rawItems.map((item: any) => ({
            name: (item.name || "").toString(),
            unit: (item.unit || "pcs").toString(),
            quantity: typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity) || 0,
            rate: typeof item.rate === "number" ? item.rate : parseFloat(item.rate) || 0,
          })),
        } as QuotationDoc;
        console.log("Loaded quotation with", mappedData.lineItems?.length || 0, "line items");
        setQuotation(mappedData);
      } catch (e) {
        console.error("Failed to load quotation", e);
        toast({ title: "Load failed", description: "Could not load quotation.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [quotationId, toast]);

  useEffect(() => {
    if (!isLoading && quotation) {
      setTimeout(() => window.print(), 50);
    }
  }, [isLoading, quotation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto text-sm text-muted-foreground">Loading quotation…</div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Button variant="outline" onClick={() => navigate("/quotations")}>Back</Button>
          <div className="mt-4 text-sm text-muted-foreground">Quotation not available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-6 print:p-0 text-black">
      <div className="max-w-5xl mx-auto print:max-w-none print:mx-0 print:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/quotations")}>
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
            <div className="text-lg mt-1">QUOTATION</div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="border border-black p-3 text-sm">
              <div className="text-xs font-bold uppercase">From</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-semibold">Name:</span> {QUOTATION_FROM.name}
                </div>
                <div>
                  <span className="font-semibold">PIN:</span> {QUOTATION_FROM.pin}
                </div>
                <div className="whitespace-pre-wrap">
                  <span className="font-semibold">Address:</span> {QUOTATION_FROM.address}
                </div>
                <div>
                  <span className="font-semibold">Mobile:</span> {QUOTATION_FROM.mobile}
                </div>
              </div>
            </div>

            <div className="border border-black p-3 text-sm">
              <div className="text-xs font-bold uppercase">To</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-semibold">Name:</span> {quotation.partyName || "—"}
                </div>
                <div>
                  <span className="font-semibold">Type:</span> {quotation.partyType === "customer" ? "Customer" : "Supplier"}
                </div>
              </div>
            </div>

            <div className="border border-black p-3 text-sm">
              <div className="text-xs font-bold uppercase">Quotation Details</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-semibold">Quotation No:</span> {quotation.quotationNo || "—"}
                </div>
                {quotation.manualQuotationNo && (
                  <div>
                    <span className="font-semibold">Manual No:</span> {quotation.manualQuotationNo}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Date:</span> {quotation.issueDate || "—"}
                </div>
                {quotation.validUntil && (
                  <div>
                    <span className="font-semibold">Valid Until:</span> {quotation.validUntil}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Status:</span> {quotation.status || "Pending"}
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
                  <th className="border border-black px-2 py-1 text-center font-bold w-[100px]">Unit</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[110px]">Qty</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[140px]">Unit Price</th>
                  <th className="border border-black px-2 py-1 text-right font-bold w-[170px]">Amount</th>
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
                  lineRows.map((r) => (
                    <tr key={r.idx}>
                      <td className="border border-black px-2 py-1">{r.idx}</td>
                      <td className="border border-black px-2 py-1">{r.name}</td>
                      <td className="border border-black px-2 py-1 text-center">{r.unit}</td>
                      <td className="border border-black px-2 py-1 text-right">
                        {r.qty.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="border border-black px-2 py-1 text-right">{formatMoney(r.rate)}</td>
                      <td className="border border-black px-2 py-1 text-right">{formatMoney(r.amount)}</td>
                    </tr>
                  ))
                )}
                <tr>
                  <td className="border border-black px-2 py-2 text-right font-bold" colSpan={5}>
                    Total Amount:
                  </td>
                  <td className="border border-black px-2 py-2 text-right font-bold">
                    {formatMoney(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {quotation.notes && (
            <div className="mt-4 border border-black p-3">
              <div className="text-xs font-bold uppercase mb-2">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{quotation.notes}</div>
            </div>
          )}

          <div className="mt-6 flex flex-col min-h-[25vh]">
            <div className="mt-auto">
              <Separator className="my-4 bg-black" />
              <div className="text-xs space-y-1">
                <div>This quotation was generated on {formatDateTimeWithSeconds(printedAt)}</div>
                <div>{SYSTEM_NAME}</div>
                <div className="mt-2 italic text-muted-foreground">
                  This is a system-generated quotation and does not require a signature.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
