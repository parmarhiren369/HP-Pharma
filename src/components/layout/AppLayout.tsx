import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <style>{`
        @media print {
          aside { display: none !important; }
        }
      `}</style>
      <AppSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
