import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStoredTags } from "@/lib/tags";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "3", 10) || 3, 1), 20);

    const summaries = await prisma.conversationSummary.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      summaries: summaries.map((summary) => ({
        ...summary,
        tags: parseStoredTags(summary.tags),
      })),
    });
  } catch (err) {
    console.error("[summaries] error:", err);
    return NextResponse.json({ error: "Failed to fetch summaries" }, { status: 500 });
  }
}
