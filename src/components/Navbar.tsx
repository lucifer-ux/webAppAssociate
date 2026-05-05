import "../componentStyling/Navbar.css";
import Button from "../components/Button.tsx";

const Navbar = () => {
  const handleClick = () => {
    console.log("clicked");
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
            <a href="#"> Pricing</a>
          </li>
        </ul>
        <div className="rightContainerNavbar">
          <a className="loginButton">Login</a>
          <Button
            text="Get Started"
            backgroundColor="#700D0D"
            color="#FFFFFF"
            onClick={handleClick}
            width={7.2}
          />
        </div>
      </nav>
    </>
  );
};

export default Navbar;
