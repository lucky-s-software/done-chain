import { NextResponse } from "next/server";
import { runSummarizationJob } from "@/lib/engine/summarizer";

export async function POST() {
  try {
    const result = await runSummarizationJob();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
