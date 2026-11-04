import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { askLLM, parseLLMJson } from "@/lib/llm";
import { getCache, setCache } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rateLimiter";

type Difficulty = "Easy" | "Medium" | "Hard";

interface Question {
  id: number;
  question: string;
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
    const { jobTitle, skills, difficulty } = body as {
      jobTitle?: string;
      skills?: string[];
      difficulty?: Difficulty;
    };

    if (
      typeof jobTitle !== "string" ||
      !jobTitle.trim() ||
      !Array.isArray(skills) ||
      skills.length === 0 ||
      !skills.every((skill) => typeof skill === "string" && skill.trim()) ||
      !["Easy", "Medium", "Hard"].includes(difficulty ?? "")
    ) {
      return NextResponse.json(
        { error: "Provide a job title, skills array, and valid difficulty." },
        { status: 400 },
      );
    }

    const normalized = {
      jobTitle: jobTitle.trim(),
      skills: skills.map((s) => s.trim()).sort(),
      difficulty,
    };

    const key =
      "questions:" +
      createHash("sha256").update(JSON.stringify(normalized)).digest("hex");

    const cached = await getCache<Question[]>(key);

    if (cached) {
      return NextResponse.json({ questions: cached, cached: true });
    }

    const content = await askLLM(
      "You are a technical interviewer. Return only valid JSON.",
      `Generate exactly 3 distinct technical interview questions.
      
      jobTitle: ${normalized.jobTitle}
      skills:${normalized.skills.join(", ")}
      Difficulty:${difficulty}
      
      Return this JSON structure:
      {
      "questions": [
      {"id": 1, "question": "First interview question"},
      {"id": 2, "question": "Second interview question"},
      {"id": 3, "question": "Third interview question"}
      ]
      }
      
      Questions must be relevant to the job and skills.`,
    );

    const result = parseLLMJson<{ questions: Question[] }>(content);

    if (
      !Array.isArray(result.questions) ||
      result.questions.length !== 3 ||
      !result.questions.every(
        (q) =>
          Number.isInteger(q.id) &&
          typeof q.question === "string" &&
          q.question.trim().length > 0,
      )
    ) {
      throw new Error("Invalid question format from LLM");
    }

    await setCache(key, result.questions);

    return NextResponse.json({
      questions: result.questions,
      cached: false,
    });
  } catch (error) {
    console.error("Question generation failed:", error);

    return NextResponse.json(
      { error: "Unable to generate questions right now. Please try again." },
      { status: 502 },
    );
  }
}

