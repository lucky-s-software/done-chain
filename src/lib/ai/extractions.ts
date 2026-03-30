import { PrismaClient } from "@prisma/client";
import type { DueType, NormalizedExtraction } from "@/types";
import { hasTaskField } from "@/lib/taskFields";
import { normalizeTags, parseStoredTags } from "@/lib/tags";

const PROJECT_SUFFIXES = [
  "app",
  "api",
  "sdk",
  "cloud",
  "studio",
  "labs",
  "inc",
  "llc",
  "corp",
  "ai",
];

const KNOWN_MULTI_WORD_NAMES = [
  "donechain",
  "github",
  "notion",
  "figma",
  "slack",
  "linear",
  "vercel",
  "supabase",
  "firebase",
  "openai",
  "deepseek",
  "apple",
  "google",
  "microsoft",
  "amazon",
  "netflix",
  "spotify",
  "airbnb",
  "stripe",
];

const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

const TAG_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "bir",
  "ve",
  "ile",
  "icin",
  "için",
  "gibi",
  "daha",
  "gore",
  "göre",
]);

const TASK_TITLE_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "to",
  "for",
  "and",
  "of",
  "on",
  "at",
  "in",
  "bir",
  "ve",
  "ile",
  "icin",
  "için",
  "bu",
  "su",
  "şu",
]);

const ADDITIONAL_INSTANCE_PATTERN =
  /\b(another|one more|again|additional|extra|second|third|new session|separate session|repeat|bir daha|tekrar|ek seans|ayri seans|ayrı seans|ikinci seans)\b/i;

interface ResolvedContext {
  tags: string[];
  personId: string | null;
  projectId: string | null;
}

interface ExistingTaskSnapshot {
  id: string;
  title: string;
  dueAt: Date | null;
  dueType: DueType | null;
  reminderAt: Date | null;
  estimatedMinutes: number | null;
  executionStartAt: Date | null;
  tags: string[];
  person: string | null;
  projectId: string | null;
  personId: string | null;
}

interface ProposedTaskEdits {
  title?: string;
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
  executionStartAt?: Date | null;
  tags?: string[];
  personId?: string | null;
  projectId?: string | null;
}

interface PersistedExtractionResult {
  taskId?: string;
  entryId?: string;
  createdMemory: boolean;
  taskDisposition?: "created" | "updated_existing" | "duplicate_existing";
  existingTask?: ExistingTaskSnapshot;
  proposedTaskEdits?: ProposedTaskEdits;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function transliterateToAscii(value: string): string {
  const mapped = Array.from(value)
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join("");

  return mapped.normalize("NFKD").replace(/\p{M}+/gu, "");
}

function toTagSlug(value: string): string {
  return transliterateToAscii(normalizeWhitespace(value))
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+.#\-/\s]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTaskTitleForMatch(value: string): string {
  const normalized = transliterateToAscii(normalizeWhitespace(value))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !TASK_TITLE_STOPWORDS.has(token))
    .join(" ");
}

function tokenSet(value: string): Set<string> {
  if (!value) return new Set();
  return new Set(value.split(" ").filter(Boolean));
}

function scoreTitleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const minLength = Math.min(a.length, b.length);
    return minLength >= 10 ? 0.92 : 0.75;
  }

  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  const unionSize = aTokens.size + bTokens.size - overlap;
  if (unionSize <= 0) return 0;

  return overlap / unionSize;
}

function withinMinutes(a: Date | null, b: Date | null, minutes: number): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff <= minutes * 60 * 1000;
}

function shouldAllowAdditionalInstance(extraction: NormalizedExtraction): boolean {
  const signal = `${extraction.title} ${extraction.content}`;
  return ADDITIONAL_INSTANCE_PATTERN.test(signal);
}

