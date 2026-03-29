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
import type {
  ParseResult,
  RawExtraction,
  NormalizedExtraction,
  DueType,
  SuggestedAction,
} from "@/types";

const USE_TWO_LAYER_AI = process.env.USE_TWO_LAYER_AI === "true";

export async function parseUserMessage(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[] = [],
  clarificationTopicKey?: string
): Promise<ParseResult> {
  try {
    if (USE_TWO_LAYER_AI) {
      return twoLayerPipeline(userContent, attentionContext, recentConversationHistory, clarificationTopicKey);
    }
    return singleLayerPipeline(userContent, attentionContext, recentConversationHistory, clarificationTopicKey);
  } catch (err) {
    console.error("[parser] pipeline error:", err);
    const language = detectPreferredLanguage(`${userContent}\n${attentionContext}`);
    return {
      reply:
        language === "tr"
          ? "Mesajını aldım. AI tarafında geçici bir sorun var, ama devam edebiliriz."
          : "I got your message. There is a temporary AI issue right now, but we can continue.",
      extractions: [],
      followUpQuestions: [],
      suggestedActions: normalizeSuggestedActions([], "", userContent, attentionContext),
    };
  }
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
    suggestedActions?: unknown;
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
    suggestedActions: normalizeSuggestedActions(parsed.suggestedActions, reply, userContent, attentionContext),
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

  let layer1: { reply?: string; intent?: string; followUpQuestions?: string[]; suggestedActions?: unknown };
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
    suggestedActions: normalizeSuggestedActions(layer1.suggestedActions, reply, userContent, attentionContext),
  };
}

