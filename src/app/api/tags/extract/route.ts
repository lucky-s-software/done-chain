import { NextRequest, NextResponse } from "next/server";
import { extractTagsWithAI } from "@/lib/ai/tagExtractor";
import { normalizeTags } from "@/lib/tags";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, existingTags } = body as {
      title?: string;
      content?: string;
      existingTags?: string[];
    };

    const tags = await extractTagsWithAI({
      title,
      content,
      existingTags: normalizeTags(existingTags ?? []),
    });

    return NextResponse.json({ tags });
  } catch (err) {
    console.error("[tags extract] error:", err);
    return NextResponse.json({ error: "Failed to extract tags" }, { status: 500 });
  }
}
