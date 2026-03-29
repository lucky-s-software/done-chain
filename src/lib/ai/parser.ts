import { chat, chatJson } from "@/lib/deepseek";
import { inferMemoryFromTasks } from "@/lib/ai/extractions";
import {
  CHAT_SYSTEM_PROMPT,
  REPLY_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  CLARIFICATION_ROUND2_INSTRUCTION,
  CLARIFICATION_RESOLVED_INSTRUCTION,
} from "@/lib/ai/prompts";
import { getClarificationContext } from "@/lib/ai/clarification";
import type { ParseResult, RawExtraction, NormalizedExtraction, DueType } from "@/types";

const USE_TWO_LAYER_AI = process.env.USE_TWO_LAYER_AI === "true";

export async function parseUserMessage(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[] = [],
  clarificationTopicKey?: string
): Promise<ParseResult> {
  if (USE_TWO_LAYER_AI) {
    return twoLayerPipeline(userContent, attentionContext, recentConversationHistory, clarificationTopicKey);
  }
  return singleLayerPipeline(userContent, attentionContext, recentConversationHistory, clarificationTopicKey);
}

async function singleLayerPipeline(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
  clarificationTopicKey?: string
): Promise<ParseResult> {
  let extraInstruction = "";
  if (clarificationTopicKey) {
    const ctx = getClarificationContext(clarificationTopicKey);
    if (ctx?.state === "round_2") extraInstruction = `\n\n${CLARIFICATION_ROUND2_INSTRUCTION}`;
    else if (ctx?.state === "resolved") extraInstruction = `\n\n${CLARIFICATION_RESOLVED_INSTRUCTION}`;
  }

  const systemPrompt = (CHAT_SYSTEM_PROMPT + extraInstruction)
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
    parsed = { reply: raw || "Got it.", extractions: [], followUpQuestions: [], suggestedActions: [] };
  }

  const followUpQuestions = normalizeFollowUpQuestions(parsed.followUpQuestions, userContent, parsed.extractions || []);
  const reply = buildReply(parsed.reply || "I understood that, but couldn't extract anything specific.", followUpQuestions);

  return {
    reply,
    extractions: inferMemoryFromTasks((parsed.extractions || []).map(normalizeExtraction)),
    followUpQuestions,
    suggestedActions: parsed.suggestedActions || [],
  };
}

async function twoLayerPipeline(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
  clarificationTopicKey?: string
): Promise<ParseResult> {
  let extraInstruction = "";
  if (clarificationTopicKey) {
    const ctx = getClarificationContext(clarificationTopicKey);
    if (ctx?.state === "round_2") extraInstruction = `\n\n${CLARIFICATION_ROUND2_INSTRUCTION}`;
    else if (ctx?.state === "resolved") extraInstruction = `\n\n${CLARIFICATION_RESOLVED_INSTRUCTION}`;
  }

  const today = new Date().toISOString().split("T")[0];
  const replySystemPrompt = (REPLY_SYSTEM_PROMPT + extraInstruction)
    .replace("{CURRENT_DATE}", today)
    .replace("{ATTENTION_CONTEXT}", attentionContext);

  const conversationMessages =
    recentConversationHistory.length > 0
      ? recentConversationHistory
      : [{ role: "user" as const, content: userContent }];

  // Layer 1: conversational reply
  const rawReply = await chatJson(replySystemPrompt, conversationMessages, {
    temperature: 0.4,
    max_tokens: 800,
  });

  let layer1: { reply?: string; intent?: string; followUpQuestions?: string[]; suggestedActions?: string[] };
  try {
    layer1 = JSON.parse(rawReply);
  } catch {
    layer1 = { reply: rawReply || "Got it.", followUpQuestions: [], suggestedActions: [] };
  }

  // Layer 2: structured extraction (runs in parallel could be an option but we need intent from L1)
  const extractionSystemPrompt = EXTRACTION_SYSTEM_PROMPT.replace("{CURRENT_DATE}", today);
  const extractionUserMessage = `Intent from previous analysis: ${layer1.intent ?? "unknown"}\n\nUser message: ${userContent}`;

  const rawExtraction = await chatJson(
    extractionSystemPrompt,
    [{ role: "user", content: extractionUserMessage }],
    { temperature: 0.1, max_tokens: 1200 }
  );

  let layer2: { extractions?: RawExtraction[] };
  try {
    layer2 = JSON.parse(rawExtraction);
  } catch {
    layer2 = { extractions: [] };
  }

  const followUpQuestions = normalizeFollowUpQuestions(layer1.followUpQuestions, userContent, layer2.extractions || []);
  const reply = buildReply(layer1.reply || "Got it.", followUpQuestions);

  return {
    reply,
    extractions: inferMemoryFromTasks((layer2.extractions || []).map(normalizeExtraction)),
    followUpQuestions,
    suggestedActions: layer1.suggestedActions || [],
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

  if (cleaned.length > 0) return cleaned;
  if (!needsFallbackClarification(userContent, extractions)) return [];

  return [
    "What exactly should I track?",
    "When should this happen?",
    "Anything important I should attach to it?",
  ];
}

function needsFallbackClarification(userContent: string, extractions: RawExtraction[]): boolean {
  const trimmed = userContent.trim();
  if (!trimmed) return false;

  const hasReminderIntent = /\b(remind|reminder|remember|schedule|follow up|follow-up|call|meet|deadline|due)\b/i.test(trimmed);
  const hasVagueTiming = /\b(soon|later|sometime|eventually|next week|next month|tomorrow maybe|around then)\b/i.test(trimmed);
  const hasVeryLittleStructure = trimmed.split(/\s+/).length <= 3;
  const extractionMissingTime = extractions.some(
    (extraction) => extraction.type !== "memory" && !extraction.dueAt && !extraction.reminderAt
  );

  return (hasReminderIntent && (hasVagueTiming || extractionMissingTime)) || (hasVeryLittleStructure && extractions.length === 0);
}

function buildReply(reply: string, followUpQuestions: string[]): string {
  if (followUpQuestions.length === 0) return reply;

  const alreadyIncludesQuestion = followUpQuestions.every((question) => reply.includes(question));
  if (alreadyIncludesQuestion) return reply;

  return `${reply}\n\n${followUpQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n")}`;
}
