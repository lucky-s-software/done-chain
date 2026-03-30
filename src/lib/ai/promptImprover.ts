import { chatJson } from "@/lib/deepseek";
import { PROMPT_IMPROVER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getKnowledgeIndex, getKnowledgeContent } from "@/lib/ai/knowledge";
import type { KnowledgeMeta } from "@/lib/ai/knowledge";
import type { DeepSeekUsage } from "@/lib/deepseek";

interface PromptImproverResult {
  selectedKnowledge: string[];
  enrichedContext: string;
  knowledgeContent: string;
}

export async function runPromptImprover(
  userMessage: string,
  profileSummary: string,
  onUsage?: (usage: DeepSeekUsage) => void
): Promise<PromptImproverResult> {
  const index: KnowledgeMeta[] = await getKnowledgeIndex();

  if (index.length === 0) {
    return { selectedKnowledge: [], enrichedContext: "", knowledgeContent: "" };
  }

  const indexText = index
    .map((k) => `- slug: ${k.slug}\n  title: ${k.title}\n  description: ${k.description}`)
    .join("\n");

  const userContent = `User message: ${userMessage}

User profile: ${profileSummary || "(no profile yet)"}

Available knowledge topics:
${indexText}`;

  const raw = await chatJson(
    PROMPT_IMPROVER_SYSTEM_PROMPT,
    [{ role: "user", content: userContent }],
    {
      mode: "analysis",
      temperature: 1,
      max_tokens: 200,
      stage: "prompt_improver",
      onUsage,
    }
  );

  let parsed: { selectedKnowledge?: string[]; enrichedContext?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { selectedKnowledge: [], enrichedContext: "" };
  }

  const slugs = (parsed.selectedKnowledge ?? []).slice(0, 3);
  const enrichedContext = parsed.enrichedContext ?? "";

  if (slugs.length === 0) {
    return { selectedKnowledge: [], enrichedContext, knowledgeContent: "" };
  }

  const entries = await getKnowledgeContent(slugs);
  const knowledgeContent = entries
    .map((e) => `### ${e.title}\n${e.content}`)
    .join("\n\n");

  return { selectedKnowledge: slugs, enrichedContext, knowledgeContent };
}
