/**
 * Analyst feedback persistence. Client-side localStorage keeps the demo working
 * on Vercel's read-only filesystem and needs no backend (v1 just stores it —
 * human-in-the-loop signal, not yet fed back into the model).
 */
export type Feedback = "agree" | "disagree";
export type Status = "unreviewed" | "agree" | "disagree";

const KEY = (id: string) => `atc:feedback:${id}`;

export function getFeedback(id: string): Feedback | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY(id));
  return v === "agree" || v === "disagree" ? v : null;
}

export function setFeedback(id: string, value: Feedback | null): void {
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(KEY(id));
  else window.localStorage.setItem(KEY(id), value);
  window.dispatchEvent(new CustomEvent("atc:feedback", { detail: { id, value } }));
}

export function statusOf(id: string): Status {
  return getFeedback(id) ?? "unreviewed";
}
