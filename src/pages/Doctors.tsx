import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { 
  Stethoscope, 
  Users, 
  Calendar,
  MessageSquare,
  ArrowRight,
  Plus,
  Filter,
  Phone,
  Mail,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query } from "firebase/firestore";

type TabType = "all" | "active" | "meetings";

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  hospital: string;
  city: string;
  phone: string;
  email: string;
  status: "Active" | "Inactive" | "New";
  lastVisit: string;
  prescriptions: number;
  loginId?: string;
  createdAt?: string;
}

interface Meeting {
  id: string;
  doctorName: string;
  purpose: string;
  date: string;
  time: string;
  location: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  representative: string;
}

const doctors: Doctor[] = [];

const meetings: Meeting[] = [];

export default function Doctors() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  const [newDoctor, setNewDoctor] = useState({
    name: "",
    specialization: "",
    hospital: "",
    city: "",
    phone: "",
    email: "",
    loginId: "",
    password: "",
    status: "New" as const,
  });

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    try {
      if (!db) return;
      const doctorsRef = collection(db, "doctors");
      const q = query(doctorsRef);
      const querySnapshot = await getDocs(q);
      const doctorsData: Doctor[] = [];
      querySnapshot.forEach((doc) => {
        doctorsData.push({ id: doc.id, ...doc.data() } as Doctor);
      });
      setDoctors(doctorsData);
    } catch (error) {
      console.error("Error loading doctors:", error);
    }
  };

  const handleAddDoctor = async () => {
    if (!newDoctor.name || !newDoctor.email || !newDoctor.loginId || !newDoctor.password) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (!db) {
        throw new Error("Firebase not initialized");
      }

      // Store doctor credentials in Firestore (will be used for login validation)
      // Note: In production, you should use Firebase Admin SDK or Cloud Functions
      // to create user accounts without affecting current session
      const doctorData = {
        name: newDoctor.name,
        specialization: newDoctor.specialization,
        hospital: newDoctor.hospital,
        city: newDoctor.city,
        phone: newDoctor.phone,
        email: newDoctor.email,
        loginId: newDoctor.loginId,
        password: newDoctor.password, // In production, hash this password
        status: newDoctor.status,
        lastVisit: "Never",
        prescriptions: 0,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "doctors"), doctorData);

      toast({
        title: "Doctor Added Successfully",
        description: `Dr. ${newDoctor.name} has been added to the system`,
      });

      setIsAddDoctorOpen(false);
      setNewDoctor({
        name: "",
        specialization: "",
        hospital: "",
        city: "",
        phone: "",
        email: "",
        loginId: "",
        password: "",
        status: "New",
      });
      
      loadDoctors();
    } catch (error: any) {
      console.error("Error adding doctor:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add doctor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const doctorColumns = [
    { 
      key: "name" as keyof Doctor, 
      header: "Doctor Name",
      render: (item: Doctor) => (
        <div>
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.specialization}</p>
        </div>
      )
    },
    { key: "hospital" as keyof Doctor, header: "Hospital" },
    { 
      key: "city" as keyof Doctor, 
      header: "Location",
      render: (item: Doctor) => (
        <div className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="w-3 h-3" />
          {item.city}
        </div>
      )
    },
    { 
      key: "phone" as keyof Doctor, 
      header: "Contact",
      render: (item: Doctor) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-sm">
            <Phone className="w-3 h-3 text-muted-foreground" />
            {item.phone}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="w-3 h-3" />
            {item.email}
          </div>
        </div>
      )
    },
    { 
      key: "status" as keyof Doctor, 
      header: "Status",
      render: (item: Doctor) => (
        <span className={`badge-type ${
          item.status === "Active" ? "badge-processed" : 
          item.status === "New" ? "badge-raw" : 
          "bg-muted text-muted-foreground"
        }`}>
          {item.status}
        </span>
      )
    },
    { key: "lastVisit" as keyof Doctor, header: "Last Visit" },
    { 
      key: "prescriptions" as keyof Doctor, 
      header: "Prescriptions",
      render: (item: Doctor) => (
        <span className="text-primary font-medium">{item.prescriptions}</span>
      )
    },
  ];

  const meetingColumns = [
    { 
      key: "doctorName" as keyof Meeting, 
      header: "Doctor",
      render: (item: Meeting) => (
        <span className="font-medium text-foreground">{item.doctorName}</span>
      )
    },
    { key: "purpose" as keyof Meeting, header: "Purpose" },
    { 
      key: "date" as keyof Meeting, 
      header: "Date & Time",
      render: (item: Meeting) => (
        <div>
          <p className="font-medium">{item.date}</p>
          <p className="text-xs text-muted-foreground">{item.time}</p>
        </div>
      )
    },
    { key: "location" as keyof Meeting, header: "Location" },
    { key: "representative" as keyof Meeting, header: "Representative" },
    { 
      key: "status" as keyof Meeting, 
      header: "Status",
      render: (item: Meeting) => (
        <span className={`badge-type ${
          item.status === "Completed" ? "badge-processed" : 
          item.status === "Scheduled" ? "badge-raw" : 
          "bg-destructive/20 text-destructive"
        }`}>
          {item.status}
        </span>
      )
    },
  ];

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All Doctors", icon: Users },
    { key: "active", label: "Active Doctors", icon: Stethoscope },
    { key: "meetings", label: "Meetings", icon: Calendar },
  ];

  const activeDoctors = doctors.filter(d => d.status === "Active");

  const exportRows = activeTab === "meetings"
    ? meetings.map((m) => ({
        "Doctor Name": m.doctorName,
        Purpose: m.purpose,
        Date: m.date,
        Time: m.time,
        Location: m.location,
        Status: m.status,
        Representative: m.representative,
      }))
    : (activeTab === "active" ? activeDoctors : doctors).map((d) => ({
        Name: d.name,
        Specialization: d.specialization,
        Hospital: d.hospital,
        City: d.city,
        Phone: d.phone,
        Email: d.email,
        Status: d.status,
        "Last Visit": d.lastVisit,
        Prescriptions: d.prescriptions,
        "Login ID": d.loginId || "",
      }));

  return (
    <>
      <AppHeader title="Doctors Module" subtitle="Manage doctor relationships and meetings" />
      
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Doctors"
            value={doctors.length}
            change="+12"
            changeType="positive"
            icon={Stethoscope}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
          />
          <StatCard
            title="Active Doctors"
            value={activeDoctors.length}
            change="+8%"
            changeType="positive"
            icon={Users}
            iconBgColor="bg-success/20"
            iconColor="text-success"
          />
          <StatCard
            title="Meetings This Week"
            value={meetings.length}
            change="+5"
            changeType="positive"
            icon={Calendar}
            iconBgColor="bg-info/20"
            iconColor="text-info"
          />
          <StatCard
            title="Total Prescriptions"
            value={doctors.reduce((sum, d) => sum + d.prescriptions, 0)}
            change="+15%"
            changeType="positive"
            icon={MessageSquare}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
          />
        </div>

        {/* Main Content */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-border px-4">
            <div className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`tab-item flex items-center gap-2 ${
                    activeTab === tab.key 
                      ? "tab-item-active" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 py-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                Filter
              </Button>
              <ExportExcelButton
                rows={exportRows}
                fileName={activeTab === "meetings" ? "doctor-meetings" : "doctors"}
                sheetName={activeTab === "meetings" ? "Meetings" : "Doctors"}
                label="Export to Excel"
                variant="outline"
              />
              <Dialog open={isAddDoctorOpen} onOpenChange={setIsAddDoctorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Doctor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Doctor</DialogTitle>
                    <DialogDescription>
                      Enter doctor details and create login credentials
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name *</Label>
                        <Input
                          id="name"
                          placeholder="Dr. John Smith"
                          value={newDoctor.name}
                          onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="specialization">Specialization</Label>
                        <Input
                          id="specialization"
                          placeholder="Cardiologist"
                          value={newDoctor.specialization}
                          onChange={(e) => setNewDoctor({ ...newDoctor, specialization: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hospital">Hospital</Label>
                        <Input
                          id="hospital"
                          placeholder="City Hospital"
                          value={newDoctor.hospital}
                          onChange={(e) => setNewDoctor({ ...newDoctor, hospital: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          placeholder="New York"
                          value={newDoctor.city}
                          onChange={(e) => setNewDoctor({ ...newDoctor, city: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          placeholder="+1 234 567 8900"
                          value={newDoctor.phone}
                          onChange={(e) => setNewDoctor({ ...newDoctor, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="doctor@hospital.com"
                          value={newDoctor.email}
                          onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4 mt-2">
                      <h4 className="font-medium mb-3">Login Credentials</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="loginId">Login ID *</Label>
                          <Input
                            id="loginId"
                            placeholder="doctor123"
                            value={newDoctor.loginId}
                            onChange={(e) => setNewDoctor({ ...newDoctor, loginId: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">Password *</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={newDoctor.password}
                            onChange={(e) => setNewDoctor({ ...newDoctor, password: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={newDoctor.status}
                        onValueChange={(value: "Active" | "Inactive" | "New") => 
                          setNewDoctor({ ...newDoctor, status: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsAddDoctorOpen(false)}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddDoctor} disabled={isLoading}>
                      {isLoading ? "Adding..." : "Add Doctor"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="section-title">
                  {activeTab === "all" && "All Registered Doctors"}
                  {activeTab === "active" && "Active Doctor Network"}
                  {activeTab === "meetings" && "Scheduled Meetings"}
                </h2>
                <p className="section-subtitle">
                  {activeTab === "all" && "Complete directory of registered healthcare professionals"}
                  {activeTab === "active" && "Doctors actively prescribing our products"}
                  {activeTab === "meetings" && "Upcoming and past doctor meetings"}
                </p>
              </div>
              <Button variant="outline" className="gap-2">
                View All <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {activeTab === "meetings" ? (
              <DataTable
                data={meetings}
                columns={meetingColumns}
                keyField="id"
              />
            ) : (
              <DataTable
                data={activeTab === "active" ? activeDoctors : doctors}
                columns={doctorColumns}
                keyField="id"
              />
            )}
          </div>
        </div>

        {/* Doctor Insights */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Top Prescriber</h3>
            <p className="text-lg font-bold text-foreground">
              {doctors.length > 0 
                ? doctors.reduce((prev, current) => (prev.prescriptions > current.prescriptions ? prev : current)).name 
                : "N/A"}
            </p>
            <p className="text-sm text-primary mt-1">
              {doctors.length > 0 
                ? `${Math.max(...doctors.map(d => d.prescriptions))} prescriptions this month` 
                : "No data"}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">New Doctors Added</h3>
            <p className="text-3xl font-bold text-foreground">
              {doctors.filter(d => d.status === "New").length}
            </p>
            <p className="text-sm text-success mt-1">This month</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Meeting Success Rate</h3>
            <p className="text-3xl font-bold text-foreground">
              {meetings.length > 0 
                ? `${Math.round((meetings.filter(m => m.status === "Completed").length / meetings.length) * 100)}%` 
                : "N/A"}
            </p>
            <p className="text-sm text-success mt-1">
              {meetings.filter(m => m.status === "Completed").length} completed
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
