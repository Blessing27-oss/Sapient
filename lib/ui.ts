import type { Label } from "./types.ts";

export const LABEL_FILL: Record<Label, string> = {
  strength: "#96cab6", review: "#fca5a5", mixed: "#fde68a",
  "tentative-up": "#e0f2fe", "tentative-down": "#ffedd5", unknown: "#f5f5f4",
};
export const LABEL_ACCENT: Record<Label, string> = {
  strength: "#16895c", review: "#dc2626", mixed: "#d97706",
  "tentative-up": "#0284c7", "tentative-down": "#ea580c", unknown: "#a8a29e",
};
export const LABEL_RING: Label[] = ["tentative-up", "tentative-down"];

// One hue per concept on the professor's map; outgoing arrows share the concept's accent.
export const PALETTE = [
  { fill: "#dbeafe", accent: "#2563eb" }, { fill: "#e3f1eb", accent: "#16895c" }, { fill: "#fef3c7", accent: "#d97706" },
  { fill: "#fce7f3", accent: "#db2777" }, { fill: "#ede9fe", accent: "#7c3aed" }, { fill: "#ccfbf1", accent: "#0d9488" },
  { fill: "#ffedd5", accent: "#ea580c" }, { fill: "#fee2e2", accent: "#dc2626" }, { fill: "#e0f2fe", accent: "#0284c7" },
  { fill: "#e0e7ff", accent: "#4f46e5" },
];
