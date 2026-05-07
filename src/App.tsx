import "./App.css";
import Home from "./Home.tsx";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginSignUpPage from "./components/LoginSignUpPage.tsx";
import HomeDashboard from "./components/HomeDashboard.tsx";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/Login" element={<LoginSignUpPage />} />
          <Route path="/dashboard" element={<HomeDashboard />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
