import { prisma } from "@/lib/prisma";

export interface KnowledgeMeta {
  slug: string;
  title: string;
  description: string;
}

let cachedIndex: KnowledgeMeta[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getKnowledgeIndex(): Promise<KnowledgeMeta[]> {
  const now = Date.now();
  if (cachedIndex && now < cacheExpiresAt) {
    return cachedIndex;
  }

  const entries = await prisma.knowledgeBase.findMany({
    where: { active: true },
    select: { slug: true, title: true, description: true },
    orderBy: { priority: "desc" },
  });

  cachedIndex = entries;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return entries;
}

export function invalidateKnowledgeCache() {
  cachedIndex = null;
  cacheExpiresAt = 0;
}

export async function getKnowledgeContent(slugs: string[]): Promise<{ slug: string; title: string; content: string }[]> {
  if (slugs.length === 0) return [];

  const entries = await prisma.knowledgeBase.findMany({
    where: { slug: { in: slugs }, active: true },
    select: { slug: true, title: true, content: true },
  });

  return entries;
}
