import OpenAI from "openai";

// DeepSeek is OpenAI-compatible — same SDK, different base URL + model
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

export interface DeepSeekUsage {
  stage?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  latencyMs: number;
}

interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  mode?: "chat" | "analysis";
  model?: string;
  stage?: string;
  onUsage?: (usage: DeepSeekUsage) => void;
}

function resolveTemperature(options?: ChatOptions): number {
  if (typeof options?.temperature === "number") {
    return options.temperature;
  }

  return options?.mode === "analysis" ? 1 : 1.2;
}

function resolveModel(options?: ChatOptions): string {
  return options?.model?.trim() || "deepseek-chat";
}

function readUsageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractUsage(
  response: OpenAI.Chat.Completions.ChatCompletion,
  latencyMs: number,
  options?: ChatOptions
): DeepSeekUsage {
  const usageRecord = (response.usage ?? {}) as Record<string, unknown>;
  const model = response.model || "deepseek-chat";

  return {
    stage: options?.stage,
    model,
    promptTokens: readUsageNumber(usageRecord.prompt_tokens),
    completionTokens: readUsageNumber(usageRecord.completion_tokens),
    totalTokens: readUsageNumber(usageRecord.total_tokens),
    promptCacheHitTokens: readUsageNumber(usageRecord.prompt_cache_hit_tokens),
    promptCacheMissTokens: readUsageNumber(usageRecord.prompt_cache_miss_tokens),
    latencyMs: Math.max(0, Math.round(latencyMs)),
  };
}

export async function chat(
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: ChatOptions
): Promise<string> {
  const startedAt = Date.now();
  const response = await client.chat.completions.create({
    model: resolveModel(options),
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: resolveTemperature(options),
    max_tokens: options?.max_tokens ?? 2000,
  });
  options?.onUsage?.(extractUsage(response, Date.now() - startedAt, options));

  return response.choices[0].message.content ?? "";
}

export async function chatJson(
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: ChatOptions
): Promise<string> {
  const startedAt = Date.now();
  const response = await client.chat.completions.create({
    model: resolveModel(options),
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: resolveTemperature(options),
    max_tokens: options?.max_tokens ?? 1200,
    response_format: { type: "json_object" },
  });
  options?.onUsage?.(extractUsage(response, Date.now() - startedAt, options));

  return response.choices[0].message.content ?? "{}";
}
