import Groq from "groq-sdk";

export async function askLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("The LLM returned an empty response");
  }

  return content;
}

export function parseLLMJson<T>(content: string): T {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  return JSON.parse(cleaned) as T;
}
