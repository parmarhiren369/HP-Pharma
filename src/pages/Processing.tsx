import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { 
  FlaskConical, 
  Package, 
  Beaker, 
  CheckCircle2,
  Plus,
  Trash2,
  MoreVertical,
  Edit,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, Timestamp, query, orderBy, limit, updateDoc, doc, setDoc, deleteDoc, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface RawMaterial {
  id: string;
  name: string;
  batchNo: string;
  quantity: string;
  status: "In Stock" | "Low Stock" | "Processing";
  supplier: string;
  expiryDate: string;
}

interface ProcessedMaterial {
  id: string;
  name: string;
  batchNo: string;
  quantity: string;
  processDate: string;
  status: "Completed" | "In Progress" | "Quality Check";
  yield: string;
}

interface RawInventoryItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  location: string;
  supplier: string;
}

interface BatchItem {
  rawItemId: string;
  rawItemName: string;
  currentQuantity: number;
  unit: string;
  useQuantity: number;
}

interface Batch {
  id: string;
  batchNo: string;
  manualBatchNo?: string;
  items: BatchItem[];
  createdAt: Date;
  status: string;
}

const rawMaterialsData: RawMaterial[] = [];

const processedMaterialsData: ProcessedMaterial[] = [];

export default function Processing() {
  const [isAddRecipeOpen, setIsAddRecipeOpen] = useState(false);
  const [rawInventory, setRawInventory] = useState<RawInventoryItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([
    { rawItemId: "", rawItemName: "", currentQuantity: 0, unit: "", useQuantity: 0 }
  ]);
  const [manualBatchNo, setManualBatchNo] = useState("");
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchStatus, setBatchStatus] = useState<"in process" | "approved" | "discarded">("in process");
  const [producedItemName, setProducedItemName] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedBatchNo, setGeneratedBatchNo] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const [isEditStatusOpen, setIsEditStatusOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [newStatus, setNewStatus] = useState<"in process" | "approved" | "discarded">("in process");
  const [approvedProducedName, setApprovedProducedName] = useState("");
  const [actualOutputQuantity, setActualOutputQuantity] = useState<string>("");
  const [itemNameSuggestions, setItemNameSuggestions] = useState<string[]>([]);
  const [processedInventoryNames, setProcessedInventoryNames] = useState<string[]>([]);
  const { toast } = useToast();

  const exportRows = batches.map((b) => ({
    "Batch No": b.batchNo,
    "Manual Batch No": b.manualBatchNo ?? "",
    Status: b.status,
    "Created At": b.createdAt ? new Date(b.createdAt).toLocaleString() : "",
    "Items Count": b.items?.length ?? 0,
    "Total Input Qty": (b.items ?? []).reduce((sum, item) => sum + (Number(item.useQuantity) || 0), 0),
  }));

  const fetchRawInventory = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      return;
    }
    try {
      const inventoryRef = collection(db, "rawInventory");
      const snapshot = await getDocs(inventoryRef);
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RawInventoryItem[];
      setRawInventory(items);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  };

  const fetchItemNameSuggestions = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      return;
    }
    try {
      const suggestionsRef = collection(db, "itemNameSuggestions");
      const snapshot = await getDocs(suggestionsRef);
      const suggestions = snapshot.docs.map((doc) => doc.data().name as string);
      setItemNameSuggestions(suggestions);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    }
  };

  const fetchProcessedInventoryNames = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      return;
    }
    try {
      const processedRef = collection(db, "processedInventory");
      const snapshot = await getDocs(processedRef);
      // Extract unique material names from processed inventory
      const names = snapshot.docs.map((doc) => doc.data().name as string);
      const uniqueNames = Array.from(new Set(names)); // Remove duplicates
      setProcessedInventoryNames(uniqueNames);
    } catch (error) {
      console.error("Error fetching processed inventory names:", error);
    }
  };

  const addItemNameSuggestion = async (name: string) => {
    if (!db) return;
    
    try {
      // Check if already exists
      if (itemNameSuggestions.includes(name)) {
        toast({
          title: "Info",
          description: "This item name already exists in suggestions",
        });
        return;
      }

      // Use the name as the document ID to prevent duplicates
      const suggestionDocRef = doc(db, "itemNameSuggestions", name);
      await setDoc(suggestionDocRef, {
        name,
        createdAt: Timestamp.now(),
      });

      setItemNameSuggestions([...itemNameSuggestions, name]);
      toast({
        title: "Success",
        description: "Item name added to suggestions",
      });
    } catch (error) {
      console.error("Error adding suggestion:", error);
      toast({
        title: "Error",
        description: "Failed to add suggestion",
        variant: "destructive",
      });
    }
  };

  const removeItemNameSuggestion = async (name: string) => {
    if (!db) return;
    
    try {
      const suggestionDocRef = doc(db, "itemNameSuggestions", name);
      await deleteDoc(suggestionDocRef);

      setItemNameSuggestions(itemNameSuggestions.filter(s => s !== name));
      toast({
        title: "Success",
        description: "Item name removed from suggestions",
      });
    } catch (error) {
      console.error("Error removing suggestion:", error);
      toast({
        title: "Error",
        description: "Failed to remove suggestion",
        variant: "destructive",
      });
    }
  };

  const fetchBatches = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      return;
    }
    try {
      const batchesRef = collection(db, "batches");
      const snapshot = await getDocs(batchesRef);
      const batchData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as Batch[];
      setBatches(batchData);
    } catch (error) {
      console.error("Error fetching batches:", error);
    }
  };

  const generateBatchNumber = async () => {
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const year = now.getFullYear().toString().slice(-2);
    const prefix = `BTC${month}${year}`;
    
    if (!db) {
      return `${prefix}001`;
    }
    
    try {
      const batchesRef = collection(db, "batches");
      const q = query(batchesRef, orderBy("createdAt", "desc"), limit(50));
      const snapshot = await getDocs(q);
      
      let serialNumber = 1;
      
      // Find the last batch with the same month and year prefix
      if (!snapshot.empty) {
        for (const doc of snapshot.docs) {
          const batchData = doc.data();
          const batchNo = batchData.batchNo as string;
          
          // Check if this batch is from the same month and year (e.g., BTCJAN26)
          if (batchNo.startsWith(prefix)) {
            // Extract the serial number (e.g., BTCJAN26001 -> 001)
            const lastSerial = parseInt(batchNo.slice(prefix.length));
            if (!isNaN(lastSerial)) {
              serialNumber = lastSerial + 1;
              break;
            }
          }
        }
      }
      
      const serialStr = serialNumber.toString().padStart(3, '0');
      return `${prefix}${serialStr}`;
    } catch (error) {
      console.error("Error generating batch number:", error);
      return `${prefix}001`;
    }
  };

  useEffect(() => {
    fetchRawInventory();
    fetchBatches();
    fetchItemNameSuggestions();
    fetchProcessedInventoryNames();
    generateBatchNumber().then(setGeneratedBatchNo);
  }, []);

  const handleSaveBatch = async () => {
    // Validation
    const validItems = batchItems.filter(item => item.rawItemId && item.useQuantity > 0);
    if (validItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item with quantity",
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
    
    try {
      const batchNo = await generateBatchNumber();

      // If creating an approved batch, ensure produced item name and actual output quantity are provided
      if (batchStatus === "approved") {
        if (producedItemName.trim() === "") {
          toast({
            title: "Error",
            description: "Please enter the produced item name for approved batches",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const outputQty = parseFloat(actualOutputQuantity);
        if (!actualOutputQuantity || isNaN(outputQty) || outputQty <= 0) {
          toast({
            title: "Error",
            description: "Please enter a valid actual output quantity",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      // Save batch to Firebase
      const batchesRef = collection(db, "batches");
      await addDoc(batchesRef, {
        batchNo,
        manualBatchNo: manualBatchNo.trim() || null,
        items: validItems,
        status: batchStatus,
        batchDate,
        createdAt: Timestamp.now(),
        ...(batchStatus === "approved" ? { 
          actualOutputQuantity: parseFloat(actualOutputQuantity),
          producedItemName: producedItemName.trim() || `Finished Batch ${batchNo}`
        } : {}),
      });

      // Update raw inventory quantities
      for (const item of validItems) {
        const inventoryDocRef = doc(db, "rawInventory", item.rawItemId);
        const currentItem = rawInventory.find(inv => inv.id === item.rawItemId);
        if (currentItem) {
          const newQuantity = parseFloat(currentItem.quantity) - item.useQuantity;
          await updateDoc(inventoryDocRef, {
            quantity: newQuantity.toString(),
          });
        }
      }

      // If status is approved, create finished goods in processed inventory
      if (batchStatus === "approved") {
        const processedInventoryRef = collection(db, "processedInventory");
        
        // Use actual output quantity instead of sum of inputs
        const totalQuantity = parseFloat(actualOutputQuantity);
        
        const itemName = producedItemName.trim() || `Finished Batch ${batchNo}`;
        
        // Check if material with same name already exists
        const existingQuery = query(processedInventoryRef, where("name", "==", itemName));
        const existingSnapshot = await getDocs(existingQuery);
        
        if (!existingSnapshot.empty) {
          // Material exists - update the quantity by adding to existing
          const existingDoc = existingSnapshot.docs[0];
          const existingData = existingDoc.data();
          const existingQuantity = parseFloat(existingData.quantity) || 0;
          const newTotalQuantity = existingQuantity + totalQuantity;
          
          await updateDoc(doc(db, "processedInventory", existingDoc.id), {
            quantity: newTotalQuantity.toString(),
            lastUpdated: new Date().toISOString().split('T')[0],
          });
          
          console.log(`Updated existing product - ID: ${existingData.productId || existingDoc.id}, Name: ${itemName}, New Total: ${newTotalQuantity}kg`);
        } else {
          // Material doesn't exist - create new entry with unique product ID
          const productId = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          
          await addDoc(processedInventoryRef, {
            productId,
            name: itemName,
            batchNo,
            quantity: totalQuantity.toString(),
            unit: validItems[0]?.unit || "kg",
            category: "Finished Goods",
            location: "Production",
            status: "In Stock",
            processDate: batchDate,
            createdAt: Timestamp.now(),
          });
          
          console.log(`Created new product - ID: ${productId}, Name: ${itemName}, Quantity: ${totalQuantity}kg`);
        }

        // Automatically add to suggestions if not already there
        if (producedItemName.trim() && !itemNameSuggestions.includes(producedItemName.trim())) {
          await addItemNameSuggestion(producedItemName.trim());
        }
      }

      toast({
        title: "Success",
        description: `Batch ${batchNo} created successfully`,
      });

      // Reset form and refresh data
      setBatchItems([{ rawItemId: "", rawItemName: "", currentQuantity: 0, unit: "", useQuantity: 0 }]);
      setManualBatchNo("");
      setProducedItemName("");
      setActualOutputQuantity("");
      setBatchDate(new Date().toISOString().split('T')[0]);
      setBatchStatus("in process");
      setIsAddRecipeOpen(false);
      await fetchRawInventory();
      await fetchBatches();
      await fetchProcessedInventoryNames(); // Refresh processed inventory names
      // Generate new batch number for next batch
      generateBatchNumber().then(setGeneratedBatchNo);
    } catch (error) {
      console.error("Error saving batch:", error);
      toast({
        title: "Error",
        description: "Failed to create batch",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddBatchItem = () => {
    setBatchItems([...batchItems, { rawItemId: "", rawItemName: "", currentQuantity: 0, unit: "", useQuantity: 0 }]);
  };

  const handleRemoveBatchItem = (index: number) => {
    if (batchItems.length > 1) {
      const newItems = batchItems.filter((_, i) => i !== index);
      setBatchItems(newItems);
    }
  };

  const handleBatchItemChange = (index: number, field: keyof BatchItem, value: string | number) => {
    const newItems = [...batchItems];
    
    if (field === "rawItemId") {
      const selectedItem = rawInventory.find(item => item.id === value);
      if (selectedItem) {
        newItems[index] = {
          ...newItems[index],
          rawItemId: selectedItem.id,
          rawItemName: selectedItem.name,
          currentQuantity: parseFloat(selectedItem.quantity) || 0,
          unit: selectedItem.unit,
          useQuantity: 0
        };
      }
    } else if (field === "useQuantity") {
      const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
      if (numValue <= newItems[index].currentQuantity) {
        newItems[index][field] = numValue;
      } else {
        toast({
          title: "Error",
          description: "Use quantity cannot exceed current quantity",
          variant: "destructive",
        });
        return;
      }
    } else {
      newItems[index][field] = value as never;
    }
    
    setBatchItems(newItems);
  };

  const handleBatchClick = (batch: Batch) => {
    setSelectedBatch(batch);
    setIsBatchDetailOpen(true);
  };

  const handleEditStatus = (batch: Batch) => {
    setEditingBatch(batch);
    setNewStatus(batch.status as "in process" | "approved" | "discarded");
    setApprovedProducedName("");
    setActualOutputQuantity("");
    setIsEditStatusOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!editingBatch || !db) return;

    setLoading(true);
    try {
      // If status changed to approved, validate required fields
      if (newStatus === "approved" && editingBatch.status !== "approved") {
        // Ensure approved produced name provided
        if (approvedProducedName.trim() === "") {
          toast({
            title: "Error",
            description: "Please enter the produced item name when approving a batch",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Ensure actual output quantity is provided
        const outputQty = parseFloat(actualOutputQuantity);
        if (!actualOutputQuantity || isNaN(outputQty) || outputQty <= 0) {
          toast({
            title: "Error",
            description: "Please enter a valid actual output quantity",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      const batchDocRef = doc(db, "batches", editingBatch.id);
      await updateDoc(batchDocRef, {
        status: newStatus,
        ...(newStatus === "approved" && editingBatch.status !== "approved" 
          ? { 
              actualOutputQuantity: parseFloat(actualOutputQuantity),
              producedItemName: approvedProducedName.trim() || `Finished Batch ${editingBatch.batchNo}`
            } 
          : {}),
      });

      // If status changed to approved, create/update finished goods in processed inventory
      if (newStatus === "approved" && editingBatch.status !== "approved") {
        const processedInventoryRef = collection(db, "processedInventory");
        const totalQuantity = parseFloat(actualOutputQuantity);
        const itemName = approvedProducedName.trim() || `Finished Batch ${editingBatch.batchNo}`;

        // Check if material with same name already exists
        const existingQuery = query(processedInventoryRef, where("name", "==", itemName));
        const existingSnapshot = await getDocs(existingQuery);
        
        if (!existingSnapshot.empty) {
          // Material exists - update the quantity by adding to existing
          const existingDoc = existingSnapshot.docs[0];
          const existingData = existingDoc.data();
          const existingQuantity = parseFloat(existingData.quantity) || 0;
          const newTotalQuantity = existingQuantity + totalQuantity;
          
          await updateDoc(doc(db, "processedInventory", existingDoc.id), {
            quantity: newTotalQuantity.toString(),
            lastUpdated: new Date().toISOString().split('T')[0],
          });
          
          console.log(`Updated existing product - ID: ${existingData.productId || existingDoc.id}, Name: ${itemName}, New Total: ${newTotalQuantity}kg`);
        } else {
          // Material doesn't exist - create new entry with unique product ID
          const productId = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          
          await addDoc(processedInventoryRef, {
            productId,
            name: itemName,
            batchNo: editingBatch.batchNo,
            quantity: totalQuantity.toString(),
            unit: editingBatch.items[0]?.unit || "kg",
            category: "Finished Goods",
            location: "Production",
            status: "In Stock",
            processDate: new Date().toISOString().split('T')[0],
            createdAt: Timestamp.now(),
          });
          
          console.log(`Created new product - ID: ${productId}, Name: ${itemName}, Quantity: ${totalQuantity}kg`);
        }

        // Automatically add to suggestions if not already there
        if (approvedProducedName.trim() && !itemNameSuggestions.includes(approvedProducedName.trim())) {
          await addItemNameSuggestion(approvedProducedName.trim());
        }
        
        setApprovedProducedName("");
        setActualOutputQuantity("");
      }

      toast({
        title: "Success",
        description: "Batch status updated successfully",
      });

      setIsEditStatusOpen(false);
      setEditingBatch(null);
      await fetchBatches();
      await fetchProcessedInventoryNames(); // Refresh processed inventory names
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update batch status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const rawMaterialColumns = [
    { key: "name" as keyof RawMaterial, header: "Material Name" },
    { key: "batchNo" as keyof RawMaterial, header: "Batch No." },
    { key: "quantity" as keyof RawMaterial, header: "Quantity" },
    { 
      key: "status" as keyof RawMaterial, 
      header: "Status",
      render: (item: RawMaterial) => (
        <span className={`badge-type ${
          item.status === "In Stock" ? "badge-processed" : 
          item.status === "Low Stock" ? "bg-warning/20 text-warning" : 
          "badge-raw"
        }`}>
          {item.status}
        </span>
      )
    },
    { key: "supplier" as keyof RawMaterial, header: "Supplier" },
    { key: "expiryDate" as keyof RawMaterial, header: "Expiry Date" },
  ];

  const processedMaterialColumns = [
    { key: "name" as keyof ProcessedMaterial, header: "Product Name" },
    { key: "batchNo" as keyof ProcessedMaterial, header: "Batch No." },
    { key: "quantity" as keyof ProcessedMaterial, header: "Quantity" },
    { key: "processDate" as keyof ProcessedMaterial, header: "Process Date" },
    { 
      key: "status" as keyof ProcessedMaterial, 
      header: "Status",
      render: (item: ProcessedMaterial) => (
        <span className={`badge-type ${
          item.status === "Completed" ? "badge-processed" : 
          item.status === "Quality Check" ? "bg-warning/20 text-warning" : 
          "badge-raw"
        }`}>
          {item.status}
        </span>
      )
    },
    { 
      key: "yield" as keyof ProcessedMaterial, 
      header: "Yield",
      render: (item: ProcessedMaterial) => (
        <span className="text-success font-medium">{item.yield}</span>
      )
    },
  ];

  const batchColumns = [
    { 
      key: "batchNo" as keyof Batch, 
      header: "System Batch No.",
    },
    { 
      key: "manualBatchNo" as keyof Batch, 
      header: "Manual Batch No.",
      render: (item: Batch) => (
        <span>{item.manualBatchNo || "-"}</span>
      )
    },
    { 
      key: "items" as keyof Batch, 
      header: "Materials Used",
      render: (item: Batch) => (
        <div className="text-sm">
          {item.items.map((batchItem, idx) => (
            <div key={idx} className="text-muted-foreground">
              {batchItem.rawItemName}: {batchItem.useQuantity} {batchItem.unit}
            </div>
          ))}
        </div>
      )
    },
    { 
      key: "status" as keyof Batch, 
      header: "Status",
      render: (item: Batch) => (
        <span className={`badge-type ${
          item.status === "approved" ? "badge-processed" : 
          item.status === "discarded" ? "bg-destructive/20 text-destructive" : 
          "bg-warning/20 text-warning"
        }`}>
          {item.status === "approved" ? "Approved" : 
           item.status === "discarded" ? "Discarded" : "In Process"}
        </span>
      )
    },
    { 
      key: "createdAt" as keyof Batch, 
      header: "Created At",
      render: (item: Batch) => (
        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
      )
    },
    {
      key: "id" as keyof Batch,
      header: "Actions",
      render: (item: Batch) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              handleBatchClick(item);
            }}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              handleEditStatus(item);
            }}>
              <Edit className="h-4 w-4 mr-2" />
              Update Status
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  ];

  return (
    <>
      <AppHeader title="Processing Dashboard" subtitle="Create and manage batches from raw materials" />
      
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Batches"
            value={batches.length}
            change="+12%"
            changeType="positive"
            icon={FlaskConical}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="In Process"
            value={batches.filter(b => b.status === "in process").length}
            change="+8%"
            changeType="positive"
            icon={Package}
            iconBgColor="bg-info/20"
            iconColor="text-info"
          />
          <StatCard
            title="Approved Batches"
            value={batches.filter(b => b.status === "approved").length}
            change="+15%"
            changeType="positive"
            icon={CheckCircle2}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Available Materials"
            value={rawInventory.length}
            change="+5%"
            changeType="positive"
            icon={Beaker}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
        </div>

        {/* Batches Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="section-title">Created Batches</h2>
              <p className="section-subtitle">View all batches created from raw materials</p>
            </div>
            <div className="flex items-center gap-2">
              <ExportExcelButton
                rows={exportRows}
                fileName="processing-batches"
                sheetName="Batches"
                label="Export to Excel"
                variant="outline"
              />
              <Button onClick={() => setIsAddRecipeOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Recipe
              </Button>
            </div>
          </div>
          <div className="p-6">
            {batches.length > 0 ? (
              <DataTable
                data={batches}
                columns={batchColumns}
                keyField="id"
                onRowClick={handleBatchClick}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FlaskConical className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No batches created yet</p>
                <p className="text-sm mt-2">Click "Add Recipe" below to create your first batch</p>
              </div>
            )}
          </div>
        </div>

        {/* Add Recipe/Batch Dialog */}
        <Dialog open={isAddRecipeOpen} onOpenChange={setIsAddRecipeOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Batch</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-6">
                {/* Batch Numbers - Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* System Generated Batch Number */}
                  <div>
                    <Label className="text-sm font-medium mb-2">System Generated Batch Number</Label>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-lg font-semibold">{generatedBatchNo || "Loading..."}</p>
                    </div>
                  </div>

                  {/* Manual Batch Number */}
                  <div>
                    <Label htmlFor="manualBatchNo" className="text-sm font-medium">Manual Batch Number (Optional)</Label>
                    <Input
                      id="manualBatchNo"
                      value={manualBatchNo}
                      onChange={(e) => setManualBatchNo(e.target.value)}
                      placeholder="Enter manual batch number"
                      className="mt-2"
                    />
                  </div>
                </div>

                {/* Batch Date */}
                <div>
                  <Label htmlFor="batchDate">Batch Date *</Label>
                  <Input
                    id="batchDate"
                    type="date"
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                  />
                </div>

                {/* Batch Status */}
                <div>
                  <Label htmlFor="batchStatus">Batch Status *</Label>
                  <Select
                    value={batchStatus}
                    onValueChange={(value) => setBatchStatus(value as "in process" | "approved" | "discarded")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in process">In Process</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="discarded">Discarded</SelectItem>
                    </SelectContent>
                  </Select>
                  {batchStatus === "approved" && (
                    <div className="mt-3">
                      <Label htmlFor="producedItemName">Produced Item Name *</Label>
                      <AutocompleteInput
                        id="producedItemName"
                        value={producedItemName}
                        onChange={setProducedItemName}
                        suggestions={Array.from(new Set([...processedInventoryNames, ...itemNameSuggestions]))}
                        onAddSuggestion={addItemNameSuggestion}
                        onRemoveSuggestion={removeItemNameSuggestion}
                        placeholder="Type to search existing materials or add new"
                        className="mt-2"
                      />
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-border pt-4">
                  <Label className="text-sm font-medium mb-3 block">Raw Materials</Label>
                </div>
              </div>

              <div className="space-y-4 mt-4">
                {batchItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-3 items-end p-4 border border-border rounded-lg bg-muted/30">
                    <div className="col-span-11 grid grid-cols-3 gap-3">
                      {/* Raw Item Selection */}
                      <div className="space-y-2">
                        <Label>Raw Item</Label>
                        <Select
                          value={item.rawItemId}
                          onValueChange={(value) => handleBatchItemChange(index, "rawItemId", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {rawInventory.map((invItem) => (
                              <SelectItem key={invItem.id} value={invItem.id}>
                                {invItem.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Current Quantity Display */}
                      <div className="space-y-2">
                        <Label>Current Quantity</Label>
                        <Input
                          value={item.currentQuantity > 0 ? `${item.currentQuantity} ${item.unit}` : ""}
                          disabled
                          className="bg-background"
                          placeholder="Select item first"
                        />
                      </div>

                      {/* Use Quantity Input */}
                      <div className="space-y-2">
                        <Label>Use Quantity ({item.unit || "unit"})</Label>
                        <Input
                          type="number"
                          value={item.useQuantity || ""}
                          onChange={(e) => handleBatchItemChange(index, "useQuantity", e.target.value)}
                          placeholder="Enter quantity"
                          max={item.currentQuantity}
                          min={0}
                          disabled={!item.rawItemId}
                        />
                      </div>
                    </div>

                    {/* Remove Button */}
                    <div className="col-span-1 flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveBatchItem(index)}
                        disabled={batchItems.length === 1}
                        className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Add More Items Button */}
                <Button
                  variant="outline"
                  onClick={handleAddBatchItem}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Raw Item
                </Button>

                {/* Actual Output Quantity - Only show for approved status */}
                {batchStatus === "approved" && (
                  <div className="mt-4 p-4 border border-primary/30 rounded-lg bg-primary/5">
                    <Label htmlFor="actualOutputQuantityCreate">Actual Output Quantity (kg) *</Label>
                    <Input
                      id="actualOutputQuantityCreate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={actualOutputQuantity}
                      onChange={(e) => setActualOutputQuantity(e.target.value)}
                      placeholder="Enter actual produced quantity"
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Total input: {batchItems.reduce((sum, item) => sum + item.useQuantity, 0).toFixed(2)} kg
                    </p>
                  </div>
                )}
              </div>

              {/* Summary */}
              {batchItems.some(item => item.useQuantity > 0) && (
                <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <h4 className="font-semibold text-sm mb-2">Batch Summary</h4>
                  <div className="space-y-1 text-sm">
                    {batchItems.filter(item => item.useQuantity > 0).map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.rawItemName}</span>
                        <span className="font-medium">{item.useQuantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddRecipeOpen(false);
                setBatchItems([{ rawItemId: "", rawItemName: "", currentQuantity: 0, unit: "", useQuantity: 0 }]);
                setManualBatchNo("");
                setProducedItemName("");
                setActualOutputQuantity("");
                setBatchDate(new Date().toISOString().split("T")[0]);
                setBatchStatus("in process");
              }}>
                Cancel
              </Button>
              <Button onClick={handleSaveBatch} disabled={loading}>
                {loading ? "Saving..." : "Save Batch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Detail Dialog */}
        <Dialog open={isBatchDetailOpen} onOpenChange={setIsBatchDetailOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Batch Details</DialogTitle>
            </DialogHeader>
            {selectedBatch && (
              <div className="py-4 space-y-6">
                {/* Batch Information */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">System Batch Number</Label>
                      <p className="text-lg font-semibold">{selectedBatch.batchNo}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Manual Batch Number</Label>
                      <p className="text-lg font-semibold">{selectedBatch.manualBatchNo || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Status</Label>
                      <div className="mt-1">
                        <span className={`badge-type ${
                          selectedBatch.status === "approved" ? "badge-processed" : 
                          selectedBatch.status === "discarded" ? "bg-destructive/20 text-destructive" : 
                          "bg-warning/20 text-warning"
                        }`}>
                          {selectedBatch.status === "approved" ? "Approved" : 
                           selectedBatch.status === "discarded" ? "Discarded" : "In Process"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Created Date</Label>
                    <p className="text-base font-medium">{new Date(selectedBatch.createdAt).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</p>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Materials Used */}
                <div>
                  <Label className="text-sm font-medium mb-3 block">Raw Materials Used</Label>
                  <div className="space-y-3">
                    {selectedBatch.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <p className="font-medium">{item.rawItemName}</p>
                          <p className="text-sm text-muted-foreground">Available: {item.currentQuantity} {item.unit}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary">{item.useQuantity} {item.unit}</p>
                          <p className="text-xs text-muted-foreground">Used</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <h4 className="font-semibold text-sm mb-2">Batch Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Materials:</span>
                      <span className="font-medium">{selectedBatch.items.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Quantity Used:</span>
                      <span className="font-medium">
                        {selectedBatch.items.reduce((sum, item) => sum + item.useQuantity, 0).toFixed(2)} {selectedBatch.items[0]?.unit || 'units'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsBatchDetailOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Status Dialog */}
        <Dialog open={isEditStatusOpen} onOpenChange={setIsEditStatusOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Update Batch Status</DialogTitle>
            </DialogHeader>
            {editingBatch && (
              <div className="py-4 space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Batch Number</Label>
                  <p className="text-lg font-semibold">{editingBatch.batchNo}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Current Status</Label>
                  <span className={`badge-type ${
                    editingBatch.status === "approved" ? "badge-processed" : 
                    editingBatch.status === "discarded" ? "bg-destructive/20 text-destructive" : 
                    "bg-warning/20 text-warning"
                  }`}>
                    {editingBatch.status === "approved" ? "Approved" : 
                     editingBatch.status === "discarded" ? "Discarded" : "In Process"}
                  </span>
                </div>
                <div>
                  <Label htmlFor="newStatus">New Status *</Label>
                  <Select
                    value={newStatus}
                    onValueChange={(value) => setNewStatus(value as "in process" | "approved" | "discarded")}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in process">In Process</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="discarded">Discarded</SelectItem>
                    </SelectContent>
                  </Select>
                  {newStatus === "approved" && editingBatch.status !== "approved" && (
                    <>
                      <div className="mt-3">
                        <Label htmlFor="approvedProducedName">Produced Item Name *</Label>
                        <AutocompleteInput
                          id="approvedProducedName"
                          value={approvedProducedName}
                          onChange={setApprovedProducedName}
                          suggestions={Array.from(new Set([...processedInventoryNames, ...itemNameSuggestions]))}
                          onAddSuggestion={addItemNameSuggestion}
                          onRemoveSuggestion={removeItemNameSuggestion}
                          placeholder="Type to search existing materials or add new"
                          className="mt-2"
                        />
                      </div>
                      <div className="mt-3">
                        <Label htmlFor="actualOutputQuantity">Actual Output Quantity (kg) *</Label>
                        <Input
                          id="actualOutputQuantity"
                          type="number"
                          step="0.01"
                          min="0"
                          value={actualOutputQuantity}
                          onChange={(e) => setActualOutputQuantity(e.target.value)}
                          placeholder="Enter actual produced quantity"
                          className="mt-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Total input: {editingBatch.items.reduce((sum, item) => sum + item.useQuantity, 0).toFixed(2)} kg
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsEditStatusOpen(false);
                setEditingBatch(null);
                setApprovedProducedName("");
                setActualOutputQuantity("");
              }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateStatus} disabled={loading}>
                {loading ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