function extractNamedEntities(content: string): string[] {
  const matches = new Set<string>();
  const multiWordRegex = /\b([\p{Lu}][\p{L}\p{N}]+(?:[ .&/_-][\p{Lu}][\p{L}\p{N}]+)+)\b/gu;

  for (const match of content.matchAll(multiWordRegex)) {
    matches.add(normalizeWhitespace(match[1]));
  }

  const tokenRegex = /\b([\p{Lu}][\p{L}\p{N}]+(?:[.#+-][\p{L}\p{N}]+)*)\b/gu;
  for (const match of content.matchAll(tokenRegex)) {
    const token = normalizeWhitespace(match[1]);
    if (token.length > 2) {
      matches.add(token);
    }
  }

  return Array.from(matches);
}

function extractHashtags(content: string): string[] {
  const matches = new Set<string>();
  const hashtagRegex = /#([\p{L}\p{N}][\p{L}\p{N}._+-]*)/gu;

  for (const match of content.matchAll(hashtagRegex)) {
    matches.add(match[1]);
  }

  return Array.from(matches);
}

export function buildNormalizedTags(
  extraction: Pick<NormalizedExtraction, "title" | "content" | "tags">
): string[] {
  const baseTags = extraction.tags.map(toTagSlug).filter(Boolean);
  const hashtagTags = extractHashtags(`${extraction.title} ${extraction.content}`)
    .map(toTagSlug)
    .filter(Boolean);
  const knownNames = KNOWN_MULTI_WORD_NAMES
    .filter((name) =>
      toTagSlug(`${extraction.title} ${extraction.content}`).includes(toTagSlug(name))
    )
    .map(toTagSlug);

  const candidates = Array.from(new Set([...baseTags, ...hashtagTags, ...knownNames]))
    .filter((tag) => tag.length >= 2 && !TAG_STOPWORDS.has(tag))
    .slice(0, 5);

  return normalizeTags(candidates);
}

function detectProjectName(extraction: Pick<NormalizedExtraction, "title" | "content" | "tags">): string | null {
  const combined = `${extraction.title} ${extraction.content}`;
  const candidates = extractNamedEntities(combined);
  const normalizedCombined = toTagSlug(combined);

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (
      KNOWN_MULTI_WORD_NAMES.includes(lower) ||
      PROJECT_SUFFIXES.some((suffix) => lower.endsWith(suffix))
    ) {
      return candidate;
    }
  }

  const knownName = KNOWN_MULTI_WORD_NAMES.find((name) => normalizedCombined.includes(toTagSlug(name)));
  if (knownName) {
    return knownName;
  }

  for (const tag of extraction.tags) {
    if (/[\p{Lu}]/u.test(tag) || PROJECT_SUFFIXES.some((suffix) => toTagSlug(tag).endsWith(suffix))) {
      return normalizeWhitespace(tag);
    }
  }

  return null;
}

function buildMemoryFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)(day)?s?\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveContext(
  prisma: PrismaClient,
  extraction: NormalizedExtraction
): Promise<ResolvedContext> {
  const tags = buildNormalizedTags(extraction);

  let personId: string | null = null;
  if (extraction.person) {
    const person = await prisma.person.upsert({
      where: { name: extraction.person },
      update: {},
      create: { name: extraction.person },
    });
    personId = person.id;
  }

  let projectId: string | null = null;
  const projectName = detectProjectName(extraction);
  if (projectName) {
    const existingProject = await prisma.project.findFirst({
      where: { name: projectName },
    });
    const project =
      existingProject ??
      (await prisma.project.create({
        data: { name: projectName },
      }));
    projectId = project.id;
  }

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { name: tag },
      update: {},
      create: { name: tag },
    });
  }

  return { tags, personId, projectId };
}

