import { NextResponse } from "next/server";
import { runSummarizationJob } from "@/lib/engine/summarizer";

export async function POST() {
  try {
    const result = await runSummarizationJob();
    return NextResponse.json({
      summary: result.summary,
      entriesCreated: result.entriesCreated,
      messagesProcessed: result.messagesProcessed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run summarization";
    console.error("[summary] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
