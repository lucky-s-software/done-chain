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
import type { DeepSeekUsage } from "@/lib/deepseek";

const USE_TWO_LAYER_AI = process.env.USE_TWO_LAYER_AI === "true";
const ENABLE_REASONER_FALLBACK = process.env.ENABLE_REASONER_FALLBACK === "true";
const REASONER_MODEL = process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner";

interface ParseOptions {
  thinkingMode?: boolean;
}

export async function parseUserMessage(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[] = [],
  clarificationTopicKey?: string,
  onUsage?: (usage: DeepSeekUsage) => void,
  options?: ParseOptions
): Promise<ParseResult> {
  try {
    const forceReasoner = options?.thinkingMode === true;
    const primary = USE_TWO_LAYER_AI
      ? await twoLayerPipeline(
          userContent,
          attentionContext,
          recentConversationHistory,
          clarificationTopicKey,
          onUsage,
          forceReasoner
        )
      : await singleLayerPipeline(
          userContent,
          attentionContext,
          recentConversationHistory,
          clarificationTopicKey,
          onUsage,
          forceReasoner
        );

    if (forceReasoner) {
      return primary;
    }

    return maybeApplyReasonerFallback(
      primary,
      userContent,
      attentionContext,
      recentConversationHistory,
      onUsage
    );
  } catch (err) {
    console.error("[parser] pipeline error:", err);
    return {
      reply: "I got your message. There is a temporary AI issue right now, but we can continue.",
      extractions: [],
      followUpQuestions: [],
      suggestedActions: normalizeSuggestedActions([], "", userContent, attentionContext),
    };
  }
}

async function maybeApplyReasonerFallback(
  primary: ParseResult,
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
  onUsage?: (usage: DeepSeekUsage) => void
): Promise<ParseResult> {
  if (!ENABLE_REASONER_FALLBACK) return primary;
  if (!shouldUseReasonerFallback(userContent, primary.extractions, primary.followUpQuestions)) {
    return primary;
  }

  const fallbackRawExtractions = await runReasonerExtractionFallback(
    userContent,
    recentConversationHistory,
    onUsage
  );
  if (fallbackRawExtractions.length === 0) return primary;

  const merged = dedupeExtractions([
    ...primary.extractions,
    ...fallbackRawExtractions.map(normalizeExtraction),
  ]);

  return {
    ...primary,
    extractions: finalizeExtractions(userContent, attentionContext, merged),
  };
}

async function singleLayerPipeline(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
  clarificationTopicKey?: string,
  onUsage?: (usage: DeepSeekUsage) => void,
  forceReasoner = false
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

  const raw = await chat(systemPrompt, conversationMessages, {
    mode: "chat",
    model: forceReasoner ? REASONER_MODEL : undefined,
    stage: forceReasoner ? "parser_single_reasoner" : "parser_single",
    onUsage,
  });

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

  const followUpQuestions = normalizeFollowUpQuestions(
    parsed.followUpQuestions,
    userContent,
    parsed.extractions || [],
    attentionContext
  );
  const reply = buildReply(parsed.reply || "I understood that, but couldn't extract anything specific.", followUpQuestions);
  const normalizedExtractions = finalizeExtractions(
    userContent,
    attentionContext,
    (parsed.extractions || []).map(normalizeExtraction)
  );

  return {
    reply,
    extractions: normalizedExtractions,
    followUpQuestions,
    suggestedActions: normalizeSuggestedActions(parsed.suggestedActions, reply, userContent, attentionContext),
  };
}

async function twoLayerPipeline(
  userContent: string,
  attentionContext: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
  clarificationTopicKey?: string,
  onUsage?: (usage: DeepSeekUsage) => void,
  forceReasoner = false
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
    mode: "chat",
    model: forceReasoner ? REASONER_MODEL : undefined,
    temperature: 1.3,
    max_tokens: 800,
    stage: forceReasoner ? "parser_reply_reasoner" : "parser_reply",
    onUsage,
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
    {
      mode: "analysis",
      model: forceReasoner ? REASONER_MODEL : undefined,
      temperature: 1,
      max_tokens: 1200,
      stage: forceReasoner ? "parser_extraction_reasoner" : "parser_extraction",
      onUsage,
    }
  );

  let layer2: { extractions?: RawExtraction[] };
  try {
    layer2 = JSON.parse(rawExtraction);
  } catch {
    layer2 = { extractions: [] };
  }

  const followUpQuestions = normalizeFollowUpQuestions(
    layer1.followUpQuestions,
    userContent,
    layer2.extractions || [],
    attentionContext
  );
  const reply = buildReply(layer1.reply || "Got it.", followUpQuestions);
  const normalizedExtractions = finalizeExtractions(
    userContent,
    attentionContext,
    (layer2.extractions || []).map(normalizeExtraction)
  );

  return {
    reply,
    extractions: normalizedExtractions,
    followUpQuestions,
    suggestedActions: normalizeSuggestedActions(layer1.suggestedActions, reply, userContent, attentionContext),
  };
}

