import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const fromMessageId = body.fromMessageId ?? body.upToMessageId;
  const includeSelected = Boolean(body.includeSelected);

  if (!fromMessageId) {
    return NextResponse.json({ error: "fromMessageId is required" }, { status: 400 });
  }

  const allMessages = await prisma.message.findMany({
    where: { expired: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const targetIndex = allMessages.findIndex((msg) => msg.id === fromMessageId);
  if (targetIndex === -1) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const deleteStartIndex = includeSelected ? targetIndex : targetIndex + 1;
  const idsToDelete = allMessages.slice(deleteStartIndex).map((msg) => msg.id);
  if (idsToDelete.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  try {
    // Delete ActionCards first (FK is ON DELETE RESTRICT in the migration)
    await prisma.actionCard.deleteMany({ where: { messageId: { in: idsToDelete } } });

    const deleted = await prisma.message.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (err) {
    console.error("[bulk-delete] error:", err);
    return NextResponse.json({ error: "Failed to delete messages" }, { status: 500 });
  }
}
