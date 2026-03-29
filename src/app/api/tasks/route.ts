import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const due = searchParams.get("due");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await prisma.task.findMany({
      where: {
        ...(status ? { status: status as "proposed" | "active" | "done" | "cancelled" } : {}),
        ...(due === "today"
          ? { dueAt: { gte: today, lt: tomorrow } }
          : {}),
      },
      orderBy: { dueAt: "asc" },
      include: { person: true, project: true },
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[tasks] error:", err);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action } = body as { id: string; action: "complete" | "snooze" | "cancel" };

    const task = await prisma.task.update({
      where: { id },
      data:
        action === "complete"
          ? { status: "done", completedAt: new Date() }
          : action === "cancel"
          ? { status: "cancelled" }
          : { dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, // snooze 1 day
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[tasks patch] error:", err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
