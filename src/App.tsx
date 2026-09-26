import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { HashRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Navigation } from "@/components/Navigation";
import Landing from "./pages/Landing";
import StudentDashboard from "./pages/StudentDashboard";
import InstitutionDashboard from "./pages/InstitutionDashboard";
import VerifierPage from "./pages/VerifierPage";
import NotFound from "./pages/NotFound";
import PortalConnect from "./pages/PortalConnect";
import SihPortalConnect from "./pages/sih/SihPortalConnect";

// Keep the large portal screens out of the initial bundle. These routes are
// reached after login, so loading them on demand makes navigation to the
// landing page and portal connect screen much faster.
const AdminDashboard = lazy(() => import("./pages/sih/AdminDashboard"));
const ManagerDashboard = lazy(() => import("./pages/sih/ManagerDashboard"));
const AuditorDashboard = lazy(() => import("./pages/sih/AuditorDashboard"));
const UserDashboard = lazy(() => import("./pages/sih/UserDashboard"));

function DashboardFallback() {
  return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-muted-foreground">Loading workspace…</div>;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        <Toaster />
        <Sonner />
        {/* HashRouter keeps share links and QR payloads self-contained in the
            fragment, so a scanned credential never reaches a server log. */}
        <HashRouter>
          <div className="flex min-h-screen flex-col">
            <Navigation />
            <main className="flex-1">
              <Suspense fallback={<DashboardFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />

                {/* Legacy portals (kept for backwards compatibility) */}
                <Route path="/student-portal" element={<PortalConnect role="student" />} />
                <Route path="/student-dashboard" element={<StudentDashboard />} />

                <Route path="/institution-portal" element={<PortalConnect role="institution" />} />
                <Route path="/institution-dashboard" element={<InstitutionDashboard />} />

                {/* SIH Platform portals */}
                <Route path="/sih-portal" element={<SihPortalConnect />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/manager" element={<ManagerDashboard />} />
                <Route path="/auditor" element={<AuditorDashboard />} />
                <Route path="/user" element={<UserDashboard />} />

                {/* Public verifier (works in both modes) */}
                <Route path="/verify" element={<VerifierPage />} />

                {/* Keep the catch-all last. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </main>
          </div>
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