function normalizeExtraction(ext: RawExtraction): NormalizedExtraction {
  const estimated =
    typeof ext.estimatedMinutes === "number" && Number.isFinite(ext.estimatedMinutes)
      ? Math.max(1, Math.round(ext.estimatedMinutes))
      : null;

  return {
    type: ext.type,
    title: ext.title,
    content: ext.content || ext.title,
    dueAt: ext.dueAt ? new Date(ext.dueAt) : null,
    dueType: (ext.dueType as DueType) || null,
    reminderAt: ext.reminderAt ? new Date(ext.reminderAt) : null,
    estimatedMinutes: estimated,
    executionStartAt: ext.executionStartAt ? new Date(ext.executionStartAt) : null,
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

function normalizeSuggestedActions(
  prompts: unknown,
  reply: string,
  userContent: string,
  attentionContext: string
): SuggestedAction[] {
  const preferredLanguage = detectPreferredLanguage(`${userContent}\n${reply}\n${attentionContext}`);
  const contextSignal = `${reply} ${userContent} ${attentionContext}`.toLocaleLowerCase(
    preferredLanguage === "tr" ? "tr-TR" : "en-US"
  );
  const parsedPrompts = parseSuggestedActions(prompts)
    .map((prompt) => prompt.text.trim())
    .filter((text) => text.length >= 16);

  const questionCandidate = parsedPrompts.find((text) => {
    if (preferredLanguage === "tr") {
      return /\?/.test(text) && /\b(bana|bizim|şu an|genel|durum|tıkan|sorun|pain)\b/i.test(text);
    }
    return /\?/.test(text) && /\b(can you|could you|overview|pain point|bottleneck|current)\b/i.test(text);
  });

  const focusWindow = inferFocusWindowLabel(contextSignal, preferredLanguage);
  const hasOverdueContext = /\b(overdue|behind|late|missed|slipped|past due|gecik|sarkt|ertele|kaçırd|kaçirdi|vadesi geçti)\b/.test(
    contextSignal
  );

  const fallbackQuestion =
    preferredLanguage === "tr"
      ? "Mevcut taahhütlerimin genel görünümünü ve şu anki en büyük tıkanmaları çıkarır mısın?"
      : "Can you give me a quick view of my current commitments and biggest pain points right now?";

  const planningStarter =
    preferredLanguage === "tr"
      ? `Şunu ${focusWindow} planlıyorum: ... Bunu gerçekçi ilk adımlara genişletmeme yardım eder misin?`
      : `I am planning to ... ${focusWindow}. Help me expand this into realistic first steps.`;

  const riskStarter =
    preferredLanguage === "tr"
      ? hasOverdueContext
        ? "Gecikmiş işlerim var: ... Bugün neyi yapıp neyi ertelemem veya yeniden pazarlık etmem gerektiğini netleştirir misin?"
        : "Şunda gecikme riski görüyorum: ... Gecikmeye düşmeden toparlamak için bir plan çıkarır mısın?"
      : hasOverdueContext
      ? "I already have overdue tasks around ... Help me triage what to do now, defer, or renegotiate."
      : "I might be late on ... Help me prevent delay and set a recovery plan before it becomes overdue.";

  return [
    { text: questionCandidate ?? fallbackQuestion, kind: "question" },
    { text: planningStarter, kind: "action" },
    { text: riskStarter, kind: "action" },
  ];
}

function inferFocusWindowLabel(contextSignal: string, language: "tr" | "en"): string {
  if (language === "tr") {
    if (/\b(sabah|morning|08:|09:|10:|11:)\b/.test(contextSignal)) return "sabah odak penceremde";
    if (/\b(öğleden sonra|ogleden sonra|afternoon|13:|14:|15:|16:)\b/.test(contextSignal)) return "öğleden sonra odak penceremde";
    if (/\b(akşam|aksam|gece|evening|night|18:|19:|20:|21:)\b/.test(contextSignal)) return "akşam odak penceremde";
    return "bir sonraki odak penceremde";
  }

  if (/\b(morning|08:|09:|10:|11:)\b/.test(contextSignal)) return "in my morning focus window";
  if (/\b(afternoon|13:|14:|15:|16:)\b/.test(contextSignal)) return "in my afternoon focus window";
  if (/\b(evening|night|18:|19:|20:|21:)\b/.test(contextSignal)) return "in my evening focus window";
  return "in my next focus window";
}

function parseSuggestedActions(prompts: unknown): SuggestedAction[] {
  if (!Array.isArray(prompts)) return [];

  const parsed: SuggestedAction[] = [];
  for (const item of prompts) {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) continue;
      parsed.push({
        text,
        kind: text.includes("?") ? "question" : "action",
      });
      continue;
    }

    if (!item || typeof item !== "object") continue;

    const candidate = item as {
      text?: unknown;
      kind?: unknown;
      estimatedMinutes?: unknown;
    };

    if (typeof candidate.text !== "string" || !candidate.text.trim()) continue;

    const normalizedKind =
      candidate.kind === "question" || candidate.kind === "action"
        ? candidate.kind
        : candidate.text.includes("?")
        ? "question"
        : "action";

    const normalized: SuggestedAction = {
      text: candidate.text.trim(),
      kind: normalizedKind,
    };

    if (
      normalizedKind === "action" &&
      typeof candidate.estimatedMinutes === "number" &&
      Number.isFinite(candidate.estimatedMinutes) &&
      candidate.estimatedMinutes > 0
    ) {
      normalized.estimatedMinutes = Math.max(1, Math.round(candidate.estimatedMinutes));
    }

    parsed.push(normalized);
  }

  return parsed;
}

function detectPreferredLanguage(signal: string): "tr" | "en" {
  if (looksTurkish(signal)) return "tr";
  return "en";
}

function looksTurkish(text: string): boolean {
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return true;
  return /\b(ve|bir|için|icin|ile|ama|şu|su|bu|ne|nasıl|nasil|hangi|görev|hatırlatma|hatirlatma|bugün|bugun|yarın|yarin|hafta|ay|toplantı|toplanti|ekip|müşteri|musteri)\b/i.test(
    text
  );
}
