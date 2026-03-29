export const MAX_TAGS = 5;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTagPrefix(value: string): string {
  return value.replace(/^#+/, "");
}

export function normalizeTags(tags: string[], limit = MAX_TAGS): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const clean = normalizeWhitespace(stripTagPrefix(tag));
    if (!clean || clean.length < 2) continue;

    const key = clean.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(clean);

    if (normalized.length >= limit) break;
  }

  return normalized;
}
