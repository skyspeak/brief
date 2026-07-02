// lib/personas.js — edit this list to change who gets a magazine and how it's framed.
//
//   id    : short slug (used in logs)
//   label : edition line shown in the masthead
//   lens  : the framing instruction the editor follows for this reader
//   to    : recipient (optional; defaults to DIGEST_TO)
//
// For now selection is lens-only (the model filters/frames the week for each reader).
// When you outgrow that, add a `query` per persona and switch to embeddings/RAG.

export const PERSONAS = [
  {
    id: "hc-sales",
    label: "Healthcare Sales Edition",
    lens:
      "You brief a HEALTHCARE SALES leader. Prioritize: payer/provider deals and consolidation, " +
      "reimbursement and regulatory shifts (CMS, HIPAA, FDA), buying signals and budget cycles, " +
      "competitor moves, and anything that changes the sales motion or ICP. Demote generic tech " +
      "news unless it directly affects how or to whom they sell.",
    // to: "sales-lead@you.com",
  },
  {
    id: "general",
    label: "General Edition",
    lens:
      "You brief a busy operator who wants the big picture. Prioritize the most consequential " +
      "developments across all topics; keep it broad but high-signal.",
    // to: "you@you.com",
  },
];
