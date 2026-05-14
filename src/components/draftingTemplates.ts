import type { MatterRecord } from "../context/MatterStoreContext";

export type DraftTemplateCategory =
  | "Confidentiality"
  | "Services"
  | "Commercial"
  | "Corporate"
  | "Disputes";

export type DraftTemplate = {
  id: string;
  title: string;
  shortTitle: string;
  category: DraftTemplateCategory;
  sourceNote: string;
  bestFor: string;
  sections: string[];
  buildHtml: (matter: MatterRecord | null) => string;
};

type DraftContext = {
  matterTitle: string;
  fileName: string;
  partyA: string;
  partyB: string;
  effectiveDate: string;
  governingLaw: string;
  term: string;
  noticePeriod: string;
  purpose: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const field = (value: string) =>
  value.startsWith("[") ? `<mark class="draftPlaceholder">${escapeHtml(value)}</mark>` : escapeHtml(value);

const getMatterContext = (matter: MatterRecord | null): DraftContext => {
  const parties = matter?.extractedFields.parties || [];
  const people = matter?.people || [];
  const firstParty = parties[0]?.name || people[0]?.name || "[Party A]";
  const secondParty = parties[1]?.name || people[1]?.name || "[Party B]";

  return {
    matterTitle: matter?.title || "[Matter Title]",
    fileName: matter?.fileName || "[Source Document]",
    partyA: firstParty,
    partyB: secondParty,
    effectiveDate: matter?.extractedFields.effective_date.value || "[Effective Date]",
    governingLaw: matter?.extractedFields.governing_law.value || "[Governing Law]",
    term: matter?.extractedFields.contract_term.value || "[Contract Term]",
    noticePeriod: matter?.extractedFields.notice_period.value || "[Notice Period]",
    purpose:
      matter?.pageIndex.find((item) =>
        /scope|summary|background|recitals/i.test(item.label),
      )?.label || "[Purpose / Transaction Description]",
  };
};

const attribution = (sourceNote: string) =>
  `<p class="draftAttribution">Template basis: ${escapeHtml(sourceNote)}. Review and localize before signature.</p>`;

export const DRAFT_TEMPLATES: DraftTemplate[] = [
  {
    id: "mutual-nda",
    title: "Mutual Non-Disclosure Agreement",
    shortTitle: "Mutual NDA",
    category: "Confidentiality",
    sourceNote: "Common Paper mutual NDA cover-page pattern",
    bestFor: "Two-way diligence, partnership discussions, procurement review",
    sections: ["Parties", "Purpose", "Confidentiality", "Term", "Governing law"],
    buildHtml: (matter) => {
      const c = getMatterContext(matter);
      return `
        <h1>Mutual Non-Disclosure Agreement</h1>
        ${attribution("Common Paper mutual NDA cover-page pattern")}
        <p>This Mutual Non-Disclosure Agreement is entered into as of ${field(c.effectiveDate)} by and between ${field(c.partyA)} and ${field(c.partyB)}.</p>
        <h2>1. Purpose</h2>
        <p>The parties may exchange confidential information solely to evaluate and discuss ${field(c.purpose)} in connection with ${field(c.matterTitle)}.</p>
        <h2>2. Confidential Information</h2>
        <p>Confidential Information means non-public business, technical, financial, legal, operational, or customer information disclosed by either party, whether orally, visually, electronically, or in writing.</p>
        <h2>3. Obligations</h2>
        <p>Each receiving party will use Confidential Information only for the Purpose, protect it using reasonable care, and disclose it only to representatives who need to know and are bound by confidentiality obligations.</p>
        <h2>4. Exclusions</h2>
        <p>Confidential Information does not include information that is publicly available, already known without restriction, independently developed, or lawfully received from a third party.</p>
        <h2>5. Term</h2>
        <p>This Agreement remains in effect for ${field(c.term)}. Confidentiality obligations survive for ${field("[Confidentiality Survival Period]")} after disclosure.</p>
        <h2>6. Governing Law</h2>
        <p>This Agreement is governed by ${field(c.governingLaw)}. Notices must be sent with at least ${field(c.noticePeriod)} notice unless urgent equitable relief is required.</p>
        <h2>Signatures</h2>
        <p>${field(c.partyA)}: ____________________ &nbsp;&nbsp; ${field(c.partyB)}: ____________________</p>
      `;
    },
  },
  {
    id: "one-way-nda",
    title: "One-Way Confidentiality Undertaking",
    shortTitle: "One-Way NDA",
    category: "Confidentiality",
    sourceNote: "Common Paper one-way NDA structure",
    bestFor: "Vendor review, investor diligence, employee or contractor access",
    sections: ["Disclosing party", "Receiving party", "Use restriction", "Return", "Survival"],
    buildHtml: (matter) => {
      const c = getMatterContext(matter);
      return `
        <h1>One-Way Confidentiality Undertaking</h1>
        ${attribution("Common Paper one-way NDA structure")}
        <p>This undertaking is made as of ${field(c.effectiveDate)} by ${field(c.partyB)} as Receiving Party in favor of ${field(c.partyA)} as Disclosing Party.</p>
        <h2>1. Protected Information</h2>
        <p>The Disclosing Party may provide confidential information relating to ${field(c.purpose)} and the matter titled ${field(c.matterTitle)}.</p>
        <h2>2. Use and Disclosure</h2>
        <p>The Receiving Party will use protected information only for evaluation or performance of the stated purpose and will not disclose it without prior written consent.</p>
        <h2>3. Safeguards</h2>
        <p>The Receiving Party will apply reasonable administrative, technical, and organizational safeguards and will promptly report unauthorized access or disclosure.</p>
        <h2>4. Return or Destruction</h2>
        <p>Upon request, the Receiving Party will return or destroy protected information, except archival copies retained for legal compliance.</p>
        <h2>5. Survival and Law</h2>
        <p>Confidentiality obligations survive for ${field("[Survival Period]")}. This undertaking is governed by ${field(c.governingLaw)}.</p>
      `;
    },
  },
  {
    id: "statement-of-work",
    title: "Statement of Work",
    shortTitle: "SOW",
    category: "Services",
    sourceNote: "Common Paper SOW and order-form business terms pattern",
    bestFor: "Professional services, implementation, consulting deliverables",
    sections: ["Scope", "Deliverables", "Timeline", "Fees", "Acceptance"],
    buildHtml: (matter) => {
      const c = getMatterContext(matter);
      return `
        <h1>Statement of Work</h1>
        ${attribution("Common Paper SOW and order-form business terms pattern")}
        <p>This Statement of Work is issued under or in connection with ${field(c.matterTitle)} and is effective as of ${field(c.effectiveDate)}.</p>
        <h2>1. Parties</h2>
        <p>Client: ${field(c.partyA)}. Service Provider: ${field(c.partyB)}.</p>
        <h2>2. Scope of Services</h2>
        <p>The Service Provider will perform the services described below: ${field("[Detailed scope of services]")}.</p>
        <h2>3. Deliverables</h2>
        <ul>
          <li>${field("[Deliverable 1]")}</li>
          <li>${field("[Deliverable 2]")}</li>
          <li>${field("[Deliverable 3]")}</li>
        </ul>
        <h2>4. Timeline and Milestones</h2>
        <p>The expected project term is ${field(c.term)}. Milestones, dependencies, and acceptance dates should be inserted here: ${field("[Milestone Schedule]")}.</p>
        <h2>5. Fees and Payment</h2>
        <p>Fees are ${field("[Fees / Rate Card]")}. Invoices are payable within ${field("[Payment Period]")} days of receipt unless disputed in good faith.</p>
        <h2>6. Acceptance</h2>
        <p>Deliverables will be deemed accepted unless the Client provides specific written rejection reasons within ${field("[Acceptance Review Period]")} days.</p>
      `;
    },
  },
  {
    id: "service-agreement",
    title: "Services Agreement",
    shortTitle: "Services Contract",
    category: "Commercial",
    sourceNote: "Common Paper cloud/service agreement structure",
    bestFor: "Vendor contracts, SaaS, managed services, business outsourcing",
    sections: ["Services", "Fees", "Data", "IP", "Liability", "Termination"],
    buildHtml: (matter) => {
      const c = getMatterContext(matter);
      return `
        <h1>Services Agreement</h1>
        ${attribution("Common Paper cloud/service agreement structure")}
        <p>This Services Agreement is entered into by ${field(c.partyA)} and ${field(c.partyB)} as of ${field(c.effectiveDate)}.</p>
        <h2>1. Services</h2>
        <p>The provider will supply the services described in the applicable statement of work, order form, or schedule attached to this Agreement.</p>
        <h2>2. Customer Responsibilities</h2>
        <p>The customer will provide timely access, approvals, data, and cooperation reasonably required for performance.</p>
        <h2>3. Fees and Taxes</h2>
        <p>The customer will pay fees described in ${field("[Order Form / Fee Schedule]")}. Taxes, reimbursable expenses, and payment timelines should be specified.</p>
        <h2>4. Confidentiality and Data</h2>
        <p>Each party will protect confidential information. If personal data or regulated data is processed, the parties will attach a data protection schedule.</p>
        <h2>5. Intellectual Property</h2>
        <p>Pre-existing materials remain with their original owner. Ownership of work product will be: ${field("[Ownership Position]")}.</p>
        <h2>6. Termination</h2>
        <p>Either party may terminate for material breach after ${field(c.noticePeriod)} written notice and failure to cure.</p>
        <h2>7. Governing Law</h2>
        <p>This Agreement is governed by ${field(c.governingLaw)}.</p>
      `;
    },
  },
  {
    id: "legal-notice-performance",
    title: "Legal Notice for Contract Performance",
    shortTitle: "Performance Notice",
    category: "Disputes",
    sourceNote: "Courtbook Indian notice and specific-performance drafting categories",
    bestFor: "Pre-litigation demand, breach notice, performance demand",
    sections: ["Addressee", "Facts", "Breach", "Demand", "Reservation"],
    buildHtml: (matter) => {
      const c = getMatterContext(matter);
      return `
        <h1>Legal Notice for Contract Performance</h1>
        ${attribution("Courtbook Indian notice and specific-performance drafting categories")}
        <p>To, ${field(c.partyB)}</p>
        <p>Under instructions from and on behalf of ${field(c.partyA)}, we issue this legal notice concerning ${field(c.matterTitle)}.</p>
        <h2>1. Background</h2>
        <p>Our client states that the parties entered into or acted upon the arrangement recorded in ${field(c.fileName)} with effect from ${field(c.effectiveDate)}.</p>
        <h2>2. Breach / Non-Performance</h2>
        <p>You have failed to perform the following obligations: ${field("[Describe breach with dates, clauses, and supporting documents]")}.</p>
        <h2>3. Demand</h2>
        <p>You are called upon to cure the breach, perform all pending obligations, and compensate our client for losses within ${field(c.noticePeriod)} from receipt of this notice.</p>
        <h2>4. Consequences</h2>
        <p>If you fail to comply, our client reserves the right to initiate civil, contractual, arbitral, or other appropriate proceedings at your risk as to costs and consequences.</p>
        <h2>5. Reservation of Rights</h2>
        <p>All rights, remedies, claims, and contentions of our client are expressly reserved.</p>
      `;
    },
  },
];
