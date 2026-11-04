import { Router } from "express";
import { createHash } from "node:crypto";
import { askLLM, parseLLMJson } from "../lib/llm.js";
import { getCache, setCache } from "../services/cache.js";

const router = Router();

type Difficulty = "Easy" | "Medium" | "Hard";

interface Question {
  id: number;
  question: string;
}

interface Evaluation {
  id: number;
  score: number;
  feedback: string;
}

router.post("/generate-questions", async (req, res) => {
  try {
    const { jobTitle, skills, difficulty } = req.body as {
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
      return res.status(400).json({
        error: "Provide a job title, skills array, and valid difficulty.",
      });
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
      return res.json({ questions: cached, cached: true });
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

    return res.json({
      questions: result.questions,
      cached: false,
    });
  } catch (error) {
    console.error("Question generation failed:", error);

    return res.status(502).json({
      error: "Unable to generate questions right now. Please try again.",
    });
  }
});

router.post("/evaluate-responses", async (req, res) => {
  try {
    const { responses } = req.body as {
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
      return res.status(400).json({
        error: "Provide exactly 3 questions with non-empty answers.",
      });
    }

    const content = await askLLM(
      "You are a fair technical interviewer. Evaluate answers against technical correctness, relevance, completeness, and clarity.Return only valid JSON.",
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

    return res.json({ evaluations: result.evaluations });
  } catch (error) {
    console.error("Response evaluation failed:", error);

    return res.status(502).json({
      error: "Unable to evaluate responses right now. Please try again.",
    });
  }
});

export default router;
