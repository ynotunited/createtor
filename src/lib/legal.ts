import { SUPPORT_EMAIL } from "@/lib/site-nav";

/**
 * Single source of truth for the legal documents. The route for each document
 * reads its content from here, so copy lives in one place and the footer, the
 * legal hub and every policy page stay in sync.
 *
 * Company identity, governing law and contact addresses are deliberately
 * centralised: replace these constants (and the entity wording in the
 * documents) with your registered details before going live. Written for a
 * United States audience. Do not treat this as legal advice.
 */
export const LEGAL_ENTITY = "Createtor";
export const GOVERNING_LAW = "the State of Delaware, United States";
export const LEGAL_UPDATED = "October 19, 2026";

/**
 * Registered postal address. Required on marketing emails (CAN-SPAM) and shown
 * on the legal/contact pages. Replace the bracketed placeholders with your
 * registered business address before launch.
 */
export const LEGAL_ADDRESS =
  "Createtor, [registered street address], [city, state ZIP], United States";

export const PRIVACY_EMAIL = "privacy@createtor.xyz";
export const LEGAL_EMAIL = "legal@createtor.xyz";
export const COMPLIANCE_EMAIL = "compliance@createtor.xyz";
export const SECURITY_EMAIL = "security@createtor.xyz";
export { SUPPORT_EMAIL };

/**
 * DMCA designated agent. Register these details with the U.S. Copyright Office
 * at https://dmca.copyright.gov/ and keep this object in sync. An unregistered
 * agent can lose the § 512 safe-harbor protection; registration must be renewed
 * every three years.
 */
export const DMCA_AGENT = {
  name: "[Designated Copyright Agent]",
  email: LEGAL_EMAIL,
  phone: "[designated agent phone]",
  address: LEGAL_ADDRESS,
};

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  /** Route id, e.g. "/privacy". */
  to: string;
  /** Stable key used by the route file and the hub. */
  slug: string;
  /** Document title, e.g. "Privacy Policy". */
  title: string;
  /** Short label for footers and pills. */
  short: string;
  /** One-line summary used for meta description and the intro paragraph. */
  summary: string;
  updated: string;
  sections: LegalSection[];
  contact?: { label: string; email: string }[];
};

const CONTACT_STANDARD: { label: string; email: string }[] = [
  { label: "General support", email: SUPPORT_EMAIL },
  { label: "Privacy", email: PRIVACY_EMAIL },
  { label: "Legal", email: LEGAL_EMAIL },
];

