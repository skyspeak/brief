// lib/personas.js — edit this list to change who gets a digest and how it's framed.
//
//   id          : short slug (used in logs)
//   label       : edition line shown in the email
//   personaKey  : maps to prompt filter in lib/prompts.js
//                  (marketing | sales | engineering | product | general)
//   to          : recipient (optional; defaults to DIGEST_TO)
//   digest      : set false to skip this edition on scheduled sends

export const PERSONAS = [
  {
    id: "general",
    label: "General Manager Edition",
    personaKey: "general",
    to: "skyspeak@gmail.com",
  },
  {
    id: "sales",
    label: "Sales Edition",
    personaKey: "sales",
    digest: false,
    to: "skyspeak@gmail.com",
  },
  {
    id: "marketing",
    label: "Marketing Edition",
    personaKey: "marketing",
    digest: false,
  },
  {
    id: "engineering",
    label: "Engineering Edition",
    personaKey: "engineering",
    digest: false,
  },
  {
    id: "product",
    label: "Product Edition",
    personaKey: "product",
    digest: false,
  },
];
