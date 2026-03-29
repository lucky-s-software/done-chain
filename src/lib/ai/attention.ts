import { PrismaClient } from "@prisma/client";

interface AttentionInput {
  recentEntries: { content: string; tags: string[]; pinned: boolean; createdAt: Date }[];
  pinnedEntries: { content: string; tags: string[] }[];
  activeTasks: { title: string; dueAt: Date | null; dueType: string | null; tags: string[] }[];
  recentSummaries: { summary: string; periodEnd: Date }[];
  currentDate: Date;
}

function formatAttentionContext(input: AttentionInput): string {
  const parts: string[] = [];

  parts.push(`## Current Date\n${input.currentDate.toISOString().split("T")[0]}`);

  if (input.pinnedEntries.length > 0) {
    parts.push(
      `## Pinned Memories\n${input.pinnedEntries
        .map((e) => `- ${e.content} [${e.tags.join(", ")}]`)
        .join("\n")}`
    );
  }

  if (input.activeTasks.length > 0) {
    parts.push(
      `## Active Tasks\n${input.activeTasks
        .map(
          (t) =>
            `- [${t.status ?? "active"}] ${t.title}${t.dueAt ? ` (due: ${t.dueAt.toISOString().split("T")[0]})` : ""} [${t.tags.join(", ")}]`
        )
        .join("\n")}`
    );
  }

  if (input.recentSummaries.length > 0) {
    parts.push(
      `## Recent Session Summaries\n${input.recentSummaries
        .map((s) => `- [${s.periodEnd.toISOString().split("T")[0]}] ${s.summary}`)
        .join("\n")}`
    );
  }

  if (input.recentEntries.length > 0) {
    parts.push(
      `## Recent Memories (last 14 days)\n${input.recentEntries
        .map((e) => `- ${e.content} [${e.tags.join(", ")}]`)
        .join("\n")}`
    );
  }

  return parts.join("\n\n");
}

export async function buildAttentionWindow(prisma: PrismaClient): Promise<string> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [recentEntries, pinnedEntries, activeTasks, recentSummaries] = await Promise.all([
    prisma.entry.findMany({
      where: { createdAt: { gte: fourteenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.entry.findMany({
      where: { pinned: true },
      take: 10,
    }),
    prisma.task.findMany({
      where: { status: "active" },
      orderBy: { dueAt: "asc" },
      take: 15,
    }),
    prisma.conversationSummary.findMany({
      orderBy: { periodEnd: "desc" },
      take: 3,
    }),
  ]);

  return formatAttentionContext({
    recentEntries,
    pinnedEntries,
    activeTasks,
    recentSummaries,
    currentDate: now,
  });
}
