export const MAX_TAGS = 5;

const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTagPrefix(value: string): string {
  return value.replace(/^#+/, "");
}

function transliterateToAscii(value: string): string {
  const mapped = Array.from(value)
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join("");

  return mapped.normalize("NFKD").replace(/\p{M}+/gu, "");
}

function normalizeTagValue(value: string): string {
  return transliterateToAscii(normalizeWhitespace(stripTagPrefix(value)))
    .toLocaleLowerCase("en-US")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeTags(tags: string[], limit = MAX_TAGS): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const clean = normalizeTagValue(tag);
    if (!clean || clean.length < 2) continue;

    if (seen.has(clean)) continue;

    seen.add(clean);
    normalized.push(clean);

    if (normalized.length >= limit) break;
  }

  return normalized;
}

export function parseStoredTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === "string");
  }

  if (typeof tags !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}
