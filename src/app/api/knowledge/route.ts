import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateKnowledgeCache } from "@/lib/ai/knowledge";

export async function GET() {
  const entries = await prisma.knowledgeBase.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, title, description, content, priority } = body;

  if (!slug || !title || !content) {
    return NextResponse.json({ error: "slug, title, and content are required" }, { status: 400 });
  }

  const entry = await prisma.knowledgeBase.create({
    data: {
      slug,
      title,
      description: description ?? "",
      content,
      priority: priority ?? 0,
    },
  });

  invalidateKnowledgeCache();
  return NextResponse.json(entry, { status: 201 });
}
