import { NextRequest, NextResponse } from "next/server";
import { askLLM, parseLLMJson } from "@/lib/llm";
import { checkRateLimit } from "@/lib/rateLimiter";

interface Evaluation {
  id: number;
  score: number;
  feedback: string;
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, 5, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in one minute." },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const { responses } = body as {
      responses?: {
        id: number;
        question: string;
        answer: string;
      }[];
    };

    if (
      !Array.isArray(responses) ||
      responses.length !== 3 ||
      !responses.every(
        (item) =>
          Number.isInteger(item.id) &&
          typeof item.question === "string" &&
          item.question.trim().length > 0 &&
          typeof item.answer === "string" &&
          item.answer.trim().length > 0,
      )
    ) {
      return NextResponse.json(
        { error: "Provide exactly 3 questions with non-empty answers." },
        { status: 400 },
      );
    }

    const content = await askLLM(
      "You are a fair technical interviewer. Evaluate answers against technical correctness, relevance, completeness, and clarity. Return only valid JSON.",
      `Evaluate each candidate response independently.
        Responses:
        ${JSON.stringify(responses)}
        
        Return:
        {"evaluations":
        [{"id":1,"score":8,"feedback":"..."}]}
        
        Requirements:
        - Return one evaluation per input.
        - Score must be a number from 0 to 10.
        - Feedback must be concise, constructive, and specific.
        - Do not award a high score to an empty or irrelevant answer.`,
    );

    const result = parseLLMJson<{
      evaluations: Evaluation[];
    }>(content);

    const expectedIds = new Set(responses.map((r) => r.id));

    if (
      !Array.isArray(result.evaluations) ||
      result.evaluations.length !== responses.length ||
      !result.evaluations.every(
        (e) =>
          Number.isInteger(e.id) &&
          expectedIds.has(e.id) &&
          Number.isFinite(e.score) &&
          e.score >= 0 &&
          e.score <= 10 &&
          typeof e.feedback === "string" &&
          e.feedback.trim().length > 0,
      ) ||
      new Set(result.evaluations.map((e) => e.id)).size !== responses.length
    ) {
      throw new Error("Invalid evaluation format from LLM");
    }

    return NextResponse.json({ evaluations: result.evaluations });
  } catch (error) {
    console.error("Response evaluation failed:", error);

    return NextResponse.json(
      { error: "Unable to evaluate responses right now. Please try again." },
      { status: 502 },
    );
  }
}
