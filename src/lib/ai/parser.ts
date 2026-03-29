import { chat } from "@/lib/deepseek";
import { inferMemoryFromTasks } from "@/lib/ai/extractions";
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import type { ParseResult, RawExtraction, NormalizedExtraction, DueType } from "@/types";

export async function parseUserMessage(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[] = []
): Promise<ParseResult> {
  const systemPrompt = CHAT_SYSTEM_PROMPT
    .replace("{CURRENT_DATE}", new Date().toISOString().split("T")[0])
    .replace("{ATTENTION_CONTEXT}", attentionContext);

  const conversationMessages =
    recentConversationHistory.length > 0
      ? recentConversationHistory
      : [{ role: "user" as const, content: userContent }];

  const raw = await chat(systemPrompt, conversationMessages);

  // DeepSeek may wrap JSON in markdown code blocks — strip them
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let parsed: {
    reply?: string;
    extractions?: RawExtraction[];
    followUpQuestions?: string[];
    suggestedActions?: string[];
  };
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch {
    // Fallback: treat the whole response as the reply
    parsed = {
      reply: raw || "Got it.",
      extractions: [],
      followUpQuestions: [],
      suggestedActions: [],
    };
  }

  const followUpQuestions = normalizeFollowUpQuestions(
    parsed.followUpQuestions,
    userContent,
    parsed.extractions || []
  );
  const reply = buildReply(
    parsed.reply || "I understood that, but couldn't extract anything specific.",
    followUpQuestions
  );

  return {
    reply,
    extractions: inferMemoryFromTasks((parsed.extractions || []).map(normalizeExtraction)),
    followUpQuestions,
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

function normalizeFollowUpQuestions(
  questions: string[] | undefined,
  userContent: string,
  extractions: RawExtraction[]
): string[] {
  const cleaned = (questions || [])
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (cleaned.length > 0) {
    return cleaned;
  }

  if (!needsFallbackClarification(userContent, extractions)) {
    return [];
  }

  return [
    "What exactly should I track?",
    "When should this happen?",
    "Anything important I should attach to it?",
  ];
}

function needsFallbackClarification(userContent: string, extractions: RawExtraction[]): boolean {
  const trimmed = userContent.trim();
  if (!trimmed) {
    return false;
  }

  const hasReminderIntent = /\b(remind|reminder|remember|schedule|follow up|follow-up|call|meet|deadline|due)\b/i.test(trimmed);
  const hasVagueTiming = /\b(soon|later|sometime|eventually|next week|next month|tomorrow maybe|around then)\b/i.test(trimmed);
  const hasVeryLittleStructure = trimmed.split(/\s+/).length <= 3;
  const extractionMissingTime = extractions.some(
    (extraction) =>
      extraction.type !== "memory" &&
      !extraction.dueAt &&
      !extraction.reminderAt
  );

  return (hasReminderIntent && (hasVagueTiming || extractionMissingTime)) || (hasVeryLittleStructure && extractions.length === 0);
}

function buildReply(reply: string, followUpQuestions: string[]): string {
  if (followUpQuestions.length === 0) {
    return reply;
  }

  const alreadyIncludesQuestion = followUpQuestions.every((question) => reply.includes(question));
  if (alreadyIncludesQuestion) {
    return reply;
  }

  return `${reply}\n\n${followUpQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n")}`;
}
