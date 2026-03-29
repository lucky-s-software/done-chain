import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/deepseek";
import { PROFILE_UPDATE_PROMPT } from "@/lib/ai/prompts";

export async function getProfile(userId?: string): Promise<string> {
  const id = userId ?? "default";
  const profile = await prisma.profile.findUnique({ where: { id } });
  return profile?.content ?? "";
}

export async function updateProfileFromConversation(
  conversationExcerpt: string,
  userId?: string
): Promise<string> {
  const id = userId ?? "default";
  const currentProfile = await getProfile(userId);

  const updatedContent = await chat(
    "You are a profile curator. Follow the instructions in the user message exactly.",
    [{ role: "user", content: PROFILE_UPDATE_PROMPT(currentProfile, conversationExcerpt) }]
  );

  const trimmed = updatedContent.trim();
  await prisma.profile.upsert({
    where: { id },
    update: { content: trimmed },
    create: { id, userId: userId ?? null, content: trimmed },
  });

  return trimmed;
}
