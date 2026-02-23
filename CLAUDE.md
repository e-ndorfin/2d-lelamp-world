# Claw Town

## Project
Fork of [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town). RPG sandbox where OpenClaw/Moltbook agents interact autonomously, observed by LeLamp (physical robot lamp).

## Tech Stack
- Frontend: React + PixiJS (@pixi/react), Vite
- Backend: Convex (real-time BaaS)
- LLM: OpenRouter (`minimax/minimax-m2-her`) via `convex/util/llm.ts`
- Map: Tiled format (20x20), rendered with PixiJS
- 5 active agents: Lucky, Bob, Stella, Alice, Pete (defined in `data/characters.ts`)

## Key Files
- `convex/util/llm.ts` — LLM config, chat completion, embeddings. Controls model selection, API calls, and provider-specific parameter handling.
- `convex/agent/conversation.ts` — Agent conversation logic (start, continue, leave messages)
- `convex/agent/memory.ts` — Agent memory system
- `convex/aiTown/agent.ts` — Agent tick loop, operation scheduling, conversation initiation
- `convex/aiTown/agentOperations.ts` — Agent actions: doSomething, generateMessage, rememberConversation
- `convex/aiTown/movement.ts` — Pathfinding (A*), collision detection
- `convex/constants.ts` — All timing constants (cooldowns, timeouts, thresholds)
- `data/characters.ts` — Agent definitions (name, identity, plan, sprite). 3 more commented out (Alex, Kurt, Kira).
- `src/App.tsx` — Main app shell (stripped down to just Game component)
- `src/components/Game.tsx` — Game canvas + right panel layout
- `src/components/PixiGame.tsx` — PixiJS rendering
- `src/components/PlayerDetails.tsx` — Right panel (agent details, chat history)

## LLM Provider Config
Provider is determined by env vars in this priority order:
1. `LLM_PROVIDER=openai` or `OPENAI_API_KEY` → OpenAI direct
2. `TOGETHER_API_KEY` → Together.ai
3. `LLM_API_URL` + `LLM_MODEL` + `LLM_EMBEDDING_MODEL` → Custom (OpenRouter, etc.)
4. Fallback → Ollama local

Currently using OpenRouter (custom provider) with `minimax/minimax-m2-her`.

## Gotchas
- **OpenAI parameter compatibility**: GPT-5 Nano rejects `max_tokens` (use `max_completion_tokens`), doesn't support `stop`, and only allows `temperature: 1`. Handled automatically for `provider: 'openai'` in `chatCompletion`.
- **Custom provider (OpenRouter) strips `stop`**: Many OpenRouter models (e.g. Minimax) don't support the `stop` parameter and return malformed responses. `stop` is stripped for custom providers in `chatCompletion`. Stop-word truncation is NOT done client-side for non-streamed responses (only streamed responses have it).
- **Minimax requires a `user` message**: Will error with "chat content is empty" if only a `system` message is sent. `startConversationMessage` sends the `"Player to OtherPlayer:"` prompt as a separate `user` message to satisfy this.
- **LLM_API_URL must NOT include `/v1`**: The code appends `/v1/chat/completions` and `/v1/embeddings` itself. So OpenRouter URL should be `https://openrouter.ai/api`, NOT `https://openrouter.ai/api/v1`.
- **Embedding dimension**: Must match the LLM provider. Set in `convex/util/llm.ts` via `EMBEDDING_DIMENSION`. Currently `1536` (OpenAI). Switching providers requires a DB wipe (`npx convex run testing:wipeAllTables`).
- **`wipeAllTables`**: Deletes all rows from every table except `embeddingsCache`. Need to re-run `npx convex run init` after to reseed the world.
- **Simulation auto-pauses** after 5 min of browser inactivity. Reload to resume.
- **Stuck engine**: Run `npx convex run testing:kick` to unstick.
- **Agents not moving**: Usually means LLM calls are failing. Each agent's `inProgressOperation` gets stuck until `ACTION_TIMEOUT` (120s). Check Convex logs for errors.

## Agent Behavior Loop
1. Agent `tick()` in `agent.ts` fires each game step
2. If idle (no conversation, no activity, no pathfinding) → starts `agentDoSomething` operation
3. `agentDoSomething` decides: wander to random tile, do an activity (read/daydream/garden), or invite someone to talk
4. Conversations: invite → accept/reject → walk to each other → exchange messages via LLM → leave → remember
5. Cooldowns prevent spam: 15s after conversation, 60s before re-talking to same player, 10s between activities
