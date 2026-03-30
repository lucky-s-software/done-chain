import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTags, parseStoredTags } from "@/lib/tags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const content = typeof body?.content === "string" ? body.content.trim() : undefined;
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
      : undefined;

    if (content !== undefined && !content) {
      return NextResponse.json({ error: "Memory content cannot be empty" }, { status: 400 });
    }

    const nextTags = tags ? normalizeTags(tags) : undefined;
    const updated = await prisma.entry.update({
      where: { id },
      data: {
        ...(content !== undefined ? { content } : {}),
        ...(nextTags !== undefined ? { tags: JSON.stringify(nextTags) } : {}),
      },
    });

    return NextResponse.json({
      entry: {
        ...updated,
        tags: nextTags ?? parseStoredTags(updated.tags),
      },
    });
  } catch (err) {
    console.error("[entries/:id patch] error:", err);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.task.updateMany({
      where: { sourceEntryId: id },
      data: { sourceEntryId: null },
    });
    await prisma.entry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[entries/:id delete] error:", err);
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