function finalizeExtractions(
  userContent: string,
  attentionContext: string,
  extracted: NormalizedExtraction[]
): NormalizedExtraction[] {
  const withInferredMemories = inferMemoryFromTasks(extracted);
  const bootstrap = inferProfileBootstrapMemories(userContent, attentionContext, withInferredMemories);
  return inferMemoryFromTasks([...withInferredMemories, ...bootstrap]);
}

function dedupeExtractions(extractions: NormalizedExtraction[]): NormalizedExtraction[] {
  const unique = new Map<string, NormalizedExtraction>();
  for (const item of extractions) {
    const key = [
      item.type,
      item.title.trim().toLowerCase(),
      item.dueAt ? item.dueAt.toISOString().slice(0, 16) : "",
      item.reminderAt ? item.reminderAt.toISOString().slice(0, 16) : "",
    ].join("|");

    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, item);
      continue;
    }

    existing.tags = Array.from(new Set([...existing.tags, ...item.tags]));
    existing.confidence = Math.max(existing.confidence, item.confidence);
    if (!existing.content && item.content) existing.content = item.content;
  }

  return Array.from(unique.values());
}

async function runReasonerExtractionFallback(
  userContent: string,
  recentConversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
  onUsage?: (usage: DeepSeekUsage) => void
): Promise<RawExtraction[]> {
  const today = new Date().toISOString().split("T")[0];
  const extractionSystemPrompt = EXTRACTION_SYSTEM_PROMPT.replace("{CURRENT_DATE}", today);

  const historySnippet = recentConversationHistory
    .slice(-6)
    .map((item) => `[${item.role}] ${item.content}`)
    .join("\n");

  const extractionUserMessage = historySnippet
    ? `Recent conversation:\n${historySnippet}\n\nLatest user message:\n${userContent}`
    : userContent;

  const raw = await chat(
    extractionSystemPrompt,
    [{ role: "user", content: extractionUserMessage }],
    {
      mode: "analysis",
      model: REASONER_MODEL,
      max_tokens: 1400,
      stage: "parser_reasoner_extraction",
      onUsage,
    }
  );

  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let parsed: { extractions?: RawExtraction[] };
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch {
    parsed = { extractions: [] };
  }

  return Array.isArray(parsed.extractions) ? parsed.extractions : [];
}

function shouldUseReasonerFallback(
  userContent: string,
  extractions: NormalizedExtraction[],
  followUpQuestions: string[]
): boolean {
  const wordCount = userContent.trim().split(/\s+/).length;
  if (wordCount < 14) return false;
  if (!hasCommitmentIntent(userContent)) return false;

  const extractedTaskLike = extractions.some(
    (item) => item.type === "task" || item.type === "reminder"
  );
  const extractedMemory = extractions.some((item) => item.type === "memory");

  if (!extractedTaskLike && !extractedMemory) return true;
  if (!extractedTaskLike && followUpQuestions.length >= 2) return true;

  return false;
}

