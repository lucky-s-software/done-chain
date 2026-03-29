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
        dueAt?: string | null;
        tags?: string[];
        estimatedMinutes?: number | null;
        executionStartAt?: string | null;
      };
    };

    const card = await prisma.actionCard.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    let createdTask = null;

    if (action === "approve") {
      if (card.cardType === "proposed_task") {
        const normalizedTags = edits?.tags ? normalizeTags(edits.tags) : undefined;
        const payload = card.payload as {
          taskId: string;
          title?: string;
          dueAt?: string;
          tags?: string[];
        };

        // Update the proposed task to active
        createdTask = await prisma.task.update({
          where: { id: payload.taskId },
          data: {
            status: "active",
            approvalState: "approved",
            ...(edits?.title ? { title: edits.title } : {}),
            ...(edits?.dueAt !== undefined
              ? { dueAt: edits.dueAt ? new Date(edits.dueAt) : null }
              : {}),
            ...(edits?.executionStartAt !== undefined && hasTaskField("executionStartAt")
              ? {
                  executionStartAt: edits.executionStartAt
                    ? new Date(edits.executionStartAt)
                    : null,
                }
              : {}),
            ...(edits?.estimatedMinutes !== undefined && hasTaskField("estimatedMinutes")
              ? {
                  estimatedMinutes:
                    typeof edits.estimatedMinutes === "number" && edits.estimatedMinutes > 0
                      ? Math.max(1, Math.round(edits.estimatedMinutes))
                      : null,
                }
              : {}),
            ...(normalizedTags !== undefined
              ? { tags: JSON.stringify(normalizedTags) }
              : {}),
          },
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
      const payload = card.payload as { taskId: string };
      await prisma.task.update({
        where: { id: payload.taskId },
        data: { status: "cancelled", approvalState: "rejected" },
      });
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