async function findSimilarMemory(
  prisma: PrismaClient,
  extraction: NormalizedExtraction
) {
  const recentEntries = await prisma.entry.findMany({
    where: {
      source: { in: ["ai_extracted", "summary"] },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const fingerprint = buildMemoryFingerprint(extraction.content);
  return (
    recentEntries.find((entry) => {
      const existingFingerprint = buildMemoryFingerprint(entry.content);
      return (
        existingFingerprint.length > 0 &&
        (existingFingerprint.includes(fingerprint) || fingerprint.includes(existingFingerprint))
      );
    }) ?? null
  );
}

function buildExistingTaskSnapshot(task: {
  id: string;
  title: string;
  dueAt: Date | null;
  dueType: DueType | null;
  reminderAt: Date | null;
  estimatedMinutes: number | null;
  executionStartAt: Date | null;
  tags: string[] | string;
  personId: string | null;
  projectId: string | null;
  person: { name: string } | null;
}): ExistingTaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    dueType: task.dueType,
    reminderAt: task.reminderAt,
    estimatedMinutes: task.estimatedMinutes,
    executionStartAt: task.executionStartAt,
    tags: parseStoredTags(task.tags),
    person: task.person?.name ?? null,
    personId: task.personId,
    projectId: task.projectId,
  };
}

function isLikelySameOpenTask(
  existing: ExistingTaskSnapshot,
  extraction: NormalizedExtraction,
  context: ResolvedContext
): boolean {
  if (context.personId && existing.personId && context.personId !== existing.personId) {
    return false;
  }

  if (context.projectId && existing.projectId && context.projectId !== existing.projectId) {
    return false;
  }

  const existingTitle = normalizeTaskTitleForMatch(existing.title);
  const incomingTitle = normalizeTaskTitleForMatch(extraction.title);
  const similarity = scoreTitleSimilarity(existingTitle, incomingTitle);

  if (similarity < 0.82) {
    return false;
  }

  if (!existing.dueAt || !extraction.dueAt) {
    return true;
  }

  const dayDistance = Math.abs(existing.dueAt.getTime() - extraction.dueAt.getTime());
  return dayDistance <= 36 * 60 * 60 * 1000;
}

function buildTaskUpdateEdits(
  existing: ExistingTaskSnapshot,
  extraction: NormalizedExtraction,
  context: ResolvedContext
): ProposedTaskEdits | null {
  const edits: ProposedTaskEdits = {};

  const trimmedIncomingTitle = normalizeWhitespace(extraction.title);
  if (
    trimmedIncomingTitle &&
    trimmedIncomingTitle.toLowerCase() !== existing.title.trim().toLowerCase()
  ) {
    edits.title = trimmedIncomingTitle;
  }

  if (extraction.dueAt && !withinMinutes(existing.dueAt, extraction.dueAt, 1)) {
    edits.dueAt = extraction.dueAt;
  }

  if (
    hasTaskField("executionStartAt") &&
    extraction.executionStartAt &&
    !withinMinutes(existing.executionStartAt, extraction.executionStartAt, 1)
  ) {
    edits.executionStartAt = extraction.executionStartAt;
  }

  if (
    hasTaskField("estimatedMinutes") &&
    typeof extraction.estimatedMinutes === "number" &&
    extraction.estimatedMinutes > 0 &&
    extraction.estimatedMinutes !== existing.estimatedMinutes
  ) {
    edits.estimatedMinutes = extraction.estimatedMinutes;
  }

  const mergedTags = Array.from(new Set([...existing.tags, ...context.tags]));
  if (mergedTags.join("|") !== existing.tags.join("|")) {
    edits.tags = mergedTags;
  }

  if (context.personId && !existing.personId) {
    edits.personId = context.personId;
  }

  if (context.projectId && !existing.projectId) {
    edits.projectId = context.projectId;
  }

  return Object.keys(edits).length > 0 ? edits : null;
}

async function findMatchingOpenTask(
  prisma: PrismaClient,
  extraction: NormalizedExtraction,
  context: ResolvedContext
): Promise<ExistingTaskSnapshot | null> {
  if (shouldAllowAdditionalInstance(extraction)) {
    return null;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = await prisma.task.findMany({
    where: {
      OR: [
        { status: "active" },
        { status: "proposed", createdAt: { gte: oneDayAgo } },
      ],
    },
    include: { person: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  for (const candidate of candidates) {
    const snapshot = buildExistingTaskSnapshot(candidate);
    if (isLikelySameOpenTask(snapshot, extraction, context)) {
      return snapshot;
    }
  }

  return null;
}

export async function persistExtraction(
  prisma: PrismaClient,
  extraction: NormalizedExtraction,
  sourceMessageId?: string,
  source: "ai_extracted" | "summary" = "ai_extracted"
): Promise<PersistedExtractionResult> {
  const context = await resolveContext(prisma, extraction);

  if (extraction.type === "memory") {
    const similar = await findSimilarMemory(prisma, extraction);
    if (similar) {
      await prisma.entry.update({
        where: { id: similar.id },
        data: {
          tags: JSON.stringify(
            Array.from(
              new Set([
                ...parseStoredTags(similar.tags),
                ...context.tags,
              ])
            )
          ),
          reviewed: false,
          ...(context.personId ? { personId: context.personId } : {}),
          ...(context.projectId ? { projectId: context.projectId } : {}),
        },
      });

      return { entryId: similar.id, createdMemory: false };
    }

    const entry = await prisma.entry.create({
      data: {
        content: extraction.content,
        source,
        tags: JSON.stringify(context.tags),
        ...(sourceMessageId ? { sourceMessageId } : {}),
        personId: context.personId,
        projectId: context.projectId,
        reviewed: false,
      },
    });

    return { entryId: entry.id, createdMemory: true };
  }

  const matchingOpenTask = await findMatchingOpenTask(prisma, extraction, context);
  if (matchingOpenTask) {
    const proposedTaskEdits = buildTaskUpdateEdits(matchingOpenTask, extraction, context);
    if (!proposedTaskEdits) {
      return {
        taskId: matchingOpenTask.id,
        createdMemory: false,
        taskDisposition: "duplicate_existing",
        existingTask: matchingOpenTask,
      };
    }

    return {
      taskId: matchingOpenTask.id,
      createdMemory: false,
      taskDisposition: "updated_existing",
      existingTask: matchingOpenTask,
      proposedTaskEdits,
    };
  }

  const task = await prisma.task.create({
    data: {
      title: extraction.title,
      status: "proposed",
      approvalState: "pending",
      dueAt: extraction.dueAt,
      dueType: extraction.dueType,
      reminderAt: extraction.reminderAt,
      ...(hasTaskField("estimatedMinutes")
        ? { estimatedMinutes: extraction.estimatedMinutes }
        : {}),
      ...(hasTaskField("executionStartAt")
        ? { executionStartAt: extraction.executionStartAt }
        : {}),
      tags: JSON.stringify(context.tags),
      personId: context.personId,
      projectId: context.projectId,
    },
  });

  return {
    taskId: task.id,
    createdMemory: false,
    taskDisposition: "created",
  };
}

export async function persistSummaryEntry(
  prisma: PrismaClient,
  entry: { content: string; tags?: string[] }
) {
  const normalized: NormalizedExtraction = {
    type: "memory",
    title: entry.content,
    content: entry.content,
    dueAt: null,
    dueType: null,
    reminderAt: null,
    estimatedMinutes: null,
    executionStartAt: null,
    tags: entry.tags ?? [],
    person: null,
    confidence: 0.8,
  };

  return persistExtraction(prisma, normalized, undefined, "summary");
}

export function summarizeUserAim(extractions: NormalizedExtraction[]): NormalizedExtraction[] {
  const groupedMemories = new Map<string, NormalizedExtraction>();
  const nonMemories: NormalizedExtraction[] = [];

  for (const extraction of extractions) {
    if (extraction.type !== "memory") {
      nonMemories.push(extraction);
      continue;
    }

    const key = buildMemoryFingerprint(extraction.content);
    const existing = groupedMemories.get(key);
    if (!existing) {
      groupedMemories.set(key, extraction);
      continue;
    }

    existing.tags = Array.from(new Set([...existing.tags, ...extraction.tags]));
    existing.confidence = Math.max(existing.confidence, extraction.confidence);
  }

  return [...groupedMemories.values(), ...nonMemories];
}

export function inferMemoryFromTasks(extractions: NormalizedExtraction[]): NormalizedExtraction[] {
  const memories = extractions.filter((item) => item.type === "memory");
  const taskLike = extractions.filter((item) => item.type !== "memory");

  const groupedByTag = new Map<string, NormalizedExtraction[]>();
  for (const extraction of taskLike) {
    const tags = buildNormalizedTags(extraction);
    if (tags.length === 0) {
      continue;
    }

    const primary = tags[0];
    const group = groupedByTag.get(primary) ?? [];
    group.push({ ...extraction, tags });
    groupedByTag.set(primary, group);
  }

  const inferredMemories: NormalizedExtraction[] = [];
  for (const [primaryTag, group] of groupedByTag) {
    if (group.length < 2) {
      continue;
    }

    const titles = group.map((item) => item.title.toLowerCase()).join(" ");
    if (!/\b(week|weekly|days?|plan|routine|habit)\b/.test(titles)) {
      continue;
    }

    inferredMemories.push({
      type: "memory",
      title: `Commitment around ${primaryTag}`,
      content: `User aims to stay consistent with ${primaryTag.replace(/-/g, " ")} as an ongoing routine or plan.`,
      dueAt: null,
      dueType: null,
      reminderAt: null,
      estimatedMinutes: null,
      executionStartAt: null,
      tags: Array.from(new Set(group.flatMap((item) => item.tags))),
      person: null,
      confidence: 0.72,
    });
  }

  return summarizeUserAim([...memories, ...inferredMemories, ...taskLike]);
}
