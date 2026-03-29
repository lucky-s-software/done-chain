import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAttentionWindow } from "@/lib/ai/attention";
import { parseUserMessage } from "@/lib/ai/parser";

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // 1. Save user message
    const userMessage = await prisma.message.create({
      data: { role: "user", content },
    });

    // 2. Build attention window
    const attentionContext = await buildAttentionWindow(prisma);

    // 3. Parse with DeepSeek
    const { reply, extractions, suggestedActions } = await parseUserMessage(
      content,
      attentionContext
    );

    // 4. Save assistant message
    const assistantMessage = await prisma.message.create({
      data: { role: "assistant", content: reply },
    });

    let memoriesCreated = 0;

    // 5. Process extractions
    for (const ext of extractions) {
      // Resolve or create Person
      let personId: string | null = null;
      if (ext.person) {
        const person = await prisma.person.upsert({
          where: { name: ext.person } as { name: string },
          update: {},
          create: { name: ext.person },
        });
        personId = person.id;
      }

      if (ext.type === "memory") {
        // Create entry + proposed_memory card
        const entry = await prisma.entry.create({
          data: {
            content: ext.content,
            source: "ai_extracted",
            tags: ext.tags,
            sourceMessageId: userMessage.id,
            personId,
            reviewed: false,
          },
        });

        await prisma.actionCard.create({
          data: {
            messageId: assistantMessage.id,
            cardType: "proposed_memory",
            payload: {
              entryId: entry.id,
              content: ext.content,
              tags: ext.tags,
              confidence: ext.confidence,
            },
            status: "pending",
          },
        });

        memoriesCreated++;
      } else if (ext.type === "task" || ext.type === "reminder") {
        // Create entry → task → card
        const entry = await prisma.entry.create({
          data: {
            content: ext.content,
            source: "ai_extracted",
            tags: ext.tags,
            sourceMessageId: userMessage.id,
            personId,
          },
        });

        const task = await prisma.task.create({
          data: {
            title: ext.title,
            status: "proposed",
            approvalState: "pending",
            dueAt: ext.dueAt,
            dueType: ext.dueType,
            reminderAt: ext.reminderAt,
            tags: ext.tags,
            sourceEntryId: entry.id,
            personId,
          },
        });

        await prisma.actionCard.create({
          data: {
            messageId: assistantMessage.id,
            cardType: "proposed_task",
            payload: {
              taskId: task.id,
              title: ext.title,
              dueAt: ext.dueAt?.toISOString() ?? null,
              dueType: ext.dueType,
              reminderAt: ext.reminderAt?.toISOString() ?? null,
              tags: ext.tags,
              person: ext.person,
              confidence: ext.confidence,
            },
            status: "pending",
          },
        });
      }
    }

    // 6. Log credits
    await prisma.creditLedger.create({
      data: {
        eventType: "parse",
        credits: 1 + extractions.length,
      },
    });

    // 7. Return full response with action cards
    const fullMessage = await prisma.message.findUnique({
      where: { id: assistantMessage.id },
      include: { actionCards: true },
    });

    return NextResponse.json({
      message: fullMessage,
      memoriesCreated,
      suggestedActions,
    });
  } catch (err) {
    console.error("[chat] error:", err);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
