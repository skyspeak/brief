// lib/personas.js — persona lenses for unified digest (one email, insight per role).
//
//   id / personaKey : maps to lib/prompts.js PERSONA_PROMPTS
//   label           : shown in "Insights by Role" section
//
// Digest email: one neutral send with talking points, stats, + one insight per persona below.

export const DIGEST_PERSONAS = [
  { id: "general", label: "General Manager", personaKey: "general" },
  { id: "sales", label: "Sales", personaKey: "sales" },
  { id: "marketing", label: "Marketing", personaKey: "marketing" },
  { id: "engineering", label: "Engineering", personaKey: "engineering" },
  { id: "product", label: "Product", personaKey: "product" },
];

/** Default digest recipient when DIGEST_TO is unset. */
export const DEFAULT_DIGEST_TO = "skyspeak@gmail.com";
