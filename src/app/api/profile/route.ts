import { NextRequest, NextResponse } from "next/server";
import { getProfile, updateProfileFromConversation } from "@/lib/engine/profile";

export async function GET() {
  const content = await getProfile();
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest) {
  const { content } = await req.json();
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.profile.upsert({
    where: { id: "default" },
    update: { content },
    create: { id: "default", content },
  });

  return NextResponse.json({ content });
}
