import { chat } from "@/lib/deepseek";
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import type { ParseResult, RawExtraction, NormalizedExtraction, DueType } from "@/types";

export async function parseUserMessage(
  userContent: string,
  attentionContext: string
): Promise<ParseResult> {
  const systemPrompt = CHAT_SYSTEM_PROMPT
    .replace("{CURRENT_DATE}", new Date().toISOString().split("T")[0])
    .replace("{ATTENTION_CONTEXT}", attentionContext);

  const raw = await chat(systemPrompt, [{ role: "user", content: userContent }]);

  // DeepSeek may wrap JSON in markdown code blocks — strip them
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let parsed: { reply?: string; extractions?: RawExtraction[]; suggestedActions?: string[] };
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch {
    // Fallback: treat the whole response as the reply
    parsed = {
      reply: raw || "Got it.",
      extractions: [],
      suggestedActions: [],
    };
  }

  return {
    reply: parsed.reply || "I understood that, but couldn't extract anything specific.",
    extractions: (parsed.extractions || []).map(normalizeExtraction),
    suggestedActions: parsed.suggestedActions || [],
  };
}

function normalizeExtraction(ext: RawExtraction): NormalizedExtraction {
  return {
    type: ext.type,
    title: ext.title,
    content: ext.content || ext.title,
    dueAt: ext.dueAt ? new Date(ext.dueAt) : null,
    dueType: (ext.dueType as DueType) || null,
    reminderAt: ext.reminderAt ? new Date(ext.reminderAt) : null,
    tags: ext.tags || [],
    person: ext.person || null,
    confidence: Math.min(1, Math.max(0, ext.confidence ?? 0.5)),
  };
}
