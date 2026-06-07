import { Layers3, RotateCcw, ShieldAlert, TimerOff, Lock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PricingModal from "./components/PricingModal";
import "./componentStyling/LandingPage.css";
import delloiteLogo from "./assets/delloite.jpeg";
import henryHughesLogo from "./assets/HenryHuges.jpeg";
import logicGnosisLogo from "./assets/logicGnosis.jpeg";
import oddisaJudicialLogo from "./assets/oddisaJudicial.jpeg";
import shardulAmarchandLogo from "./assets/shardulAmarchand.jpeg";
import wadiyaChandiLogo from "./assets/WadiyaChandi.jpeg";
import firstPageVideo from "./assets/firstPage.mp4";
import secondPageVideo from "./assets/secondPage.mp4";
import thirdRecordingVideo from "./assets/thirdrecording.mp4";

type ProblemCard = {
  title: string;
  body: string;
  icon: typeof Layers3;
};

type ActStep = {
  title: string;
  headline: string;
  body: string;
  mediaType: "video" | "image";
  mediaSrc: string;
  mediaAlt: string;
};

type LogoItem = {
  name: string;
  src: string;
};

const problemCards: ProblemCard[] = [
  {
    title: "Context Fragmentation",
    body:
      "The lawyer doing the actual work in India today switches between eight to twelve tools to close a single matter. They become the memory layer holding everything together.",
    icon: Layers3,
  },
  {
    title: "Session By Session AI",
    body:
      "Most AI tools help with one document at a time. The next session starts from zero, so the lawyer rebuilds context from memory, every single time.",
    icon: RotateCcw,
  },
  {
    title: "Verification Burden",
    body:
      "When AI cites a case, you still open the judgment yourself. It may use the right case for the wrong proposition or miss that a ruling was overturned.",
    icon: ShieldAlert,
  },
  {
    title: "False Time Savings",
    body:
      "The tool that should save one hour can cost ninety minutes of verification. The problem is not whether AI can help Indian lawyers. It's whether a lawyer can trust it.",
    icon: TimerOff,
  },
];

const actSteps: ActStep[] = [
  {
    title: "Act 1 Intake",
    headline: "You hand over the file. Associate reads it.",
    body:
      "Drop in whatever you have. The vakalatnama. The WhatsApp thread. The email from opposing counsel you forgot about for two days. Associate reads it the way a good junior would, quietly and carefully. By the time you're ready to think about the matter, it has already pulled the relevant judgments from eCourts and India Code.",
    mediaType: "video",
    mediaSrc: firstPageVideo,
    mediaAlt: "Act 1 Intake preview",
  },
  {
    title: "Act 2 Brief",
    headline: "Associate hands you back the matter you should have spent two days building.",
    body:
      "What kind of matter this is. Who the parties are. What the law actually says, and what's missing. Every citation is verified. Where the law is genuinely unsettled, it tells you that with both positions instead of picking one for you. You still do the thinking. That part has not changed.",
    mediaType: "video",
    mediaSrc: secondPageVideo,
    mediaAlt: "Act 2 Brief preview",
  },
  {
    title: "Act 3 Work",
    headline: "Then you do the work. With the agent in the margin, never in the way.",
    body:
      "Drafting opens the document. Margin annotations appear with sources against your playbook and Indian law. Accept, reject, modify. Your call. During DD review, the agent flags section-level risks and clause references, then keeps filings, checklists, court fee logic, and artifacts complete as the matter closes.",
    mediaType: "video",
    mediaSrc: thirdRecordingVideo,
    mediaAlt: "Act 3 Work preview",
  },
];

const logoPills: LogoItem[] = [
  { name: "Deloitte", src: delloiteLogo },
  { name: "Henry Hughes Intellectual Australia", src: henryHughesLogo },
  { name: "Logic Gnosis", src: logicGnosisLogo },
  { name: "Odisha Judicial Academy", src: oddisaJudicialLogo },
  { name: "Shardul Amarchand", src: shardulAmarchandLogo },
  { name: "Wadiya Ghandy & Co", src: wadiyaChandiLogo },
];
const scrollingLogos = [...logoPills, ...logoPills];

const Home = () => {
  const navigate = useNavigate();
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <>
      <div className="landingRoot">
        <div className="landingTopStrip" />
        <header className="landingNav">
          <button type="button" className="landingWordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Associate
          </button>

          <nav className="landingNavLinks" aria-label="Primary">
            <a href="#blogs">Blogs</a>
            <a href="#demos">Demos</a>
            <a href="#security">Security</a>
            <button type="button" onClick={() => setIsPricingOpen(true)}>
              Pricing
            </button>
          </nav>

          <button type="button" className="landingSignupButton" onClick={handleLogin}>
            Sign Up
          </button>
        </header>

        <main className="landingMain">
          <section className="landingHero">
            <h1>The AI workspace for Indian lawyers</h1>
            <p>The associate you couldn't afford. Now you can.</p>
            <button type="button" className="landingCtaButton" onClick={handleLogin}>
              Try Associate
            </button>
            <span>Built in India. For India's 1.7 million advocates. From day one.</span>
          </section>

          <section id="blogs" className="landingSection landingProblemSection">
            <p className="landingEyebrow">The Problem</p>
            <h2>Every legal AI tool generates. Nobody verifies.</h2>
            <p className="landingSectionLead">
              AI can help Indian lawyers. But until verification is native, context is persistent, and uncertainty is explicit, trust stays on the lawyer and not the tool.
            </p>

            <div className="landingProblemGrid">
              {problemCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.title} className="landingProblemCard">
                    <div className="landingProblemHeader">
                      <Icon size={28} strokeWidth={1.6} />
                      <h3>{card.title}</h3>
                    </div>
                    <p>{card.body}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="landingSection landingLogoBand">
            <div className="landingLogoPanel">
              <p className="landingEyebrow">Tried By Lawyers At</p>
              <h2>Already in the hands of lawyers at the firms and companies you know.</h2>
              <p className="landingSectionLead">
                We've shown Associate to in house counsel, partners, and solo practitioners across India.
              </p>
              <div className="landingLogoViewport">
                <div className="landingLogoTrack">
                  {scrollingLogos.map((logo, index) => (
                    <div key={`${logo.name}-${index}`} className="landingLogoPill">
                      <img src={logo.src} alt={logo.name} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="demos" className="landingSection landingHowSection">
            <h2>How Associate Works</h2>
            <p className="landingHowLead">The brief, the build, the work.</p>

            <div className="landingActs">
              {actSteps.map((step, index) => (
                <article
                  key={step.title}
                  className={`landingAct ${index % 2 === 1 ? "reverse" : ""}`}
                >
                  <div className="landingActCopy">
                    <h3>{step.title}</h3>
                    <strong>{step.headline}</strong>
                    <p>{step.body}</p>
                  </div>

                  <div className="landingActMediaWrap">
                    <div className={`landingActMedia ${step.mediaType}`}>
                      <video
                        className="landingActVideo"
                        src={step.mediaSrc}
                        aria-label={step.mediaAlt}
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="security" className="landingSection">
            <div className="landingSecurityCard">
              <Lock size={22} strokeWidth={1.6} />
              <h2>Uncompromising Security.</h2>
              <p>
                Associate employs bank-grade encryption and stringent data privacy protocols to ensure confidentiality is never breached.
              </p>
              <div className="landingSecurityBadges">
                <span>SOC 2 TYPE II CERTIFIED</span>
                <span>END-TO-END ENCRYPTION</span>
                <span>GDPR COMPLIANT</span>
                <span>ZERO-TRUST ARCHITECTURE</span>
              </div>
            </div>
          </section>

          <section className="landingSection">
            <div className="landingClosingCard">
              <h2>One Lawyer with Associate should feel like Ten.</h2>
              <p>
                We're building this for the advocate in Bengaluru with forty active matters and no support staff, not just the firms that already have both.
              </p>
              <button type="button" className="landingCtaButton" onClick={handleLogin}>
                Try Associate
              </button>
            </div>
          </section>
        </main>

        <footer className="landingFooter">
          <strong>Thank you for reading this far.</strong>
          <p>Associate · Built in Bengaluru, for India</p>
          <span>© 2026 Associate</span>
        </footer>
      </div>

      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
      />
    </>
  );
};

export default Home;
