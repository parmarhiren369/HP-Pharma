import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { IndianRupee, Plus, RefreshCw, ShoppingCart, Truck, PackageSearch } from "lucide-react";

interface SupplierOption {
  id: string;
  name: string;
}

interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit?: string;
}

interface PurchaseRecord {
  id: string;
  date: string; // YYYY-MM-DD
  supplierId: string;
  supplierName: string;
  invoiceNo: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  invoicePrice: number;
  taxInvoicePrice: number;
  notTaxInvoice: boolean;
  totalPrice: number;
  createdAt?: Date;
}

const defaultFormState = {
  date: new Date().toISOString().slice(0, 10),
  supplierId: "",
  invoiceNo: "",
  itemId: "",
  quantity: "",
  unit: "pcs",
  invoicePrice: "",
  taxInvoicePrice: "",
  notTaxInvoice: false,
};

function safeNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Purchases() {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [formData, setFormData] = useState(defaultFormState);

  const { toast } = useToast();

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === formData.supplierId),
    [suppliers, formData.supplierId]
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === formData.itemId),
    [items, formData.itemId]
  );

  const computedTotal = useMemo(() => {
    const invoicePrice = safeNumber(formData.invoicePrice);
    const taxInvoicePrice = safeNumber(formData.taxInvoicePrice);

    // Total Price is treated as per-unit price:
    // - Non-tax invoice: Invoice Price
    // - Tax invoice: Tax Invoice Price if provided, otherwise Invoice Price
    if (formData.notTaxInvoice) return invoicePrice;
    return taxInvoicePrice > 0 ? taxInvoicePrice : invoicePrice;
  }, [formData.invoicePrice, formData.notTaxInvoice, formData.taxInvoicePrice]);

  const filteredPurchases = useMemo(() => {
    if (!search.trim()) return purchases;
    const q = search.toLowerCase();
    return purchases.filter((p) =>
      `${p.invoiceNo} ${p.supplierName} ${p.itemCode} ${p.itemName}`.toLowerCase().includes(q)
    );
  }, [purchases, search]);

  const stats = useMemo(() => {
    const total = purchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = purchases.filter((p) => p.date === today).length;
    return {
      totalPurchases: purchases.length,
      totalValue: total,
      todayCount,
      uniqueSuppliers: new Set(purchases.map((p) => p.supplierId)).size,
    };
  }, [purchases]);

  const exportRows = useMemo(
    () =>
      filteredPurchases.map((p) => ({
        Date: p.date,
        "Invoice No": p.invoiceNo,
        Supplier: p.supplierName,
        "Item Code": p.itemCode,
        "Item Name": p.itemName,
        Quantity: p.quantity,
        Unit: p.unit,
        "Invoice Price": p.invoicePrice,
        "Tax Invoice Price": p.taxInvoicePrice,
        "Not Tax Invoice": p.notTaxInvoice ? "Yes" : "No",
        "Total Price": p.totalPrice,
      })),
    [filteredPurchases]
  );

  const fetchSuppliers = async () => {
    const snapshot = await getDocs(collection(db, "suppliers"));
    const list: SupplierOption[] = snapshot.docs
      .map((d) => ({ id: d.id, name: (d.data().name || "").toString() }))
      .filter((s) => s.name);
    list.sort((a, b) => a.name.localeCompare(b.name));
    setSuppliers(list);
  };

  const fetchItems = async () => {
    const snapshot = await getDocs(collection(db, "items"));
    const list: ItemOption[] = snapshot.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: (data.code || "").toString(),
          name: (data.name || "").toString(),
          unit: (data.unit || "").toString() || undefined,
        };
      })
      .filter((i) => i.code && i.name);
    list.sort((a, b) => a.code.localeCompare(b.code));
    setItems(list);
  };

  const fetchPurchases = async () => {
    const purchasesQuery = query(collection(db, "purchases"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(purchasesQuery);
    const list = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        date: (data.date || "").toString(),
        supplierId: (data.supplierId || "").toString(),
        supplierName: (data.supplierName || "").toString(),
        invoiceNo: (data.invoiceNo || "").toString(),
        itemId: (data.itemId || "").toString(),
        itemCode: (data.itemCode || "").toString(),
        itemName: (data.itemName || "").toString(),
        quantity: typeof data.quantity === "number" ? data.quantity : parseFloat(data.quantity) || 0,
        unit: (data.unit || "pcs").toString(),
        invoicePrice: typeof data.invoicePrice === "number" ? data.invoicePrice : parseFloat(data.invoicePrice) || 0,
        taxInvoicePrice:
          typeof data.taxInvoicePrice === "number" ? data.taxInvoicePrice : parseFloat(data.taxInvoicePrice) || 0,
        notTaxInvoice: Boolean(data.notTaxInvoice),
        totalPrice: typeof data.totalPrice === "number" ? data.totalPrice : parseFloat(data.totalPrice) || 0,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      } as PurchaseRecord;
    });
    setPurchases(list);
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
      await Promise.all([fetchSuppliers(), fetchItems(), fetchPurchases()]);
    } catch (error) {
      console.error("Error loading purchase dependencies", error);
      toast({
        title: "Load failed",
        description: "Could not load suppliers/items/purchases from Firestore.",
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
    setFormData({
      ...defaultFormState,
      date: new Date().toISOString().slice(0, 10),
    });
  };

  const upsertRawInventoryFromPurchase = async (payload: {
    itemCode: string;
    itemName: string;
    supplierName: string;
    quantity: number;
    unit: string;
    date: string;
  }) => {
    // Raw Inventory page expects: name/category/supplier/location/status/lastUpdated/reorderLevel
    const inventoryRef = collection(db, "rawInventory");
    const existingQuery = query(inventoryRef, where("itemCode", "==", payload.itemCode));
    const snapshot = await getDocs(existingQuery);

    const lastUpdated = payload.date || new Date().toISOString().slice(0, 10);

    if (snapshot.empty) {
      await addDoc(inventoryRef, {
        itemCode: payload.itemCode,
        name: payload.itemName,
        category: "Purchased",
        quantity: payload.quantity.toString(),
        unit: payload.unit,
        location: "Main Store",
        supplier: payload.supplierName,
        reorderLevel: "0",
        status: "Adequate",
        lastUpdated,
        createdAt: Timestamp.now(),
      });
      return;
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    const currentQty = parseFloat((data.quantity ?? "0").toString()) || 0;
    const newQty = currentQty + payload.quantity;
    await updateDoc(doc(db, "rawInventory", docSnap.id), {
      quantity: newQty.toString(),
      unit: payload.unit || (data.unit ?? "pcs"),
      supplier: payload.supplierName || data.supplier,
      lastUpdated,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.date) {
      toast({ title: "Validation error", description: "Date is required.", variant: "destructive" });
      return;
    }

    if (!formData.supplierId) {
      toast({ title: "Validation error", description: "Supplier is required.", variant: "destructive" });
      return;
    }

    if (!formData.invoiceNo.trim()) {
      toast({ title: "Validation error", description: "Invoice No. is required.", variant: "destructive" });
      return;
    }

    if (!formData.itemId) {
      toast({ title: "Validation error", description: "Item is required.", variant: "destructive" });
      return;
    }

    const quantity = safeNumber(formData.quantity);
    if (!quantity || quantity <= 0) {
      toast({ title: "Validation error", description: "Quantity must be greater than 0.", variant: "destructive" });
      return;
    }

    const invoicePrice = safeNumber(formData.invoicePrice);
    const taxInvoicePrice = safeNumber(formData.taxInvoicePrice);
    const unit = (formData.unit || selectedItem?.unit || "pcs").trim() || "pcs";

    // Total Price is per-unit; pick Invoice Price or Tax Invoice Price accordingly
    if (formData.notTaxInvoice) {
      if (invoicePrice <= 0) {
        toast({
          title: "Validation error",
          description: "Invoice Price is required for non-tax invoices.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (taxInvoicePrice <= 0 && invoicePrice <= 0) {
        toast({
          title: "Validation error",
          description: "Tax Invoice Price (or Invoice Price) is required.",
          variant: "destructive",
        });
        return;
      }
    }

    const supplierName = selectedSupplier?.name || "";
    const itemCode = selectedItem?.code || "";
    const itemName = selectedItem?.name || "";

    if (!supplierName || !itemCode || !itemName) {
      toast({
        title: "Validation error",
        description: "Selected supplier/item could not be resolved. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const totalPrice = computedTotal;

      await addDoc(collection(db, "purchases"), {
        date: formData.date,
        supplierId: formData.supplierId,
        supplierName,
        invoiceNo: formData.invoiceNo.trim(),
        itemId: formData.itemId,
        itemCode,
        itemName,
        quantity,
        unit,
        invoicePrice,
        taxInvoicePrice,
        notTaxInvoice: formData.notTaxInvoice,
        totalPrice,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      await upsertRawInventoryFromPurchase({
        itemCode,
        itemName,
        supplierName,
        quantity,
        unit,
        date: formData.date,
      });

      toast({ title: "Purchase added", description: "Purchase saved and Raw Inventory updated." });

      setIsDialogOpen(false);
      resetForm();
      await fetchPurchases();
    } catch (error) {
      console.error("Error adding purchase", error);
      toast({
        title: "Save failed",
        description: "Could not save the purchase. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: "date",
      header: "Date",
      render: (p: PurchaseRecord) => <span className="text-sm">{p.date}</span>,
    },
    {
      key: "supplierName",
      header: "Supplier",
      render: (p: PurchaseRecord) => (
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{p.supplierName}</span>
        </div>
      ),
    },
    {
      key: "invoiceNo",
      header: "Invoice No.",
      render: (p: PurchaseRecord) => <Badge variant="outline" className="font-mono text-xs">{p.invoiceNo}</Badge>,
    },
    {
      key: "itemName",
      header: "Item",
      render: (p: PurchaseRecord) => (
        <div>
          <div className="font-medium">{p.itemName}</div>
          <div className="text-xs text-muted-foreground">{p.itemCode}</div>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      render: (p: PurchaseRecord) => (
        <span className="text-sm">
          {p.quantity} {p.unit}
        </span>
      ),
    },
    {
      key: "totalPrice",
      header: "Total Price",
      render: (p: PurchaseRecord) => (
        <div className="flex items-center gap-1 font-semibold">
          <IndianRupee className="h-4 w-4 text-muted-foreground" />
          <span>
            {p.totalPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ),
    },
    {
      key: "notTaxInvoice",
      header: "Type",
      render: (p: PurchaseRecord) => (
        <Badge variant={p.notTaxInvoice ? "secondary" : "default"}>
          {p.notTaxInvoice ? "Non-tax" : "Tax"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Purchases" subtitle="Create purchase entries and update Raw Inventory" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Purchases" value={stats.totalPurchases} icon={ShoppingCart} />
          <StatCard
            title="Total Value"
            value={`₹${stats.totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
            icon={IndianRupee}
            changeType="neutral"
          />
          <StatCard title="Today" value={stats.todayCount} icon={RefreshCw} changeType="neutral" />
          <StatCard title="Suppliers Used" value={stats.uniqueSuppliers} icon={Truck} changeType="neutral" />
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search invoice / supplier / item"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-80"
              />
              <Button variant="secondary" onClick={fetchAll} disabled={isLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <ExportExcelButton
                rows={exportRows}
                fileName="purchases"
                sheetName="Purchases"
                label="Export to Excel"
                variant="outline"
              />
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Purchase
            </Button>
          </div>

          {filteredPurchases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-10 text-center text-muted-foreground">
              {isLoading ? "Loading purchases..." : "No purchases found. Add your first purchase."}
            </div>
          ) : (
            <DataTable data={filteredPurchases} columns={columns} keyField="id" />
          )}
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add Purchase</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select
                    value={formData.supplierId}
                    onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={suppliers.length ? "Select supplier" : "No suppliers"} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoiceNo">Invoice No.</Label>
                  <Input
                    id="invoiceNo"
                    value={formData.invoiceNo}
                    onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
                    placeholder="INV-0001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Item</Label>
                  <Select
                    value={formData.itemId}
                    onValueChange={(value) => {
                      const item = items.find((i) => i.id === value);
                      setFormData({
                        ...formData,
                        itemId: value,
                        unit: item?.unit || formData.unit,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={items.length ? "Select item" : "No items"} />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">{i.code}</Badge>
                            <span>{i.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="0"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
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
                </div>

                <div className="space-y-2">
                  <Label>Total Price</Label>
                  <div className="h-10 px-3 rounded-md border border-input bg-muted flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Computed</span>
                    <span className="font-semibold">
                      ₹{computedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoicePrice">Invoice Price (per unit)</Label>
                  <Input
                    id="invoicePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.invoicePrice}
                    onChange={(e) => setFormData({ ...formData, invoicePrice: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxInvoicePrice">Tax Invoice Price (per unit)</Label>
                  <Input
                    id="taxInvoicePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.taxInvoicePrice}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData((prev) => {
                        const tax = safeNumber(value);
                        return {
                          ...prev,
                          taxInvoicePrice: value,
                          notTaxInvoice: tax > 0 ? false : prev.notTaxInvoice,
                        };
                      });
                    }}
                    placeholder="0.00"
                    disabled={formData.notTaxInvoice}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  id="notTaxInvoice"
                  checked={formData.notTaxInvoice}
                  onCheckedChange={(checked) => {
                    const isNonTax = Boolean(checked);
                    setFormData((prev) => ({
                      ...prev,
                      notTaxInvoice: isNonTax,
                      taxInvoicePrice: isNonTax ? "" : prev.taxInvoicePrice,
                    }));
                  }}
                />
                <div className="flex-1">
                  <Label htmlFor="notTaxInvoice">Not a tax invoice</Label>
                  <p className="text-xs text-muted-foreground">
                    If enabled, Total Price uses Invoice Price; otherwise it uses Tax Invoice Price (or Invoice Price if tax price is empty).
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground flex items-start gap-2">
                <PackageSearch className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-medium text-foreground">Raw Inventory update</div>
                  <div>
                    This purchase will create/update the Raw Inventory record using the selected item code.
                  </div>
                </div>
              </div>
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
                {isSubmitting ? "Saving..." : "Save Purchase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
