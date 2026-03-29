import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/deepseek";
import { PROFILE_UPDATE_PROMPT } from "@/lib/ai/prompts";

type ProfileDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<{ content: string } | null>;
  upsert: (args: {
    where: { id: string };
    update: { content: string };
    create: { id: string; userId: string | null; content: string };
  }) => Promise<unknown>;
};

function getProfileDelegate(): ProfileDelegate | null {
  const delegate = (prisma as unknown as { profile?: ProfileDelegate }).profile;
  return delegate ?? null;
}

export async function getProfile(userId?: string): Promise<string> {
  const id = userId ?? "default";
  const profileDelegate = getProfileDelegate();
  if (!profileDelegate) return "";
  const profile = await profileDelegate.findUnique({ where: { id } });
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
  const profileDelegate = getProfileDelegate();
  if (!profileDelegate) return trimmed;

  await profileDelegate.upsert({
    where: { id },
    update: { content: trimmed },
    create: { id, userId: userId ?? null, content: trimmed },
  });

  return trimmed;
}
