import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/deepseek";
import { SUMMARY_SYSTEM_PROMPT, SUMMARY_USER_PROMPT } from "@/lib/ai/prompts";

export async function runSummarizationJob(): Promise<{
  summary: {
    id: string;
    summary: string;
    periodStart: Date;
    periodEnd: Date;
    tags: string[];
    createdAt: Date;
  };
  entriesCreated: number;
  messagesProcessed: number;
}> {
  const lastSummary = await prisma.conversationSummary.findFirst({
    orderBy: { periodEnd: "desc" },
  });

  const periodStart = lastSummary?.periodEnd ?? new Date(0);
  const periodEnd = new Date();

  // Fetch all non-expired messages in period
  const messages = await prisma.message.findMany({
    where: {
      expired: false,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { createdAt: "asc" },
  });

  if (messages.length === 0) {
    throw new Error("No messages to summarize");
  }

  // Get recent summaries for continuity
  const recentSummaries = await prisma.conversationSummary.findMany({
    orderBy: { periodEnd: "desc" },
    take: 2,
  });

  const previousSummariesText = recentSummaries
    .map((s) => `[${s.periodEnd.toISOString().split("T")[0]}] ${s.summary}`)
    .join("\n");

  const messagesText = messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n");

  const raw = await chat(SUMMARY_SYSTEM_PROMPT, [
    {
      role: "user",
      content: SUMMARY_USER_PROMPT(previousSummariesText, messagesText),
    },
  ]);

  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let parsed: {
    summary?: string;
    tags?: string[];
    extractedEntries?: { content: string; tags: string[] }[];
  };
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch {
    parsed = { summary: raw, tags: [], extractedEntries: [] };
  }

  // Save summary
  const savedSummary = await prisma.conversationSummary.create({
    data: {
      summary: parsed.summary || "Session summarized.",
      periodStart,
      periodEnd,
      tags: parsed.tags || [],
    },
  });

  // Save extracted entries
  const entries = parsed.extractedEntries || [];
  await prisma.entry.createMany({
    data: entries.map((e) => ({
      content: e.content,
      source: "summary" as const,
      tags: e.tags || [],
    })),
  });

  // Mark messages as expired
  await prisma.message.updateMany({
    where: { id: { in: messages.map((m) => m.id) } },
    data: { expired: true },
  });

  // Log credits
  await prisma.creditLedger.create({
    data: { eventType: "summary", credits: 5 },
  });

  return {
    summary: savedSummary,
    entriesCreated: entries.length,
    messagesProcessed: messages.length,
  };
}
