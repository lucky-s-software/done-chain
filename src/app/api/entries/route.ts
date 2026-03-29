import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reviewed = searchParams.get("reviewed");

    const entries = await prisma.entry.findMany({
      where: {
        ...(reviewed === "false" ? { reviewed: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { person: true, project: true },
    });

    const parsedEntries = entries.map(e => ({ ...e, tags: typeof e.tags === "string" ? JSON.parse(e.tags) : e.tags }));
    return NextResponse.json({ entries: parsedEntries });
  } catch (err) {
    console.error("[entries] error:", err);
    return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
  }
}
