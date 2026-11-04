import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { apiRateLimiter } from "./middleware/rateLimiter.js";
import interviewRouter from "./routes/interview.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  }),
);

app.use(express.json({ limit: "1mb" }));

// Root info route
app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "AI Interview Evaluator API is running.",
    endpoints: {
      health: "/api/health",
      generateQuestions: "POST /api/generate-questions",
      evaluateResponses: "POST /api/evaluate-responses",
    },
  });
});

// Health check route
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "AI Interview Evaluator API is running",
  });
});

app.use("/api", apiRateLimiter, interviewRouter);

// Catch-all 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested endpoint does not exist on this API server.",
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

export default app;