function hasCommitmentIntent(text: string): boolean {
  return /\b(plan|planning|schedule|task|todo|to-do|deadline|remind|follow up|focus window|analy[sz]e|extract|organi[sz]e|prioriti[sz]e|roadmap|next steps?)\b/i.test(
    text
  );
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
  extractions: RawExtraction[],
  attentionContext: string
): string[] {
  const cleaned = (questions || [])
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (cleaned.length > 0) return cleaned;
  if (needsFallbackClarification(userContent, extractions)) {
    return [
      "What exactly should I track?",
      "When should this happen?",
      "Anything important I should attach to it?",
    ];
  }

  const profileQuestion = inferProfileFollowUpQuestion(userContent, attentionContext, extractions);
  if (!profileQuestion) return [];
  return [profileQuestion];
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

function inferProfileBootstrapMemories(
  userContent: string,
  attentionContext: string,
  extracted: NormalizedExtraction[]
): NormalizedExtraction[] {
  const hasMemory = extracted.some((item) => item.type === "memory");
  if (hasMemory) return [];

  const trimmed = userContent.trim();
  if (trimmed.split(/\s+/).length < 18) return [];

  const bootstrapped: NormalizedExtraction[] = [];

  const projectMatch =
    trimmed.match(/\b(?:named|called)\s+([A-Z][\w-]{2,})/i) ??
    trimmed.match(/\b([A-Z][\w-]{2,})\s*[-–—]\s*(?:platform|app|product|project)/i);
  const projectName = projectMatch?.[1] ?? null;

  const collaboratorMatch = trimmed.match(/\bwith my (?:brother|sister|cofounder|co-founder|partner)\s+([A-Z][a-z]{1,})\b/i);
  const collaborator = collaboratorMatch?.[1] ?? null;

  if (projectName || collaborator) {
    const relationNote = collaborator ? ` with ${collaborator}` : "";
    const projectNote = projectName ? ` on ${projectName}` : "";
    bootstrapped.push({
      type: "memory",
      title: projectName ? `Project context: ${projectName}` : "Collaboration context",
      content: `User is building a side project${projectNote}${relationNote}.`,
      dueAt: null,
      dueType: null,
      reminderAt: null,
      estimatedMinutes: null,
      executionStartAt: null,
      tags: [projectName, "side-project", collaborator].filter((item): item is string => Boolean(item)),
      person: collaborator,
      confidence: 0.82,
    });
  }

  const focusWindowMatches = Array.from(
    trimmed.matchAll(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/gi)
  )
    .map((match) => `${match[1]}-${match[2]}`)
    .slice(0, 3);

  const profileIsSparse = !/## User Profile/i.test(attentionContext);
  const isOneTimeSchedule = /\b(tomorrow|next morning|starting tomorrow|starting next|tonight|this evening|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(trimmed);
  if (focusWindowMatches.length > 0 && profileIsSparse && !isOneTimeSchedule) {
    bootstrapped.push({
      type: "memory",
      title: "Preferred focus windows",
      content: `User prefers focus windows around ${focusWindowMatches.join(", ")}.`,
      dueAt: null,
      dueType: null,
      reminderAt: null,
      estimatedMinutes: null,
      executionStartAt: null,
      tags: ["focus-window", "planning"],
      person: null,
      confidence: 0.86,
    });
  }

  return bootstrapped.slice(0, 2);
}

function inferProfileFollowUpQuestion(
  userContent: string,
  attentionContext: string,
  extractions: RawExtraction[]
): string | null {
  const hasProfileSection = /## User Profile/i.test(attentionContext);
  const profileLength = attentionContext.match(/## User Profile\s+([\s\S]*?)(?:\n##|$)/i)?.[1]?.trim().length ?? 0;
  const sparseProfile = !hasProfileSection || profileLength < 80;
  const substantialInput = userContent.trim().split(/\s+/).length >= 16;
  const hasTaskLikeExtraction = extractions.some((item) => item.type === "task" || item.type === "reminder");
  const hasMemoryExtraction = extractions.some((item) => item.type === "memory");

  if (sparseProfile && substantialInput && hasTaskLikeExtraction && !hasMemoryExtraction) {
    return "Alongside these plans, which project is your main priority this period?";
  }

  if (!sparseProfile && substantialInput && (hashSignal(userContent) % 9 === 0)) {
    return "Quick one: what hours do you usually do your best focused work?";
  }

  return null;
}

function hashSignal(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
}

function normalizeSuggestedActions(
  prompts: unknown,
  reply: string,
  userContent: string,
  attentionContext: string
): SuggestedAction[] {
  const contextSignal = `${reply} ${userContent} ${attentionContext}`.toLowerCase();
  const parsedPrompts = parseSuggestedActions(prompts)
    .map((prompt) => prompt.text.trim())
    .filter((text) => text.length >= 16);

  const questionCandidate = parsedPrompts.find((text) => /\?/.test(text));

  const focusWindow = inferFocusWindowLabel(contextSignal);
  const hasOverdueContext = /\b(overdue|behind|late|missed|slipped|past due)\b/.test(contextSignal);

  const fallbackQuestion = "Can you give me a quick view of my current commitments and biggest pain points right now?";

  const hasTaskUpdateSignal = /\b(update|reschedule|postpone|move|change|deadline|due|task update|edit task)\b/.test(
    contextSignal
  );
  const hasTaskCreationSignal = /\b(add task|new task|todo|to-do|need to|i should|i have to|remind me)\b/.test(
    contextSignal
  );

  const planningStarter = hasTaskUpdateSignal
    ? "I need to update this task: ... Help me turn that into a clear task update proposal."
    : hasTaskCreationSignal
    ? "I want to add this as a new task: ... Can you suggest a title, duration, and due date?"
    : `I am planning to ... ${focusWindow}. Help me expand this into realistic first steps.`;

  const riskStarter = hasOverdueContext
    ? "I already have overdue tasks around ... Help me triage what to do now, defer, or renegotiate."
    : "I might be late on ... Help me prevent delay and set a recovery plan before it becomes overdue.";

  return [
    { text: questionCandidate ?? fallbackQuestion, kind: "question" },
    { text: planningStarter, kind: "action" },
    { text: riskStarter, kind: "action" },
  ];
}

function inferFocusWindowLabel(contextSignal: string): string {
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

