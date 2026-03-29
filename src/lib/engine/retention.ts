import { prisma } from "@/lib/prisma";

const MAX_ACTIVE_MESSAGES = 100;

export async function enforceRetentionPolicy(): Promise<{ expired: number }> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const totalActive = await prisma.message.count({ where: { expired: false } });

  if (totalActive <= MAX_ACTIVE_MESSAGES) {
    return { expired: 0 };
  }

  const excess = totalActive - MAX_ACTIVE_MESSAGES;

  // Only expire messages from before today — today's messages are always exempt
  const candidates = await prisma.message.findMany({
    where: { expired: false, createdAt: { lt: startOfToday } },
    orderBy: { createdAt: "asc" },
    take: excess,
  });

  if (candidates.length === 0) {
    return { expired: 0 };
  }

  await prisma.message.updateMany({
    where: { id: { in: candidates.map((m) => m.id) } },
    data: { expired: true },
  });

  return { expired: candidates.length };
}
