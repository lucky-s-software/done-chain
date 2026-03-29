import { prisma } from "@/lib/prisma";

// Evaluates and records the daily closure for a given date.
// Called at end of day (or at first access of the next day).
export async function evaluateDailyClosure(date: Date): Promise<void> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const dueTasks = await prisma.task.findMany({
    where: {
      dueAt: { gte: startOfDay, lte: endOfDay },
      status: { in: ["active", "done", "cancelled"] },
    },
  });

  const dueCount = dueTasks.length;
  const completedCount = dueTasks.filter((t) => t.status === "done").length;
  const cancelledCount = dueTasks.filter((t) => t.status === "cancelled").length;
  const missedCount = dueCount - completedCount - cancelledCount;
  const snoozedCount = 0; // MVP: no snooze yet

  let closureStatus: "clean" | "partial" | "missed";
  if (dueCount === 0 || completedCount === dueCount) {
    closureStatus = "clean";
  } else if (completedCount > 0) {
    closureStatus = "partial";
  } else {
    closureStatus = "missed";
  }

  // Calculate chain day (streak)
  const previousClosure = await prisma.dailyClosure.findFirst({
    orderBy: { date: "desc" },
    where: { date: { lt: startOfDay } },
  });

  const chainDay =
    previousClosure && previousClosure.closureStatus !== "missed"
      ? previousClosure.chainDay + 1
      : 0;

  // Upsert closure for this date
  await prisma.dailyClosure.upsert({
    where: { date: startOfDay },
    update: {
      dueCount,
      completedCount,
      snoozedCount,
      missedCount,
      closureStatus,
      chainDay,
    },
    create: {
      date: startOfDay,
      dueCount,
      completedCount,
      snoozedCount,
      missedCount,
      closureStatus,
      chainDay,
    },
  });
}

// Get the current streak (chain) info
export async function getStreakInfo(): Promise<{
  chainDay: number;
  todayStatus: "clean" | "partial" | "missed" | "pending";
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayClosure = await prisma.dailyClosure.findUnique({
    where: { date: today },
  });

  const lastClosure = await prisma.dailyClosure.findFirst({
    orderBy: { date: "desc" },
  });

  return {
    chainDay: todayClosure?.chainDay ?? lastClosure?.chainDay ?? 0,
    todayStatus: todayClosure
      ? (todayClosure.closureStatus as "clean" | "partial" | "missed")
      : "pending",
  };
}
