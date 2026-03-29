import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const before = searchParams.get("before");

    const messages = await prisma.message.findMany({
      where: {
        expired: false,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: { actionCards: true },
    });

    const total = await prisma.message.count({ where: { expired: false } });
    const hasMore = total > limit;

    return NextResponse.json({ messages, hasMore });
  } catch (err) {
    console.error("[messages] error:", err);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
