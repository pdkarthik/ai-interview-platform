# AI Interview Platform: Automated Evaluation & Caching Architecture

An end-to-end full-stack AI platform designed to simulate realistic technical interviews. Candidates input a target role, tech stack, and difficulty level to receive three tailored technical interview questions. Upon answering, the platform evaluates responses in parallel using high-speed LLM inference, returning granular scores (0–10), actionable technical feedback per question, and an overall performance score.

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
   - [Backend Configuration & Setup](#backend-configuration--setup)
   - [Frontend Configuration & Setup](#frontend-configuration--setup)
6. [Production Build](#production-build)
7. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## Architectural Approach

The system follows a decoupled, client-server architecture designed for reliability, responsiveness, and cost-efficiency when interacting with large language models.

```
┌────────────────────────────────────────────────────────┐
│               Frontend (Next.js 16 + React 19)          │
│         Tailwind CSS v4 • Dark Theme • Client Forms    │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP JSON / CORS
                            ▼
┌────────────────────────────────────────────────────────┐
│               Backend (Express 5 + TypeScript)          │
│   Rate Limiter (5 req/min) • Input Sanitization        │
└──────────────┬───────────────────────────┬─────────────┘
               │ SHA-256 Hash              │ Low-Temp Inference
               ▼                           ▼
┌──────────────────────────────┐ ┌───────────────────────┐
│ Two-Tier Cache Strategy      │ │ Groq Cloud API        │
│ 1. Redis (TTL: 10m)          │ │ Model:                │
│ 2. In-Memory Map (Fallback)  │ │ openai/gpt-oss-120b   │
└──────────────────────────────┘ └───────────────────────┘
```

### Key Architectural Decisions

1. **Decoupled API & Client**:
   - The frontend is an interactive single-page application built on Next.js 16 App Router.
   - The backend is an Express 5 REST API running in Node.js with native ES Modules (`"type": "module"`).
   - Strict CORS configuration ensures only authorized frontend origins can interact with backend endpoints.

2. **Deterministic Prompt Hashing & Two-Tier Caching**:
   - To minimize redundant API calls, generation requests are normalized: the job title is trimmed, skills are trimmed and sorted alphabetically, and difficulty is matched.
   - A SHA-256 hash is computed over the normalized payload to generate a cache key (`questions:<sha256>`).
   - **Tier 1 (Redis)**: Connects to Redis (e.g., Upstash or local) with a 600-second (10-minute) TTL.
   - **Tier 2 (In-Memory Fallback)**: If Redis is unconfigured, unreachable, or disconnects during runtime, the system automatically falls back to an internal Node.js `Map` cache with expiration tracking without crashing or rejecting requests.

3. **Deterministic LLM Output via Structured Prompts**:
   - Uses the Groq SDK with `openai/gpt-oss-120b` at a low temperature (`0.3`) for deterministic evaluation.
   - System prompts enforce strict JSON-only outputs.
   - Defensive parsing cleans potential Markdown code fences (````json ... ````) before executing `JSON.parse`.
   - Post-parsing schema verification enforces structural constraints (e.g., exactly 3 questions/evaluations, numerical range `0 <= score <= 10`, non-empty strings).

4. **Defensive Rate Limiting & Abuse Prevention**:
   - Backed by `express-rate-limit`, limiting each client IP to 5 requests per minute.
   - Emits draft-7 standard rate-limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).

---

## Tech Stack

### Frontend
- **Framework**: [Next.js](https://nextjs.org/) 16.4.3 (App Router, Client Components)
- **Library**: [React](https://react.dev/) 19.3.0
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4 (using `@tailwindcss/turbopack`)
- **Icons & Fonts**: Inline SVG assets and Geist Sans / Mono system fonts

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Server Framework**: [Express.js](https://expressjs.com/) v5.3.0
- **Language**: [TypeScript](https://www.typescriptlang.org/) 7.0.2 with `tsx` (v4.23.15) for dev execution
- **API Security & Limits**: [cors](https://www.npmjs.com/package/cors) (2.8.6), [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) (8.7.1)
- **Environment Management**: [dotenv](https://www.npmjs.com/package/dotenv) (18.0.9)

### AI & Data Storage
- **LLM Provider**: [Groq Cloud](https://groq.com/) via `groq-sdk` (v1.6.0)
- **Inference Model**: `openai/gpt-oss-120b` (low temperature: 0.3)
- **Primary Cache**: [Redis](https://redis.io/) via `@redis/client` (v6.3.0) — Upstash Redis compatible
- **Secondary Cache**: In-Memory Map with TTL expiration timestamps

---

## Feature Breakdown

### Developer Perspective

#### 1. Input Normalization & SHA-256 Key Derivation
- When generating questions, arbitrary casing or varied ordering of skills (e.g., `["TypeScript", "React"]` vs. `["React", "TypeScript"]`) produces the exact same normalized hash:
  ```typescript
  const normalized = {
    jobTitle: jobTitle.trim(),
    skills: skills.map((s) => s.trim()).sort(),
    difficulty,
  };
  const key = "questions:" + createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  ```
- Maximizes cache hits and saves LLM token budget.

#### 2. Dual-Layer Cache Engine with Automatic Failover
- `backend/src/services/cache.ts` maintains an active connection listener:
  ```typescript
  redisClient.on("error", (error) => {
    console.error("Redis error:", error.message);
    redisReady = false;
  });
  ```
- Reads attempt Redis retrieval first; if Redis flags `redisReady = false` or throws, it transparently drops to `memoryCache.get(key)`. Writes replicate this fallback pattern.

#### 3. LLM JSON Fence Sanitization & Validation
- Responses from open models occasionally contain surrounding ````json ... ```` fences. The backend strips them via regex prior to deserialization:
  ```typescript
  export function parseLLMJson<T>(content: string): T {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(cleaned) as T;
  }
  ```
- Both `/generate-questions` and `/evaluate-responses` rigorously assert array shapes, item IDs, and boundary limits before responding with HTTP 200.

#### 4. Rate Limiting Middleware
- Protects downstream AI quotas from spikes or brute-force scripts:
  - 5 requests per 60 seconds per IP.
  - Returns `429 Too Many Requests` with a descriptive JSON message.

---

### User Perspective

#### 1. Interactive Interview Configuration
- Candidates enter their targeted job position (e.g., *Senior Backend Engineer*), technical skill tags (e.g., *Golang, Docker, Kubernetes, PostgreSQL*), and difficulty (*Easy*, *Medium*, *Hard*).
- Form validates inputs and prevents submitting empty or invalid skills.

#### 2. Real-Time Generation Feedback
- When submitted, the UI enters a loading state with an animated pulse indicator ("Generating tailored interview questions...").
- Disables generation controls to avoid duplicate requests.

#### 3. Question Workspace
- Displays 3 discrete question cards with clean typography and numbering.
- Provides independent multi-line text areas (`textarea`) with responsive height adjustment so candidates can articulate in-depth technical solutions and system design trade-offs.

#### 4. Automated Evaluation & Constructive Feedback
- Upon clicking **Evaluate My Answers**, the system ensures all 3 questions have answers before sending the request.
- The AI evaluates each answer independently across:
  - **Technical correctness**: Depth and validity of concepts.
  - **Relevance**: Addressing the specific problem posed.
  - **Completeness**: Handling edge cases and prerequisites.
  - **Clarity**: Communication and structure.
- Each question card dynamically renders:
  - An **AI evaluation badge** with a numeric score out of 10 (e.g., `8/10`).
  - Specific, actionable feedback highlighting strengths and targeted areas for improvement.

#### 5. Cumulative Scorecard
- Computes and highlights the candidate's **Overall average score** out of 10 in a prominent summary card at the bottom of the test.

---

## API Reference

### 1. Health Check
- **Endpoint**: `GET /api/health`
- **Description**: Verifies API availability.
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "message": "AI Interview Evaluator API is running"
  }
  ```

---

### 2. Generate Questions
- **Endpoint**: `POST /api/generate-questions`
- **Rate Limit**: 5 requests / min
- **Request Body**:
  ```json
  {
    "jobTitle": "Full Stack Engineer",
    "skills": ["React", "Node.js", "PostgreSQL"],
    "difficulty": "Medium"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "questions": [
      {
        "id": 1,
        "question": "How does React's virtual DOM reconciliation algorithm work?"
      },
      {
        "id": 2,
        "question": "Explain how you handle asynchronous errors in Express middleware."
      },
      {
        "id": 3,
        "question": "What indexing strategy would you use in PostgreSQL for high-volume range queries?"
      }
    ],
    "cached": false
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing fields or invalid difficulty.
  - `429 Too Many Requests`: Rate limit exceeded.
  - `502 Bad Gateway`: LLM service unavailable or invalid response.

---

### 3. Evaluate Responses
- **Endpoint**: `POST /api/evaluate-responses`
- **Rate Limit**: 5 requests / min
- **Request Body**:
  ```json
  {
    "responses": [
      {
        "id": 1,
        "question": "How does React's virtual DOM reconciliation algorithm work?",
        "answer": "It compares virtual DOM trees using a diffing algorithm..."
      },
      {
        "id": 2,
        "question": "Explain how you handle asynchronous errors in Express middleware.",
        "answer": "Using next(error) or Express 5 automatic promise rejection catching..."
      },
      {
        "id": 3,
        "question": "What indexing strategy would you use in PostgreSQL for high-volume range queries?",
        "answer": "B-Tree index or BRIN indexes for ordered sequential data..."
      }
    ]
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "evaluations": [
      {
        "id": 1,
        "score": 9,
        "feedback": "Strong explanation of the diffing heuristics and key props."
      },
      {
        "id": 2,
        "score": 8,
        "feedback": "Accurate coverage of Express 5 error propagation; could mention custom error handlers."
      },
      {
        "id": 3,
        "score": 8.5,
        "feedback": "Good differentiation between B-Tree and BRIN indexes."
      }
    ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Must provide exactly 3 questions with non-empty answers.
  - `429 Too Many Requests`: Rate limit exceeded.
  - `502 Bad Gateway`: LLM service failed to format evaluations.

---

## Setup & Installation

### Prerequisites
- **Node.js**: `v18.18+` or `v20+` recommended
- **npm**: `v9+` or `pnpm` / `yarn`
- **Groq API Key**: Obtain a free API key at [console.groq.com](https://console.groq.com/)
- **Redis (Optional)**: Local Redis instance or a cloud Redis instance (e.g., [Upstash](https://upstash.com/))

---

### Backend Configuration & Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the `backend/` directory:
   ```env
   # Server Configuration
   PORT=4000
   FRONTEND_URL=http://localhost:3000

   # AI Provider
   GROQ_API_KEY=your_groq_api_key_here

   # Cache (Optional: leave empty or omit to use internal in-memory cache)
   REDIS_URL=rediss://default:password@your-redis-host.upstash.io:6379
   ```

4. **Start the backend development server**:
   ```bash
   npm run dev
   ```
   The backend server will run on [http://localhost:4000](http://localhost:4000).

---

### Frontend Configuration & Setup

1. **Open a new terminal and navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` or `.env.local` file in the `frontend/` directory:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000/api
   ```

4. **Start the frontend development server**:
   ```bash
   npm run dev
   ```

5. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Production Build

### Backend
To compile TypeScript into JavaScript:
```bash
cd backend
npm run build
npm start
```

### Frontend
To produce an optimized Next.js production build:
```bash
cd frontend
npm run build
npm start
```

---

## Troubleshooting & FAQs

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **"GROQ_API_KEY is not configured"** | Missing or incorrect API key in `backend/.env`. | Verify that `GROQ_API_KEY` is set in `backend/.env` and restart the backend server. |
| **"Too many requests. Please try again in one minute."** | Exceeded the 5 requests/minute threshold. | Wait 60 seconds before making additional question generation or evaluation requests. |
| **"Redis unavailable; using memory cache"** | Redis host unreachable, invalid credentials, or offline. | No action required if you want in-memory caching. Otherwise, verify your `REDIS_URL` in `backend/.env`. |
| **CORS errors in browser console** | `FRONTEND_URL` in `backend/.env` doesn't match client URL. | Ensure `FRONTEND_URL=http://localhost:3000` matches the host and port of your Next.js application. |
| **"Please answer all three questions before evaluating"** | One or more text areas are blank or whitespace. | Provide text in each of the three question answer fields before submitting for evaluation. |
