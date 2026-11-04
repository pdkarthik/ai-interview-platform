"use client";

import { useState } from "react";

type Question = {
  id: number;
  question: string;
};

type Evaluation = {
  id: number;
  score: number;
  feedback: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function Home() {
  const [jobTitle, setJobTitle] = useState("");
  const [skills, setSkills] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingEvaluation, setLoadingEvaluation] = useState(false);
  const [error, setError] = useState("");

  async function generateQuestions() {
    setError("");
    setEvaluations([]);
    setQuestions([]);
    setAnswers({});

    const skillList = skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    if (!jobTitle.trim() || skillList.length === 0) {
      setError("Please enter a job title and at least one technical skill.");
      return;
    }

    setLoadingQuestions(true);

    try {
      const response = await fetch(`${API_URL}/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          skills: skillList,
          difficulty,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not generate questions.");
      }

      if (!Array.isArray(data.questions) || data.questions.length !== 3) {
        throw new Error("The server did not return exactly three questions.");
      }

      setQuestions(data.questions);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while generating questions.",
      );
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function evaluateAnswers() {
    setError("");
    setEvaluations([]);

    if (questions.length !== 3) {
      setError("Generate your questions first.");
      return;
    }

    const responses = questions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: answers[question.id]?.trim() || "",
    }));

    if (responses.some((item) => !item.answer)) {
      setError("Please answer all three questions before evaluating.");
      return;
    }

    setLoadingEvaluation(true);

    try {
      const response = await fetch(`${API_URL}/evaluate-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not evaluate your answers.");
      }

      if (!Array.isArray(data.evaluations)) {
        throw new Error("The server returned an invalid evaluation.");
      }

      setEvaluations(data.evaluations);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while evaluating your answers.",
      );
    } finally {
      setLoadingEvaluation(false);
    }
  }

  const averageScore =
    evaluations.length > 0
      ? (
          evaluations.reduce((total, item) => total + item.score, 0) /
          evaluations.length
        ).toFixed(1)
      : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            AI Interview Lab
          </p>
          <h1 className="text-3xl font-bold sm:text-5xl">
            Interview Question Generator
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            Generate role-specific technical questions, submit your answers, and
            receive AI-powered scores with actionable feedback.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
          <h2 className="mb-5 text-xl font-semibold">
            Configure your interview
          </h2>
          <form
            className="grid gap-5 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void generateQuestions();
            }}
          >
            <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
              Job title
              <input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="e.g. Full Stack Developer"
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
                required
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
              Technical skills (comma-separated)
              <input
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
                placeholder="Node.js, TypeScript, PostgreSQL"
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
                required
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              Difficulty
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loadingQuestions}
                className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingQuestions
                  ? "Generating questions..."
                  : "Generate 3 Questions"}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300"
          >
            {error}
          </div>
        )}

        {loadingQuestions && (
          <p
            className="mt-6 animate-pulse text-center text-cyan-300"
            role="status"
          >
            Generating tailored interview questions. Please wait...
          </p>
        )}

        {questions.length > 0 && (
          <section className="mt-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Your interview questions</h2>
              <p className="mt-1 text-sm text-slate-400">
                Answer each question clearly, then submit all three for
                evaluation.
              </p>
            </div>

            {questions.map((question, index) => {
              const evaluation = evaluations.find(
                (item) => item.id === question.id,
              );

              return (
                <article
                  key={question.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6"
                >
                  <p className="mb-2 text-sm font-semibold text-cyan-400">
                    QUESTION {index + 1}
                  </p>
                  <h3 className="text-lg font-semibold leading-relaxed">
                    {question.question}
                  </h3>

                  <label
                    htmlFor={`answer-${question.id}`}
                    className="mt-5 block text-sm font-medium text-slate-300"
                  >
                    Your answer
                  </label>
                  <textarea
                    id={`answer-${question.id}`}
                    value={answers[question.id] || ""}
                    onChange={(event) =>
                      setAnswers((previous) => ({
                        ...previous,
                        [question.id]: event.target.value,
                      }))
                    }
                    placeholder="Write your technical answer here..."
                    rows={5}
                    className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
                  />

                  {evaluation && (
                    <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold">AI evaluation</h4>
                        <span className="rounded-full bg-cyan-400/10 px-3 py-1 font-bold text-cyan-300">
                          {evaluation.score}/10
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-300">
                        {evaluation.feedback}
                      </p>
                    </div>
                  )}
                </article>
              );
            })}

            <button
              type="button"
              onClick={() => void evaluateAnswers()}
              disabled={loadingEvaluation || loadingQuestions}
              className="w-full rounded-lg bg-emerald-400 px-5 py-4 font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingEvaluation
                ? "Evaluating your answers..."
                : "Evaluate My Answers"}
            </button>

            {loadingEvaluation && (
              <p
                className="animate-pulse text-center text-emerald-300"
                role="status"
              >
                Evaluating your answers and preparing feedback...
              </p>
            )}

            {averageScore !== null && (
              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <p className="text-sm font-medium text-emerald-300">
                  Overall average score
                </p>
                <p className="mt-2 text-4xl font-bold">{averageScore}/10</p>
                <p className="mt-2 text-sm text-slate-300">
                  Review the feedback on each question to identify areas for
                  improvement.
                </p>
              </section>
            )}
          </section>
        )}

        <footer className="mt-12 text-center text-xs text-slate-500">
          Built with Next.js, TypeScript, Express, Groq and Redis.
        </footer>
      </div>
    </main>
  );
}
