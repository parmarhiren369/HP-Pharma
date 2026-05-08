import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { 
  Package, 
  AlertTriangle,
  ArrowRight,
  Download,
  Filter,
  TrendingUp,
  CheckCircle2,
  Plus,
  Search,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, Timestamp } from "firebase/firestore";

interface RawInventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  location: string;
  reorderLevel: string;
  status: "Adequate" | "Low" | "Critical" | "Overstocked";
  supplier: string;
  lastUpdated: string;
}

const rawInventory: RawInventoryItem[] = [];

export default function RawInventory() {
  const [rawInventoryData, setRawInventoryData] = useState<RawInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    quantity: "",
    unit: "kg",
    location: "",
    status: "Adequate" as "Adequate" | "Low" | "Critical" | "Overstocked",
    supplier: "",
  });
  const { toast } = useToast();

  // Fetch raw inventory from Firebase
  const fetchRawInventory = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      console.log("Fetching raw inventory from Firebase...");
      const inventoryRef = collection(db, "rawInventory");
      const snapshot = await getDocs(inventoryRef);
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log("Fetched document:", doc.id, data);
        return {
          id: doc.id,
          ...data,
        };
      }) as RawInventoryItem[];
      console.log("Total items fetched:", items.length);
      setRawInventoryData(items);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      toast({
        title: "Error",
        description: "Failed to fetch inventory data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRawInventory();
  }, []);

  // Combine static data with Firebase data
  const allInventoryData = rawInventoryData;

  // Filter data based on search and date range
  const filteredData = allInventoryData.filter((item) => {
    const matchesSearch = searchQuery === "" || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDateRange = (!startDate || new Date(item.lastUpdated) >= new Date(startDate)) &&
                             (!endDate || new Date(item.lastUpdated) <= new Date(endDate));
    
    return matchesSearch && matchesDateRange;
  });

  const exportRows = filteredData.map((item) => ({
    Name: item.name,
    Category: item.category,
    Quantity: item.quantity,
    Unit: item.unit,
    Location: item.location,
    "Reorder Level": item.reorderLevel,
    Status: item.status,
    Supplier: item.supplier,
    "Last Updated": item.lastUpdated,
  }));

  const handleAddItem = async () => {
    if (!formData.name || !formData.category || !formData.quantity || !formData.location || !formData.supplier) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!db) {
      toast({
        title: "Error",
        description: "Database connection not available",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("Adding new item to Firebase...", formData);
    
    try {
      const inventoryRef = collection(db, "rawInventory");
      const itemData = {
        name: formData.name,
        category: formData.category,
        quantity: formData.quantity,
        unit: formData.unit,
        location: formData.location,
        status: formData.status,
        supplier: formData.supplier,
        lastUpdated: new Date().toISOString().split('T')[0],
        createdAt: Timestamp.now(),
      };
      
      console.log("Item data to save:", itemData);
      const docRef = await addDoc(inventoryRef, itemData);
      console.log("Document added with ID:", docRef.id);

      setRawInventoryData((prev) => [
        {
          id: docRef.id,
          ...itemData,
          reorderLevel: "",
        } as RawInventoryItem,
        ...prev,
      ]);
      
      toast({
        title: "Success",
        description: "Item added successfully to inventory",
      });
      
      setIsAddItemOpen(false);
      setFormData({
        name: "",
        category: "",
        quantity: "",
        unit: "kg",
        location: "",
        status: "Adequate",
        supplier: "",
      });
      
      // Avoid full-collection refetch after save for faster UX.
    } catch (error) {
      console.error("Error adding item:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add item";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
  };

  const inventoryColumns = [
    { key: "name" as keyof RawInventoryItem, header: "Material Name" },
    { key: "category" as keyof RawInventoryItem, header: "Category" },
    { 
      key: "quantity" as keyof RawInventoryItem, 
      header: "Quantity",
      render: (item: RawInventoryItem) => `${item.quantity} ${item.unit}`
    },
    { key: "location" as keyof RawInventoryItem, header: "Location" },
    { key: "supplier" as keyof RawInventoryItem, header: "Supplier" },
    { key: "reorderLevel" as keyof RawInventoryItem, header: "Reorder Level" },
    { 
      key: "status" as keyof RawInventoryItem, 
      header: "Status",
      render: (item: RawInventoryItem) => (
        <span className={`badge-type ${
          item.status === "Adequate" ? "badge-processed" : 
          item.status === "Low" ? "bg-warning/20 text-warning" : 
          item.status === "Critical" ? "bg-destructive/20 text-destructive" :
          "badge-raw"
        }`}>
          {item.status}
        </span>
      )
    },
    { key: "lastUpdated" as keyof RawInventoryItem, header: "Last Updated" },
  ];

  return (
    <>
      <AppHeader title="Raw Inventory Management" subtitle="Track and manage raw material stock levels" />
      
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Raw Materials"
            value={allInventoryData.length}
            change="+5%"
            changeType="positive"
            icon={Package}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="Adequate Stock"
            value={allInventoryData.filter(item => item.status === "Adequate" || item.status === "Overstocked").length}
            change="+8%"
            changeType="positive"
            icon={CheckCircle2}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Low Stock Items"
            value={allInventoryData.filter(item => item.status === "Low").length}
            change="-3"
            changeType="positive"
            icon={TrendingUp}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
          <StatCard
            title="Critical Alerts"
            value={allInventoryData.filter(item => item.status === "Critical").length}
            change="-2"
            changeType="positive"
            icon={AlertTriangle}
            iconBgColor="bg-destructive/20"
            iconColor="text-destructive"
          />
        </div>

        {/* Main Content */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="section-title">Raw Material Inventory</h2>
              <p className="section-subtitle">Complete overview of raw material stock levels</p>
            </div>
            <div className="flex items-center gap-2">
              <ExportExcelButton
                rows={exportRows}
                fileName="raw-inventory"
                sheetName="Raw Inventory"
                label="Export to Excel"
                variant="outline"
              />
              <Button 
                size="sm" 
                onClick={() => setIsAddItemOpen(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>
          </div>

          {/* Filters Section */}
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="search" className="text-sm font-medium mb-2 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, category, or supplier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="startDate" className="text-sm font-medium mb-2 block">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate" className="text-sm font-medium mb-2 block">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearFilters}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Clear Filters
              </Button>
              <div className="text-sm text-muted-foreground ml-auto">
                Showing {filteredData.length} of {allInventoryData.length} items
              </div>
            </div>
          </div>

          <div className="p-6">
            <DataTable
              data={filteredData}
              columns={inventoryColumns}
              keyField="id"
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Inventory Value</h3>
            <p className="text-3xl font-bold text-foreground">$2.4M</p>
            <p className="text-sm text-success mt-1">+5% from last month</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Reorder Requests</h3>
            <p className="text-3xl font-bold text-foreground">12</p>
            <p className="text-sm text-muted-foreground mt-1">Pending approval</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Suppliers Active</h3>
            <p className="text-3xl font-bold text-foreground">34</p>
            <p className="text-sm text-success mt-1">All verified</p>
          </div>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Raw Material</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="itemName">Material Name *</Label>
                <Input
                  id="itemName"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Paracetamol API"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Active Ingredient"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="500"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData({ ...formData, unit: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="mL">mL</SelectItem>
                    <SelectItem value="units">units</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Warehouse A"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier">Supplier *</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="e.g., ChemPharma Ltd"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as "Adequate" | "Low" | "Critical" | "Overstocked" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Adequate">Adequate</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="Overstocked">Overstocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={loading}>
              {loading ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
