import "../componentStyling/Fotter.css";

const Footer = () => {
  return (
    <>
      <div className="footerContainer">
        <span>Associate</span>
        <ul className="footerLinks">
          <li>
            <a href="#">Privacy</a>
          </li>
          <li>
            <a href="#"> Terms </a>
          </li>
          <li>
            {" "}
            <a href="#">Contact</a>
          </li>
        </ul>
        <span>© 2026 Associate All rights reserved.</span>
      </div>
    </>
  );
};

export default Footer;
