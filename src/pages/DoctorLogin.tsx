import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function DoctorLogin() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginId || !password) {
      toast({
        title: "Missing Information",
        description: "Please enter both login ID and password",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (!db) {
        throw new Error("Firebase not initialized");
      }

      // Find doctor by loginId
      const doctorsRef = collection(db, "doctors");
      const q = query(doctorsRef, where("loginId", "==", loginId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("Invalid login credentials");
      }

      const doctorDoc = querySnapshot.docs[0];
      const doctorData = doctorDoc.data();

      // Validate password
      // Note: In production, use proper password hashing (bcrypt, etc.)
      if (doctorData.password !== password) {
        throw new Error("Invalid login credentials");
      }

      toast({
        title: "Login Successful",
        description: `Welcome back, Dr. ${doctorData.name}`,
      });

      navigate(`/doctor-dashboard/${doctorDoc.id}`);
    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-2">
            <Stethoscope className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Doctor Portal</CardTitle>
          <CardDescription>
            Sign in to access your patient management dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loginId">Login ID</Label>
              <Input
                id="loginId"
                placeholder="Enter your login ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>For administrative access, please contact your system administrator</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
