import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DataTable } from "@/components/tables/DataTable";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { 
  Calculator, 
  TrendingDown,
  Eye,
  Download,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

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
  batchDate: string;
  actualOutputQuantity?: number;
  producedItemName?: string;
}

interface ProcessedInventoryItem {
  id: string;
  name: string;
  batchNo: string;
  quantity: string;
  unit: string;
}

interface LossCalculationData {
  id: string;
  batchNo: string;
  manualBatchNo?: string;
  rawMaterialName: string;
  rawMaterialUsed: number;
  unit: string;
  productName: string;
  productQuantity: number;
  lossQuantity: number;
  lossPercentage: number;
  status: string;
  date: string;
}

export default function LossCalculation() {
  const [lossData, setLossData] = useState<LossCalculationData[]>([]);
  const [filteredData, setFilteredData] = useState<LossCalculationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLoss, setSelectedLoss] = useState<LossCalculationData | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();

  const fetchLossCalculations = async () => {
    if (!db) {
      console.warn("Firebase not initialized");
      return;
    }

    try {
      setLoading(true);
      
      // Fetch all batches
      const batchesRef = collection(db, "batches");
      const batchesSnapshot = await getDocs(batchesRef);
      const batches = batchesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as Batch[];

      // Fetch processed inventory
      const processedRef = collection(db, "processedInventory");
      const processedSnapshot = await getDocs(processedRef);
      const processedInventory = processedSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ProcessedInventoryItem[];

      // Calculate loss for each batch
      const calculations: LossCalculationData[] = [];

      batches.forEach((batch) => {
        // Only process approved batches that have actual output quantity
        if (batch.status !== 'approved' || !batch.actualOutputQuantity) {
          return;
        }

        // Find corresponding processed inventory item
        const processedItem = processedInventory.find(item => item.batchNo === batch.batchNo);

        // Calculate total raw materials used
        const totalRawUsed = batch.items.reduce((sum, item) => sum + item.useQuantity, 0);
        
        // Use the actual output quantity from the batch
        const actualOutput = batch.actualOutputQuantity;
        
        // Calculate total loss (input - output)
        const totalLoss = totalRawUsed - actualOutput;
        const lossPercentage = totalRawUsed > 0 ? (totalLoss / totalRawUsed) * 100 : 0;

        // Create one entry per batch showing overall loss
        calculations.push({
          id: batch.id,
          batchNo: batch.batchNo,
          manualBatchNo: batch.manualBatchNo,
          rawMaterialName: batch.items.map(item => item.rawItemName).join(', '),
          rawMaterialUsed: totalRawUsed,
          unit: batch.items[0]?.unit || 'kg',
          productName: batch.producedItemName || processedItem?.name || "N/A",
          productQuantity: actualOutput,
          lossQuantity: totalLoss,
          lossPercentage: Math.max(0, lossPercentage),
          status: batch.status,
          date: batch.batchDate || new Date(batch.createdAt).toISOString().split('T')[0],
        });
      });

      setLossData(calculations);
      setFilteredData(calculations);
    } catch (error) {
      console.error("Error fetching loss calculations:", error);
      toast({
        title: "Error",
        description: "Failed to fetch loss calculation data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLossCalculations();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = lossData.filter((item) =>
        item.batchNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.rawMaterialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredData(filtered);
    } else {
      setFilteredData(lossData);
    }
  }, [searchQuery, lossData]);

  const exportRows = filteredData.map((item) => ({
    "Batch No": item.batchNo,
    "Manual Batch No": item.manualBatchNo || "",
    "Raw Material": item.rawMaterialName,
    "Raw Used": item.rawMaterialUsed,
    Unit: item.unit,
    Product: item.productName,
    "Product Qty": item.productQuantity,
    Loss: item.lossQuantity,
    "Loss %": item.lossPercentage,
    Status: item.status,
    Date: item.date,
  }));

  const handleViewDetails = (item: LossCalculationData) => {
    setSelectedLoss(item);
    setIsDetailOpen(true);
  };

  const lossColumns = [
    { 
      key: "batchNo" as keyof LossCalculationData, 
      header: "Batch No.",
      render: (item: LossCalculationData) => (
        <div>
          <div className="font-medium">{item.batchNo}</div>
          {item.manualBatchNo && (
            <div className="text-xs text-muted-foreground">{item.manualBatchNo}</div>
          )}
        </div>
      )
    },
    { 
      key: "rawMaterialName" as keyof LossCalculationData, 
      header: "Raw Material" 
    },
    { 
      key: "rawMaterialUsed" as keyof LossCalculationData, 
      header: "Quantity Used",
      render: (item: LossCalculationData) => (
        <span>{item.rawMaterialUsed.toFixed(2)} {item.unit}</span>
      )
    },
    { 
      key: "productName" as keyof LossCalculationData, 
      header: "Product Created" 
    },
    { 
      key: "productQuantity" as keyof LossCalculationData, 
      header: "Product Quantity",
      render: (item: LossCalculationData) => (
        <span>{item.productQuantity.toFixed(2)} {item.unit}</span>
      )
    },
    { 
      key: "lossQuantity" as keyof LossCalculationData, 
      header: "Loss",
      render: (item: LossCalculationData) => (
        <span className="text-destructive font-medium">
          {item.lossQuantity.toFixed(2)} {item.unit}
        </span>
      )
    },
    { 
      key: "lossPercentage" as keyof LossCalculationData, 
      header: "Loss %",
      render: (item: LossCalculationData) => (
        <span className={`font-semibold ${
          item.lossPercentage > 10 ? 'text-destructive' : 
          item.lossPercentage > 5 ? 'text-warning' : 
          'text-success'
        }`}>
          {item.lossPercentage.toFixed(2)}%
        </span>
      )
    },
    { 
      key: "status" as keyof LossCalculationData, 
      header: "Status",
      render: (item: LossCalculationData) => (
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
      key: "date" as keyof LossCalculationData, 
      header: "Date" 
    },
    {
      key: "id" as keyof LossCalculationData,
      header: "Actions",
      render: (item: LossCalculationData) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewDetails(item)}
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          View
        </Button>
      )
    },
  ];

  // Calculate statistics
  const totalLoss = filteredData.reduce((sum, item) => sum + item.lossQuantity, 0);
  const avgLossPercentage = filteredData.length > 0 
    ? filteredData.reduce((sum, item) => sum + item.lossPercentage, 0) / filteredData.length 
    : 0;
  const highLossCount = filteredData.filter(item => item.lossPercentage > 10).length;

  return (
    <>
      <AppHeader 
        title="Loss Calculation" 
        subtitle="Track and analyze raw material loss in production" 
      />
      
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Batches</p>
                <p className="text-3xl font-bold text-foreground">{filteredData.length}</p>
                <p className="text-sm text-muted-foreground mt-1">Analyzed</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Calculator className="h-6 w-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Loss</p>
                <p className="text-3xl font-bold text-destructive">{totalLoss.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground mt-1">kg</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Avg Loss %</p>
                <p className="text-3xl font-bold text-warning">{avgLossPercentage.toFixed(2)}%</p>
                <p className="text-sm text-muted-foreground mt-1">Overall</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
                <Calculator className="h-6 w-6 text-warning" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">High Loss</p>
                <p className="text-3xl font-bold text-destructive">{highLossCount}</p>
                <p className="text-sm text-muted-foreground mt-1">&gt;10% loss</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="section-title">Loss Calculation Records</h2>
              <p className="section-subtitle">Detailed analysis of raw material usage and loss</p>
            </div>
            <div className="flex items-center gap-2">
              <ExportExcelButton
                rows={exportRows}
                fileName="loss-calculation"
                sheetName="Loss Calculation"
                label="Export to Excel"
                variant="outline"
              />
            </div>
          </div>

          {/* Search Filter */}
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <div className="max-w-md">
              <Label htmlFor="search" className="text-sm font-medium mb-2 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by batch, material, or product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calculator className="w-12 h-12 mx-auto mb-4 opacity-20 animate-pulse" />
                <p>Loading loss calculations...</p>
              </div>
            ) : filteredData.length > 0 ? (
              <DataTable
                data={filteredData}
                columns={lossColumns}
                keyField="id"
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calculator className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No loss calculation data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Loss Calculation Details</DialogTitle>
            </DialogHeader>
            {selectedLoss && (
              <div className="py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Batch Number</Label>
                    <p className="text-base font-semibold">{selectedLoss.batchNo}</p>
                    {selectedLoss.manualBatchNo && (
                      <p className="text-xs text-muted-foreground">{selectedLoss.manualBatchNo}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Date</Label>
                    <p className="text-base font-semibold">{selectedLoss.date}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="font-semibold mb-3">Raw Material</h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Material:</span>
                      <span className="font-medium">{selectedLoss.rawMaterialName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantity Used:</span>
                      <span className="font-medium">{selectedLoss.rawMaterialUsed.toFixed(2)} {selectedLoss.unit}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="font-semibold mb-3">Product Created</h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product:</span>
                      <span className="font-medium">{selectedLoss.productName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium">{selectedLoss.productQuantity.toFixed(2)} {selectedLoss.unit}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="font-semibold mb-3">Loss Analysis</h4>
                  <div className="bg-destructive/10 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Loss Quantity:</span>
                      <span className="font-bold text-destructive">{selectedLoss.lossQuantity.toFixed(2)} {selectedLoss.unit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Loss Percentage:</span>
                      <span className="font-bold text-destructive">{selectedLoss.lossPercentage.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
