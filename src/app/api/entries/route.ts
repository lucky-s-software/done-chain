import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStoredTags } from "@/lib/tags";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reviewed = searchParams.get("reviewed");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

    const entries = await prisma.entry.findMany({
      where: {
        ...(reviewed === "false" ? { reviewed: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { person: true, project: true },
    });

    const parsedEntries = entries.map((entry) => ({ ...entry, tags: parseStoredTags(entry.tags) }));
    return NextResponse.json({ entries: parsedEntries });
  } catch (err) {
    console.error("[entries] error:", err);
    return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
  }
}
