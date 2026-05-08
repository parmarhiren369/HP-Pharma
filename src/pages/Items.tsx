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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, Timestamp, updateDoc } from "firebase/firestore";
import { ClipboardList, Hash, PackagePlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ItemRecord {
  id: string;
  code: string;
  name: string;
  openingBalance: number;
  unit: string;
  notes?: string;
  createdAt?: Date;
}

interface PurchaseLite {
  itemId: string;
  itemCode: string;
  quantity: number;
  totalPrice: number; // per-unit price
  date: string; // YYYY-MM-DD
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

const defaultFormState = {
  code: "",
  name: "",
  openingBalance: "0",
  unit: "pcs",
  notes: "",
};

export default function Items() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [inQtyByItemId, setInQtyByItemId] = useState<Record<string, number>>({});
  const [outQtyByItemCode, setOutQtyByItemCode] = useState<Record<string, number>>({});
  const [lastUnitPriceByItemId, setLastUnitPriceByItemId] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [formData, setFormData] = useState(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const itemsWithStock = useMemo(() => {
    return items.map((item) => {
      const inQty = inQtyByItemId[item.id] || 0;
      const outQty = outQtyByItemCode[item.code] || 0;
      const availableQty = (item.openingBalance || 0) + inQty - outQty;
      const lastUnitPrice = lastUnitPriceByItemId[item.id] || 0;
      const stockValue = availableQty * lastUnitPrice;

      return {
        ...item,
        inQty,
        outQty,
        availableQty,
        lastUnitPrice,
        stockValue,
      };
    });
  }, [items, inQtyByItemId, lastUnitPriceByItemId, outQtyByItemCode]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return itemsWithStock;
    return itemsWithStock.filter((item) =>
      `${item.code} ${item.name}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [itemsWithStock, search]);

  const stats = useMemo(() => {
    const totalOpeningQty = items.reduce((sum, item) => sum + (item.openingBalance || 0), 0);
    const totalInQty = Object.values(inQtyByItemId).reduce((sum, v) => sum + (v || 0), 0);
    const totalOutQty = Object.values(outQtyByItemCode).reduce((sum, v) => sum + (v || 0), 0);
    const totalAvailableQty = filteredItems.reduce((sum, item: any) => sum + (item.availableQty || 0), 0);
    const latest = items[0]?.name || "—";
    const avgOpeningQty = items.length ? totalOpeningQty / items.length : 0;

    return {
      totalItems: items.length,
      totalOpeningQty,
      totalInQty,
      totalOutQty,
      totalAvailableQty,
      latest,
      avgOpeningQty,
    };
  }, [filteredItems, inQtyByItemId, items, outQtyByItemCode]);

  const exportRows = useMemo(
    () =>
      filteredItems.map((item) => ({
        Code: item.code,
        Name: item.name,
        "In Qty": (item as any).inQty ?? 0,
        "Opening Balance": item.openingBalance,
        Unit: item.unit,
        "Out Qty": (item as any).outQty ?? 0,
        "Available Qty": (item as any).availableQty ?? 0,
        "Last Unit Price": (item as any).lastUnitPrice ?? 0,
        "Stock Value": (item as any).stockValue ?? 0,
        Notes: item.notes || "",
        Created: item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : "",
      })),
    [filteredItems]
  );

  const fetchItems = async () => {
    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    try {
      const itemsQuery = query(collection(db, "items"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(itemsQuery);
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          code: data.code || "",
          name: data.name || "",
          openingBalance:
            typeof data.openingBalance === "number"
              ? data.openingBalance
              : parseFloat(data.openingBalance) || 0,
          unit: data.unit || "pcs",
          notes: data.notes || "",
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as ItemRecord;
      });
      setItems(list);
    } catch (error) {
      console.error("Error fetching items", error);
      toast({
        title: "Fetch failed",
        description: "Could not load items from Firestore.",
        variant: "destructive",
      });
    }
  };

  const fetchStockSummaries = async () => {
    if (!db) return;

    const [purchasesSnap, batchesSnap, rawInvSnap] = await Promise.all([
      getDocs(collection(db, "purchases")),
      getDocs(collection(db, "batches")),
      getDocs(collection(db, "rawInventory")),
    ]);

    const purchases: PurchaseLite[] = purchasesSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          itemId: (data.itemId || "").toString(),
          itemCode: (data.itemCode || "").toString(),
          date: (data.date || "").toString(),
          quantity: typeof data.quantity === "number" ? data.quantity : parseFloat(data.quantity) || 0,
          totalPrice: typeof data.totalPrice === "number" ? data.totalPrice : parseFloat(data.totalPrice) || 0,
        } as PurchaseLite;
      })
      .filter((p) => p.itemId && p.itemCode);

    const batches: BatchLite[] = batchesSnap.docs
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

    const rawInventory: RawInventoryLite[] = rawInvSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        itemCode: (data.itemCode || "").toString() || undefined,
        name: (data.name || "").toString() || undefined,
      } as RawInventoryLite;
    });

    const nextInQtyByItemId: Record<string, number> = {};
    const nextLastUnitPriceByItemId: Record<string, number> = {};
    const nextLastDateByItemId: Record<string, string> = {};

    for (const p of purchases) {
      nextInQtyByItemId[p.itemId] = (nextInQtyByItemId[p.itemId] || 0) + (p.quantity || 0);
      const prevDate = nextLastDateByItemId[p.itemId] || "";
      if (!prevDate || (p.date && p.date >= prevDate)) {
        nextLastDateByItemId[p.itemId] = p.date;
        nextLastUnitPriceByItemId[p.itemId] = p.totalPrice || 0;
      }
    }

    const outQtyByRawId: Record<string, number> = {};
    for (const b of batches) {
      for (const it of b.items) {
        outQtyByRawId[it.rawItemId] = (outQtyByRawId[it.rawItemId] || 0) + (it.useQuantity || 0);
      }
    }

    const rawIdToCode: Record<string, string> = {};
    for (const ri of rawInventory) {
      if (ri.itemCode) rawIdToCode[ri.id] = ri.itemCode;
    }

    const nextOutQtyByItemCode: Record<string, number> = {};
    for (const [rawId, qty] of Object.entries(outQtyByRawId)) {
      const code = rawIdToCode[rawId];
      if (!code) continue;
      nextOutQtyByItemCode[code] = (nextOutQtyByItemCode[code] || 0) + (qty || 0);
    }

    setInQtyByItemId(nextInQtyByItemId);
    setLastUnitPriceByItemId(nextLastUnitPriceByItemId);
    setOutQtyByItemCode(nextOutQtyByItemCode);
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
      await Promise.all([fetchItems(), fetchStockSummaries()]);
    } catch (error) {
      console.error("Error loading items/stock", error);
      toast({
        title: "Load failed",
        description: "Could not load items/stock data from Firestore.",
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
    setFormData(defaultFormState);
    setEditingItem(null);
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setFormData(defaultFormState);
    setIsDialogOpen(true);
  };

  const handleEditItem = (item: ItemRecord) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      openingBalance: (item.openingBalance ?? 0).toString(),
      unit: item.unit || "pcs",
      notes: item.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!db) {
      toast({
        title: "Database unavailable",
        description: "Firebase is not initialized. Please check your environment variables.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      await deleteDoc(doc(db, "items", itemId));
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      toast({ title: "Item deleted", description: "The item has been removed." });
    } catch (error) {
      console.error("Error deleting item", error);
      toast({
        title: "Delete failed",
        description: "Could not delete the item. Please try again.",
        variant: "destructive",
      });
    }
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

    if (!formData.code.trim()) {
      toast({
        title: "Validation error",
        description: "Item code is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Item name is required.",
        variant: "destructive",
      });
      return;
    }

    const openingValue = parseFloat(formData.openingBalance);
    if (Number.isNaN(openingValue) || openingValue < 0) {
      toast({
        title: "Validation error",
        description: "Opening balance must be a number greater than or equal to zero.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const payload = {
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      openingBalance: openingValue,
      unit: formData.unit.trim() || "pcs",
      notes: formData.notes.trim(),
      updatedAt: Timestamp.now(),
    };

    if (editingItem) {
      const previousItem = items.find((item) => item.id === editingItem.id) || null;

      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                code: payload.code,
                name: payload.name,
                openingBalance: payload.openingBalance,
                unit: payload.unit,
                notes: payload.notes,
              }
            : item,
        ),
      );

      setIsDialogOpen(false);
      resetForm();
      setIsSubmitting(false);
      toast({ title: "Item updated", description: "The item has been updated." });

      void (async () => {
        try {
          await updateDoc(doc(db, "items", editingItem.id), payload);
        } catch (error) {
          console.error("Error updating item", error);
          if (previousItem) {
            setItems((prev) => prev.map((item) => (item.id === previousItem.id ? previousItem : item)));
          }
          toast({
            title: "Save failed",
            description: "Could not save the item. Changes were reverted.",
            variant: "destructive",
          });
        }
      })();
      return;
    }

    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticItem: ItemRecord = {
      id: tempId,
      code: payload.code,
      name: payload.name,
      openingBalance: payload.openingBalance,
      unit: payload.unit,
      notes: payload.notes,
      createdAt: new Date(),
    };

    setItems((prev) => [optimisticItem, ...prev]);
    setIsDialogOpen(false);
    resetForm();
    setIsSubmitting(false);
    toast({ title: "Item added", description: "Item saved locally, syncing to Firestore..." });

    void (async () => {
      try {
        const newDoc = await addDoc(collection(db, "items"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        setItems((prev) => prev.map((item) => (item.id === tempId ? { ...item, id: newDoc.id } : item)));
      } catch (error) {
        console.error("Error adding item", error);
        setItems((prev) => prev.filter((item) => item.id !== tempId));
        toast({
          title: "Save failed",
          description: "Could not save the item to Firestore. Local change was removed.",
          variant: "destructive",
        });
      }
    })();
  };

  const columns = [
    {
      key: "code",
      header: "Item Code",
      render: (item: ItemRecord) => (
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="font-mono text-xs">{item.code}</Badge>
        </div>
      ),
    },
    {
      key: "name",
      header: "Item Name",
      render: (item: ItemRecord) => (
        <div>
          <button
            type="button"
            className="font-medium text-left hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/items/${item.id}`);
            }}
          >
            {item.name}
          </button>
          {item.notes && (
            <p className="text-xs text-muted-foreground line-clamp-1">{item.notes}</p>
          )}
        </div>
      ),
    },
    {
      key: "inQty",
      header: "In Qty",
      render: (item: any) => (
        <span className="font-medium text-emerald-600">{(item.inQty || 0).toLocaleString("en-IN")}</span>
      ),
    },
    {
      key: "openingBalance",
      header: "Opening",
      render: (item: ItemRecord) => <span className="font-medium">{(item.openingBalance || 0).toLocaleString("en-IN")}</span>,
    },
    {
      key: "unit",
      header: "Unit",
      render: (item: ItemRecord) => <span className="text-sm text-muted-foreground uppercase">{item.unit}</span>,
    },
    {
      key: "outQty",
      header: "Out Qty",
      render: (item: any) => (
        <span className="font-medium text-red-600">{(item.outQty || 0).toLocaleString("en-IN")}</span>
      ),
    },
    {
      key: "availableQty",
      header: "Available",
      render: (item: any) => <span className="font-semibold">{(item.availableQty || 0).toLocaleString("en-IN")}</span>,
    },
    {
      key: "stockValue",
      header: "Stock Value",
      render: (item: any) => <span className="font-medium">₹{(item.stockValue || 0).toLocaleString("en-IN")}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (item: ItemRecord) => (
        <span className="text-sm text-muted-foreground">
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: ItemRecord) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditItem(item)}
            className="hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteItem(item.id)}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Item Master" subtitle="Manage your item catalog and opening balances" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Items"
            value={stats.totalItems}
            icon={ClipboardList}
            change={`Avg opening ${stats.avgOpeningQty.toFixed(2)}`}
            subtitle="Items tracked in Firestore"
          />
          <StatCard
            title="Opening Qty"
            value={stats.totalOpeningQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            icon={PackagePlus}
            changeType="neutral"
            subtitle="Aggregate opening quantity"
          />
          <StatCard
            title="Available Qty"
            value={stats.totalAvailableQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            icon={RefreshCw}
            changeType="neutral"
            subtitle={`In ${stats.totalInQty.toLocaleString("en-IN")} / Out ${stats.totalOutQty.toLocaleString("en-IN")}`}
          />
          <StatCard
            title="Searchable"
            value={`${filteredItems.length} results`}
            icon={ClipboardList}
            changeType="neutral"
            subtitle={search ? "Filtered view" : "Showing all items"}
          />
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search by code or name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72"
              />
              <Button variant="secondary" onClick={fetchAll} disabled={isLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <ExportExcelButton
                rows={exportRows}
                fileName="items"
                sheetName="Items"
                label="Export to Excel"
                variant="outline"
              />
            </div>
            <Button onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-10 text-center text-muted-foreground">
              {isLoading ? "Loading items..." : "No items found. Add your first item."}
            </div>
          ) : (
            <DataTable
              data={filteredItems}
              columns={columns}
              keyField="id"
              onRowClick={(row: any) => navigate(`/items/${row.id}`)}
            />
          )}
        </Card>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Item Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="E.g. ITM-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Item Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Paracetamol 500mg"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="openingBalance">Opening Balance (Qty)</Label>
                  <Input
                    id="openingBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                    placeholder="0.00"
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional remarks about the item"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingItem ? "Update Item" : "Save Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
