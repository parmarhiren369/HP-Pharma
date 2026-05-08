import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { 
  Settings as SettingsIcon, 
  Trash2,
  AlertTriangle,
  Database,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc, addDoc, Timestamp, writeBatch } from "firebase/firestore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingDummy, setIsAddingDummy] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();

  const deleteSnapshotInBatches = async (docs: Array<{ ref: ReturnType<typeof doc> }>) => {
    // Firestore limits writes per batch to 500. Keep margin for safety.
    const BATCH_SIZE = 450;
    let deleted = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);
      for (const d of chunk) batch.delete(d.ref);
      await batch.commit();
      deleted += chunk.length;
    }

    return deleted;
  };

  const deleteCollectionDocs = async (collectionName: string) => {
    const snapshot = await getDocs(collection(db, collectionName));
    if (snapshot.empty) return 0;
    return deleteSnapshotInBatches(snapshot.docs);
  };

  const deleteAllData = async () => {
    if (!db) {
      toast({
        title: "Error",
        description: "Database connection not available",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    let totalDeleted = 0;

    try {
      // 1) Delete nested data first (doctors/*/patients)
      const doctorsSnap = await getDocs(collection(db, "doctors"));
      for (const doctorDoc of doctorsSnap.docs) {
        const patientsSnap = await getDocs(collection(db, "doctors", doctorDoc.id, "patients"));
        totalDeleted += await deleteSnapshotInBatches(patientsSnap.docs);
      }

      // 2) Delete top-level collections
      // Keep this list in sync with collections used across the app.
      const collectionsToDelete = [
        "purchases",
        "suppliers",
        "items",
        "customers",
        "rawInventory",
        "processedInventory",
        "batches",
        "itemNameSuggestions",
        "doctors",
        "transactions",
        "bankAccounts",
        "cashAccounts",
        "accountingTransactions",
        "invoices",
        "quotations",
        "proformaInvoices",
        "payments",
        "debitCreditNotes",
      ];

      for (const collectionName of collectionsToDelete) {
        console.log(`Deleting documents from ${collectionName}...`);
        totalDeleted += await deleteCollectionDocs(collectionName);
      }

      toast({
        title: "Success",
        description: `All data deleted successfully. ${totalDeleted} records removed.`,
      });

      // Close dialogs
      setShowDeleteDialog(false);
      setShowConfirmDialog(false);

      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error) {
      console.error("Error deleting data:", error);
      toast({
        title: "Error",
        description: "Failed to delete all data. Some records may remain.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleFirstConfirm = () => {
    setShowDeleteDialog(false);
    setShowConfirmDialog(true);
  };

  const addDummyData = async () => {
    if (!db) {
      toast({
        title: "Error",
        description: "Database connection not available",
        variant: "destructive",
      });
      return;
    }

    setIsAddingDummy(true);
    let totalAdded = 0;

    try {
      // Add dummy raw inventory items
      const rawInventoryData = [
        {
          name: "Paracetamol API",
          category: "Active Ingredient",
          quantity: "500",
          unit: "kg",
          location: "Warehouse A",
          status: "Adequate",
          supplier: "ChemPharma Ltd",
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          name: "Lactose Monohydrate",
          category: "Excipient",
          quantity: "1000",
          unit: "kg",
          location: "Warehouse A",
          status: "Adequate",
          supplier: "BioSupply Co",
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          name: "Microcrystalline Cellulose",
          category: "Excipient",
          quantity: "750",
          unit: "kg",
          location: "Warehouse B",
          status: "Adequate",
          supplier: "ChemPharma Ltd",
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          name: "Magnesium Stearate",
          category: "Lubricant",
          quantity: "150",
          unit: "kg",
          location: "Warehouse A",
          status: "Low",
          supplier: "Global Ingredients",
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          name: "Ibuprofen API",
          category: "Active Ingredient",
          quantity: "300",
          unit: "kg",
          location: "Warehouse C",
          status: "Adequate",
          supplier: "PharmaChem Inc",
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
      ];

      const rawInventoryRef = collection(db, "rawInventory");
      for (const item of rawInventoryData) {
        await addDoc(rawInventoryRef, item);
        totalAdded++;
      }
      console.log(`Added ${rawInventoryData.length} raw inventory items`);

      // Add dummy processed inventory items
      const processedInventoryData = [
        {
          name: "Paracetamol Granules",
          category: "Finished Goods",
          quantity: "450",
          unit: "kg",
          location: "Production",
          reorderLevel: "100 kg",
          status: "In Stock",
          batchNo: "BTCJAN26001",
          processedDate: new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          name: "Ibuprofen Tablets",
          category: "Finished Goods",
          quantity: "250",
          unit: "kg",
          location: "Production",
          reorderLevel: "50 kg",
          status: "In Stock",
          batchNo: "BTCJAN26002",
          processedDate: new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          name: "Paracetamol Tablets 500mg",
          category: "Finished Goods",
          quantity: "800",
          unit: "kg",
          location: "Production",
          reorderLevel: "200 kg",
          status: "In Stock",
          batchNo: "BTCJAN26003",
          processedDate: new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
      ];

      const processedInventoryRef = collection(db, "processedInventory");
      for (const item of processedInventoryData) {
        await addDoc(processedInventoryRef, item);
        totalAdded++;
      }
      console.log(`Added ${processedInventoryData.length} processed inventory items`);

      // Add dummy item name suggestions
      const suggestionsData = [
        { name: "Paracetamol Granules", createdAt: Timestamp.now() },
        { name: "Ibuprofen Tablets", createdAt: Timestamp.now() },
        { name: "Paracetamol Tablets 500mg", createdAt: Timestamp.now() },
        { name: "Aspirin Granules", createdAt: Timestamp.now() },
        { name: "Amoxicillin Powder", createdAt: Timestamp.now() },
      ];

      const suggestionsRef = collection(db, "itemNameSuggestions");
      for (const suggestion of suggestionsData) {
        await addDoc(suggestionsRef, suggestion);
        totalAdded++;
      }
      console.log(`Added ${suggestionsData.length} item suggestions`);

      // Add dummy batches
      const batchesData = [
        {
          batchNo: "BTCJAN26001",
          manualBatchNo: "MAN-2026-001",
          items: [
            {
              rawItemId: "dummy-id-1",
              rawItemName: "Paracetamol API",
              currentQuantity: 500,
              unit: "kg",
              useQuantity: 50,
            },
          ],
          status: "approved",
          batchDate: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          batchNo: "BTCJAN26002",
          manualBatchNo: "MAN-2026-002",
          items: [
            {
              rawItemId: "dummy-id-2",
              rawItemName: "Ibuprofen API",
              currentQuantity: 300,
              unit: "kg",
              useQuantity: 50,
            },
          ],
          status: "approved",
          batchDate: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
        {
          batchNo: "BTCJAN26003",
          manualBatchNo: null,
          items: [
            {
              rawItemId: "dummy-id-1",
              rawItemName: "Paracetamol API",
              currentQuantity: 500,
              unit: "kg",
              useQuantity: 100,
            },
            {
              rawItemId: "dummy-id-2",
              rawItemName: "Lactose Monohydrate",
              currentQuantity: 1000,
              unit: "kg",
              useQuantity: 200,
            },
          ],
          status: "in process",
          batchDate: new Date().toISOString().split('T')[0],
          createdAt: Timestamp.now(),
        },
      ];

      const batchesRef = collection(db, "batches");
      for (const batch of batchesData) {
        await addDoc(batchesRef, batch);
        totalAdded++;
      }
      console.log(`Added ${batchesData.length} batches`);

      toast({
        title: "Success",
        description: `Dummy data added successfully! ${totalAdded} records created.`,
      });

      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error) {
      console.error("Error adding dummy data:", error);
      toast({
        title: "Error",
        description: "Failed to add dummy data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAddingDummy(false);
    }
  };

  return (
    <>
      <AppHeader 
        title="Settings" 
        subtitle="Manage your application settings and data" 
      />
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Database Management Section */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Database Management</h2>
                  <p className="text-sm text-muted-foreground">Manage your application data</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-2">Danger Zone</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Delete all data from the database. This action will permanently remove:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 mb-6 ml-4">
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All batch records and processing data
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All purchases
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All suppliers, items, and customers
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All raw inventory items
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All processed inventory items
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All doctors and patient records
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All transactions and accounting data
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All bank and cash accounts
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All invoices, quotations, and payments
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                        All item name suggestions
                      </li>
                    </ul>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="destructive"
                        onClick={handleDeleteClick}
                        disabled={isDeleting}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? "Deleting..." : "Delete All Data"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        This action cannot be undone
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Plus className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-2">Test Data</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add dummy data for testing purposes. This will create:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 mb-6 ml-4">
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                        5 raw inventory items (APIs, excipients, lubricants)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                        3 processed inventory items (finished goods)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                        3 batch records (approved and in-process)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                        5 item name suggestions
                      </li>
                    </ul>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="default"
                        onClick={addDummyData}
                        disabled={isAddingDummy}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {isAddingDummy ? "Adding..." : "Add Dummy Data"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Great for testing and demos
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* General Settings Section */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-info/20 flex items-center justify-center">
                  <SettingsIcon className="h-5 w-5 text-info" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">General Settings</h2>
                  <p className="text-sm text-muted-foreground">Configure application preferences</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">Application Version</p>
                    <p className="text-xs text-muted-foreground mt-1">Current version of the system</p>
                  </div>
                  <span className="text-sm font-mono bg-muted px-3 py-1 rounded">v1.0.0</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">Database Status</p>
                    <p className="text-xs text-muted-foreground mt-1">Connection status</p>
                  </div>
                  <span className="text-sm font-medium text-success flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                    Connected
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Environment</p>
                    <p className="text-xs text-muted-foreground mt-1">Current environment mode</p>
                  </div>
                  <span className="text-sm font-mono bg-muted px-3 py-1 rounded">Production</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* First Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all data from your database including:
              <ul className="mt-3 space-y-1 text-sm">
                <li>• All batch records</li>
                <li>• All inventory data</li>
                <li>• All purchases, suppliers, items, and customers</li>
                <li>• All doctors and patient records</li>
                <li>• All transactions, bank accounts, and cash accounts</li>
                <li>• All invoices, quotations, payments, and debit/credit notes</li>
              </ul>
              <p className="mt-3 font-semibold text-destructive">
                This action cannot be undone!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFirstConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Final Confirmation
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p className="font-semibold mb-2">This is your last chance to cancel!</p>
              <p className="mb-3">
                Once you click "Delete All Data", all records will be permanently removed from the database.
              </p>
              <p className="text-destructive font-semibold">
                Are you 100% sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAllData}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
