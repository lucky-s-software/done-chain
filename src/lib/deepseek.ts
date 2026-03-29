import OpenAI from "openai";

// DeepSeek is OpenAI-compatible — same SDK, different base URL + model
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

export async function chat(
  systemPrompt: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[]
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: 0.3,
    max_tokens: 2000,
  });

  return response.choices[0].message.content ?? "";
}
