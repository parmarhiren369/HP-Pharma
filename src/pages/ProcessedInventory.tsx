import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { 
  Boxes, 
  TrendingUp,
  ArrowRight,
  Download,
  Filter,
  Activity,
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

interface ProcessedInventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  location: string;
  reorderLevel?: string;
  status?: "Adequate" | "Low" | "Critical" | "Overstocked";
  batchNo: string;
  processedDate: string;
  lastUpdated: string;
}

const processedInventory: ProcessedInventoryItem[] = [];

export default function ProcessedInventory() {
  const [processedInventoryData, setProcessedInventoryData] = useState<ProcessedInventoryItem[]>([]);
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
    batchNo: "",
    processedDate: "",
  });
  const { toast } = useToast();

  // Fetch processed inventory from Firebase
  const fetchProcessedInventory = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      console.log("Fetching processed inventory from Firebase...");
      const inventoryRef = collection(db, "processedInventory");
      const snapshot = await getDocs(inventoryRef);
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log("Fetched document:", doc.id, data);
        return {
          id: doc.id,
          ...data,
        };
      }) as ProcessedInventoryItem[];
      console.log("Total items fetched:", items.length);
      setProcessedInventoryData(items);
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
    fetchProcessedInventory();
  }, []);

  // Combine static data with Firebase data
  const allInventoryData = processedInventoryData;

  // Filter data based on search and date range
  const filteredData = allInventoryData.filter((item) => {
    const matchesSearch = searchQuery === "" || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.batchNo.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDateRange = (!startDate || new Date(item.processedDate) >= new Date(startDate)) &&
                             (!endDate || new Date(item.processedDate) <= new Date(endDate));
    
    return matchesSearch && matchesDateRange;
  });

  const exportRows = filteredData.map((item) => ({
    Name: item.name,
    Category: item.category,
    Quantity: item.quantity,
    Unit: item.unit,
    Location: item.location,
    "Batch No": item.batchNo,
    "Processed Date": item.processedDate,
    "Last Updated": item.lastUpdated,
  }));

  const handleAddItem = async () => {
    if (!formData.name || !formData.category || !formData.quantity || !formData.location || !formData.batchNo || !formData.processedDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("Adding new item to Firebase...", formData);
    
    try {
      const inventoryRef = collection(db, "processedInventory");
      const itemData = {
        name: formData.name,
        category: formData.category,
        quantity: formData.quantity,
        unit: formData.unit,
        location: formData.location,
        batchNo: formData.batchNo,
        processedDate: formData.processedDate,
        lastUpdated: new Date().toISOString().split('T')[0],
        createdAt: Timestamp.now(),
      };
      
      console.log("Item data to save:", itemData);
      const docRef = await addDoc(inventoryRef, itemData);
      console.log("Document added with ID:", docRef.id);

      setProcessedInventoryData((prev) => [
        {
          id: docRef.id,
          ...itemData,
        } as ProcessedInventoryItem,
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
        batchNo: "",
        processedDate: "",
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
    { key: "name" as keyof ProcessedInventoryItem, header: "Material Name" },
    { key: "category" as keyof ProcessedInventoryItem, header: "Category" },
    { key: "batchNo" as keyof ProcessedInventoryItem, header: "Batch No." },
    { 
      key: "quantity" as keyof ProcessedInventoryItem, 
      header: "Quantity",
      render: (item: ProcessedInventoryItem) => `${item.quantity} ${item.unit}`
    },
    { key: "location" as keyof ProcessedInventoryItem, header: "Location" },
    { key: "processedDate" as keyof ProcessedInventoryItem, header: "Processed Date" },
    { key: "lastUpdated" as keyof ProcessedInventoryItem, header: "Last Updated" },
  ];

  return (
    <>
      <AppHeader title="Processed Inventory Management" subtitle="Monitor intermediate products ready for final processing" />
      
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Processed Materials"
            value={allInventoryData.length}
            change="+12%"
            changeType="positive"
            icon={Boxes}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="Categories"
            value={new Set(allInventoryData.map(item => item.category)).size}
            change="+2"
            changeType="positive"
            icon={CheckCircle2}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Locations"
            value={new Set(allInventoryData.map(item => item.location)).size}
            change="+1"
            changeType="positive"
            icon={Activity}
            iconBgColor="bg-info/20"
            iconColor="text-info"
          />
          <StatCard
            title="Total Quantity"
            value={allInventoryData.reduce((sum, item) => sum + parseInt(item.quantity), 0)}
            change="+0.8%"
            changeType="positive"
            icon={TrendingUp}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
        </div>

        {/* Main Content */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="section-title">Processed Material Inventory</h2>
              <p className="section-subtitle">Intermediate products ready for final processing</p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                onClick={() => setIsAddItemOpen(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
              <ExportExcelButton
                rows={exportRows}
                fileName="processed-inventory"
                sheetName="Processed Inventory"
                label="Export to Excel"
                variant="outline"
              />
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
                      placeholder="Search by name, category, or batch number..."
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
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Processing Value</h3>
            <p className="text-3xl font-bold text-foreground">$1.8M</p>
            <p className="text-sm text-success mt-1">+12% from last month</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Batches This Month</h3>
            <p className="text-3xl font-bold text-foreground">42</p>
            <p className="text-sm text-success mt-1">+8 from last month</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Quality Pass Rate</h3>
            <p className="text-3xl font-bold text-foreground">98.5%</p>
            <p className="text-sm text-success mt-1">Above target</p>
          </div>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Processed Material</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="itemName">Material Name *</Label>
                <Input
                  id="itemName"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Paracetamol Granules"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Intermediate"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="batchNo">Batch Number *</Label>
                <Input
                  id="batchNo"
                  value={formData.batchNo}
                  onChange={(e) => setFormData({ ...formData, batchNo: e.target.value })}
                  placeholder="e.g., PG-2024-001"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="processedDate">Processed Date *</Label>
                <Input
                  id="processedDate"
                  type="date"
                  value={formData.processedDate}
                  onChange={(e) => setFormData({ ...formData, processedDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="200"
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
            <div className="grid gap-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Production Bay 1"
              />
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
