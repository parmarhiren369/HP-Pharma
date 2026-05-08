import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "@/lib/firestore-shim";
import { ArrowLeft, Printer } from "lucide-react";

const COMPANY_NAME = "Haritany pharma";
const COMPANY_ADDRESS = "";
const COMPANY_TAX = "";
const CURRENCY = "₹";

type PaymentDoc = {
  date?: string;
  partyName?: string;
  partyType?: "customer" | "supplier" | "other";
  amount?: number;
  method?: string;
  reference?: string;
  bankAccountName?: string;
  cashAccountName?: string;
  notes?: string;
  status?: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function formatMoney(n?: number): string {
  const value = Number.isFinite(n) ? (n as number) : 0;
  return `${CURRENCY} ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentPrint() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [payment, setPayment] = useState<PaymentDoc | null>(null);

  const printedAt = useMemo(() => new Date(), []);

  useEffect(() => {
    const load = async () => {
      if (!paymentId) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(db, "payments", paymentId));
        if (!snap.exists()) {
          toast({ title: "Not found", description: "Payment record not found.", variant: "destructive" });
          return;
        }
        setPayment(snap.data() as PaymentDoc);
        // Auto-print after content loads
        setTimeout(() => {
          window.print();
        }, 500);
      } catch (error) {
        console.error("Error loading payment", error);
        toast({ title: "Load failed", description: "Could not load payment.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [paymentId, toast]);

  const handlePrint = () => {
    window.print();
  };

  const partyLabel = useMemo(() => {
    if (payment?.partyType === "supplier") return "Supplier";
    if (payment?.partyType === "customer") return "Customer";
    return "Party";
  }, [payment?.partyType]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black">
        Loading...
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black">
        Payment not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-6 print:p-0 text-black">
      <div className="max-w-4xl mx-auto print:max-w-none print:mx-0 print:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 print:hidden">
          <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button className="gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-bold uppercase">{COMPANY_NAME}</div>
            {COMPANY_ADDRESS ? (
              <div className="text-xs text-muted-foreground whitespace-pre-line">{COMPANY_ADDRESS}</div>
            ) : null}
            {COMPANY_TAX ? (
              <div className="text-xs text-muted-foreground">{COMPANY_TAX}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">Statement</div>
            <div className="border px-3 py-1 text-sm font-semibold inline-block">
              {formatDate(payment.date)}
            </div>
          </div>
        </div>

        <div className="mt-4 border">
          <div className="p-3 text-sm">
            <div className="font-semibold">To</div>
            <div className="mt-1 font-bold uppercase">{payment.partyName || "—"}</div>
            <div className="text-xs text-muted-foreground">{partyLabel}</div>
          </div>
        </div>

        <div className="mt-3 border">
          <div className="grid grid-cols-2 text-xs">
            <div className="p-2 border-r">
              <div className="text-muted-foreground">Payment Method</div>
              <div className="font-semibold text-sm">{payment.method || "—"}</div>
            </div>
            <div className="p-2">
              <div className="text-muted-foreground">Reference</div>
              <div className="font-semibold text-sm">{payment.reference || "—"}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 text-xs border-t">
            <div className="p-2 border-r">
              <div className="text-muted-foreground">Account</div>
              <div className="font-semibold text-sm">
                {payment.bankAccountName || payment.cashAccountName || "—"}
              </div>
            </div>
            <div className="p-2">
              <div className="text-muted-foreground">Status</div>
              <div className="font-semibold text-sm">{payment.status || "—"}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 border">
          <div className="grid grid-cols-4 text-xs font-semibold bg-muted/20 border-b">
            <div className="p-2 border-r">Date</div>
            <div className="p-2 border-r">Transaction</div>
            <div className="p-2 border-r text-right">Amount</div>
            <div className="p-2 text-right">Balance</div>
          </div>
          <div className="grid grid-cols-4 text-sm border-b">
            <div className="p-2 border-r">{formatDate(payment.date)}</div>
            <div className="p-2 border-r">Opening Balance</div>
            <div className="p-2 border-r text-right">{formatMoney(0)}</div>
            <div className="p-2 text-right">{formatMoney(0)}</div>
          </div>
          <div className="grid grid-cols-4 text-sm">
            <div className="p-2 border-r">{formatDate(payment.date)}</div>
            <div className="p-2 border-r">Payment {payment.method ? `(${payment.method})` : ""}</div>
            <div className="p-2 border-r text-right">{formatMoney(payment.amount)}</div>
            <div className="p-2 text-right">{formatMoney(payment.amount)}</div>
          </div>
        </div>

        <div className="mt-3 border">
          <div className="grid grid-cols-6 text-[11px] font-semibold bg-muted/20 border-b">
            <div className="p-2 border-r">Current</div>
            <div className="p-2 border-r">1-30 Days</div>
            <div className="p-2 border-r">31-60 Days</div>
            <div className="p-2 border-r">61-90 Days</div>
            <div className="p-2 border-r">90+ Days</div>
            <div className="p-2 text-right">Amount Due</div>
          </div>
          <div className="grid grid-cols-6 text-sm">
            <div className="p-2 border-r text-right">{formatMoney(0)}</div>
            <div className="p-2 border-r text-right">{formatMoney(0)}</div>
            <div className="p-2 border-r text-right">{formatMoney(0)}</div>
            <div className="p-2 border-r text-right">{formatMoney(0)}</div>
            <div className="p-2 border-r text-right">{formatMoney(0)}</div>
            <div className="p-2 text-right font-semibold">{formatMoney(payment.amount)}</div>
          </div>
        </div>

        {payment.notes ? (
          <div className="mt-4 text-sm">
            <div className="font-semibold">Notes</div>
            <div className="text-muted-foreground">{payment.notes}</div>
          </div>
        ) : null}

        <div className="mt-10 text-xs text-muted-foreground text-center">
          Generated on {printedAt.toLocaleString("en-IN")}
        </div>
      </div>
    </div>
  );
}
