import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { upToMessageId } = await req.json();

  if (!upToMessageId) {
    return NextResponse.json({ error: "upToMessageId is required" }, { status: 400 });
  }

  const target = await prisma.message.findUnique({ where: { id: upToMessageId } });
  if (!target) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Hard-delete all messages at or before the target's createdAt
  const deleted = await prisma.message.deleteMany({
    where: { createdAt: { lte: target.createdAt } },
  });

  return NextResponse.json({ deleted: deleted.count });
}
