import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  ClipboardCheck,
  FilePenLine,
  FileText,
  FolderKanban,
  Gavel,
  Landmark,
  Lock,
  PlayCircle,
  ScrollText,
  SearchCheck,
  UploadCloud,
} from "lucide-react";
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
import backgroundVideo from "./assets/backgroundVideo.mp4";

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

type FloatingHeroItem = {
  text: string;
  icon: typeof FolderKanban;
  variant?: "pulse" | "tertiary";
};

const infrastructureSteps = [
  {
    title: "1. Upload",
    body: "Contracts, notices, emails",
    icon: UploadCloud,
  },
  {
    title: "2. Understand",
    body: "Parties, clauses, dates",
    icon: BrainCircuit,
  },
  {
    title: "3. Research",
    body: "Statutes, case law",
    icon: ScrollText,
  },
  {
    title: "4. Draft",
    body: "Notices, memos, replies",
    icon: FilePenLine,
  },
  {
    title: "5. Verify",
    body: "Source refs, clause checks",
    icon: ClipboardCheck,
  },
  {
    title: "6. Review",
    body: "Lawyer approval",
    icon: Gavel,
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

const floatingHeroItems: FloatingHeroItem[] = [
  {
    text: "Matter Atlas: Party A v. Party B - Ready",
    icon: FolderKanban,
  },
  {
    text: "Evidence Registry: 12 verified facts, 4 open gaps",
    icon: ClipboardCheck,
    variant: "pulse",
  },
  {
    text: "Draft Queue: Section 21 Notice, Appointment Note",
    icon: FilePenLine,
  },
  {
    text: "Matter Law Vault: 8 pinned authorities",
    icon: Landmark,
  },
  {
    text: "Source Trace: Clause 8.3 MSA - 97% Verified",
    icon: SearchCheck,
    variant: "tertiary",
  },
];

const Home = () => {
  const navigate = useNavigate();
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const showHowAssociateWorks = false;

  const handleLogin = () => {
    navigate("/login");
  };

  const handleWalkthroughClick = () => {
    document.getElementById("demos")?.scrollIntoView({ behavior: "smooth" });
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
            <a href="#blogs">Problem</a>
            {showHowAssociateWorks && <a href="#demos">Demos</a>}
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
          <section className="landingHero" aria-labelledby="landing-hero-title">
            <div className="landingHeroBackdrop" aria-hidden="true">
              <video
                className="landingHeroVideo"
                src={backgroundVideo}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
              />
              <div className="landingHeroShader" />
            </div>

            <div className="landingHeroInner">
              <div className="landingHeroCopy">
                <div className="landingHeroEyebrow">
                  <span />
                  <strong>AI Legal Workbench For Lawyers</strong>
                </div>
                <h1 id="landing-hero-title">
                  The associate every lawyer wishes they had.
                </h1>
                <p className="landingHeroLead">
                  Built for research, drafting, matter review, and source-grounded legal work.
                </p>
                <p className="landingHeroBody">
                  Upload contracts, notices, pleadings, emails, PDFs, and case files. Associate organizes the matter, researches the law, extracts what matters, and helps draft with source-grounded precision.
                </p>

                <div className="landingHeroActions">
                  <button type="button" className="landingHeroPrimary" onClick={handleLogin}>
                    Request Demo
                    <ArrowRight size={18} strokeWidth={1.8} />
                  </button>
                  {showHowAssociateWorks && (
                    <button type="button" className="landingHeroSecondary" onClick={handleWalkthroughClick}>
                      View Product Walkthrough
                      <PlayCircle size={18} strokeWidth={1.8} />
                    </button>
                  )}
                </div>

                <div className="landingHeroTrust" aria-label="Product capabilities">
                  <span>Matter intelligence</span>
                  <i>·</i>
                  <span>Legal research</span>
                  <i>·</i>
                  <span>Draft support</span>
                  <i>·</i>
                  <span>Evidence trace</span>
                  <i>·</i>
                  <span>Lawyer review</span>
                </div>
              </div>

              <div className="landingHeroVisual" aria-hidden="true">
                <div className="landingHeroFloatLayer">
                  {floatingHeroItems.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.text}
                        className={`landingHeroFloat landingHeroFloat${index + 1} ${
                          item.variant === "pulse" ? "pulse" : ""
                        } ${item.variant === "tertiary" ? "tertiary" : ""}`}
                      >
                        <span className="landingHeroFloatIcon">
                          <Icon size={17} strokeWidth={1.7} />
                        </span>
                        <span>{item.text}</span>
                      </div>
                    );
                  })}
                </div>

                <aside className="landingHeroBrief">
                  <div className="landingHeroBriefHeader">
                    <BarChart3 size={22} strokeWidth={1.7} />
                    <h2>Today's Matter Brief</h2>
                  </div>
                  <dl>
                    <div>
                      <dt>Active Matters</dt>
                      <dd>04</dd>
                    </div>
                    <div>
                      <dt>Documents Digested</dt>
                      <dd>1,204</dd>
                    </div>
                    <div>
                      <dt>Drafts Pending Review</dt>
                      <dd className="live"><span />02</dd>
                    </div>
                  </dl>
                </aside>
              </div>
            </div>
          </section>

          <section id="blogs" className="landingSection landingProblemSection">
            <div className="institutionalTexture" aria-hidden="true" />
            <div className="institutionalShell">
              <div className="institutionalGrid">
                <div className="institutionalIntro">
                  <p className="institutionalKicker">The Problem</p>
                  <h2>Legal AI that builds the matter before it writes the draft.</h2>
                  <p>
                    Upload contracts, notices, emails, PDFs, pleadings, and case files. Associate turns them into matter intelligence, legal research, verified evidence, and source-grounded drafts.
                  </p>
                  <div className="institutionalActions">
                    <button type="button" onClick={handleLogin}>
                      Request Demo
                    </button>
                    {showHowAssociateWorks && (
                      <button type="button" onClick={handleWalkthroughClick}>
                        <PlayCircle size={18} strokeWidth={1.7} />
                        View Product Walkthrough
                      </button>
                    )}
                  </div>
                </div>

                <div className="institutionalMockup" aria-label="Matter intelligence preview">
                  <div className="institutionalMockupGlow" aria-hidden="true" />
                  <div className="institutionalMatterBar">
                    <div>
                      <span>Matter</span>
                      <strong>Party A v. Party B</strong>
                    </div>
                    <div className="institutionalStatus">
                      <i />
                      Pre-Arbitration / Section 21 Readiness
                    </div>
                  </div>

                  <div className="institutionalMatterGrid">
                    <div className="institutionalMatterColumn">
                      <article className="institutionalPanel">
                        <h3>
                          <ClipboardCheck size={18} strokeWidth={1.7} />
                          Verified Clauses
                        </h3>
                        <div className="institutionalClauseList">
                          <span>6.1</span>
                          <span>8.1</span>
                          <span>8.2</span>
                          <span>8.3</span>
                          <span>10.1</span>
                        </div>
                      </article>

                      <article className="institutionalPanel danger">
                        <h3>
                          <SearchCheck size={18} strokeWidth={1.7} />
                          Open Gaps
                        </h3>
                        <ul>
                          <li>Proof of Service</li>
                          <li>Negotiation Completion</li>
                          <li>Arbitrator Strategy</li>
                        </ul>
                      </article>
                    </div>

                    <div className="institutionalMatterColumn">
                      <article className="institutionalPanel evidence">
                        <div className="institutionalEvidenceHeader">
                          <span>Evidence Trace</span>
                          <strong>97% Conf</strong>
                        </div>
                        <p>MSA dated 12 Jan 2024</p>
                        <div className="institutionalDocumentRef">
                          <FileText size={14} strokeWidth={1.7} />
                          01_MSA_PartyA_PartyB.md
                          <span>•</span>
                          Clause 8.3
                        </div>
                      </article>

                      <article className="institutionalPanel queue">
                        <h3>
                          <FilePenLine size={18} strokeWidth={1.7} />
                          Draft Queue
                        </h3>
                        <div className="institutionalDraftList">
                          <div>
                            <span>Section 21 Notice</span>
                            <strong>97% Conf</strong>
                          </div>
                          <div className="pending">
                            <span>Appointment Note</span>
                            <strong>Pending gaps</strong>
                          </div>
                          <div className="pending">
                            <span>Claim Chronology</span>
                            <strong>Pending gaps</strong>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
              </div>

              <div className="institutionalPipeline">
                <div className="institutionalPipelineHeader">
                  <h2>From document dump to review-ready legal work.</h2>
                  <span />
                </div>

                <div className="institutionalStepGrid">
                  {infrastructureSteps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <article key={step.title} className="institutionalStep">
                        <div className="institutionalStepIcon">
                          <Icon size={22} strokeWidth={1.7} />
                        </div>
                        <h3>{step.title}</h3>
                        <p>{step.body}</p>
                        {index < infrastructureSteps.length - 1 && <i aria-hidden="true" />}
                      </article>
                    );
                  })}
                </div>
              </div>
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

          {showHowAssociateWorks && (
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
          )}

          <section id="security" className="landingSection landingSecuritySection">
            <div className="landingSecurityCard">
              <div className="landingSecurityHeader">
                <span className="landingSecurityIcon">
                  <Lock size={22} strokeWidth={1.6} />
                </span>
                <p className="landingEyebrow">Security</p>
                <h2>Uncompromising Security.</h2>
                <p>
                  Associate employs bank-grade encryption and stringent data privacy protocols to ensure confidentiality is never breached.
                </p>
              </div>
              <div className="landingSecurityBadges" aria-label="Security standards">
                <span>SOC 2 TYPE II CERTIFIED</span>
                <span>END-TO-END ENCRYPTION</span>
                <span>GDPR COMPLIANT</span>
                <span>ZERO-TRUST ARCHITECTURE</span>
              </div>
            </div>
          </section>

          <section className="landingSection landingValueSection">
            <div className="landingClosingCard">
              <p className="landingEyebrow">Value</p>
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
