import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import RawInventory from "./pages/RawInventory";
import ProcessedInventory from "./pages/ProcessedInventory";
import Accounting from "./pages/Accounting";
import Doctors from "./pages/Doctors";
import LossCalculation from "./pages/LossCalculation";
import SupplierList from "./pages/SupplierList";
import CustomerList from "./pages/CustomerList";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Processing from "./pages/Processing";
import DoctorLogin from "./pages/DoctorLogin";
import DoctorDashboard from "./pages/DoctorDashboard";
import Items from "./pages/Items";
import ItemMonthlyReport from "./pages/ItemMonthlyReport";
import Purchases from "./pages/Purchases";
import Transactions from "./pages/Transactions";
import Payments from "./pages/Payments";
import Invoices from "./pages/Invoices";
import InvoiceNew from "./pages/InvoiceNew";
import InvoicePrint from "./pages/InvoicePrint";
import DebitCreditNotes from "./pages/DebitCreditNotes";
import DebitCreditNoteNew from "./pages/DebitCreditNoteNew";
import BankBook from "./pages/BankBook";
import CashBook from "./pages/CashBook";
import BankDetails from "./pages/BankDetails";
import CashDetails from "./pages/CashDetails";
import Quotations from "./pages/Quotations";
import QuotationNew from "./pages/QuotationNew";
import QuotationPrint from "./pages/QuotationPrint";
import ProformaInvoices from "./pages/ProformaInvoices";
import ProformaInvoiceNew from "./pages/ProformaInvoiceNew";
import { Suspense } from "react";

console.log("App.tsx loaded");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const App = () => {
  console.log("App rendering...");
  
  return (
    <Suspense fallback={<LoadingFallback />}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/doctor-login" element={<DoctorLogin />} />
                <Route path="/doctor-dashboard/:doctorId" element={<DoctorDashboard />} />
                <Route path="/invoices/:invoiceId/print" element={<InvoicePrint />} />
                <Route path="/quotations/:quotationId/print" element={<QuotationPrint />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/items" element={<Items />} />
                  <Route path="/items/:itemId" element={<ItemMonthlyReport />} />
                  <Route path="/purchases" element={<Purchases />} />
                  <Route path="/raw-inventory" element={<RawInventory />} />
                  <Route path="/processed-inventory" element={<ProcessedInventory />} />
                  <Route path="/processing" element={<Processing />} />
                  <Route path="/accounting" element={<Accounting />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/bank-book" element={<BankBook />} />
                  <Route path="/bank-details" element={<BankDetails />} />
                  <Route path="/cash-book" element={<CashBook />} />
                  <Route path="/cash-details" element={<CashDetails />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/invoices/new" element={<InvoiceNew />} />
                  <Route path="/quotations" element={<Quotations />} />
                  <Route path="/quotations/new" element={<QuotationNew />} />
                  <Route path="/proforma-invoices" element={<ProformaInvoices />} />
                  <Route path="/proforma-invoices/new" element={<ProformaInvoiceNew />} />
                  <Route path="/debit-credit-notes" element={<DebitCreditNotes />} />
                  <Route path="/debit-credit-notes/new" element={<DebitCreditNoteNew />} />
                  <Route path="/doctors" element={<Doctors />} />
                  <Route path="/loss-calculation" element={<LossCalculation />} />
                  <Route path="/suppliers" element={<SupplierList />} />
                  <Route path="/customers" element={<CustomerList />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Suspense>
  );
};

export default App;
