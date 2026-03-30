import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasTaskField } from "@/lib/taskFields";
import { normalizeTags } from "@/lib/tags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, edits } = body as {
      action: "approve" | "reject" | "dismiss";
      edits?: {
        title?: string;
        tags?: string[];
        estimatedMinutes?: number | null;
        executionStartAt?: string | null;
        personId?: string | null;
        projectId?: string | null;
      };
    };

    const card = await prisma.actionCard.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    let createdTask = null;

    if (action === "approve") {
      if (card.cardType === "proposed_task") {
        const payload = card.payload as {
          taskId: string;
          proposalMode?: "create" | "update";
          proposedEdits?: {
            title?: string;
            tags?: string[];
            estimatedMinutes?: number | null;
            executionStartAt?: string | null;
            personId?: string | null;
            projectId?: string | null;
          };
          title?: string;
          dueAt?: string;
          tags?: string[];
        };
        const proposalMode = payload.proposalMode === "update" ? "update" : "create";
        const mergedEdits = proposalMode === "update"
          ? { ...(payload.proposedEdits ?? {}), ...(edits ?? {}) }
          : edits;
        const normalizedTags = mergedEdits?.tags ? normalizeTags(mergedEdits.tags) : undefined;

        // For updates, check if the target task is still proposed — if so, activate it
        let shouldActivate = proposalMode === "create";
        if (proposalMode === "update") {
          const targetTask = await prisma.task.findUnique({
            where: { id: payload.taskId },
            select: { status: true },
          });
          if (targetTask?.status === "proposed") {
            shouldActivate = true;
          }
        }

        const updateData: Record<string, unknown> = {
          ...(shouldActivate
            ? { status: "active", approvalState: "approved" }
            : {}),
          ...(mergedEdits?.title ? { title: mergedEdits.title } : {}),
          ...(mergedEdits?.executionStartAt !== undefined && hasTaskField("executionStartAt")
            ? {
                executionStartAt: mergedEdits.executionStartAt
                  ? new Date(mergedEdits.executionStartAt)
                  : null,
              }
            : {}),
          ...(mergedEdits?.estimatedMinutes !== undefined && hasTaskField("estimatedMinutes")
            ? {
                estimatedMinutes:
                  typeof mergedEdits.estimatedMinutes === "number" && mergedEdits.estimatedMinutes > 0
                    ? Math.max(1, Math.round(mergedEdits.estimatedMinutes))
                    : null,
              }
            : {}),
          ...(normalizedTags !== undefined
            ? { tags: JSON.stringify(normalizedTags) }
            : {}),
          ...(mergedEdits?.personId !== undefined
            ? { personId: mergedEdits.personId }
            : {}),
          ...(mergedEdits?.projectId !== undefined
            ? { projectId: mergedEdits.projectId }
            : {}),
        };

        createdTask = await prisma.task.update({
          where: { id: payload.taskId },
          data: updateData,
        });

        if (normalizedTags) {
          for (const tag of normalizedTags) {
            await prisma.tag.upsert({
              where: { name: tag },
              update: {},
              create: { name: tag },
            });
          }
        }

        // Log credit
        await prisma.creditLedger.create({
          data: { eventType: "parse", credits: 1 },
        });
      } else if (card.cardType === "proposed_memory") {
        const payload = card.payload as { entryId: string };
        await prisma.entry.update({
          where: { id: payload.entryId },
          data: { reviewed: true },
        });
      }
    } else if (action === "reject" && card.cardType === "proposed_task") {
      const payload = card.payload as { taskId: string; proposalMode?: "create" | "update" };
      const proposalMode = payload.proposalMode === "update" ? "update" : "create";
      if (proposalMode === "create") {
        await prisma.task.update({
          where: { id: payload.taskId },
          data: { status: "cancelled", approvalState: "rejected" },
        });
      }
    }

    // Update card status
    const updatedCard = await prisma.actionCard.update({
      where: { id },
      data: {
        status:
          action === "approve"
            ? "approved"
            : action === "reject"
            ? "rejected"
            : "dismissed",
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({ card: updatedCard, createdTask });
  } catch (err) {
    console.error("[cards] error:", err);
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}
