import { PrismaClient } from "@prisma/client";
import { parseStoredTags } from "@/lib/tags";

interface AttentionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

interface AttentionInput {
  recentEntries: { content: string; tags: string[] | string; pinned: boolean; createdAt: Date }[];
  pinnedEntries: { content: string; tags: string[] | string }[];
  activeTasks: { title: string; status?: string; dueAt: Date | null; dueType: string | null; tags: string[] | string }[];
  recentSummaries: { summary: string; periodEnd: Date }[];
  recentMessages: AttentionMessage[];
  currentDate: Date;
  profile?: string;
  knowledgeContext?: string;
  includeRecentMessages?: boolean;
}

function parseTags(tags: string[] | string): string[] {
  return parseStoredTags(tags);
}

function truncateContent(content: string, maxLength = 220): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

function formatAttentionContext(input: AttentionInput): string {
  const stableParts: string[] = [];
  const volatileParts: string[] = [];

  if (input.profile) {
    stableParts.push(`## User Profile\n${input.profile.slice(0, 500)}`);
  }

  if (input.pinnedEntries.length > 0) {
    stableParts.push(
      `## Pinned Memories\n${input.pinnedEntries
        .map((e) => `- ${e.content} [${parseTags(e.tags).join(", ")}]`)
        .join("\n")}`
    );
  }

  if (input.activeTasks.length > 0) {
    stableParts.push(
      `## Active Tasks\n${input.activeTasks
        .map(
          (t) =>
            `- [${t.status ?? "active"}] ${t.title}${t.dueAt ? ` (due: ${t.dueAt.toISOString().split("T")[0]})` : ""} [${parseTags(t.tags).join(", ")}]`
        )
        .join("\n")}`
    );
  }

  if (input.recentSummaries.length > 0) {
    stableParts.push(
      `## Recent Session Summaries\n${input.recentSummaries
        .map((s) => `- [${s.periodEnd.toISOString().split("T")[0]}] ${s.summary}`)
        .join("\n")}`
    );
  }

  if (input.recentEntries.length > 0) {
    stableParts.push(
      `## Recent Memories (last 14 days)\n${input.recentEntries
        .map((e) => `- ${truncateContent(e.content, 150)} [${parseTags(e.tags).join(", ")}]`)
        .join("\n")}`
    );
  }

  if (input.knowledgeContext) {
    volatileParts.push(`## Knowledge Context\n${input.knowledgeContext}`);
  }

  if (input.includeRecentMessages !== false && input.recentMessages.length > 0) {
    volatileParts.push(
      `## Latest Conversation\n${input.recentMessages
        .map((message) => `- [${message.role}] ${truncateContent(message.content)}`)
        .join("\n")}`
    );
  }

  return [...stableParts, ...volatileParts].join("\n\n");
}

export async function getRecentConversationHistory(
  prisma: PrismaClient,
  limit = 10
): Promise<AttentionMessage[]> {
  const messages = await prisma.message.findMany({
    where: { expired: false },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse().map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

export async function buildAttentionWindow(
  prisma: PrismaClient,
  recentMessages?: AttentionMessage[],
  options?: { profile?: string; knowledgeContext?: string; includeRecentMessages?: boolean }
): Promise<string> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const includeRecentMessages = options?.includeRecentMessages !== false;

  const [recentEntries, pinnedEntries, activeTasks, recentSummaries, latestConversation] = await Promise.all([
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
      where: {
        status: "active",
        OR: [{ dueAt: null }, { dueAt: { lte: sevenDaysFromNow } }],
      },
      orderBy: { dueAt: "asc" },
      take: 15,
    }),
    prisma.conversationSummary.findMany({
      orderBy: { periodEnd: "desc" },
      take: 2,
    }),
    includeRecentMessages
      ? recentMessages
        ? Promise.resolve(recentMessages)
        : getRecentConversationHistory(prisma)
      : Promise.resolve([] as AttentionMessage[]),
  ]);

  return formatAttentionContext({
    recentEntries,
    pinnedEntries,
    activeTasks,
    recentSummaries,
    recentMessages: latestConversation,
    currentDate: now,
    profile: options?.profile,
    knowledgeContext: options?.knowledgeContext,
    includeRecentMessages,
  });
}
