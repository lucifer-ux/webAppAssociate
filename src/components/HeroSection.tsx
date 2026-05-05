import "../componentStyling/HeroSection.css";
import { Gavel } from "lucide-react";
import Button from "./Button.tsx";
const heroSection = () => {
  const handleSynthesisClick = () => {
    console.log("synthesisclicked");
  };

  const handleDemoClick = () => {
    console.log("democlicked");
  };
  return (
    <>
      <div className="tagContainer">
        <span className="tag">
          <Gavel />
          <p>New: Multi-Jurisdictional Analysis</p>
        </span>
      </div>

      <div className="mainHeroSection">
        <span className="heroTitle">The Future of Legal Craft</span>
        <span className="heroUnderTitle">Synthesized by AI.</span>
      </div>

      <div className="bottomSection">
        <div>
          <p>
            Empowering practitioners with intelligent chronology, precise
            drafting, and
          </p>
          <p>
            jurisdictional foresight. Reduce cognitive load and elevate your
            legal strategy.
          </p>
        </div>
      </div>

      <div className="ButtonLayoutHero">
        <Button
          backgroundColor="#700D0D"
          text="Start Synthesis"
          color="#FFFFFF"
          onClick={handleSynthesisClick}
          width={12.2}
        />

        <Button
          backgroundColor="#F9F7F2"
          text="Request a Demo"
          color="#1B1C19"
          onClick={handleDemoClick}
          width={12.2}
        />
      </div>
    </>
  );
};

export default heroSection;
