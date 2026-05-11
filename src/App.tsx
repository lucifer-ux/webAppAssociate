import "./App.css";
import Home from "./Home.tsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginSignUpPage from "./components/LoginSignUpPage.tsx";
import HomeDashboard from "./components/HomeDashboard.tsx";
import ActiveResearchPage from "./components/ActiveResearchPage.tsx";
import DraftingPage from "./components/DraftingPage.tsx";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/Login" element={<LoginSignUpPage />} />
          <Route path="/dashboard" element={<HomeDashboard />} />
          <Route
            path="/dashboard/active-research"
            element={<ActiveResearchPage />}
          />
          <Route
            path="/dashboard/drafting"
            element={<DraftingPage />}
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
