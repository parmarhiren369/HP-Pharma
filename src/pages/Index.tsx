import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatCard } from "@/components/cards/StatCard";
import { QuickActionCard } from "@/components/cards/QuickActionCard";
import { 
  Package, 
  Beaker, 
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  FlaskConical,
  Users,
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardStats {
  totalRawInventory: number;
  totalProcessedInventory: number;
  activeBatches: number;
  approvedBatches: number;
  lowStockItems: number;
  totalDoctors: number;
  rawInventoryValue: number;
  processedInventoryValue: number;
}

interface InventoryTrend {
  month: string;
  raw: number;
  processed: number;
}

interface BatchStatusData {
  name: string;
  value: number;
  color: string;
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  status: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalRawInventory: 0,
    totalProcessedInventory: 0,
    activeBatches: 0,
    approvedBatches: 0,
    lowStockItems: 0,
    totalDoctors: 0,
    rawInventoryValue: 0,
    processedInventoryValue: 0,
  });

  const [inventoryTrends] = useState<InventoryTrend[]>([
    { month: "Jan", raw: 45, processed: 28 },
    { month: "Feb", raw: 52, processed: 35 },
    { month: "Mar", raw: 48, processed: 42 },
    { month: "Apr", raw: 61, processed: 48 },
    { month: "May", raw: 55, processed: 52 },
    { month: "Jun", raw: 67, processed: 58 },
  ]);

  const [batchStatusData, setBatchStatusData] = useState<BatchStatusData[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const categoryDistribution = [
    { name: "Active Ingredients", value: 35, color: "hsl(var(--primary))" },
    { name: "Excipients", value: 28, color: "hsl(var(--info))" },
    { name: "Solvents", value: 20, color: "hsl(var(--success))" },
    { name: "Packaging", value: 17, color: "hsl(var(--warning))" },
  ];

  const weeklyProductionData = [
    { day: "Mon", production: 12, quality: 11 },
    { day: "Tue", production: 19, quality: 17 },
    { day: "Wed", production: 15, quality: 14 },
    { day: "Thu", production: 22, quality: 21 },
    { day: "Fri", production: 18, quality: 16 },
    { day: "Sat", production: 14, quality: 13 },
    { day: "Sun", production: 8, quality: 8 },
  ];

  const fetchDashboardData = async () => {
    if (!db) {
      setLoading(false);
      return;
    }

    try {
      // Fetch raw inventory
      const rawInventoryRef = collection(db, "rawInventory");
      const rawSnapshot = await getDocs(rawInventoryRef);
      const rawInventoryCount = rawSnapshot.size;
      const rawValue = rawSnapshot.docs.reduce((sum, doc) => {
        const data = doc.data();
        return sum + (parseFloat(data.quantity) || 0);
      }, 0);

      // Fetch processed inventory
      const processedInventoryRef = collection(db, "processedInventory");
      const processedSnapshot = await getDocs(processedInventoryRef);
      const processedInventoryCount = processedSnapshot.size;
      const processedValue = processedSnapshot.docs.reduce((sum, doc) => {
        const data = doc.data();
        return sum + (parseFloat(data.quantity) || 0);
      }, 0);

      // Fetch batches
      const batchesRef = collection(db, "batches");
      const batchesSnapshot = await getDocs(batchesRef);
      const allBatches = batchesSnapshot.docs.map(doc => doc.data());
      
      const activeBatchesCount = allBatches.filter(b => b.status === "in process").length;
      const approvedBatchesCount = allBatches.filter(b => b.status === "approved").length;
      const discardedBatchesCount = allBatches.filter(b => b.status === "discarded").length;

      // Fetch doctors
      const doctorsRef = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsRef);
      const doctorsCount = doctorsSnapshot.size;

      // Check for low stock items (quantity < 10)
      const lowStockCount = rawSnapshot.docs.filter(doc => {
        const quantity = parseFloat(doc.data().quantity) || 0;
        return quantity < 10;
      }).length;

      // Fetch recent activities (last 5 batches)
      const recentBatchesQuery = query(batchesRef, orderBy("createdAt", "desc"), limit(5));
      const recentBatchesSnapshot = await getDocs(recentBatchesQuery);
      const activities: RecentActivity[] = recentBatchesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: "batch",
          description: `Batch ${data.batchNo} ${data.status}`,
          timestamp: data.createdAt?.toDate() || new Date(),
          status: data.status,
        };
      });

      setStats({
        totalRawInventory: rawInventoryCount,
        totalProcessedInventory: processedInventoryCount,
        activeBatches: activeBatchesCount,
        approvedBatches: approvedBatchesCount,
        lowStockItems: lowStockCount,
        totalDoctors: doctorsCount,
        rawInventoryValue: rawValue,
        processedInventoryValue: processedValue,
      });

      setBatchStatusData([
        { name: "In Process", value: activeBatchesCount, color: "hsl(var(--warning))" },
        { name: "Approved", value: approvedBatchesCount, color: "hsl(var(--success))" },
        { name: "Discarded", value: discardedBatchesCount, color: "hsl(var(--destructive))" },
      ]);

      setRecentActivities(activities);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const chartConfig = {
    raw: {
      label: "Raw Materials",
      color: "hsl(var(--primary))",
    },
    processed: {
      label: "Processed Goods",
      color: "hsl(var(--success))",
    },
    production: {
      label: "Production",
      color: "hsl(var(--primary))",
    },
    quality: {
      label: "Quality Passed",
      color: "hsl(var(--success))",
    },
  };

  return (
    <>
      <AppHeader 
        title="Dashboard Overview" 
        subtitle="Real-time insights and analytics for your pharmaceutical operations" 
      />
      
      <div className="flex-1 overflow-auto p-6">
        {/* Key Performance Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Raw Inventory Items"
            value={stats.totalRawInventory}
            change="+12.5%"
            changeType="positive"
            icon={Package}
            iconBgColor="bg-primary/20"
            iconColor="text-primary"
            subtitle={`${stats.rawInventoryValue.toFixed(1)} kg total`}
          />
          <StatCard
            title="Processed Inventory"
            value={stats.totalProcessedInventory}
            change="+8.2%"
            changeType="positive"
            icon={CheckCircle2}
            iconBgColor="bg-success/20"
            iconColor="text-success"
            subtitle={`${stats.processedInventoryValue.toFixed(1)} units`}
          />
          <StatCard
            title="Active Batches"
            value={stats.activeBatches}
            change="+3"
            changeType="positive"
            icon={FlaskConical}
            iconBgColor="bg-warning/20"
            iconColor="text-warning"
            subtitle={`${stats.approvedBatches} approved`}
          />
          <StatCard
            title="Low Stock Alerts"
            value={stats.lowStockItems}
            change="-2"
            changeType="negative"
            icon={AlertCircle}
            iconBgColor="bg-destructive/20"
            iconColor="text-destructive"
            subtitle="Items need reorder"
          />
        </div>

        {/* Secondary Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-border bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Registered Doctors</p>
                  <p className="text-3xl font-bold">{stats.totalDoctors}</p>
                  <div className="flex items-center mt-2 text-sm text-success">
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                    <span>+15% this month</span>
                  </div>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-to-br from-success/5 to-success/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Approved This Month</p>
                  <p className="text-3xl font-bold">{stats.approvedBatches}</p>
                  <div className="flex items-center mt-2 text-sm text-success">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    <span>On track</span>
                  </div>
                </div>
                <div className="h-12 w-12 rounded-full bg-success/20 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-to-br from-info/5 to-info/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Production Efficiency</p>
                  <p className="text-3xl font-bold">94.2%</p>
                  <div className="flex items-center mt-2 text-sm text-success">
                    <Activity className="w-4 h-4 mr-1" />
                    <span>Excellent</span>
                  </div>
                </div>
                <div className="h-12 w-12 rounded-full bg-info/20 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Inventory Trends Chart */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Inventory Trends
              </CardTitle>
              <CardDescription>Raw materials vs processed goods over 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <AreaChart data={inventoryTrends}>
                  <defs>
                    <linearGradient id="colorRaw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProcessed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area 
                    type="monotone" 
                    dataKey="raw" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorRaw)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="processed" 
                    stroke="hsl(var(--success))" 
                    fillOpacity={1} 
                    fill="url(#colorProcessed)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Batch Status Distribution */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                Batch Status Distribution
              </CardTitle>
              <CardDescription>Current batch processing status overview</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={batchStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {batchStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Production & Category Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Weekly Production Chart */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Weekly Production Activity
              </CardTitle>
              <CardDescription>Production vs quality approved batches this week</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={weeklyProductionData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="production" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="quality" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Category Distribution */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Inventory by Category
              </CardTitle>
              <CardDescription>Raw material categorization breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}%`}
                  >
                    {categoryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card className="border-border lg:col-span-1">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <QuickActionCard
                title="Create New Batch"
                description="Start processing raw materials"
                icon={FlaskConical}
                onClick={() => navigate("/processing")}
              />
              <QuickActionCard
                title="Add Raw Material"
                description="Register new inventory"
                icon={Package}
                onClick={() => navigate("/inventory/raw")}
              />
              <QuickActionCard
                title="View Processed Goods"
                description="Check finished products"
                icon={CheckCircle2}
                onClick={() => navigate("/inventory/processed")}
              />
              <QuickActionCard
                title="Manage Doctors"
                description="View doctor database"
                icon={Users}
                onClick={() => navigate("/doctors")}
              />
            </CardContent>
          </Card>

          {/* Recent Activities */}
          <Card className="border-border lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Activities
              </CardTitle>
              <CardDescription>Latest updates and batch operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.length > 0 ? (
                  recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        activity.status === 'approved' ? 'bg-success/20' : 
                        activity.status === 'discarded' ? 'bg-destructive/20' : 
                        'bg-warning/20'
                      }`}>
                        <FlaskConical className={`h-5 w-5 ${
                          activity.status === 'approved' ? 'text-success' : 
                          activity.status === 'discarded' ? 'text-destructive' : 
                          'text-warning'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {activity.timestamp.toLocaleDateString()} at {activity.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                      <span className={`badge-type text-xs ${
                        activity.status === 'approved' ? 'badge-processed' : 
                        activity.status === 'discarded' ? 'bg-destructive/20 text-destructive' : 
                        'bg-warning/20 text-warning'
                      }`}>
                        {activity.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No recent activities</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Index;
