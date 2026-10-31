import type { Label } from "./types.ts";

export const LABEL_FILL: Record<Label, string> = {
  strength: "#86efac", review: "#fca5a5", mixed: "#fde68a",
  "tentative-up": "#e0f2fe", "tentative-down": "#ffedd5", unknown: "#f5f5f4",
};
export const LABEL_RING: Label[] = ["tentative-up", "tentative-down"];
