import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DataTable } from "@/components/tables/DataTable";
import { StatCard } from "@/components/cards/StatCard";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { 
  Users, 
  Plus,
  Pencil,
  Trash2,
  Search,
  TrendingUp,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  DollarSign,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, Timestamp } from "@/lib/firestore-shim";

interface Supplier {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  gst: string;
  opening: number;
  createdAt: Date;
  updatedAt?: Date;
}

const SupplierList = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    gst: "",
    opening: "0"
  });

  const [stats, setStats] = useState({
    totalSuppliers: 0,
    totalOpeningBalance: 0,
    activeSuppliers: 0,
    newThisMonth: 0
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const filtered = suppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.gst.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredSuppliers(filtered);
    
    // Calculate stats
    const totalBalance = suppliers.reduce((sum, c) => sum + (c.opening || 0), 0);
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = suppliers.filter(c => c.createdAt >= firstDayOfMonth).length;
    
    setStats({
      totalSuppliers: suppliers.length,
      totalOpeningBalance: totalBalance,
      activeSuppliers: suppliers.filter(c => c.phone && c.email).length,
      newThisMonth: newThisMonth
    });
  }, [searchTerm, suppliers]);

  const fetchSuppliers = async () => {
    try {
      setIsLoading(true);
      const suppliersCollection = collection(db, "suppliers");
      const supplierSnapshot = await getDocs(suppliersCollection);
      const supplierList = supplierSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || "",
          address: data.address || "",
          phone: data.phone || "",
          email: data.email || "",
          gst: data.gst || "",
          opening: typeof data.opening === 'number' ? data.opening : parseFloat(data.opening) || 0,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || undefined
        };
      }) as Supplier[];
      
      // Sort by creation date (newest first)
      supplierList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      setSuppliers(supplierList);
      setFilteredSuppliers(supplierList);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      toast({
        title: "Error",
        description: "Failed to fetch suppliers. Please check your Firebase connection.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      address: "",
      phone: "",
      email: "",
      gst: "",
      opening: "0"
    });
    setIsDialogOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      address: supplier.address,
      phone: supplier.phone,
      email: supplier.email,
      gst: supplier.gst,
      opening: supplier.opening.toString()
    });
    setIsDialogOpen(true);
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    try {
      await deleteDoc(doc(db, "suppliers", supplierId));
      setSuppliers((prev) => prev.filter((supplier) => supplier.id !== supplierId));
      toast({
        title: "Success",
        description: "Supplier deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting supplier:", error);
      toast({
        title: "Error",
        description: "Failed to delete supplier",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Supplier name is required",
        variant: "destructive"
      });
      return;
    }

    if (!formData.phone.trim()) {
      toast({
        title: "Validation Error",
        description: "Phone number is required",
        variant: "destructive"
      });
      return;
    }

    // Validate email format if provided
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }

    // Validate phone number format
    if (formData.phone && !/^[0-9]{10,15}$/.test(formData.phone.replace(/[-\s]/g, ''))) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid phone number (10-15 digits)",
        variant: "destructive"
      });
      return;
    }

    try {
      const supplierData = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        gst: formData.gst.trim().toUpperCase(),
        opening: parseFloat(formData.opening) || 0,
      };

      if (editingSupplier) {
        // Update existing supplier
        await updateDoc(doc(db, "suppliers", editingSupplier.id), {
          ...supplierData,
          updatedAt: Timestamp.now()
        });
        setSuppliers((prev) =>
          prev.map((supplier) =>
            supplier.id === editingSupplier.id
              ? {
                  ...supplier,
                  ...supplierData,
                  updatedAt: new Date(),
                }
              : supplier,
          ),
        );
        toast({
          title: "Success",
          description: "Supplier updated successfully",
        });
      } else {
        // Add new supplier
        const newDoc = await addDoc(collection(db, "suppliers"), {
          ...supplierData,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        setSuppliers((prev) => [
          {
            id: newDoc.id,
            ...supplierData,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          ...prev,
        ]);
        toast({
          title: "Success",
          description: "Supplier added successfully",
        });
      }
      
      setIsDialogOpen(false);
      setFormData({
        name: "",
        address: "",
        phone: "",
        email: "",
        gst: "",
        opening: "0"
      });
    } catch (error) {
      console.error("Error saving supplier:", error);
      toast({
        title: "Error",
        description: "Failed to save supplier. Please try again.",
        variant: "destructive"
      });
    }
  };

  const columns = [
    {
      key: "name",
      header: "Supplier Name",
      render: (row: Supplier) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-medium">{row.name}</div>
            {row.gst && <div className="text-xs text-muted-foreground">GST: {row.gst}</div>}
          </div>
        </div>
      )
    },
    {
      key: "contact",
      header: "Contact",
      render: (row: Supplier) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-3 h-3 text-muted-foreground" />
            <span>{row.phone}</span>
          </div>
          {row.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-3 h-3" />
              <span>{row.email}</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: "address",
      header: "Address",
      render: (row: Supplier) => (
        <div className="flex items-start gap-2 max-w-xs">
          {row.address ? (
            <>
              <MapPin className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0" />
              <span className="text-sm text-muted-foreground line-clamp-2">{row.address}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground italic">No address</span>
          )}
        </div>
      )
    },
    {
      key: "opening",
      header: "Opening Balance",
      render: (row: Supplier) => (
        <div className="flex items-center gap-1">
          <DollarSign className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">
            {row.opening ? `₹${row.opening.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'}
          </span>
        </div>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (row: Supplier) => (
        <Badge variant={row.phone && row.email ? "default" : "secondary"}>
          {row.phone && row.email ? "Active" : "Incomplete"}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: Supplier) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditSupplier(row)}
            className="hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteSupplier(row.id)}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="Supplier Management" 
        icon={Users}
      />
      
      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Suppliers"
            value={stats.totalSuppliers.toString()}
            icon={Users}
            trend={{ value: stats.newThisMonth, label: "new this month" }}
            description="Active supplier accounts"
          />
          <StatCard
            title="Opening Balance"
            value={`₹${stats.totalOpeningBalance.toLocaleString('en-IN')}`}
            icon={DollarSign}
            description="Total outstanding amount"
          />
          <StatCard
            title="Active Suppliers"
            value={stats.activeSuppliers.toString()}
            icon={TrendingUp}
            description="With complete information"
          />
          <StatCard
            title="New This Month"
            value={stats.newThisMonth.toString()}
            icon={Plus}
            description="Recently added"
          />
        </div>

        {/* Search and Add Section */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, email, or GST..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex w-full md:w-auto gap-2">
              <ExportExcelButton
                rows={filteredSuppliers.map((s) => ({
                  Name: s.name,
                  Phone: s.phone,
                  Email: s.email,
                  GST: s.gst,
                  Address: s.address,
                  Opening: s.opening,
                  Created: s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : "",
                }))}
                fileName="suppliers"
                sheetName="Suppliers"
                label="Export to Excel"
                variant="outline"
              />
              <Button onClick={handleAddSupplier} className="w-full md:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add New Supplier
              </Button>
            </div>
          </div>
        </Card>

        {/* Suppliers Table */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">All Suppliers</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage your supplier database and contact information
                </p>
              </div>
              {filteredSuppliers.length > 0 && (
                <Badge variant="outline" className="text-sm">
                  {filteredSuppliers.length} {filteredSuppliers.length === 1 ? 'supplier' : 'suppliers'}
                </Badge>
              )}
            </div>
            
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading suppliers...</p>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No suppliers found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first supplier"}
                </p>
                {!searchTerm && (
                  <Button onClick={handleAddSupplier}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Supplier
                  </Button>
                )}
              </div>
            ) : (
              <DataTable
                data={filteredSuppliers}
                columns={columns}
                keyField="id"
              />
            )}
          </div>
        </Card>
      </div>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingSupplier ? (
                <>
                  <Pencil className="w-5 h-5 text-primary" />
                  Edit Supplier
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-primary" />
                  Add New Supplier
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Basic Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Supplier Name *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter supplier/company name"
                    required
                    className="font-medium"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number *
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 1234567890"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="supplier@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Address & Location
              </h3>
              
              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Full Address
                </Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter complete business address"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Financial Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Financial Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gst" className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    GST Number
                  </Label>
                  <Input
                    id="gst"
                    value={formData.gst}
                    onChange={(e) => setFormData({ ...formData, gst: e.target.value.toUpperCase() })}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    className="uppercase"
                  />
                  <p className="text-xs text-muted-foreground">15-digit GST identification number</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="opening" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Opening Balance
                  </Label>
                  <Input
                    id="opening"
                    type="number"
                    step="0.01"
                    value={formData.opening}
                    onChange={(e) => setFormData({ ...formData, opening: e.target.value })}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">Current outstanding amount in ₹</p>
                </div>
              </div>
            </div>
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="gap-2">
                {editingSupplier ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    Update Supplier
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Supplier
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierList;
