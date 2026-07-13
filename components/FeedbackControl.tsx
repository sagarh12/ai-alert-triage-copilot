"use client";

import { useEffect, useState } from "react";
import { getFeedback, setFeedback, type Feedback } from "@/lib/feedback";

export default function FeedbackControl({ id }: { id: string }) {
  const [value, setValue] = useState<Feedback | null>(null);
  useEffect(() => setValue(getFeedback(id)), [id]);

  function choose(next: Feedback) {
    const v = value === next ? null : next; // toggle off if re-clicked
    setValue(v);
    setFeedback(id, v);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-white/40">
        analyst review
      </span>
      <button
        onClick={() => choose("agree")}
        aria-pressed={value === "agree"}
        className={`rounded-md border px-3 py-1.5 font-mono text-[12px] transition-all ${
          value === "agree"
            ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_16px_#00ff8822]"
            : "border-white/10 text-white/50 hover:border-primary/40 hover:text-primary"
        }`}
      >
        ▲ agree
      </button>
      <button
        onClick={() => choose("disagree")}
        aria-pressed={value === "disagree"}
        className={`rounded-md border px-3 py-1.5 font-mono text-[12px] transition-all ${
          value === "disagree"
            ? "border-high/60 bg-high/15 text-high"
            : "border-white/10 text-white/50 hover:border-high/40 hover:text-high"
        }`}
      >
        ▼ disagree
      </button>
      {value && (
        <span className="font-mono text-[11px] text-white/35">saved locally</span>
      )}
    </div>
  );
}
