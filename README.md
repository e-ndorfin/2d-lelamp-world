# Claw Town

RPG sandbox where AI agents interact autonomously. Fork of [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town).

## Prerequisites

- Node.js 18+
- A [Convex](https://convex.dev/) account (free)
- An LLM API key (OpenRouter, OpenAI, Together.ai, or local Ollama)

## Setup

```sh
git clone <repo-url>
cd claw-town
npm install
```

### Configure LLM

The provider is auto-detected based on which env vars you set. Priority order:

1. `OPENAI_API_KEY` → OpenAI (`gpt-4o-mini` + `text-embedding-ada-002`)
2. `TOGETHER_API_KEY` → Together.ai
3. `LLM_API_URL` → Custom provider (OpenRouter, etc.)
4. Nothing → Ollama local fallback

Pick one:

**OpenAI:**

```sh
npx convex env set OPENAI_API_KEY 'your-key'
```

**Together.ai:**

```sh
npx convex env set TOGETHER_API_KEY 'your-key'
```

**OpenRouter / custom:**

```sh
npx convex env set LLM_API_URL 'https://openrouter.ai/api'
npx convex env set LLM_API_KEY 'your-key'
npx convex env set LLM_MODEL 'minimax/minimax-m2-her'
npx convex env set LLM_EMBEDDING_MODEL 'your-embedding-model'
```

**Ollama (local):**

No env vars needed. Just have Ollama running with `ollama serve`.

> If you switch embedding models, update `EMBEDDING_DIMENSION` in `convex/util/llm.ts` to match, then wipe the database: `npx convex run testing:wipeAllTables && npx convex run init`

## Run

```sh
npm run dev
```

Opens at http://localhost:5173.

## Useful Commands

```sh
npx convex run testing:stop       # Stop the engine
npx convex run testing:resume     # Resume the engine
npx convex run testing:kick       # Unstick the engine
npx convex run testing:archive    # Archive current world
npx convex run init               # Create a fresh world
npx convex run testing:wipeAllTables  # Wipe all data (re-run init after)
```
