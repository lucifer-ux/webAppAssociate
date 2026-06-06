import "../componentStyling/Navbar.css";
import Button from "../components/Button.tsx";
import PricingModal from "./PricingModal";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Navbar = () => {
  const navigate = useNavigate();
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const handleClick = () => {
    navigate("/login");
  };

  return (
    <>
      <nav className="header">
        <img height={40} width={40} src="/logo.jpeg" />
        <ul className="navBarList">
          <li className="logoImage"></li>
          <li>
            {" "}
            <a href="#">Platform </a>{" "}
          </li>
          <li>
            <a href="#"> Solutions</a>
          </li>
          <li>
            <button
              type="button"
              className="navLinkButton"
              onClick={() => setIsPricingOpen(true)}
            >
              Pricing
            </button>
          </li>
        </ul>
        <div className="rightContainerNavbar">
          <button className="loginButton" type="button" onClick={handleClick}>
            Login
          </button>
          <Button
            text="Get Started"
            backgroundColor="#700D0D"
            color="#FFFFFF"
            onClick={handleClick}
            width={7.2}
            isBorder={false}
          />
        </div>
      </nav>
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
      />
    </>
  );
};

export default Navbar;
