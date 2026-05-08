import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { DataTable } from "@/components/tables/DataTable";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from "firebase/firestore";
import { ArrowLeft, RefreshCw } from "lucide-react";

interface ItemRecord {
  id: string;
  code: string;
  name: string;
  openingBalance: number;
  unit: string;
  notes?: string;
}

interface PurchaseLite {
  itemId: string;
  date: string; // YYYY-MM-DD
  quantity: number;
  totalPrice: number; // per-unit price
}

interface BatchLite {
  batchDate: string; // YYYY-MM-DD
  items: Array<{ rawItemId: string; useQuantity: number }>;
}

interface RawInventoryLite {
  id: string;
  itemCode?: string;
  name?: string;
}

type MonthRow = {
  month: string;
  inQty: number;
  outQty: number;
  availableQty: number;
  unit: string;
  lastUnitPrice: number;
  stockValue: number;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function lastDayOfMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

export default function ItemMonthlyReport() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [item, setItem] = useState<ItemRecord | null>(null);
  const [purchases, setPurchases] = useState<PurchaseLite[]>([]);
  const [batches, setBatches] = useState<BatchLite[]>([]);
  const [rawIds, setRawIds] = useState<string[]>([]);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [isLoading, setIsLoading] = useState(false);
  const [reportRun, setReportRun] = useState(0);

  const months = useMemo(
    () => [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    []
  );

  const fetchAll = async () => {
    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    if (!itemId) {
      toast({ title: "Missing item", description: "No item selected.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const itemSnap = await getDoc(doc(db, "items", itemId));
      if (!itemSnap.exists()) {
        toast({ title: "Not found", description: "Item not found.", variant: "destructive" });
        setItem(null);
        return;
      }

      const itemData = itemSnap.data();
      const resolvedItem: ItemRecord = {
        id: itemSnap.id,
        code: (itemData.code || "").toString(),
        name: (itemData.name || "").toString(),
        openingBalance:
          typeof itemData.openingBalance === "number" ? itemData.openingBalance : parseFloat(itemData.openingBalance) || 0,
        unit: (itemData.unit || "pcs").toString(),
        notes: (itemData.notes || "").toString() || undefined,
      };
      setItem(resolvedItem);

      // Purchases: keep query simple to avoid composite index requirements; filter by year in memory.
      const purchasesSnap = await getDocs(query(collection(db, "purchases"), where("itemId", "==", itemId)));
      const purchasesList: PurchaseLite[] = purchasesSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            itemId: (data.itemId || "").toString(),
            date: (data.date || "").toString(),
            quantity: typeof data.quantity === "number" ? data.quantity : parseFloat(data.quantity) || 0,
            totalPrice: typeof data.totalPrice === "number" ? data.totalPrice : parseFloat(data.totalPrice) || 0,
          } as PurchaseLite;
        })
        .filter((p) => p.date);
      setPurchases(purchasesList);

      // Raw inventory IDs for this item code (used to compute outQty from batches)
      const rawSnap = await getDocs(query(collection(db, "rawInventory"), where("itemCode", "==", resolvedItem.code)));
      let ids = rawSnap.docs.map((d) => d.id);

      // Fallback: if no rawInventory entries exist yet, try matching by name (client-side) so the report still works.
      if (ids.length === 0) {
        const allRawSnap = await getDocs(collection(db, "rawInventory"));
        const allRaw: RawInventoryLite[] = allRawSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            itemCode: (data.itemCode || "").toString() || undefined,
            name: (data.name || "").toString() || undefined,
          };
        });
        ids = allRaw
          .filter((r) => (r.name || "").toLowerCase() === resolvedItem.name.toLowerCase())
          .map((r) => r.id);
      }
      setRawIds(ids);

      // Batches for selected year
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const batchesSnap = await getDocs(
        query(collection(db, "batches"), where("batchDate", ">=", start), where("batchDate", "<=", end))
      );
      const batchesList: BatchLite[] = batchesSnap.docs
        .map((d) => {
          const data = d.data();
          const items = Array.isArray(data.items) ? data.items : [];
          return {
            batchDate: (data.batchDate || "").toString(),
            items: items
              .map((it: any) => ({
                rawItemId: (it.rawItemId || "").toString(),
                useQuantity: typeof it.useQuantity === "number" ? it.useQuantity : parseFloat(it.useQuantity) || 0,
              }))
              .filter((it: any) => it.rawItemId),
          } as BatchLite;
        })
        .filter((b) => b.batchDate);
      setBatches(batchesList);

      setReportRun((v) => v + 1);
    } catch (error) {
      console.error("Error loading item report", error);
      toast({
        title: "Load failed",
        description: "Could not load item monthly report data from Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, year]);

  const yearPurchases = useMemo(() => {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return purchases.filter((p) => p.date >= start && p.date <= end);
  }, [purchases, year]);

  const rows: MonthRow[] = useMemo(() => {
    if (!item) return [];

    const rawIdSet = new Set(rawIds);

    let runningAvailable = item.openingBalance || 0;

    return months.map((monthName, idx) => {
      const monthNumber = idx + 1;
      const monthStart = `${year}-${pad2(monthNumber)}-01`;
      const monthEnd = `${year}-${pad2(monthNumber)}-${pad2(lastDayOfMonth(year, monthNumber))}`;

      const inQty = yearPurchases
        .filter((p) => p.date >= monthStart && p.date <= monthEnd)
        .reduce((sum, p) => sum + (p.quantity || 0), 0);

      const outQty = batches
        .filter((b) => b.batchDate >= monthStart && b.batchDate <= monthEnd)
        .reduce((sum, b) => {
          const used = b.items.reduce((s, it) => (rawIdSet.has(it.rawItemId) ? s + (it.useQuantity || 0) : s), 0);
          return sum + used;
        }, 0);

      runningAvailable = runningAvailable + inQty - outQty;

      // Last unit price up to end of this month (based on purchase records)
      const lastPurchase = purchases
        .filter((p) => p.date && p.date <= monthEnd)
        .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))[0];

      const lastUnitPrice = lastPurchase?.totalPrice || 0;
      const stockValue = runningAvailable * lastUnitPrice;

      return {
        month: `${monthName.toLowerCase()} ${year}`,
        inQty,
        outQty,
        availableQty: runningAvailable,
        unit: item.unit,
        lastUnitPrice,
        stockValue,
      };
    });
  }, [batches, item, months, purchases, rawIds, year, yearPurchases]);

  useEffect(() => {
    if (!db) return;
    if (!itemId) return;
    if (!item) return;
    if (!rows.length) return;
    if (reportRun === 0) return;

    const persist = async () => {
      try {
        const docId = `${itemId}_${year}`;
        await setDoc(
          doc(db, "itemMonthlyReports", docId),
          {
            itemId,
            itemCode: item.code,
            itemName: item.name,
            unit: item.unit,
            year,
            rows,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("Could not persist item monthly report snapshot", e);
      }
    };

    persist();
  }, [db, item, itemId, reportRun, rows, year]);

  const columns = useMemo(
    () => [
      { key: "month", header: "Month" },
      {
        key: "inQty",
        header: "In Qty",
        render: (r: MonthRow) => (
          <span className="font-medium text-emerald-600">{r.inQty.toLocaleString("en-IN")}</span>
        ),
      },
      {
        key: "outQty",
        header: "Out Qty",
        render: (r: MonthRow) => (
          <span className="font-medium text-red-600">{r.outQty.toLocaleString("en-IN")}</span>
        ),
      },
      {
        key: "availableQty",
        header: "Available Qty",
        render: (r: MonthRow) => <span className="font-semibold">{r.availableQty.toLocaleString("en-IN")}</span>,
      },
      { key: "unit", header: "Unit" },
      {
        key: "stockValue",
        header: "Stock Value",
        render: (r: MonthRow) => <span className="font-medium">₹{r.stockValue.toLocaleString("en-IN")}</span>,
      },
    ],
    []
  );

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 5; y <= currentYear + 1; y++) years.push(y);
    return years;
  }, [currentYear]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={item ? `Item Report: ${item.name}` : "Item Report"}
        subtitle={item ? `Monthly stock movement for ${item.code}` : "Monthly stock movement"}
      />

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => navigate("/items")}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button variant="outline" className="gap-2" onClick={fetchAll} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <Label>Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ExportExcelButton
              rows={rows.map((r) => ({
                Month: r.month,
                "In Qty": r.inQty,
                "Out Qty": r.outQty,
                "Available Qty": r.availableQty,
                Unit: r.unit,
                "Stock Value": r.stockValue,
              }))}
              fileName={`item-${item?.code || itemId}-monthly-${year}`}
              sheetName="Monthly"
              label="Export"
              variant="outline"
            />
          </div>
        </div>

        {item?.notes ? (
          <Card className="p-4 text-sm text-muted-foreground">{item.notes}</Card>
        ) : null}

        <Card className="p-4">
          {rows.length === 0 ? (
            <div className="text-muted-foreground">{isLoading ? "Loading..." : "No data yet for this year."}</div>
          ) : (
            <DataTable data={rows} columns={columns} keyField="month" />
          )}
        </Card>
      </div>
    </div>
  );
}
