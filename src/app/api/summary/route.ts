import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSummarizationJob } from "@/lib/engine/summarizer";

export async function POST() {
  try {
    const result = await runSummarizationJob();
    const assistantMessage = await prisma.message.create({
      data: {
        role: "assistant",
        content: result.entriesCreated > 0
          ? `Session summarized. I condensed the recent conversation and captured ${result.entriesCreated} durable ${result.entriesCreated === 1 ? "memory" : "memories"}.`
          : "Session summarized. I condensed the recent conversation and didn't find any new durable memories to add.",
      },
    });

    const summaryCard = await prisma.actionCard.create({
      data: {
        messageId: assistantMessage.id,
        cardType: "summary_notice",
        payload: {
          messagesProcessed: result.messagesProcessed,
          entriesCreated: result.entriesCreated,
          tags: result.summary.tags,
          summaryText: result.summary.summary,
        },
      },
    });

    return NextResponse.json({
      summary: result.summary,
      entriesCreated: result.entriesCreated,
      messagesProcessed: result.messagesProcessed,
      message: {
        ...assistantMessage,
        actionCards: [summaryCard],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run summarization";
    console.error("[summary] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
