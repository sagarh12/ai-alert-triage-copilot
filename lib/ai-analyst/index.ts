/**
 * lib/ai-analyst — a small, GENERIC toolkit for getting validated structured
 * output from Claude. Nothing here is hard-coded to "alerts"; it's the Claude
 * call wrapper + prompt templating + JSON-schema validation that any analysis
 * pipeline can reuse. (Designed to be lifted into a second security project.)
 *
 * Server-side only. Reads ANTHROPIC_API_KEY from the environment — the key is
 * never referenced or bundled client-side.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

// Guardrail: this module reads ANTHROPIC_API_KEY and must never run in a
// browser bundle. (Works in Node CLI + Next server; throws only client-side.)
if (typeof window !== "undefined") {
  throw new Error("lib/ai-analyst is server-only and must not be imported client-side.");
}

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

let _client: Anthropic | null = null;

/** True when a live Claude call is possible. */
export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — the live Claude engine is unavailable. " +
        "Add it to .env.local, or run the pipeline with the heuristic engine."
    );
  }
  if (!_client) _client = new Anthropic();
  return _client;
}

export type PromptSection = { heading: string; body: string };

/** Assemble a readable prompt from titled sections. */
export function buildPrompt(sections: PromptSection[]): string {
  return sections
    .map((s) => `## ${s.heading}\n${s.body.trim()}`)
    .join("\n\n");
}

export type StructuredOptions = {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
};

/**
 * Call Claude and return the raw assistant text. Sampling params are omitted
 * deliberately — they are rejected by current Opus/Sonnet models.
 */
export async function complete(
  opts: StructuredOptions
): Promise<{ text: string; model: string }> {
  const model = opts.model || DEFAULT_MODEL;
  const response = await client().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { text, model };
}

/** Pull the first JSON object out of possibly-fenced / chatty model output. */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output.");
  }
  return JSON.parse(s.slice(start, end + 1));
}

/**
 * The main helper: call Claude, extract JSON, and validate against a Zod
 * schema — returning a fully-typed result. Retries once on a validation or
 * parse failure with a corrective nudge.
 */
export async function analyzeStructured<T>(
  opts: StructuredOptions & { schema: ZodType<T> }
): Promise<{ data: T; model: string }> {
  const first = await complete(opts);
  try {
    return { data: opts.schema.parse(extractJson(first.text)), model: first.model };
  } catch (err) {
    // One corrective retry — common when the model adds prose or a stray field.
    const retry = await complete({
      ...opts,
      prompt:
        opts.prompt +
        "\n\nReturn ONLY a single valid JSON object matching the schema. " +
        "No prose, no markdown fences.",
    });
    void err;
    return { data: opts.schema.parse(extractJson(retry.text)), model: retry.model };
  }
}
