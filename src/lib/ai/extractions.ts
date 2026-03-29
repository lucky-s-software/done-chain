import { PrismaClient } from "@prisma/client";
import type { NormalizedExtraction } from "@/types";

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

interface ResolvedContext {
  tags: string[];
  personId: string | null;
  projectId: string | null;
}

interface PersistedExtractionResult {
  taskId?: string;
  entryId?: string;
  createdMemory: boolean;
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

  return Array.from(new Set([...baseTags, ...hashtagTags, ...knownNames]))
    .filter((tag) => tag.length >= 2 && !TAG_STOPWORDS.has(tag))
    .slice(0, 5);
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
                ...(JSON.parse(typeof similar.tags === "string" ? similar.tags : "[]") as string[]),
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

  const task = await prisma.task.create({
    data: {
      title: extraction.title,
      status: "proposed",
      approvalState: "pending",
      dueAt: extraction.dueAt,
      dueType: extraction.dueType,
      reminderAt: extraction.reminderAt,
      estimatedMinutes: extraction.estimatedMinutes,
      executionStartAt: extraction.executionStartAt,
      tags: JSON.stringify(context.tags),
      personId: context.personId,
      projectId: context.projectId,
    },
  });

  return { taskId: task.id, createdMemory: false };
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
