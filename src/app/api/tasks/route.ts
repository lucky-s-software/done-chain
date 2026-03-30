import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasTaskField } from "@/lib/taskFields";
import { normalizeTags, parseStoredTags } from "@/lib/tags";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const due = searchParams.get("due");
    const allowedStatuses = new Set(["proposed", "active", "done", "cancelled"] as const);
    const statusFilters = (status ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is "proposed" | "active" | "done" | "cancelled" =>
        allowedStatuses.has(item as "proposed" | "active" | "done" | "cancelled")
      );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const taskOrderBy = hasTaskField("executionStartAt")
      ? [{ executionStartAt: "asc" as const }, { dueAt: "asc" as const }]
      : [{ dueAt: "asc" as const }];

    const tasks = await prisma.task.findMany({
      where: {
        ...(statusFilters.length === 1 ? { status: statusFilters[0] } : {}),
        ...(statusFilters.length > 1 ? { status: { in: statusFilters } } : {}),
        ...(due === "today"
          ? { OR: [{ dueAt: { gte: today, lt: tomorrow } }, { dueAt: null }] }
          : {}),
      },
      orderBy: taskOrderBy,
      include: { person: true, project: true },
    });

    const parsedTasks = tasks.map((task) => ({ ...task, tags: parseStoredTags(task.tags) }));
    return NextResponse.json({ tasks: parsedTasks });
  } catch (err) {
    console.error("[tasks] error:", err);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      action,
      edits,
      title,
      dueAt,
      estimatedMinutes,
      executionStartAt,
      tags,
      postponeTo,
    } = body as {
      id: string;
      action?: "complete" | "postpone" | "snooze" | "cancel";
      edits?: {
        title?: string;
        dueAt?: string | null;
        estimatedMinutes?: number | null;
        executionStartAt?: string | null;
        tags?: string[];
      };
      title?: string;
      dueAt?: string | null;
      estimatedMinutes?: number | null;
      executionStartAt?: string | null;
      tags?: string[];
      postponeTo?: string | null;
    };

    const normalizedEdits = edits ?? { title, dueAt, estimatedMinutes, executionStartAt, tags };
    const updateData: Record<string, unknown> = {};

    if (action === "complete") {
      updateData.status = "done";
      updateData.completedAt = new Date();
    } else if (action === "cancel") {
      updateData.status = "cancelled";
    } else if (action === "snooze" || action === "postpone") {
      updateData.dueAt = postponeTo
        ? new Date(postponeTo)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    if (normalizedEdits.title !== undefined) {
      const nextTitle = normalizedEdits.title.trim();
      if (!nextTitle) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      updateData.title = nextTitle;
    }

    if (normalizedEdits.dueAt !== undefined) {
      updateData.dueAt = normalizedEdits.dueAt ? new Date(normalizedEdits.dueAt) : null;
    }

    if (normalizedEdits.executionStartAt !== undefined && hasTaskField("executionStartAt")) {
      updateData.executionStartAt = normalizedEdits.executionStartAt
        ? new Date(normalizedEdits.executionStartAt)
        : null;
    }

    if (normalizedEdits.estimatedMinutes !== undefined && hasTaskField("estimatedMinutes")) {
      updateData.estimatedMinutes =
        typeof normalizedEdits.estimatedMinutes === "number" && normalizedEdits.estimatedMinutes > 0
          ? Math.max(1, Math.round(normalizedEdits.estimatedMinutes))
          : null;
    }

    if (normalizedEdits.tags !== undefined) {
      const normalized = normalizeTags(normalizedEdits.tags);
      updateData.tags = JSON.stringify(normalized);
      for (const tag of normalized) {
        await prisma.tag.upsert({
          where: { name: tag },
          update: {},
          create: { name: tag },
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[tasks patch] error:", err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "Task id is required" }, { status: 400 });
    }

    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tasks delete] error:", err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
