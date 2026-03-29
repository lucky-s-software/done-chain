import { chatJson } from "@/lib/deepseek";
import { MAX_TAGS, normalizeTags } from "@/lib/tags";

const TAG_EXTRACT_SYSTEM_PROMPT = `You extract semantic tags for a commitment/task tracker.

Rules:
- Return at most ${MAX_TAGS} tags.
- Tags must be semantically true to the input text.
- Prefer specific entities, project names, app names, company names, people names, and clear categories.
- Internal/private project codenames are valid tags when present.
- Avoid generic filler like verbs/adjectives ("do", "important", "quick", "daily").
- Keep tags concise.

Return strict JSON:
{
  "tags": ["tag 1", "tag 2"]
}`;

interface TagExtractionInput {
  title?: string;
  content?: string;
  existingTags?: string[];
}

export async function extractTagsWithAI({
  title,
  content,
  existingTags = [],
}: TagExtractionInput): Promise<string[]> {
  const trimmedTitle = (title ?? "").trim();
  const trimmedContent = (content ?? "").trim();
  const signal = [trimmedTitle, trimmedContent].filter(Boolean).join("\n");

  if (!signal) return normalizeTags(existingTags);

  const raw = await chatJson(
    TAG_EXTRACT_SYSTEM_PROMPT,
    [
      {
        role: "user",
        content: `Title: ${trimmedTitle || "(none)"}\nContext: ${trimmedContent || "(none)"}\nCurrent tags: ${(existingTags || []).join(", ") || "(none)"}`,
      },
    ],
    { mode: "analysis", temperature: 1, max_tokens: 300 }
  );

  let parsed: { tags?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const aiTags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return normalizeTags(aiTags);
}
