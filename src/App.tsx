import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Team from "./pages/Team";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import TeamSetup from "./pages/TeamSetup";
import MeetingUpload from "./pages/MeetingUpload";
import MeetingDetails from "./pages/MeetingDetails";
import InviteMembers from "./pages/InviteMembers";
import Integrations from "./pages/Integrations";
import TeamSettings from "./pages/TeamSettings";
import MemberManagement from "./pages/MemberManagement";
import MeetingManagement from "./pages/MeetingManagement";
import ActionItems from "./pages/ActionItems";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected route component to restrict access to authenticated users only
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/team-setup" element={
              <ProtectedRoute>
                <TeamSetup />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/team" element={
              <ProtectedRoute>
                <Team />
              </ProtectedRoute>
            } />
            <Route path="/meeting-upload" element={
              <ProtectedRoute>
                <MeetingUpload />
              </ProtectedRoute>
            } />
            <Route path="/meeting-details" element={
              <ProtectedRoute>
                <MeetingDetails />
              </ProtectedRoute>
            } />
            <Route path="/invite-members" element={
              <ProtectedRoute>
                <InviteMembers />
              </ProtectedRoute>
            } />
            <Route path="/integrations" element={
              <ProtectedRoute>
                <Integrations />
              </ProtectedRoute>
            } />
            <Route path="/team-settings" element={
              <ProtectedRoute>
                <TeamSettings />
              </ProtectedRoute>
            } />
            <Route path="/member-management" element={
              <ProtectedRoute>
                <MemberManagement />
              </ProtectedRoute>
            } />
            <Route path="/meeting-management" element={
              <ProtectedRoute>
                <MeetingManagement />
              </ProtectedRoute>
            } />
            <Route path="/action-items" element={
              <ProtectedRoute>
                <ActionItems />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
