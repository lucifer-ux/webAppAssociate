import type {
  MatterProcessedResult,
  MatterRecord,
  MatterValidationSummary,
  MatterPreviewSource,
  TextQualityReport,
  MatterHealth,
  MatterExtractedFields,
  MatterUploadPayload,
  PageAwareStructure,
  MatterPageIndexItem,
} from "../context/MatterStoreContext";

export const MOCK_MODE_STORAGE_KEY = "associateapp:matter-mock-mode";
export const MOCK_MATTERS_STORAGE_KEY = "associateapp:mock-matter-results";
const MOCK_PREFIX = "mock_matter_";

export const MOCK_ANSWER_KEY_MD = `# GOLD STANDARD ANSWER KEY
## Mehra Exports v. CloudServ Technologies — Sample Matter Benchmark

This is the analysis Associate should produce when fed the five matter documents. Compare your actual output against this to identify gaps in classification, retrieval, inference, and next-steps generation.

---

## MATTER CLASSIFICATION

| Field | Correct Value |
|---|---|
| **Matter Type** | Commercial contract dispute — B2B services agreement with cross-claims |
| **Legal Regime** | Contract law (primary) + Arbitration law (procedural) + Tort (negligence — secondary) |
| **Sub-domain** | IT services / SaaS contracts; cloud services performance disputes |
| **Party Represented** | Mehra Exports Pvt. Ltd. (Client / Petitioner-Claimant) |
| **Opposing Party** | CloudServ Technologies Pvt. Ltd. (Service Provider / Respondent) |
| **Forum (Primary)** | Arbitration under the Arbitration and Conciliation Act, 1996 (mandatory under Clause 8.2) |
| **Seat of Arbitration** | New Delhi (per Clause 8.3) |
| **Forum (Interim Relief)** | Delhi High Court (per Clause 8.4 and Section 9, A&C Act) |
| **Civil/criminal forum jurisdiction** | **EXPRESSLY EXCLUDED** by the arbitration clause for substantive disputes. Criminal proceedings under IPC are *not* available for purely commercial breach claims and any such threat is improper. |
| **Primary Statutes** | Indian Contract Act, 1872 (Sections 17, 18, 55, 56, 73, 74); Arbitration and Conciliation Act, 1996 (Sections 9, 11, 17, 21, 34); Specific Relief Act, 1963; Limitation Act, 1963 (Article 113) |
| **Contract Value** | Rs. 48,00,000 (Rs. 12,00,000 paid; Rs. 36,00,000 outstanding/disputed) |
| **Quantum of Client's Claim** | Rs. 82,46,700 (direct damages) + interest @ commercial rates + costs |
| **Quantum of Counter-Claim** | Rs. 55,58,997 (per reply notice) |
| **Net Exposure Analysis** | If client wins fully: Net recovery ~Rs. 82L. If client loses on key issues: Net liability ~Rs. 21-25L (constrained by liability cap). |
| **Limitation** | 3 years from breach (14 August 2024) under Article 113 — limitation expires ~14 August 2027. Arbitration notice tolls limitation. |
| **Urgency** | Medium. Arbitration must be commenced. Section 9 interim relief should be considered to secure CloudServ's assets given counter-claim risk. |

---

## CRITICAL ISSUES THE AGENT MUST FLAG IMMEDIATELY

### ⚠️ Issue 1: The legal notice threatens criminal proceedings — this is a significant error
Paragraph 15(c) of the Sounak Senapati notice threatens prosecution under IPC Sections 405, 406, and 420. This is legally and ethically problematic.

### ⚠️ Issue 2: The forum question is settled but the negotiation precondition needs careful handling
Clause 8.1 requires 30-day senior executive negotiation before arbitration and that precondition needs to be formally invoked cleanly.

### ⚠️ Issue 3: The M2 dispute is the lynchpin issue and needs forensic clarity
The 24 June objection falls within the 15-day Clause 3.2 dispute window counted from the 14 June invoice.

---

## GROUND ANALYSIS

### Ground 1 — Breach of Service Level Warranty (Uptime) [Strong — 85%]
The 99.5% uptime warranty was breached by a material margin during the 14-15 August 2024 outage.

### Ground 2 — Breach of Incident Response SLA [Strong — 88%]
The 30-minute incident response SLA was breached by more than four hours.

### Ground 3 — Misrepresentation / Negligence on Deployment Architecture [Strong — 82%]
The architecture sold as multi-AZ was actually deployed in a single AZ, with non-functional redundancy.

### Ground 4 — Wrongful Termination Liability (Defensive) [Medium — 65%]
If material breach is not proved, the client's termination risks being treated as convenience termination with compensation exposure.

### Ground 5 — Recovery of Customer Penalty Losses [Medium-Strong — 72%]
Rs. 64,87,500 in customer penalties is recoverable if the liability cap is displaced through gross negligence or wilful misconduct.

---

## NEXT STEPS (PRIORITY-ORDERED)

### Immediate (this week)
1. Issue a corrigendum to the legal notice removing the criminal threats.
2. Formally invoke the 30-day senior executive negotiation under Clause 8.1.
3. Preserve all evidence under formal chain-of-custody.

### Within 2 weeks
4. File Section 9 application before Delhi High Court for interim measures.
5. Issue formal Notice of Arbitration under Section 21 of A&C Act.
6. Engage technical expert to prepare expert report.

### Before Statement of Claim
7. Quantify damages with precision under each head.
8. Develop counter-claim defense strategy.
9. Prepare Statement of Claim.
10. Develop settlement parameters internally.
`;

type MockScenario = {
  initialResult: MatterProcessedResult;
  acceptedResult: MatterProcessedResult;
  stageResults: Array<{
    delayMs: number;
    result: MatterProcessedResult;
  }>;
};

type GroundCard = NonNullable<
  NonNullable<MatterProcessedResult["ground_analysis"]>["cards"]
>[number];
type LegalRule = NonNullable<GroundCard["legal_rules"]>[number];
type ContraryPoint = NonNullable<GroundCard["contrary_or_limiting_points"]>[number];
type NextStepItem =
  NonNullable<NonNullable<GroundCard["next_steps"]>["recommended_next_steps"]>[number];

const DEFAULT_DOCUMENTS = [
  "01_master_services_agreement.md",
  "02_invoice_and_email_chain.md",
  "03_forensic_outage_memo.md",
  "04_legal_notice.md",
  "05_reply_notice.md",
];

