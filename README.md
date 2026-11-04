# AI Interview Question Generator & Evaluator

An end-to-end full-stack AI platform designed to simulate realistic technical interviews. Candidates input a target role, tech stack, and difficulty level to receive three tailored technical interview questions. Upon answering, the platform evaluates responses in parallel using high-speed LLM inference, returning granular scores (0–10), actionable technical feedback per question, and an overall performance score.

Built as a **unified full-stack Next.js application**, combining the interactive user interface and serverless API route handlers into a single, zero-CORS deployment.

---

## Table of Contents

1. [Architectural Approach](#architectural-approach)
2. [Tech Stack](#tech-stack)
3. [Feature Breakdown](#feature-breakdown)
   - [Developer Perspective](#developer-perspective)
   - [User Perspective](#user-perspective)
4. [API Reference](#api-reference)
5. [Setup & Installation](#setup--installation)
   - [Prerequisites](#prerequisites)
   - [Local Development Setup](#local-development-setup)
6. [One-Click Vercel Deployment](#one-click-vercel-deployment)
7. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## Architectural Approach

The application utilizes a **Unified Full-Stack Architecture** powered by Next.js 16 App Router. Both the frontend client application and the backend API route handlers run on the same domain, completely eliminating cross-origin (CORS) friction and enabling instantaneous, relative-path communication.

```
┌─────────────────────────────────────────────────────────────┐
│              Unified Next.js 16 Full-Stack App              │
├──────────────────────────────┬──────────────────────────────┤
│      Frontend Client UI      │    Serverless API Routes     │
│   React 19 • Tailwind CSS    │   /api/generate-questions   │
│   Interactive Answer Form    │   /api/evaluate-responses   │
│   Real-Time Score Display    │   /api/health                │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ Relative Fetch (/api/...)    │
               └──────────────┬───────────────┘
                              ▼
┌──────────────────────────────┴──────────────────────────────┐
│                    Backend Processing Layer                  │
│       Rate Limiting (5 req/min) • Input Sanitization        │
└──────────────┬──────────────────────────────┬───────────────┘
               │ SHA-256 Hash                 │ Low-Temp Inference
               ▼                              ▼
┌──────────────────────────────┐   ┌──────────────────────────┐
│   Two-Tier Cache Strategy    │   │      Groq Cloud API      │
│ 1. Upstash Redis (TTL: 10m)  │   │          Model:          │
│ 2. In-Memory Map (Fallback)  │   │   openai/gpt-oss-120b    │
└──────────────────────────────┘   └──────────────────────────┘
```

### Key Architectural Decisions

1. **Unified Full-Stack Deployment (Zero CORS)**:
   - The UI and API live together under the same origin.
   - Frontend components make direct relative network calls (`/api/generate-questions` and `/api/evaluate-responses`).
   - No CORS preflight latency, no cross-origin blockers, and only **one** set of environment variables to configure.

2. **Deterministic Input Normalization & SHA-256 Hashing**:
   - Question generation requests are normalized: the job title is trimmed, skills are trimmed and sorted alphabetically, and difficulty is matched.
   - A cryptographic SHA-256 hash creates deterministic cache keys (`questions:<sha256>`).
   - Repeated requests for the same role and skill set (regardless of skill order) hit the cache instantly, preserving LLM token quotas.

3. **Two-Tier Resilient Caching**:
   - **Tier 1 (Redis)**: Connects to Redis (e.g. [Upstash Redis](https://upstash.com/)) with a 600-second (10-minute) TTL.
   - **Tier 2 (In-Memory Fallback)**: If Redis is offline or unconfigured, operations silently fail over to an internal in-memory cache with timestamp expiration without crashing the app.

4. **Deterministic LLM Output & Defensive Parsing**:
   - Leverages Groq Cloud's low-latency inference on `openai/gpt-oss-120b` with a low temperature (`0.3`).
   - Markdown code fences (````json ... ````) are stripped prior to parsing.
   - Strict post-parsing validation verifies question counts (exactly 3), ID matching, non-empty feedback strings, and numerical bounds (`0 <= score <= 10`).

5. **Built-In Rate Limiting**:
   - Protects downstream AI quotas by capping requests to 5 requests per 60 seconds per IP via client IP header tracking (`x-forwarded-for`).

---

## Tech Stack

### Framework & Language
- **Full-Stack Framework**: [Next.js](https://nextjs.org/) 16.4.3 (App Router with Serverless Route Handlers)
- **UI Library**: [React](https://react.dev/) 19.3.0
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4 (with `@tailwindcss/turbopack`)

### AI & Data Storage
- **LLM Provider**: [Groq Cloud](https://groq.com/) via `groq-sdk` (v1.6.0)
- **Model**: `openai/gpt-oss-120b` (deterministic generation at temperature 0.3)
- **Primary Cache**: [Redis](https://redis.io/) via `@redis/client` (v6.3.0) — Upstash Redis compatible
- **Secondary Cache**: Internal In-Memory Map with timestamp-based TTL expiry
- **Hashing**: Node.js native `crypto` (SHA-256)

---

## Feature Breakdown

### Developer Perspective

* **Unified API Route Handlers (`src/app/api/`)**:
  - `POST /api/generate-questions`: Validates inputs, computes SHA-256 key, checks Redis/memory cache, queries Groq if uncached, parses/validates JSON, stores to cache (TTL 600s), and returns questions.
  - `POST /api/evaluate-responses`: Receives candidate answers, prompts Groq with technical evaluation rubrics, asserts 0–10 scoring boundaries, and returns structured feedback.
  - `GET /api/health`: Health status endpoint for uptime checks.
* **Resilient Cache Layer (`src/lib/cache.ts`)**:
  - Automatically detects Redis connectivity. If disconnected, seamlessly routes gets and sets to an in-memory `Map`.
* **Rate Limiter (`src/lib/rateLimiter.ts`)**:
  - Lightweight sliding-window IP tracker using `x-forwarded-for` to guard endpoints on serverless platforms.
* **Single Configuration Surface**:
  - No need for separate backend URLs or cross-service sync; all server secrets (`GROQ_API_KEY`, `REDIS_URL`) stay securely on the server side.

---

### User Perspective

* **Customized Interview Setup**:
  - Input target job title (e.g. *Full Stack Developer*), specific technical skills (*React, TypeScript, Node.js*), and choose difficulty (*Easy*, *Medium*, *Hard*).
* **Instant Question Generation**:
  - Generates 3 tailored, real-world technical interview questions based on the selected criteria.
* **Dedicated Workspace**:
  - Each question has its own dedicated multi-line answer box for drafting comprehensive technical solutions.
* **AI Evaluation & Actionable Feedback**:
  - Submitting answers delivers an AI evaluation badge with a score out of 10 and specific, constructive feedback detailing strengths and areas for technical improvement.
* **Cumulative Performance Score**:
  - Highlights an overall average score at the end of the interview to benchmark readiness.

---

## API Reference

### 1. Health Check
* **Endpoint**: `GET /api/health`
* **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "message": "AI Interview Evaluator API is running"
  }
  ```

---

### 2. Generate Questions
* **Endpoint**: `POST /api/generate-questions`
* **Rate Limit**: 5 requests / min
* **Request Body**:
  ```json
  {
    "jobTitle": "Full Stack Engineer",
    "skills": ["React", "TypeScript", "Node.js"],
    "difficulty": "Medium"
  }
  ```
* **Response `200 OK`**:
  ```json
  {
    "questions": [
      {
        "id": 1,
        "question": "How does React's virtual DOM diffing algorithm optimize re-renders?"
      },
      {
        "id": 2,
        "question": "Explain how TypeScript utility types like Partial and Pick work under the hood."
      },
      {
        "id": 3,
        "question": "How does the Node.js event loop handle microtasks vs macrotasks?"
      }
    ],
    "cached": false
  }
  ```

---

### 3. Evaluate Responses
* **Endpoint**: `POST /api/evaluate-responses`
* **Rate Limit**: 5 requests / min
* **Request Body**:
  ```json
  {
    "responses": [
      {
        "id": 1,
        "question": "How does React's virtual DOM diffing algorithm optimize re-renders?",
        "answer": "It uses heuristic O(n) diffing, comparing keys and element types..."
      },
      {
        "id": 2,
        "question": "Explain how TypeScript utility types like Partial and Pick work under the hood.",
        "answer": "They use mapped types and keyof to iterate over interface keys..."
      },
      {
        "id": 3,
        "question": "How does the Node.js event loop handle microtasks vs macrotasks?",
        "answer": "Microtasks (process.nextTick, Promise callbacks) run immediately after the current phase..."
      }
    ]
  }
  ```
* **Response `200 OK`**:
  ```json
  {
    "evaluations": [
      {
        "id": 1,
        "score": 9,
        "feedback": "Clear explanation of the O(n) heuristic diffing mechanism and key reconciliation."
      },
      {
        "id": 2,
        "score": 8.5,
        "feedback": "Accurate coverage of mapped types and keyof constraints."
      },
      {
        "id": 3,
        "score": 9,
        "feedback": "Correct distinction between process.nextTick, promise microtasks, and libuv phases."
      }
    ]
  }
  ```

---

## Setup & Installation

### Prerequisites
* **Node.js**: `v18.18+` or `v20+`
* **npm**: `v9+` (or `pnpm` / `yarn`)
* **Groq API Key**: Obtain a free key at [console.groq.com](https://console.groq.com/)
* **Redis URL (Optional)**: Cloud Redis instance from [Upstash](https://upstash.com/) or local Redis

---

### Local Development Setup

1. **Install dependencies**:
   ```powershell
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` (or `.env.local`) file in the project root:
   ```env
   # AI Provider
   GROQ_API_KEY=your_groq_api_key_here

   # Cache (Optional: omit to use internal in-memory fallback)
   REDIS_URL=rediss://default:password@your-redis-host.upstash.io:6379
   ```

3. **Start the development server**:
   ```powershell
   npm run dev
   ```

4. **Open the application**:
   Open [http://localhost:3000](http://localhost:3000) in your browser. Both the interactive UI and the API (`http://localhost:3000/api/health`) are active immediately!

---

## One-Click Vercel Deployment

Deploying to Vercel is completely zero-config:

1. **Push your code to GitHub**:
   ```powershell
   git push origin main
   ```

2. **Import to Vercel**:
   * Go to **[vercel.com/new](https://vercel.com/new)** and import your GitHub repository.
   * Vercel will automatically detect **Next.js** at the root with zero configuration needed.

3. **Add Environment Variables**:
   * `GROQ_API_KEY` = your Groq API key
   * `REDIS_URL` = your Upstash Redis connection string *(recommended for serverless caching)*

4. **Deploy**:
   * Click **Deploy**.
   * Your entire platform (UI + API) will be live at `https://your-app.vercel.app` with zero CORS configuration required!

---

## Troubleshooting & FAQs

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **"GROQ_API_KEY is not configured"** | Missing key in `.env` or Vercel Environment Variables. | Add `GROQ_API_KEY` to `frontend/.env` (locally) or Vercel Project Settings (production). |
| **"Too many requests. Please try again in one minute."** | Rate limit threshold reached (5 req/min). | Wait 60 seconds before submitting another request. |
| **"Redis unavailable; using memory cache"** | Redis host unreachable or unconfigured. | If using cloud Redis, verify `REDIS_URL` in your environment variables. Otherwise, in-memory cache is used automatically. |
| **CORS errors** | Running separate backend/frontend ports instead of unified app. | With the unified Next.js app, requests hit `/api/...` directly on the same domain, preventing all CORS errors. |
