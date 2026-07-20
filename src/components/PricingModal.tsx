import { X } from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Button from "./Button";
import "../componentStyling/PricingModal.css";

type PricingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated?: boolean;
};

type PricingPlan = {
  key: string;
  name: string;
  price: string;
  note?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  highlight?: boolean;
  action: "login" | "dashboard" | "contact";
};

const CONTACT_EMAIL =
  import.meta.env.VITE_CONTACT_EMAIL || "support@associateapp.com";

const PricingModal = ({
  isOpen,
  onClose,
  isAuthenticated = false,
}: PricingModalProps) => {
  const navigate = useNavigate();

  const plans = useMemo<PricingPlan[]>(
    () => [
      {
        key: "explore",
        name: "Explore Associate",
        price: "₹0/month",
        description:
          "For lawyers who want to try the workflow before committing to a paid plan.",
        features: [
          "1,500 free Associate Credits for invited users",
          "Trial credits expire after 30 days",
          "Credits are charged from actual AI and search usage",
          "1 Associate Credit equals ₹0.05 internal usage budget",
        ],
        ctaLabel: "Start Free",
        action: isAuthenticated ? "dashboard" : "login",
      },
      {
        key: "starter",
        name: "Starter",
        price: "₹1,999/month + GST",
        description:
          "For solo lawyers who want matter briefs, legal research, and drafting support.",
        features: [
          "Usage-based Associate Credit wallet",
          "Matter analysis, research, drafting, critique, and chat draw from one pool",
          "Backend-enforced credit checks before AI work starts",
          "Up to 5 documents per matter",
          "Standard queue",
        ],
        ctaLabel: "Choose Starter",
        action: isAuthenticated ? "dashboard" : "login",
      },
      {
        key: "professional",
        name: "Professional",
        price: "₹4,999/month + GST",
        note: "Best value",
        description:
          "For lawyers using AI daily for matter analysis, drafting, research, and playbooks.",
        features: [
          "Larger monthly Associate Credit allocation",
          "Matter analysis, deep research, drafting, critique, and chat draw from one pool",
          "Priority queue",
          "Top 5 law + inference cards per matter",
          "Draft recommendations + playbook",
        ],
        ctaLabel: "Start Professional",
        highlight: true,
        action: isAuthenticated ? "dashboard" : "login",
      },
      {
        key: "enterprise",
        name: "Enterprise",
        price: "Custom",
        description:
          "For chambers and firms that need higher limits, shared workflows, and bespoke rollout support.",
        features: [
          "Custom seat count",
          "Custom Associate Credit allocation",
          "Shared matter workspace",
          "Priority onboarding and support",
          "Custom rollout and billing",
        ],
        ctaLabel: "Contact Us",
        action: "contact",
      },
    ],
    [isAuthenticated],
  );

  if (!isOpen) return null;

  const handlePlanAction = (plan: PricingPlan) => {
    if (plan.action === "contact") {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        "Associate Enterprise plan",
      )}`;
      return;
    }

    onClose();
    navigate(plan.action === "dashboard" ? "/dashboard" : "/login");
  };

  return createPortal(
    <div
      className="pricingModalBackdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
      onClick={onClose}
    >
      <div
        className="pricingModalPanel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pricingModalHeader">
          <div>
            <p className="pricingModalEyebrow">Pricing</p>
            <h2 id="pricing-modal-title">Plans for every legal workflow</h2>
          </div>
          <Button
            type="button"
            className="pricingModalClose"
            aria-label="Close pricing"
            onClick={onClose}
            showImage
            image={<X size={18} />}
          />
        </div>

        <div className="pricingPlanGrid">
          {plans.map((plan) => (
            <section
              key={plan.key}
              className={`pricingPlanCard ${plan.highlight ? "highlight" : ""}`}
            >
              <div className="pricingPlanHead">
                <div>
                  <h3>{plan.name}</h3>
                  {plan.note ? <span>{plan.note}</span> : null}
                </div>
                <p className="pricingPlanPrice">{plan.price}</p>
              </div>
              <p className="pricingPlanDescription">{plan.description}</p>
              <ul className="pricingPlanFeatures">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button
                type="button"
                className={`pricingPlanCta ${plan.highlight ? "primary" : ""}`}
                onClick={() => handlePlanAction(plan)}
              >
                {plan.ctaLabel}
              </Button>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PricingModal;
