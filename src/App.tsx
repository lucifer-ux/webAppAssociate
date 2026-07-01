import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import LoginSignUpPage from "./components/LoginSignUpPage.tsx";
import HomeDashboard from "./components/HomeDashboard.tsx";
import ActiveResearchPage from "./components/ActiveResearchPage.tsx";
import DraftingPage from "./components/DraftingPage.tsx";
import MatterPage from "./components/MatterPage.tsx";
import AdministrationPage from "./components/AdministrationPage.tsx";
import Home from "./Home.tsx";
import { MatterStoreProvider } from "./context/MatterStoreContext.tsx";
import { AuthProvider, useAuth } from "./context/AuthContext.tsx";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { status, isAuthenticated } = useAuth();
  if (status === "loading") {
    return <div className="routeLoading">Loading workspace...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const PublicLoginRoute = () => {
  const { status, isAuthenticated } = useAuth();
  if (status === "loading") {
    return <div className="routeLoading">Loading sign in...</div>;
  }
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginSignUpPage />;
};

function App() {
  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <MatterStoreProvider>
          <Routes>
            <Route path="/login" element={<PublicLoginRoute />} />
            <Route path="/Login" element={<PublicLoginRoute />} />
            <Route path="/administration" element={<AdministrationPage />} />
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<ProtectedRoute><HomeDashboard /></ProtectedRoute>} />
            <Route
              path="/dashboard/active-research"
              element={<ProtectedRoute><ActiveResearchPage /></ProtectedRoute>}
            />
            <Route
              path="/research"
              element={<ProtectedRoute><ActiveResearchPage /></ProtectedRoute>}
            />
            <Route
              path="/dashboard/drafting"
              element={<ProtectedRoute><DraftingPage /></ProtectedRoute>}
            />
            <Route path="/drafting" element={<ProtectedRoute><DraftingPage /></ProtectedRoute>} />
            <Route path="/draft" element={<ProtectedRoute><DraftingPage /></ProtectedRoute>} />
            <Route path="/matter" element={<ProtectedRoute><MatterPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </MatterStoreProvider>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
