import OpenAI from "openai";

// DeepSeek is OpenAI-compatible — same SDK, different base URL + model
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
}

export async function chat(
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: ChatOptions
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.max_tokens ?? 2000,
  });

  return response.choices[0].message.content ?? "";
}

export async function chatJson(
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: ChatOptions
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.max_tokens ?? 1200,
    response_format: { type: "json_object" },
  });

  return response.choices[0].message.content ?? "{}";
}