const defaultValidation = (sha256: string): MatterValidationSummary => ({
  accepted: true,
  size_bytes: 18240,
  declared_extension: ".md",
  declared_kind: "md",
  detected_extension: "md",
  detected_mime: "text/markdown",
  sha256,
  parse: {
    kind: "md",
    page_count: 14,
    estimated_pages: 14,
    is_encrypted: false,
    is_corrupt: false,
  },
});

const defaultTextQuality: TextQualityReport = {
  level: "GOOD",
  score: 1,
  usable_for_ai: true,
  issues: [],
  metrics: {
    character_count: 12540,
    word_count: 1840,
    empty_pages: 0,
    garbled_ratio: 0,
    weird_symbol_ratio: 0,
    repeated_header_footer_count: 0,
    table_like_block_count: 1,
    language_script: "Latin",
    ocr_confidence: null,
  },
};

const defaultExtractedFields: MatterExtractedFields = {
  parties: [
    { name: "Mehra Exports Pvt. Ltd.", role: "Client / Claimant", confidence: "high" },
    { name: "CloudServ Technologies Pvt. Ltd.", role: "Service Provider / Respondent", confidence: "high" },
  ],
  effective_date: { value: "2024-01-12", confidence: "high" },
  governing_law: { value: "Indian law", confidence: "medium" },
  contract_term: { value: "Managed cloud services engagement", confidence: "medium" },
  notice_period: { value: "30-day negotiation precondition; 60-day convenience termination clause", confidence: "medium" },
};

const defaultHealth: MatterHealth = {
  missing_clauses: [],
  flagged_clauses: ["dispute_resolution", "limitation_of_liability", "termination"],
  completeness_score: 96,
};

const buildPageAwareStructure = (documentId: string, fullText: string): PageAwareStructure => {
  const paragraphs = fullText
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const blocks = paragraphs.map((text, index) => ({
    block_id: `${documentId}_block_${index + 1}`,
    type: text.startsWith("#") ? "heading" : "paragraph",
    text,
    page: Math.floor(index / 6) + 1,
    page_block_index: index,
    doc_char_start: 0,
    doc_char_end: text.length,
  })) as PageAwareStructure["pages"][number]["blocks"];

  return {
    document_id: documentId,
    full_text: fullText,
    sections: [
      {
        section_id: `${documentId}_section_1`,
        section_type: "summary",
        section_label: "Summary",
        page_start: 1,
        page_end: Math.max(1, Math.ceil(blocks.length / 6)),
        extraction_status: "ready",
        error: null,
        clauses: [],
      },
    ],
    pages: Array.from(
      { length: Math.max(1, Math.ceil(blocks.length / 6)) },
      (_, pageIndex) => ({
        page_number: pageIndex + 1,
        label: `Page ${pageIndex + 1}`,
        blocks: blocks.filter((block) => block.page === pageIndex + 1),
      }),
    ),
  };
};

const buildPageIndex = (pages: number): MatterPageIndexItem[] => [
  {
    type: "brief",
    label: "Brief",
    start: 1,
    end: Math.max(1, Math.ceil(pages / 2)),
    status: "clean",
  },
  {
    type: "analysis",
    label: "Analysis",
    start: Math.max(1, Math.ceil(pages / 2)),
    end: pages,
    status: "flagged",
  },
];

const hashSeed = (seed: string) =>
  `mock_sha_${seed.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

const makeDocumentEntry = ({
  matterId,
  jobId,
  fileName,
  index,
  text,
}: {
  matterId: string;
  jobId: string;
  fileName: string;
  index: number;
  text: string;
}) => {
  const documentId = `${matterId}_doc_${index + 1}`;
  const structure = buildPageAwareStructure(documentId, text);
  const validation = defaultValidation(hashSeed(`${matterId}_${fileName}`));

  const document: MatterUploadPayload = {
    id: documentId,
    job_id: jobId,
    title: fileName.replace(/\.md$/i, "").replace(/_/g, " "),
    fileName,
    mimeType: "text/markdown",
    document_type: "MARKDOWN",
    status: "processed",
    uploaded_at: new Date().toISOString(),
    uploadedAt: new Date().toISOString(),
    page_count: structure.pages.length,
    word_count: text.split(/\s+/).filter(Boolean).length,
    sha256: validation.sha256,
    kind: "md",
    versionFingerprint: validation.sha256,
  };

  return {
    document,
    validation,
    preview_text: text.slice(0, 1200),
    preview_text_source: "server" as MatterPreviewSource,
    text_quality: defaultTextQuality,
    next_step: "BUILD_PAGE_AWARE_STRUCTURE" as const,
    page_aware_structure: structure,
    page_index: buildPageIndex(structure.pages.length),
    extracted_fields: defaultExtractedFields,
    extracted_fields_status: "ready" as const,
    extracted_fields_error: null,
    health: defaultHealth,
    pipeline_statuses: {
      extraction: "ready",
      field_extraction: "ready",
    },
  };
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const htmlFromPlainText = (text: string) =>
  String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

const negotiationTemplateText = `Subject: Notice Invoking Clause 8.1 Senior-Executive Negotiation Process

[Date]

Via Email and [Courier / Certified Mail, if required]

To:
[Recipient Name]
[Title]
[Company Name]
[Address]
[Email]

Re: Formal Notice Invoking Clause 8.1 Pre-Arbitration Senior-Executive Negotiation Process

Dear [Recipient Name],