export const LEGAL_DOCS: LegalDoc[] = [
  {
    to: "/privacy",
    slug: "privacy",
    title: "Privacy Policy",
    short: "Privacy",
    summary: "What personal data Createtor collects, why we collect it, and the controls you have.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "overview",
        heading: "Overview",
        paragraphs: [
          `${LEGAL_ENTITY} ("Createtor", "we", "us") provides a web application that helps creators research, script, narrate, render and schedule video content. This policy explains how we handle personal data when you use the service.`,
          "By creating an account or using the service you agree to this policy. If you do not agree, please do not use the service.",
        ],
      },
      {
        id: "data-we-collect",
        heading: "Information we collect",
        bullets: [
          "Account data: your email address, display name, and authentication identifiers.",
          "Workspace and channel data: the niche brief, brand settings, channels, scripts, scenes, characters, voice choices and other content you create or upload.",
          "Generated content: prompts, scripts, storyboards, narration, images and rendered video you produce with the service.",
          "Usage and billing data: credit balances and transactions, plan, subscription status, and payment references returned by our payment processors.",
          "Technical data: IP address, device and browser information, and security and audit logs used to protect the service.",
        ],
        paragraphs: [
          "We do not receive or store your full card number. Card payments are processed by Stripe and subscription payments by PayPal; they return only a tokenised customer reference and status to us.",
        ],
      },
      {
        id: "how-we-use",
        heading: "How we use information",
        bullets: [
          "To provide, operate and maintain the service and your workspace.",
          "To generate content you request, including by sending prompts and inputs to AI model providers.",
          "To manage plans, credits, subscriptions and renewals and to prevent fraud.",
          "To secure the service, enforce our Terms and Acceptable Use Policy, and investigate abuse.",
          "To respond to support requests and send essential service or account notices.",
          "To comply with legal, tax and accounting obligations.",
        ],
      },
      {
        id: "ai-processing",
        heading: "AI processing",
        paragraphs: [
          "To produce scripts, narration, images and other outputs, the prompts and inputs you provide (and, where relevant, your uploaded assets) are transmitted to third-party AI model providers that we use through a unified gateway.",
          "Those providers process your inputs to return a result under their own terms. We configure our integrations to minimise retention and we do not use your content to train our own models.",
        ],
      },
      {
        id: "sharing",
        heading: "How we share information",
        paragraphs: [
          "We do not sell your personal data. We share it only with service providers (subprocessors) that help us run the service, and only as needed for the purposes above.",
        ],
        bullets: [
          "Hosting, database and authentication (Supabase).",
          "AI model and voice providers used to generate content.",
          "Payment processors (Stripe, PayPal) for checkout and subscription billing.",
          "Infrastructure, email delivery and error-monitoring providers.",
          "Professional advisers or authorities where required by law or to protect rights and safety.",
        ],
      },
      {
        id: "cookies",
        heading: "Cookies and local storage",
        paragraphs: [
          "We use a small number of strictly necessary cookies and local storage entries to keep you signed in and to protect your session. We do not use advertising or cross-site tracking cookies. See our Cookie Policy for details.",
        ],
      },
      {
        id: "retention",
        heading: "How long we keep data",
        paragraphs: [
          "We keep account and workspace data for as long as your account is active. If you delete your account we remove or de-identify personal data within a reasonable period, except where we must retain records to meet legal, tax or accounting obligations.",
          "Financial records (including our append-only payment ledger) and security logs are retained for the period required by law and for fraud prevention, even after account deletion.",
        ],
      },
      {
        id: "security",
        heading: "How we protect data",
        paragraphs: [
          "Data is encrypted in transit. Access to production data is restricted to the service role and enforced with database row-level security, least-privilege access, server-side authorisation on every operation, and audit logging.",
          "No system is perfectly secure. If we become aware of a breach affecting your data we will notify you and any relevant authority as required by law.",
        ],
      },
      {
        id: "your-rights",
        heading: "Your rights",
        paragraphs: [
          "Under United States privacy law, including the California Consumer Privacy Act as amended by the CPRA and similar state laws, you may have the right to know what personal data we collect and how we use it, to access and receive a copy of it, to correct it, to delete it, to opt out of the sale or sharing of personal data, and to not be discriminated against for exercising these rights. We do not sell your personal data.",
          "If you are in the EEA or the UK, you also have rights of restriction, objection, portability and withdrawal of consent. You can exercise most rights from your workspace settings or by contacting us.",
        ],
      },
      {
        id: "children",
        heading: "Children",
        paragraphs: [
          "The service is not intended for anyone under 18, and we do not knowingly collect personal data from children. This is stricter than the United States Children's Online Privacy Protection Act (COPPA), which applies to children under 13. If you believe a child has provided us data, contact us and we will delete it.",
        ],
        bullets: [
          "Creating an account requires an affirmative confirmation that you are at least 18 years old.",
          "We do not knowingly collect personal information from children under 13, and if we learn we have, we delete it and close the account.",
          "If you are a parent or guardian and believe your child has provided us data, contact us and we will remove it.",
        ],
      },
      {
        id: "analytics",
        heading: "Analytics and session replay",
        paragraphs: [
          "We use first-party product analytics to understand how the service is used. We do not run session-replay, heatmap or advertising trackers, and our analytics never record the values you type into forms.",
        ],
        bullets: [
          "Session replay is disabled by default and no replay SDK is loaded.",
          "Analytics events contain only an event name, route and coarse non-identifying properties; input values and sensitive fields are filtered out before storage.",
          "We do not sell personal data or use it for cross-site advertising.",
        ],
      },
      {
        id: "transfers",
        heading: "Data location and transfers",
        paragraphs: [
          "We are based in the United States and process and store personal data primarily in the United States, where our hosting and infrastructure providers operate. Where we or our subprocessors transfer data internationally, we rely on appropriate safeguards, such as standard contractual clauses.",
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        paragraphs: [
          "We may update this policy from time to time. Material changes will be announced in the app or by email, and the \u201clast updated\u201d date above will change.",
        ],
      },
    ],
    contact: CONTACT_STANDARD,
  },
  {
    to: "/terms",
    slug: "terms",
    title: "Terms of Use",
    short: "Terms",
    summary:
      "The agreement that governs your use of Createtor, your content ownership, and our responsibilities.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "agreement",
        heading: "Agreement to these terms",
        paragraphs: [
          `These Terms of Use ("Terms") form a binding agreement between you and ${LEGAL_ENTITY} governing your access to and use of the Createtor service, website and applications.`,
          "By creating an account or using the service you accept these Terms. If you use the service on behalf of an organisation, you confirm you are authorised to bind that organisation.",
        ],
      },
      {
        id: "eligibility",
        heading: "Eligibility and accounts",
        paragraphs: [
          "You must be at least 18 years old and able to form a binding contract. You are responsible for the accuracy of your account information and for keeping your credentials secure. You are responsible for all activity under your account.",
        ],
      },
      {
        id: "service",
        heading: "The service, plans and credits",
        paragraphs: [
          "The service consumes credits for generations and processing. Credit costs are shown before an action runs. Credits are non-transferable and have no cash value except where required by law.",
          "We may add, change or remove features over time. We aim to describe capabilities honestly, including limitations such as music that must be uploaded because no music-generation model is available.",
        ],
      },
      {
        id: "billing",
        heading: "Subscriptions, billing and renewals",
        paragraphs: [
          "Paid plans are billed through Stripe or PayPal on a monthly or yearly cycle and renew automatically until cancelled. You can cancel at any time from the billing page; access continues until the end of the paid period.",
          "Prices, taxes and credit allotments are shown at checkout. Refunds are governed by our Refund and Billing Policy and any statutory rights you may have.",
        ],
      },
      {
        id: "your-content",
        heading: "Your content and ownership",
        paragraphs: [
          "You retain ownership of the content you create or upload, and of the videos, scripts and assets you generate with the service, subject to the rights of third-party model and asset providers and any applicable platform rules.",
          "You grant us a limited licence to host, process, transmit and display your content solely to operate, secure and improve the service for you. We do not sell your content.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        paragraphs: [
          "Your use of the service must comply with our Acceptable Use Policy. You must not use the service to create or distribute unlawful, infringing, deceptive or harmful content, or to violate the rules of the platforms you publish to.",
        ],
      },
      {
        id: "third-party",
        heading: "Third-party services and platforms",
        paragraphs: [
          "The service integrates with third-party providers, including AI model providers, payment processors and social or video platforms. Your use of those services is subject to their terms. You are responsible for complying with the terms and community guidelines of any platform you publish to, including rules on synthetic or AI-assisted media.",
        ],
      },
      {
        id: "ai-disclaimer",
        heading: "AI output disclaimer",
        paragraphs: [
          "AI-generated output can be inaccurate, incomplete or unexpectedly similar to existing material. You are responsible for reviewing and editing all output before publishing and for ensuring it is accurate, lawful and free of third-party rights violations.",
        ],
      },
      {
        id: "ip",
        heading: "Our intellectual property",
        paragraphs: [
          "The service, including its software, design, branding and underlying technology, is owned by us and our licensors and is protected by intellectual property laws. These Terms grant you no rights to our trademarks or software except the right to use the service as permitted here.",
        ],
      },
      {
        id: "disclaimers",
        heading: "Disclaimers and limitation of liability",
        paragraphs: [
          "The service is provided \u201cas is\u201d and \u201cas available\u201d without warranties of any kind to the maximum extent permitted by law. We do not warrant uninterrupted or error-free operation or any particular result, audience or revenue.",
          "To the maximum extent permitted by law, we are not liable for indirect, incidental, special or consequential damages, and our total liability arising from the service is limited to the amount you paid us in the twelve months before the claim.",
        ],
      },
      {
        id: "termination",
        heading: "Suspension and termination",
        paragraphs: [
          "We may suspend or terminate your access if you breach these Terms or the Acceptable Use Policy, if required by law, or to protect the service or other users. You may stop using the service and delete your account at any time.",
        ],
      },
      {
        id: "law",
        heading: "Governing law and disputes",
        paragraphs: [
          `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to conflict-of-law rules. The state and federal courts located there have exclusive jurisdiction over any dispute, subject to any mandatory protections that apply where you live.`,
        ],
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        paragraphs: [
          "We may update these Terms. If we make material changes we will provide notice in the app or by email. Continuing to use the service after changes take effect means you accept the updated Terms.",
        ],
      },
    ],
    contact: CONTACT_STANDARD,
  },
  {
    to: "/compliance",
    slug: "compliance",
    title: "Data & Compliance",
    short: "Data & Compliance",
    summary: "How Createtor handles data protection, security and regulatory compliance.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "approach",
        heading: "Our approach",
        paragraphs: [
          "We build privacy and security into the service rather than bolting them on. This page summarises how we handle data protection, security and compliance. It complements, and does not replace, our Privacy Policy.",
        ],
      },
      {
        id: "roles",
        heading: "Data we process and our role",
        paragraphs: [
          "For your account and workspace data, we generally act as a controller. For content and personal data you upload or ask us to process on behalf of your organisation, we act as a processor and you are the controller.",
          "We process data on documented instructions and only for the purposes described in our Privacy Policy and any data processing agreement we sign with you.",
        ],
      },
      {
        id: "lawful-basis",
        heading: "Legal bases and US privacy law",
        paragraphs: [
          "We process personal data in line with the laws that apply where you live. In the United States we follow applicable federal and state privacy laws, including the California Consumer Privacy Act as amended by the CPRA and comparable state statutes.",
          "Where the GDPR or UK GDPR applies (for example, if you are in the EEA or the UK), we rely on performance of our contract with you, our legitimate interests in operating and securing the service, your consent where required, and compliance with legal obligations.",
        ],
      },
      {
        id: "security-controls",
        heading: "Security controls",
        bullets: [
          "Encryption in transit for all traffic; secrets held server-side and never shipped to the browser.",
          "Database row-level security plus server-side authorisation on every operation.",
          "Least-privilege service roles; billing, credits and ledger writes are service-role only.",
          "Append-only financial ledger with database-enforced immutability for auditability.",
          "Authentication hardening, abuse and rate limiting, and security event logging.",
          "Distributed rate limiting and input validation to resist abuse and injection.",
        ],
      },
      {
        id: "subprocessors",
        heading: "Subprocessors",
        paragraphs: [
          "We use reputable subprocessors for hosting and authentication, AI generation, payments and infrastructure. We keep this list current and make it available on request. A data processing agreement is available for business customers.",
        ],
      },
      {
        id: "dsr",
        heading: "Privacy requests",
        paragraphs: [
          `You can submit access, correction, deletion, restriction, objection and portability requests directly, and business customers can reach us at ${COMPLIANCE_EMAIL}. We verify requests as required by applicable US state privacy laws and respond within the timeframes those laws require.`,
        ],
      },
      {
        id: "breach",
        heading: "Breach notification",
        paragraphs: [
          "We maintain procedures to detect, assess and respond to personal data breaches and will notify affected individuals, customers and regulators as required by applicable law, including US state breach-notification statutes, without undue delay.",
        ],
      },
      {
        id: "retention-records",
        heading: "Records and retention",
        paragraphs: [
          "We keep records of processing and financial history as required. Our payment ledger is append-only, so financial events cannot be silently altered. Retention periods are described in our Privacy Policy.",
        ],
      },
      {
        id: "standards",
        heading: "Standards and commitments",
        paragraphs: [
          "We design our practices to align with widely accepted frameworks, including the principles of US state privacy laws such as the CCPA/CPRA and, where relevant, the GDPR. We describe our practices accurately and do not claim certifications we have not obtained. Where you need a specific certification or contractual clause, contact us.",
        ],
      },
    ],
    contact: [
      { label: "Compliance", email: COMPLIANCE_EMAIL },
      { label: "Security", email: SECURITY_EMAIL },
      { label: "Privacy", email: PRIVACY_EMAIL },
    ],
  },
  {
    to: "/copyright",
    slug: "copyright",
    title: "Intellectual Property & Copyright",
    short: "IP & Copyright",
    summary: "How Createtor respects intellectual property and how to report infringement.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "respect",
        heading: "Respect for intellectual property",
        paragraphs: [
          `${LEGAL_ENTITY} respects the intellectual property rights of others and expects users of the service to do the same. We respond to clear notices of alleged copyright and other intellectual property infringement, including notices made under the Digital Millennium Copyright Act (DMCA).`,
        ],
      },
      {
        id: "designated-agent",
        heading: "Designated copyright agent",
        paragraphs: [
          `${LEGAL_ENTITY} has designated an agent to receive notifications of claimed infringement, as required by the DMCA, and has registered that agent with the United States Copyright Office. Notices may be sent to:`,
        ],
        bullets: [
          `Agent: ${DMCA_AGENT.name}`,
          `Email: ${DMCA_AGENT.email}`,
          `Phone: ${DMCA_AGENT.phone}`,
          `Mail: ${DMCA_AGENT.address}`,
        ],
      },
      {
        id: "your-content",
        heading: "You own your content",
        paragraphs: [
          "You retain ownership of the content you upload and, subject to third-party provider terms and platform rules, of the videos, scripts and assets you generate. You are responsible for ensuring you have the rights to any material you upload or reference.",
        ],
      },
      {
        id: "copyright-notice",
        heading: "Reporting copyright infringement (DMCA notice)",
        paragraphs: [
          `If you believe content on or produced through the service infringes your copyright, send a written DMCA notice to our designated agent, ${DMCA_AGENT.name}, by email at ${DMCA_AGENT.email} or by post to ${DMCA_AGENT.address} (tel ${DMCA_AGENT.phone}). To be effective, your notice should include:`,
        ],
        bullets: [
          "Your physical or electronic signature.",
          "Identification of the copyrighted work you claim has been infringed.",
          "Identification and location of the allegedly infringing material, with enough detail for us to find it.",
          "Your name, address, telephone number and email address.",
          "A statement that you have a good-faith belief the use is not authorised by the owner, its agent or the law.",
          "A statement, under penalty of perjury, that the information is accurate and that you are the owner or authorised to act on the owner's behalf.",
        ],
      },
      {
        id: "counter-notice",
        heading: "Counter-notification",
        paragraphs: [
          "If your content was removed and you believe it was removed in error or misidentified, you may send a DMCA counter-notification to our designated agent at the address above. If we receive a valid counter-notice we may restore the content unless the original complainant takes legal action.",
        ],
      },
      {
        id: "repeat-infringers",
        heading: "Repeat infringers",
        paragraphs: [
          "We may suspend or terminate the accounts of users who repeatedly infringe intellectual property rights, and we may remove or disable access to allegedly infringing content, consistent with the DMCA and our repeat-infringer policy.",
        ],
      },
      {
        id: "other-ip",
        heading: "Trademark and other IP complaints",
        paragraphs: [
          `For trademark or other intellectual property concerns, contact ${LEGAL_EMAIL} with the same level of detail described above, identifying the right relied on and the material concerned.`,
        ],
      },
    ],
    contact: [
      { label: "Legal / IP notices", email: LEGAL_EMAIL },
      { label: "General support", email: SUPPORT_EMAIL },
    ],
  },
  {
    to: "/cookies",
    slug: "cookies",
    title: "Cookie Policy",
    short: "Cookies",
    summary: "The cookies and local storage Createtor uses, and how to control them.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "what",
        heading: "What are cookies and local storage",
        paragraphs: [
          "Cookies are small files stored on your device. Local storage is a similar browser store. We use both, sparingly, to keep you signed in and to make the service work securely.",
        ],
      },
      {
        id: "we-use",
        heading: "What we use",
        bullets: [
          "Strictly necessary: authentication and session cookies set by our authentication provider to keep you signed in and protect your session.",
          "Preferences: local storage entries that remember interface and workspace settings on your device.",
          "Security: short-lived data used to complete security checks and to prevent abuse.",
        ],
        paragraphs: [
          "We do not use advertising cookies or third-party cross-site tracking cookies.",
        ],
      },
      {
        id: "third-parties",
        heading: "Third-party cookies",
        paragraphs: [
          "Some strictly necessary cookies are set by our authentication and hosting providers as part of delivering the service. Payment pages hosted by Stripe or PayPal set their own cookies under their policies when you are redirected there.",
        ],
      },
      {
        id: "managing",
        heading: "Managing cookies",
        paragraphs: [
          "You can block or delete cookies in your browser settings. If you block strictly necessary cookies, parts of the service, such as staying signed in, may stop working.",
        ],
      },
      {
        id: "changes",
        heading: "Changes and contact",
        paragraphs: [
          "We may update this policy as the service evolves. Questions can be sent to our privacy team.",
        ],
      },
    ],
    contact: [
      { label: "Privacy", email: PRIVACY_EMAIL },
      { label: "General support", email: SUPPORT_EMAIL },
    ],
  },
  {
    to: "/acceptable-use",
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    short: "Acceptable Use",
    summary: "The rules for what you may and may not create, upload or do with Createtor.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "purpose",
        heading: "Purpose",
        paragraphs: [
          "This policy protects our users, the platforms our content reaches, and the people affected by it. It applies to everything you create, upload, generate, publish or process with the service and forms part of our Terms of Use.",
        ],
      },
      {
        id: "prohibited-content",
        heading: "Prohibited content",
        paragraphs: ["You must not create, upload or distribute content that:"],
        bullets: [
          "Is unlawful, or promotes illegal activity.",
          "Infringes the intellectual property or privacy rights of others.",
          "Is hateful, harassing, defamatory or incites violence.",
          "Sexualises or endangers minors in any way.",
          "Depicts sexual content or gratuitous violence where prohibited.",
          "Is deliberately deceptive, including impersonation, non-consensual deepfakes, and manipulative disinformation.",
          "Distributes malware or facilitates fraud, phishing or scams.",
        ],
      },
      {
        id: "prohibited-activities",
        heading: "Prohibited activities",
        bullets: [
          "Attempting to access accounts, data or systems you are not authorised to access.",
          "Circumventing credit limits, rate limits, paywalls or security controls.",
          "Reverse engineering, scraping or reselling the service without written permission.",
          "Using the service to send spam or to mass-produce deceptive content.",
          "Interfering with the service or other users, including denial-of-service attempts.",
        ],
      },
      {
        id: "platform-rules",
        heading: "Platform rules and disclosure",
        paragraphs: [
          "You are responsible for complying with the terms and community guidelines of any platform you publish to, including YouTube, TikTok, Instagram, Facebook and Pinterest. Many platforms require you to disclose realistic synthetic or AI-generated media, and you must do so.",
        ],
      },
      {
        id: "enforcement",
        heading: "Enforcement",
        paragraphs: [
          "We may remove content, issue warnings, suspend features, or suspend or terminate accounts that breach this policy. Serious breaches may be reported to the relevant authorities. We may also act where required by law or to protect the service and its users.",
        ],
      },
      {
        id: "reporting",
        heading: "Reporting abuse",
        paragraphs: [
          "If you believe content or activity breaches this policy, report it to our team.",
        ],
      },
    ],
    contact: [
      { label: "Report abuse", email: SUPPORT_EMAIL },
      { label: "Legal", email: LEGAL_EMAIL },
    ],
  },
  {
    to: "/refunds",
    slug: "refunds",
    title: "Refund & Billing Policy",
    short: "Refunds",
    summary: "How billing, renewals, cancellations and our 7-day money-back guarantee work.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        id: "plans",
        heading: "Plans and billing cycles",
        paragraphs: [
          "Createtor offers a free plan and paid plans billed monthly or yearly through Stripe or PayPal. Yearly billing is charged as a single annual amount. The price and credit allotment for each plan are shown at checkout.",
        ],
      },
      {
        id: "guarantee",
        heading: "7-day money-back guarantee",
        paragraphs: [
          `Every paid plan includes a 7-day money-back guarantee. If the service is not the right fit, email us within 7 days of your first paid charge and we will refund that charge in full.`,
          "The guarantee applies to the first payment on a plan. Contact us and we will process the refund to your original payment method.",
        ],
      },
      {
        id: "renewals",
        heading: "Renewals and cancellation",
        paragraphs: [
          "Subscriptions renew automatically at the end of each billing period until cancelled. You can cancel any time from the billing page; you keep access until the end of the period you have paid for. Cancelling stops future charges.",
        ],
      },
      {
        id: "failed-payments",
        heading: "Failed payments",
        paragraphs: [
          "If a payment fails we may retry it and may mark the subscription past due. If payment remains outstanding, we may downgrade the workspace to the free plan. You can update your payment method at any time.",
        ],
      },
      {
        id: "credits",
        heading: "Credits",
        paragraphs: [
          "Credits are consumed when you run billable generations and processing. Credits already consumed for delivered generations are not refunded, except where a generation fails, in which case reserved credits are returned automatically. Credits are non-transferable and have no cash value except where required by law.",
        ],
      },
      {
        id: "chargebacks",
        heading: "Chargebacks",
        paragraphs: [
          "Please contact us before raising a chargeback so we can resolve the issue quickly. Unwarranted chargebacks may result in suspension of the account and any associated workspaces.",
        ],
      },
      {
        id: "statutory",
        heading: "Your statutory rights",
        paragraphs: [
          "This policy does not limit any consumer rights you may have under mandatory United States federal or state law. Where those rights offer more protection than this policy, they prevail.",
        ],
      },
    ],
    contact: [
      { label: "Billing support", email: SUPPORT_EMAIL },
      { label: "Legal", email: LEGAL_EMAIL },
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) throw new Error(`Unknown legal document: ${slug}`);
  return doc;
}

/** Footer / hub links for every legal document. */
export const LEGAL_LINKS = LEGAL_DOCS.map((d) => ({ to: d.to, label: d.short }));