We write on behalf of [Company / Individual Name] regarding the dispute arising from [brief description of dispute, e.g., the termination of [Name]'s employment and related allegations of wrongful termination, damages, and liability].

Pursuant to Clause 8.1 of the [Agreement Name] dated [Date], this letter serves as formal notice that [Company / Individual Name] invokes the required senior-executive negotiation process as a condition precedent to arbitration.

Consistent with Clause 8.1, we request that authorized senior executives from both parties meet and confer in good faith to attempt to resolve the dispute within the required 30-day pre-arbitration period. Nothing in this notice constitutes an admission of liability, waiver of rights, or limitation of any claims, defenses, remedies, or objections available to [Company / Individual Name], all of which are expressly reserved.

To facilitate timely compliance with Clause 8.1, we propose the following meeting window:

Proposed Meeting Window:
Between [Start Date] and [End Date]
Available times: [list 2–4 specific dates/times, including time zone]
Format: [Video conference / in-person at location / telephone conference]

Please confirm your availability by [Response Deadline] and identify the senior executive who will attend with authority to engage in settlement discussions. We are also prepared to exchange a short agenda in advance to ensure the meeting is productive and focused.

This notice is provided without prejudice and with a full reservation of rights. Should the parties be unable to resolve the dispute within the 30-day period required by Clause 8.1, [Company / Individual Name] reserves the right to proceed with arbitration or any other available remedy in accordance with the Agreement.

Sincerely,

[Name]
[Title]
[Company / Law Firm, if applicable]
[Email]
[Phone]

cc: [Names / Counsel, if applicable]`;

const corrigendumTemplateText = `CORRIGENDUM / CLARIFICATION TO LEGAL NOTICE DATED 12 SEPTEMBER [YEAR]

Date: [●]

To:
[Recipient Name]
[Address / Email]

From:
[Sender Name]
[Address / Email]

Subject: Corrigendum to Legal Notice dated 12 September [Year]

Dear [Sir/Madam],

We refer to our legal notice dated 12 September [Year] issued to you in relation to [briefly describe dispute / agreement / termination / outstanding obligations].

This communication is issued as a corrigendum and clarification to the said notice.

Without prejudice to our client's civil, contractual, monetary, injunctive, and arbitral rights, and with full reservation of all remedies available in law and equity, we hereby clarify that any language in the notice dated 12 September [Year] referring to, threatening, or suggesting initiation of criminal proceedings under Sections 405, 406, and/or 420 of the Indian Penal Code, 1860, or any similar criminal provision, is hereby withdrawn and shall not be relied upon.

Accordingly, the notice dated 12 September [Year] shall stand modified to the following limited extent:

Any reference to proposed criminal action, criminal complaint, prosecution, or proceedings under IPC Sections 405, 406, 420, or equivalent criminal provisions, shall be treated as deleted.

For the avoidance of doubt, this corrigendum does not withdraw, waive, dilute, or prejudice our client's position regarding:

breach of contract;
wrongful termination / unlawful termination, if applicable;
recovery of dues, losses, damages, indemnities, or compensation;
enforcement of contractual obligations;
interim or protective reliefs;
invocation or continuation of arbitration under [Agreement / Clause reference]; and
all other civil and contractual remedies available to our client.

Our client expressly reserves the right to pursue appropriate civil and arbitral proceedings in accordance with the agreement between the parties, including under the dispute resolution and arbitration clause contained therein.

This corrigendum is issued solely to clarify the scope of the notice dated 12 September [Year] and to ensure that the dispute is pursued as a civil, contractual, and arbitral matter. Nothing contained herein shall be construed as an admission of liability, waiver of rights, concession on merits, or abandonment of any civil claim, defense, counterclaim, set-off, or remedy.

Save as expressly modified above, the contents of the legal notice dated 12 September [Year] shall remain unchanged and are reiterated to the extent they relate to civil, contractual, monetary, and arbitral claims.

Kindly take this corrigendum on record.

Sincerely,

[Name]
[Designation / Advocate for Sender, if applicable]
[Company / Law Firm Name]
[Email]
[Phone]`;

const arbitrationTemplateText = `NOTICE INVOKING ARBITRATION UNDER SECTION 21

Arbitration and Conciliation Act, 1996

Date: [●]

Via: Email / Registered Post / Courier / Contractual Notice Method
To:
[Respondent Name]
[Designation]
[Company Name]
[Address]
[Email]

From:
[Claimant Name]
[Address]
[Email]

Subject: Notice Invoking Arbitration under Section 21 of the Arbitration and Conciliation Act, 1996 — Breach of Service Level Warranty / Uptime Obligations

Dear [Sir/Madam],

We act for and on behalf of [Claimant Name]. This notice is issued pursuant to Section 21 of the Arbitration and Conciliation Act, 1996, and Clause [●] of the [Agreement Name] dated [●], to formally invoke arbitration in respect of disputes arising out of your breach of the service level warranty and uptime commitments under the Agreement.

1. Agreement and Arbitration Clause

The parties entered into the [Master Services Agreement / SaaS Agreement / Service Agreement] dated [●]. Clause [●] of the Agreement contains a binding arbitration agreement, which provides that disputes arising out of or in connection with the Agreement shall be referred to arbitration.

The relevant contractual provisions include, among others:

Clause [●] — Service Level Warranty / Uptime Commitment;
Clause [●] — Service Credits / Remedies;
Clause [●] — Limitation of Liability, if applicable;
Clause [●] — Dispute Resolution / Senior-Executive Negotiation; and
Clause [●] — Arbitration.
2. Record of Pre-Arbitration Negotiation Step

Before issuing this notice, our client complied with the contractual pre-arbitration negotiation requirement under Clause 8.1 of the Agreement.

By notice dated [●], our client invoked the senior-executive negotiation process under Clause 8.1 and proposed a meeting window between [●] and [●].

The negotiation step now stands recorded as follows:

Option A — Meeting Held but Failed:
The parties' senior representatives met on [●]. Despite good-faith discussions, no resolution was reached within the contractual negotiation period.

Option B — No Response / No Meeting:
You failed to confirm participation in the proposed negotiation process and/or failed to nominate an authorised senior executive within the required period. Accordingly, the pre-arbitration negotiation mechanism has been exhausted or deemed unsuccessful.

Option C — 30-Day Period Expired:
The 30-day pre-arbitration negotiation period under Clause 8.1 expired on [●], without settlement of the dispute.

Accordingly, the condition precedent to arbitration has been satisfied.

3. Nature of Dispute

The dispute concerns your breach of the service level warranty and uptime obligations under the Agreement.

In particular, our client states that:

you warranted and undertook to maintain service availability / uptime of [●]% during the applicable measurement period;
during the period [●] to [●], the service experienced outages, degradation, or unavailability exceeding the permitted downtime;
the actual uptime was approximately [●]%, resulting in breach of the agreed service level warranty;
our client notified you of the downtime / service failure on [●];
despite such notice, you failed to cure the breach, provide contractually required service credits, or compensate our client for losses suffered; and
our client has suffered losses, business disruption, customer impact, operational harm, and other damages presently estimated at INR [●], subject to further quantification.
4. Claims and Reliefs

Our client presently intends to claim, inter alia:

a. declaration that you breached the Agreement, including the service level warranty and uptime obligations;
b. damages for downtime, business interruption, lost revenue, customer claims, mitigation costs, and consequential losses to the extent recoverable;
c. service credits, refunds, rebates, or contractual compensation;
d. indemnity, if applicable;
e. interest, including pre-reference, pendente lite, and post-award interest;
f. costs of arbitration, legal costs, and other expenses; and
g. such further reliefs as the arbitral tribunal may deem fit.

Our client reserves the right to amend, supplement, or expand its claims upon filing the statement of claim.

5. Invocation of Arbitration

Accordingly, by this notice, our client hereby formally invokes arbitration under Clause [●] of the Agreement and Section 21 of the Arbitration and Conciliation Act, 1996.

For the purposes of Section 21, this notice constitutes our client's request that the disputes described above be referred to arbitration.

6. Appointment of Arbitrator

In accordance with Clause [●] of the Agreement, our client proposes the appointment of:

[Name of Proposed Arbitrator]
[Designation / Former Judge / Advocate / Arbitrator]
[Address / Email]`;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const withStatuses = (
  matter: MatterUploadPayload,
  overrides: NonNullable<MatterUploadPayload["intelligence_statuses"]>,
): MatterUploadPayload => ({
  ...matter,
  intelligence_statuses: {
    extraction: "ready",
    field_extraction: "ready",
    brief_generation: "ready",
    brief_verification: "not_started",
    next_step_planner: "not_started",
    draft_review: "not_started",
    debrief_generation: "not_started",
    debrief_verification: "not_started",
    law_generation: "not_started",
    law_verification: "not_started",
    inference_generation: "not_started",
    inference_verification: "not_started",
    ...overrides,
  },
});

export const isMockMatterId = (matterId: string | null | undefined) =>
  String(matterId || "").startsWith(MOCK_PREFIX);

export const loadMockModeEnabled = () => {
  try {
    return window.localStorage.getItem(MOCK_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const saveMockModeEnabled = (enabled: boolean) => {
  try {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
};

export const loadMockMatterResults = (): MatterProcessedResult[] => {
  try {
    const raw = window.localStorage.getItem(MOCK_MATTERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MatterProcessedResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveMockMatterResults = (results: MatterProcessedResult[]) => {
  try {
    window.localStorage.setItem(MOCK_MATTERS_STORAGE_KEY, JSON.stringify(results));
  } catch {
    // ignore
  }
};

export const upsertMockMatterResult = (result: MatterProcessedResult) => {
  const existing = loadMockMatterResults().filter(
    (item) => item?.matter?.id !== result?.matter?.id,
  );
  saveMockMatterResults([result, ...existing]);
};

export const deleteMockMatterResult = (matterId: string) => {
  saveMockMatterResults(
    loadMockMatterResults().filter((item) => item?.matter?.id !== matterId),
  );
};

export const getMockTemplatePayload = (
  matter: MatterRecord | null,
  templateKey: string,
) => {
  const cache = matter?.nextStepPlan?.template_cache || {};
  return cache[templateKey] || null;
};

export const createMockMatterScenario = ({
  query,
  fileNames,
}: {
  query: string;
  fileNames?: string[];
}): MockScenario => {
  const createdAt = new Date().toISOString();
  const seed = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const matterId = `${MOCK_PREFIX}${seed}`;
  const jobId = `mock_job_${seed}`;
  const normalizedFiles =
    fileNames?.length ? fileNames.filter(Boolean).slice(0, 5) : DEFAULT_DOCUMENTS;

  const docTexts = [
    `# Master Services Agreement\n\nMSA between Mehra Exports Pvt. Ltd. and CloudServ Technologies Pvt. Ltd. executed on 12 January 2024.\n\nClause 2.3 warrants 99.5% uptime measured quarterly.\n\nClause 2.4 requires a 30-minute Tier-1 response.\n\nClause 5.3 caps aggregate liability at Rs. 24,00,000.\n\nClause 5.4 disapplies the cap for gross negligence or wilful misconduct.\n\nClause 6.1 provides termination for cause.\n\nClause 6.2 provides convenience termination with notice and compensation.\n\nClause 8.1 requires 30-day senior executive negotiation.\n\nClause 8.2 mandates arbitration.\n\nClause 8.3 sets the seat at New Delhi.\n\nClause 8.4 allows Section 9 relief before Delhi High Court.`,
    `# Invoice and email chain\n\nCloudServ issued the M2 invoice on 14 June 2024.\n\nMehra Exports raised its first written objection on 24 June 2024.\n\nThe 16 August 2024 email records a notice of breach.\n\nThe 28 August 2024 termination notice cites Clause 6.1 and material breach.\n\nThe correspondence reflects a dispute on whether the 30-day negotiation precondition was formally invoked.`,
    `# Forensic outage memo\n\nThe 14-15 August 2024 outage lasted 40 hours 30 minutes.\n\nQuarterly uptime fell to 98.16%, well below the 99.5% warranty.\n\nThe incident alert triggered at 02:18 IST and the first CloudServ acknowledgement was at 06:42 IST.\n\nThe deployment was effectively single-AZ despite multi-AZ architecture commitments.\n\nThe Hyderabad redundancy environment was stale and non-functional.\n\nCustomer penalties total Rs. 64,87,500. Payroll late fees total Rs. 1,84,200. Emergency consulting totals Rs. 4,50,000. Forensic remediation totals Rs. 11,25,000.`,
    `# Legal notice\n\nThe legal notice sent by Sounak Senapati threatens criminal proceedings under IPC Sections 405, 406, and 420.\n\nIt also asserts that negotiation was exhausted through correspondence.\n\nThe notice demands payment and frames the deployment misrepresentation as a serious civil wrong.`,
    `# Reply notice\n\nCloudServ denies liability and asserts the deemed-acceptance argument under Clause 3.2.\n\nCloudServ argues the M2 dispute is time-barred, says M3 work was authorized, and claims the 28 August 2024 termination was effectively a convenience termination attracting compensation.\n\nThe reply notice claims a counter-claim of Rs. 55,58,997.`,
  ];

  const documents = normalizedFiles.map((fileName, index) =>
    makeDocumentEntry({
      matterId,
      jobId,
      fileName,
      index,
      text: docTexts[index] || docTexts[docTexts.length - 1],
    }),
  );

  const matterPreview = `${MOCK_ANSWER_KEY_MD}\n\n---\n\nUser query: ${query}`;
  const matterStructure = buildPageAwareStructure(matterId, matterPreview);
  const matterValidation = defaultValidation(hashSeed(matterId));

  const baseMatter: MatterUploadPayload = {
    id: matterId,
    job_id: jobId,
    title: "Mehra Exports v. CloudServ Technologies",
    fileName: `${normalizedFiles[0]} +${Math.max(0, normalizedFiles.length - 1)} documents`,
    mimeType: "text/markdown",
    document_type: "MATTER",
    status: "processed",
    uploaded_at: createdAt,
    uploadedAt: createdAt,
    page_count: matterStructure.pages.length,
    word_count: matterPreview.split(/\s+/).filter(Boolean).length,
    sha256: matterValidation.sha256,
    kind: "md",
    versionFingerprint: hashSeed(`version_${matterId}`),
    user_message: query,
    classification: {
      classification_id: "mock_01",
      classification_name: "Commercial Contract Dispute",
      track: "ARBITRATION",
      forums: ["Arbitration (A&C Act)", "Delhi High Court (Section 9)"],
      reason:
        "Mock mode loaded the Mehra Exports v. CloudServ benchmark answer key, which is an arbitration-led B2B services dispute with cross-claims.",
      confidence: "high",
    },
    classification_meta: {
      degraded: false,
      model: "mock-answer-key",
      error: null,
    },
    document_count: normalizedFiles.length,
    documents: normalizedFiles.map((file_name, index) => ({
      index,
      file_name,
      size_bytes: 2400 + index * 320,
    })),
  };

  const matterBaseResult: MatterProcessedResult = {
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
    }),
    documents,
    document_statuses: Object.fromEntries(
      documents.map((entry) => [
        entry.document.id,
        {
          file_name: entry.document.fileName,
          extraction_status: "ready",
          field_extraction_status: "ready",
          error: null,
        },
      ]),
    ),
    validation: matterValidation,
    preview_text: matterPreview,
    preview_text_source: "server",
    text_quality: defaultTextQuality,
    next_step: "BUILD_PAGE_AWARE_STRUCTURE",
    page_aware_structure: matterStructure,
    page_index: buildPageIndex(matterStructure.pages.length),
    extracted_fields: defaultExtractedFields,
    extracted_fields_status: "ready",
    extracted_fields_error: null,
    health: defaultHealth,
  };

  const brief = {
    decision: "generate_brief" as const,
    accumulated_brief:
      "Mehra Exports should treat this matter as an arbitration-led commercial contract dispute with immediate attention on the criminal-threat error, Clause 8.1 negotiation compliance, the M2 dispute timeline, liability-cap displacement, and termination-risk framing.",
    brief_points: [
      {
        id: "brief_1",
        heading: "Correct forum and regime",
        detail:
          "This is an arbitration-centric B2B services dispute governed primarily by contract law and the Arbitration and Conciliation Act, not a writ or ordinary civil recovery matter.",
        tone: "neutral",
        source_document: normalizedFiles[0],
        reason: "The benchmark answer key treats arbitration, New Delhi seat, and Section 9 relief as settled.",
      },
      {
        id: "brief_2",
        heading: "Immediate legal notice correction required",
        detail:
          "The legal notice's threat of criminal prosecution is a serious strategic and ethical weakness and should be withdrawn by corrigendum before formal proceedings continue.",
        tone: "warning",
        source_document: normalizedFiles[3],
        reason: "The answer key flags this as the first critical issue.",
      },
      {
        id: "brief_3",
        heading: "Negotiation precondition must be cleaned up",
        detail:
          "Clause 8.1 requires a formal 30-day senior-executive negotiation step before arbitration. The record is inconsistent on whether it was truly invoked.",
        tone: "warning",
        source_document: `${normalizedFiles[0]}, ${normalizedFiles[1]}`,
        reason: "The benchmark treats procedural compliance here as essential for clean arbitration commencement.",
      },
      {
        id: "brief_4",
        heading: "Multi-AZ misrepresentation is the strongest leverage point",
        detail:
          "The deployment architecture mismatch is the key issue because proving gross negligence or wilful misconduct can disapply the contractual liability cap.",
        tone: "positive",
        source_document: `${normalizedFiles[0]}, ${normalizedFiles[2]}`,
        reason: "Ground 3 in the answer key is the bridge to uncapped damages.",
      },
      {
        id: "brief_5",
        heading: "Termination and counter-claim exposure must be defended early",
        detail:
          "If material breach is not proven, Mehra's termination risks being treated as convenience termination, opening meaningful compensation exposure.",
        tone: "warning",
        source_document: `${normalizedFiles[1]}, ${normalizedFiles[4]}`,
        reason: "The answer key identifies termination validity as the biggest risk path.",
      },
    ],
    questions: [],
    covered_information: {
      forum: true,
      limitation: true,
      next_steps: true,
      counter_claim: true,
      liability_cap: true,
    },
    missing_information: [],
  };

  const acceptedBrief = {
    accepted_at: createdAt,
    accepted_by: "mock_user",
    brief,
  };

  const factCards: GroundCard[] = [
    {
      card_id: "ground_001",
      title: "Breach of Service Level Warranty (Uptime)",
      status: "ready",
      confidence_percent: 85,
      fact_text:
        "Clause 2.3 warranted 99.5% uptime. The 14-15 August 2024 outage lasted 40 hours 30 minutes and reduced quarterly availability to 98.16%, far outside the contractual threshold.",
      source_files: [normalizedFiles[0], normalizedFiles[2]],
      why_this_point:
        "The outage duration and the contractual warranty line up cleanly, making this a strong quantified breach ground.",
      backing_signal_ids: ["signal_uptime_1"],
      source_refs: [
        { document_id: `${matterId}_doc_1`, page: 1, fact: "Clause 2.3 warrants 99.5% uptime." },
        { document_id: `${matterId}_doc_3`, page: 1, fact: "Outage lasted 40 hours 30 minutes and dropped availability to 98.16%." },
      ],
    },
    {
      card_id: "ground_002",
      title: "Breach of Incident Response SLA",
      status: "ready",
      confidence_percent: 88,
      fact_text:
        "Clause 2.4 required a 30-minute Tier-1 response. The first acknowledgement came at 06:42 IST after a 02:18 IST alert, missing the SLA by more than four hours.",
      source_files: [normalizedFiles[0], normalizedFiles[2]],
      why_this_point:
        "The response SLA breach is timestamp-driven and difficult for the opposing side to reframe if the records are preserved correctly.",
      backing_signal_ids: ["signal_response_1"],
      source_refs: [
        { document_id: `${matterId}_doc_1`, page: 1, fact: "Clause 2.4 mandates a 30-minute Tier-1 response." },
        { document_id: `${matterId}_doc_3`, page: 1, fact: "Alert at 02:18 IST, first acknowledgement at 06:42 IST." },
      ],
    },
    {
      card_id: "ground_003",
      title: "Misrepresentation / Negligence on Deployment Architecture",
      status: "ready",
      confidence_percent: 82,
      fact_text:
        "The paid architecture deliverable represented multi-AZ deployment, but the actual environment was effectively single-AZ and the Hyderabad redundancy environment was stale and non-functional.",
      source_files: [normalizedFiles[0], normalizedFiles[2]],
      why_this_point:
        "This is the strongest route to displacing the liability cap because it supports gross-negligence or wilful-misconduct framing.",
      backing_signal_ids: ["signal_architecture_1"],
      source_refs: [
        { document_id: `${matterId}_doc_1`, page: 1, fact: "Clause 5.4 disapplies the cap for gross negligence or wilful misconduct." },
        { document_id: `${matterId}_doc_3`, page: 1, fact: "Actual deployment was single-AZ and Hyderabad redundancy was non-functional." },
      ],
    },
    {
      card_id: "ground_004",
      title: "Wrongful Termination Liability (Defensive)",
      status: "open",
      confidence_percent: 65,
      fact_text:
        "Mehra terminated on 28 August 2024 for cause. CloudServ says the clause 6.1 basis fails and that the termination should be treated as a convenience termination with notice and compensation consequences.",
      source_files: [normalizedFiles[0], normalizedFiles[1], normalizedFiles[4]],
      why_this_point:
        "Termination validity is the main risk path because if the breach grounds weaken, the counter-claim becomes materially stronger.",
      backing_signal_ids: ["signal_termination_1"],
      source_refs: [
        { document_id: `${matterId}_doc_2`, page: 1, fact: "Termination notice issued on 28 August 2024 citing clause 6.1." },
        { document_id: `${matterId}_doc_5`, page: 1, fact: "Reply notice asserts convenience-termination consequences and counter-claim." },
      ],
    },
    {
      card_id: "ground_005",
      title: "Recovery of Customer Penalty Losses",
      status: "ready",
      confidence_percent: 72,
      fact_text:
        "Mehra paid Rs. 64,87,500 in customer penalties from delayed shipments caused by the outage. Recovery depends on whether those losses are characterized as direct and whether the liability cap can be displaced.",
      source_files: [normalizedFiles[0], normalizedFiles[2]],
      why_this_point:
        "Damages recovery is viable, but full quantum depends on connecting the outage and architecture failures to uncapped liability.",
      backing_signal_ids: ["signal_damages_1"],
      source_refs: [
        { document_id: `${matterId}_doc_3`, page: 1, fact: "Customer penalties total Rs. 64,87,500." },
        { document_id: `${matterId}_doc_1`, page: 1, fact: "Clause 5.3 caps liability, while clause 5.4 removes the cap for gross negligence or wilful misconduct." },
      ],
    },
  ];

  const lawByCard: Record<
    string,
    {
      lawText: string;
      legalRules: LegalRule[];
      contrary: ContraryPoint[];
      gaps: string[];
      support: number;
    }
  > = {
    ground_001: {
      lawText:
        "Section 73 of the Indian Contract Act supports damages for losses naturally arising from breach, while Energy Watchdog limits any implied force majeure defence where the contract does not provide it.",
      legalRules: [
        { rule: "Section 73 allows damages for losses naturally arising from breach.", source_id: "law_001", authority_type: "statute", court: "India", relevance: "Damages basis" },
        { rule: "Force majeure is not implied where the parties did not contract for it.", source_id: "law_002", authority_type: "supreme_court", court: "Supreme Court of India", relevance: "Weakens outage defence" },
      ],
      contrary: [{ rule: "Opponent may challenge causation and technical attribution.", source_id: "law_003", relevance: "Evidence contest" }],
      gaps: ["Preserve the exact quarterly uptime computation and the underlying telemetry exports."],
      support: 0.86,
    },
    ground_002: {
      lawText:
        "Express SLA commitments are strictly enforced in commercial contracts, and technical incident timestamps can be used as documentary proof for the response-delay breach.",
      legalRules: [
        { rule: "Express performance commitments in commercial contracts are strictly construed.", source_id: "law_004", authority_type: "supreme_court", court: "Supreme Court of India", relevance: "Supports strict SLA enforcement" },
      ],
      contrary: [{ rule: "CloudServ may argue internal acknowledgement differs from customer-facing acknowledgement.", source_id: "law_005", relevance: "Interpretation dispute" }],
      gaps: ["Lock the incident-management export and metadata into the evidence bundle."],
      support: 0.88,
    },
    ground_003: {
      lawText:
        "Sections 17 and 18 of the Indian Contract Act support fraud and misrepresentation theories, while Avitel confirms strong civil remedies where commercial fraud or serious concealment is made out.",
      legalRules: [
        { rule: "Section 17 addresses fraud where falsity is known or recklessly advanced.", source_id: "law_006", authority_type: "statute", court: "India", relevance: "Fraud pathway" },
        { rule: "Section 18 addresses misrepresentation short of fraud.", source_id: "law_007", authority_type: "statute", court: "India", relevance: "Alternative civil pathway" },
        { rule: "Commercial fraud can justify strong civil remedies.", source_id: "law_008", authority_type: "supreme_court", court: "Supreme Court of India", relevance: "Remedy strength" },
      ],
      contrary: [{ rule: "Opponent will frame the issue as a disclosed technical deviation rather than concealed misconduct.", source_id: "law_009", relevance: "Cap-displacement fight" }],
      gaps: ["Obtain architecture deck, AWS snapshots, and billing records in one evidentiary chain."],
      support: 0.84,
    },
    ground_004: {
      lawText:
        "Indian contract law requires the terminating party to prove a valid contractual basis. If material breach is not sustained, the convenience-termination clause becomes a live risk path.",
      legalRules: [
        { rule: "Contractual termination procedures are enforced strictly.", source_id: "law_010", authority_type: "supreme_court", court: "Supreme Court of India", relevance: "Termination-risk analysis" },
      ],
      contrary: [{ rule: "If one material breach is proved, the for-cause termination remains defensible.", source_id: "law_011", relevance: "Client defence" }],
      gaps: ["Tie each relied-on breach to clause 6.1 with fact-specific pleading."],
      support: 0.68,
    },
    ground_005: {
      lawText:
        "Hadley v. Baxendale and Indian remoteness cases support recovery where the loss was within the reasonable contemplation of the parties, but the contractual liability cap remains a major obstacle unless clause 5.4 is triggered.",
      legalRules: [
        { rule: "Losses arising naturally or reasonably contemplated at contracting can be recovered.", source_id: "law_012", authority_type: "precedent", court: "Common law / India", relevance: "Remoteness and recoverability" },
      ],
      contrary: [{ rule: "Opponent will characterize customer penalties as consequential and capped.", source_id: "law_013", relevance: "Damages defence" }],
      gaps: ["Map each penalty deduction note to the outage timeline and customer shipment disruption."],
      support: 0.74,
    },
  };

  const topSteps: NextStepItem[] = [
    {
      step_id: "step_001",
      title: "Draft Clause 8.1 negotiation invocation notice",
      description:
        "Prepare a senior-executive negotiation notice formally invoking the 30-day pre-arbitration process under Clause 8.1 and proposing a meeting window.",
      action_type: "draft_notice",
      priority: "high",
      status: "ready",
      reason:
        "The record is inconsistent on whether the negotiation precondition was formally invoked, so the safest next procedural step is to cure that now.",
      required_before_drafting: true,
      draft_type: "pre_arbitration_negotiation_notice",
      template_key: "clause_8_1_negotiation_notice_v1",
      required_inputs: [
        "Authorized signatory for Mehra Exports",
        "Preferred negotiation dates",
        "Recipient details for CloudServ leadership",
      ],
    },
    {
      step_id: "step_002",
      title: "Draft corrigendum withdrawing criminal threats",
      description:
        "Prepare a formal corrigendum to the 12 September legal notice withdrawing the IPC 405/406/420 threat language while preserving the civil and arbitral claims.",
      action_type: "draft_notice",
      priority: "high",
      status: "ready",
      reason:
        "The benchmark answer key treats the criminal-threat language as the first issue to fix because it gives the opponent avoidable credibility attacks.",
      required_before_drafting: true,
      draft_type: "corrigendum_notice",
      template_key: "corrigendum_notice_v1",
      required_inputs: [
        "Client authority to withdraw the criminal-threat language",
        "Original legal notice date and reference block",
      ],
    },
    {
      step_id: "step_003",
      title: "Draft Section 21 notice of arbitration",
      description:
        "Prepare the formal notice commencing arbitration under Section 21 of the Arbitration and Conciliation Act after the negotiation step is recorded.",
      action_type: "draft_notice",
      priority: "high",
      status: "ready",
      reason:
        "Arbitration is the primary forum and the benchmark expects a clean Section 21 notice as the immediate proceedings step after precondition compliance.",
      required_before_drafting: false,
      draft_type: "section_21_notice_of_arbitration",
      template_key: "section_21_notice_v1",
      required_inputs: [
        "Arbitration clause extract",
        "Claim amount and relief heads",
        "Proposed arbitrator preference",
      ],
    },
  ];

  const cardsWithLaw = factCards.map((card) => {
    const law = lawByCard[card.card_id];
    return {
      ...card,
      law_text: law.lawText,
      legal_rules: law.legalRules,
      contrary_or_limiting_points: law.contrary,
      research_gaps: law.gaps,
      law_sources: law.legalRules.map((rule, index) => ({
        source_id: String(rule.source_id),
        title: `Authority ${index + 1} for ${card.title}`,
        url: "https://courtbook.in/draft/english",
        court: String(rule.court),
        source_type: String(rule.authority_type),
        date: "2024-01-01",
      })),
      law_verification_status: "passed_with_caution",
      law_verification_issues: [
        {
          type: "scope_note",
          severity: "medium",
          message: "Preserve and exhibit the underlying technical evidence carefully.",
        },
      ],
      law_meta: {
        query_model: "mock-answer-key",
        extractor_model: "mock-answer-key",
        verifier_model: "mock-answer-key",
        degraded: false,
        error: null,
        retrieval_errors: [],
      },
      support_score: law.support,
    };
  });

  const cardsWithInference = cardsWithLaw.map((card) => ({
    ...card,
    inference_text:
      card.card_id === "ground_003"
        ? "From Mehra Exports' perspective, the architecture misrepresentation is the strongest leverage point because proving concealed deviation or gross negligence can unlock uncapped damages and improve settlement posture across the entire dispute."
        : card.card_id === "ground_004"
          ? "Termination risk remains the main defensive exposure. If the tribunal weakens the for-cause case, CloudServ's convenience-termination and compensation framing becomes materially more dangerous."
          : "The contractual record and benchmark law support a claimant-side pleading that is specific, commercially grounded, and procedurally suitable for arbitration rather than a diffuse civil recovery strategy.",
    inference_card: {
      ground_id: card.card_id,
      card_type: "inference",
      inference_type:
        card.card_id === "ground_004" ? "procedural_risk" : "evidentiary_vulnerability",
      text:
        card.card_id === "ground_003"
          ? "Architecture misrepresentation is the cap-displacement path."
          : card.card_id === "ground_004"
            ? "Termination validity is the main counter-claim risk."
            : "The benchmark supports a claimant-side arbitration framing.",
      basis: {
        fact_used: [card.fact_text],
        law_used: [card.law_text],
      },
      limits: ["Final strength depends on preserving technical and correspondence evidence cleanly."],
      recommended_actions: topSteps.map((step) => ({
        action_type: step.action_type,
        title: step.title,
      })),
      confidence: "high",
      display_status: card.status === "open" ? "review" : "ready",
    },
    inference_verification: {
      passed: true,
      issues: [],
      downgrade_required: card.status === "open",
      recommended_status: card.status === "open" ? "review" : "ready",
      confidence_adjustment: card.status === "open" ? -1 : 0,
    },
    inference_guardrails: {
      passed: true,
      issues: [],
      downgrade_required: false,
      recommended_status: card.status === "open" ? "review" : "ready",
    },
    inference_meta: {
      generator_model: "mock-answer-key",
      verifier_model: "mock-answer-key",
      degraded: false,
      error: null,
    },
  }));

  const cardsWithNextSteps = cardsWithInference.map((card) => {
    const recommended =
      card.card_id === "ground_003"
        ? [topSteps[0], topSteps[2]]
        : card.card_id === "ground_004"
          ? [topSteps[1], topSteps[2]]
          : card.card_id === "ground_001"
            ? [topSteps[2]]
            : [];

    return {
      ...card,
      next_steps_status: recommended.length ? "ready" : "not_started",
      next_steps: recommended.length
        ? {
            recommended_next_steps: recommended,
            primary_drafting_action: {
              label: recommended[0].title,
              draft_type: recommended[0].draft_type,
              template_key: recommended[0].template_key,
              cta: "Open draft",
            },
          }
        : null,
      next_steps_meta: recommended.length
        ? {
            model: "mock-answer-key",
            provider: "local",
            degraded: false,
            error: null,
          }
        : null,
    };
  });

  const templateCache = {
    corrigendum_notice_v1: {
      template_key: "corrigendum_notice_v1",
      title: "Corrigendum to legal notice",
      source_url: "https://courtbook.in/draft/english",
      content_html: htmlFromPlainText(corrigendumTemplateText),
      content_text: corrigendumTemplateText,
      fetched_at: createdAt,
      draft_type: "corrigendum_notice",
      search_query: "corrigendum to legal notice withdrawing criminal allegations",
    },
    clause_8_1_negotiation_notice_v1: {
      template_key: "clause_8_1_negotiation_notice_v1",
      title: "Clause 8.1 negotiation invocation notice",
      source_url: "https://courtbook.in/draft/english",
      content_html: htmlFromPlainText(negotiationTemplateText),
      content_text: negotiationTemplateText,
      fetched_at: createdAt,
      draft_type: "pre_arbitration_negotiation_notice",
      search_query: "pre arbitration negotiation invocation notice",
    },
    section_21_notice_v1: {
      template_key: "section_21_notice_v1",
      title: "Section 21 notice of arbitration",
      source_url: "https://courtbook.in/draft/english",
      content_html: htmlFromPlainText(arbitrationTemplateText),
      content_text: arbitrationTemplateText,
      fetched_at: createdAt,
      draft_type: "section_21_notice_of_arbitration",
      search_query: "section 21 notice of arbitration india template",
    },
  };

  const initialResult: MatterProcessedResult = {
    ...matterBaseResult,
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
      debrief_generation: "not_started",
      debrief_verification: "not_started",
      law_generation: "not_started",
      law_verification: "not_started",
      inference_generation: "not_started",
      inference_verification: "not_started",
      next_step_planner: "not_started",
    }),
    accumulated_brief: brief,
    accumulated_brief_meta: {
      degraded: false,
      model: "mock-answer-key",
      provider: "local",
      error: null,
    },
  };

  const acceptedResult: MatterProcessedResult = {
    ...clone(initialResult),
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
      debrief_generation: "processing",
      debrief_verification: "processing",
      law_generation: "not_started",
      law_verification: "not_started",
      inference_generation: "not_started",
      inference_verification: "not_started",
      next_step_planner: "not_started",
    }),
    accepted_brief: acceptedBrief,
    accepted_brief_version_fingerprint: baseMatter.versionFingerprint,
  };

  const factStageResult: MatterProcessedResult = {
    ...clone(acceptedResult),
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
      debrief_generation: "ready",
      debrief_verification: "ready",
      law_generation: "processing",
      law_verification: "processing",
      inference_generation: "not_started",
      inference_verification: "not_started",
      next_step_planner: "not_started",
    }),
    ground_analysis: {
      version: 1,
      no_signals_found: false,
      cards: factCards,
      meta: {
        degraded: false,
        provider: "local",
        orchestrator_model: "mock-answer-key",
        verifier_model: "mock-answer-key",
        law_generation_model: null,
        law_verifier_model: null,
        inference_generation_model: null,
        inference_verifier_model: null,
        next_step_generation_model: null,
        error: null,
      },
    },
  };

  const lawStageResult: MatterProcessedResult = {
    ...clone(factStageResult),
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
      debrief_generation: "ready",
      debrief_verification: "ready",
      law_generation: "ready",
      law_verification: "ready",
      inference_generation: "processing",
      inference_verification: "processing",
      next_step_planner: "not_started",
    }),
    law_research_payloads: cardsWithLaw.map((card) => ({
      card_id: card.card_id,
      title: card.title,
      law_text: card.law_text,
      legal_rules: card.legal_rules,
      contrary_or_limiting_points: card.contrary_or_limiting_points,
      research_gaps: card.research_gaps,
      support_score: card.support_score,
    })),
    law_research_meta: cardsWithLaw.map((card) => card.law_meta),
    ground_analysis: {
      ...clone(factStageResult.ground_analysis),
      cards: cardsWithLaw,
      meta: {
        ...factStageResult.ground_analysis?.meta,
        law_generation_model: "mock-answer-key",
        law_verifier_model: "mock-answer-key",
      },
    },
  };

  const inferenceStageResult: MatterProcessedResult = {
    ...clone(lawStageResult),
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
      debrief_generation: "ready",
      debrief_verification: "ready",
      law_generation: "ready",
      law_verification: "ready",
      inference_generation: "ready",
      inference_verification: "ready",
      next_step_planner: "processing",
    }),
    inference_payloads: cardsWithInference.map((card) => ({
      card_id: card.card_id,
      title: card.title,
      inference_text: card.inference_text,
      inference_card: card.inference_card,
      inference_verification: card.inference_verification,
      inference_guardrails: card.inference_guardrails,
    })),
    inference_meta: cardsWithInference.map((card) => card.inference_meta),
    ground_analysis: {
      ...clone(lawStageResult.ground_analysis),
      cards: cardsWithInference,
      meta: {
        ...lawStageResult.ground_analysis?.meta,
        inference_generation_model: "mock-answer-key",
        inference_verifier_model: "mock-answer-key",
      },
    },
  };

  const finalResult: MatterProcessedResult = {
    ...clone(inferenceStageResult),
    matter: withStatuses(baseMatter, {
      brief_generation: "ready",
      debrief_generation: "ready",
      debrief_verification: "ready",
      law_generation: "ready",
      law_verification: "ready",
      inference_generation: "ready",
      inference_verification: "ready",
      next_step_planner: "ready",
    }),
    next_step_plan: {
      version: 1,
      items: cardsWithNextSteps
        .filter((card) => Array.isArray(card.next_steps?.recommended_next_steps) && card.next_steps.recommended_next_steps.length)
        .map((card) => ({
          ground_id: card.card_id,
          title: card.title,
          status: "ready",
          recommended_next_steps: card.next_steps?.recommended_next_steps,
          primary_drafting_action: card.next_steps?.primary_drafting_action,
          meta: card.next_steps_meta,
        })),
      template_cache: templateCache,
      meta: {
        degraded: false,
        provider: "local",
        model: "mock-answer-key",
        error: null,
      },
    },
    ground_analysis: {
      ...clone(inferenceStageResult.ground_analysis),
      cards: cardsWithNextSteps,
      meta: {
        ...inferenceStageResult.ground_analysis?.meta,
        next_step_generation_model: "mock-answer-key",
      },
    },
  };

  return {
    initialResult,
    acceptedResult,
    stageResults: [
      { delayMs: 1200, result: factStageResult },
      { delayMs: 3200, result: lawStageResult },
      { delayMs: 5600, result: inferenceStageResult },
      { delayMs: 7600, result: finalResult },
    ],
  };
};
