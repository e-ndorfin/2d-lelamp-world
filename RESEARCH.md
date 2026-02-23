# Claw Town - Implementation Plan

## Context

Claw Town is an RPG sandbox simulation where OpenClaw agents from [Moltbook](https://www.moltbook.com/) (the AI-agent-only social network, 1.6M+ agents) interact autonomously in a 2D world. A physical [LeLamp](https://github.com/humancomputerlab/LeLamp) robot (open-source Pixar-style lamp from Human Computer Lab, Raspberry Pi + servo motors + LiveKit voice agents) serves as the human interface — it observes Claw Town and reports to humans via voice, with both **pull** (user asks LeLamp a question) and **push** (LeLamp proactively notifies about events) interaction modes.

Inspired by Stanford's [Generative Agents](https://arxiv.org/abs/2304.03442) paper.

The codebase is currently empty (greenfield).

### User Flow (from flowchart)
1. OpenClaw generates a world with different agents in a town
2. **Pull**: Person asks LeLamp for update → LeLamp accesses Claw Town → looks at what was asked → gives update
3. **Push**: LeLamp detects something interesting → tells person there's an update → person says yes → LeLamp gives rundown of latest events

---

## Problem Space: Multi-Agent Simulation Environments

### What is this?
An **agent simulation** is a virtual world where AI-powered characters (agents) live autonomously — they move around, talk to each other, form memories, make plans, and develop personalities over time. Humans observe from outside. The seminal work is Stanford's 2023 paper "Generative Agents: Interactive Simulacra of Human Behavior" (the Simulacra paper), which put 25 LLM-powered agents in a 2D town called Smallville and showed they exhibit believable human behavior: they remember past conversations, reflect on experiences, and even organize social events unprompted.

### Key Concepts

**Agent Cognitive Architecture** (from Simulacra paper):
- **Memory Stream**: Every observation/interaction stored with timestamp + importance score. Retrieved via recency × importance × relevance (embedding similarity).
- **Reflection**: Periodically, agent synthesizes higher-order insights from recent memories ("I keep visiting the library — I must value learning"). These reflections themselves become memories.
- **Planning**: Agent generates daily/hourly plans based on personality + reflections. Plans are hierarchical (day → hour → minute) and can be revised when new events occur.

**Game Master Pattern** (from DeepMind's Concordia):
- A central "Game Master" agent narrates the world and resolves actions, like a tabletop RPG DM. Individual agents propose actions, GM decides outcomes. This is conceptually what LeLamp does — it's the omniscient narrator/observer.

**Key Tradeoffs in the Space**:
- **Text-only vs visual**: Text sims are cheaper and simpler but less engaging to watch. Visual (2D/3D) sims require rendering, pathfinding, spatial state — more engineering but much more compelling as a product.
- **Centralized vs decentralized agents**: In centralized systems, one server runs all agents. In decentralized (like Moltbook/OpenClaw), each agent runs independently. Claw Town likely needs a centralized world simulation with an adapter for decentralized OpenClaw agents to plug in.
- **Real-time vs turn-based**: Real-time feels more alive but costs more LLM calls. Turn-based (batched steps) is more practical — AI Town uses 1-second batched steps.

### Landscape of Existing Frameworks

**Text-only multi-agent frameworks:**

- **[Concordia](https://github.com/google-deepmind/concordia)** (DeepMind, ~1.2k stars) — Python. The most architecturally elegant. Uses a "Game Master" that narrates the world + individual agents that propose actions. Agents are grounded in physical, social, and digital spaces. Very flexible — you define the world rules. No visual frontend. *Best for*: custom simulation logic, LeLamp-style observer patterns.

- **[CAMEL](https://github.com/camel-ai/camel)** (~14k stars) — Python. First LLM multi-agent framework. Focuses on role-playing communication between agents. Large community, many integrations. *Best for*: agent-to-agent dialogue research. Less relevant for a spatial RPG world.

- **[OASIS](https://github.com/camel-ai/oasis)** (~2.1k stars) — From CAMEL team. Simulates social media platforms (Twitter/Reddit clones) with up to 1M agents. Agents follow, comment, repost. Studies polarization and herd behavior. *Interesting for*: understanding how Moltbook-style dynamics emerge, but not for 2D RPG worlds.

- **[ChatArena](https://github.com/Farama-Foundation/chatarena)** (Farama Foundation, ~1.2k stars) — Python. Multi-agent language game environments (Werewolf, negotiation, debate). MDP-based framework. *Best for*: structured multi-agent games, not open-world RPG.

- **[AgentVerse](https://github.com/OpenBMB/AgentVerse)** (~4.7k stars) — Python. Two modes: task-solving (agents collaborate on problems) and simulation (agents interact in custom environments). Has a Pokemon-style visual sim demo. *Best for*: if you want both task-solving and simulation.

**2D/3D visual environments:**

- **[Generative Agents / Smallville](https://github.com/joonspk-research/generative_agents)** (Stanford, ~20k stars) — The original. Django backend + Phaser.js 2D frontend. Full cognitive architecture (memory, reflection, planning). 25 agents in a pixel-art town. Research code — works but not production-quality. *Best for*: most faithful implementation of the Simulacra paper.

- **[AI Town](https://github.com/a16z-infra/ai-town)** (a16z, ~9k stars) — The production-grade spiritual successor to Smallville. TypeScript end-to-end. Convex backend (real-time, transactional). PixiJS 2D rendering. Agents walk, talk, form memories. MIT licensed, actively maintained. Simpler cognitive model than Smallville but much more robust engineering. *Best for*: shipping a real product fastest.

- **[GPTRPG](https://github.com/dzoba/gptrpg)** (~500 stars) — Lightweight proof-of-concept. GPT agent in a 2D RPG world via Phaser + Grid Engine Plugin. Archived/unmaintained. *Best for*: inspiration only.

- **[Project Sid](https://github.com/altera-al/project-sid)** (Altera) — PIANO architecture for 10-1000+ agent civilizations in Minecraft. Agents develop roles, rules, religion, culture. Published as a research report, not a reusable framework. *Interesting for*: understanding what emergent behavior looks like at scale.

### How Claw Town Fits In

Claw Town sits at the intersection of:
1. **Simulacra-style cognitive agents** (memory + reflection + planning + personality)
2. **Visual 2D RPG world** (tile-based town, agents move and talk visually)
3. **OpenClaw/Moltbook ecosystem** (agents come from an existing social network)
4. **Physical hardware interface** (LeLamp robot as the human's window into the world)

No existing framework does all 4. The strategy is to pick the best base for #1 + #2, then build #3 and #4 as integration layers on top.

---

## Framework Options (pick one as base)

### Option A: Fork AI Town (Recommended for fastest path to demo)

**[a16z-infra/ai-town](https://github.com/a16z-infra/ai-town)** — ~9k stars, MIT, actively maintained (Feb 2025)

| Pro | Con |
|-|-|
| 2D world rendering (PixiJS), real-time sync, tick-based engine, pathfinding, conversations, vector-search memory all built | Locked into Convex as backend (proprietary BaaS) |
| Deploys out of the box | Opinionated architecture — customization has ceiling |
| TypeScript end-to-end | Agent cognitive model is simpler than Simulacra paper |

**Stack**: React + PixiJS + Convex + Clerk + Vite
**Effort to MVP**: ~4 weeks (extend existing code)

### Option B: Fork Generative Agents (Smallville) (Closest to Simulacra paper)

**[joonspk-research/generative_agents](https://github.com/joonspk-research/generative_agents)** — ~20k stars, the original Stanford implementation

| Pro | Con |
|-|-|
| Full Simulacra cognitive architecture (memory stream, reflection, planning) already implemented | Research code, not production-grade |
| Django backend + Phaser 2D frontend | Not actively maintained |
| Most faithful to the paper's vision | Python backend, JS frontend — split stack |

**Stack**: Django + Phaser.js + PostgreSQL
**Effort to MVP**: ~6 weeks (production-hardening + extending)

### Option C: Build from Scratch with Concordia + Custom Frontend

**[google-deepmind/concordia](https://github.com/google-deepmind/concordia)** for agent simulation + custom 2D frontend

| Pro | Con |
|-|-|
| DeepMind's Game Master pattern is ideal for LeLamp's observer role | No visual frontend — must build 2D rendering from scratch |
| Python, very flexible, actively maintained | Most engineering effort |
| Clean separation of simulation and presentation | Need to build real-time sync layer |

**Stack**: Python (Concordia) + React + PixiJS + WebSocket + PostgreSQL/Redis
**Effort to MVP**: ~8-10 weeks

### Option D: Build from Scratch (Full custom)

No fork — build everything bespoke.

| Pro | Con |
|-|-|
| Total control over every layer | 3-4 months to MVP |
| No framework constraints | Solving already-solved problems (pathfinding, tile rendering, etc.) |
| Choose any tech stack | High risk of scope creep |

**Stack**: Whatever you want (e.g. Next.js + Phaser + Supabase + Python agent runtime)
**Effort to MVP**: ~12-16 weeks

---

## Architecture (framework-agnostic design)

### Layer 1: World Simulation Engine
- Tick-based simulation loop (1-second batched steps)
- Tile-based 2D map with locations (homes, shops, park, library, etc.)
- Agent pathfinding and spatial state
- Conversation system (agents initiate/join/leave conversations)

### Layer 2: Agent Cognitive System
Extends OpenClaw agents with Simulacra-inspired cognition:
- **Memory Stream** — All observations stored with importance score (1-10 via LLM) + recency decay + relevance (embedding similarity)
- **Reflection** — Every N memories, agent synthesizes higher-order insights ("I've been spending time at the library. I value learning."). Stored back with high importance.
- **Planning** — Daily/hourly schedule generation based on personality archetype + reflections. Plans guide action selection.
- **Personality Layer** — Archetype injected into all LLM prompts:

```typescript
interface Archetype {
  name: 'Adventurous' | 'Creative' | 'Educational' | 'Peaceful' | 'Orderly' | 'Social';
  systemPrompt: string;                    // Narrative voice
  activityWeights: Record<string, number>; // Location/activity bias
  socialBias: number;                      // -1 (loner) to 1 (social)
  reflectionFrequency: number;
  emotionalVolatility: number;
}
```

### Layer 3: LeLamp Integration
LeLamp is a **physical robot lamp** (Raspberry Pi, servo motors, LiveKit voice agents, ESP32). Integration:

**Software bridge (new service):**
- Subscribes to all world events (agent movements, conversations, reflections, plan changes)
- Maintains a **World Narrative Log** — running LLM-compressed summary of events
- Two APIs:
  - `askLeLamp(question: string) → string` — Pull mode. Vector-search over narrative log + current world snapshot → natural language answer
  - `getLatestUpdates() → Update[]` — Push mode. Returns significant events since last check, ranked by interestingness score
- Connects to LeLamp hardware via **LiveKit** (LeLamp runtime already uses LiveKit voice agents for real-time speech)

**Push notification flow:**
1. World event occurs (e.g., two agents have a dramatic conversation)
2. Event importance scored by LLM
3. If above threshold → queued as notification
4. LeLamp hardware receives notification via LiveKit → physically animates (tilts toward user) → speaks update
5. User responds verbally → LeLamp relays follow-up questions back to `askLeLamp`

### Layer 4: OpenClaw/Moltbook Integration
- **OpenClaw Skill**: Build a custom OpenClaw skill (`claw-town-skill`) that lets any OpenClaw agent join Claw Town
  - Skill reads agent's existing personality/backstory from its OpenClaw config
  - Maps personality → Claw Town archetype weights via adapter
  - Registers agent in the world, spawns at town entrance
  - Agent's in-world actions can optionally post back to Moltbook (cross-platform storytelling)
- **Moltbook recruitment**: Post a link on Moltbook inviting agents to join Claw Town (agents install the skill, join automatically)

### Layer 5: 2D Frontend
- PixiJS or Phaser for tile-based 2D rendering
- Real-time view of agents moving, talking, emoting
- Speech bubbles for conversations
- Human observer mode (watch the world through browser)
- Optional: LeLamp's "view" rendered on a companion web dashboard

---

## Implementation Phases

### Phase 1: Foundation + Moltbot Sandbox (Weeks 1-4)
1. Set up base framework (fork or scaffold depending on option chosen)
2. Design custom RPG town tile map in Tiled
3. Implement archetype system with 6 personality types
4. Implement Simulacra cognitive architecture (memory stream, reflection, planning)
5. Build OpenClaw skill + adapter for moltbot → agent conversion
6. Deploy and test with 5-10 OpenClaw agents interacting autonomously
7. **Success**: Agents with distinct personalities move around, talk, form memories

### Phase 2: LeLamp Observer (Weeks 5-7)
1. Build world narrative log system (event subscription + LLM summarization)
2. Implement `askLeLamp` query API (pull mode)
3. Implement push notification system with importance scoring
4. Build LiveKit bridge to connect Claw Town backend → LeLamp hardware
5. Test pull: ask LeLamp "How is Villager 1 doing?" → accurate voice response
6. Test push: LeLamp physically animates and speaks when something interesting happens
7. **Success**: LeLamp accurately reports on Claw Town via voice

### Phase 3: Gamification + Multi-LeLamp (Weeks 8-10)
1. Gate world access behind LeLamp device ownership (auth token from hardware)
2. Multiple LeLamp instances with specialized observer roles ("Town Historian", "Gossip Reporter", etc.)
3. LeLamp-to-LeLamp communication (shared narrative, different perspectives)
4. Emergent event detection (LeLamp notices patterns → creates narrative arcs)
5. **Success**: Multiple LeLamps with distinct perspectives, gated access working

---

## Risks & Mitigations

- **LLM Cost**: Many agents = many API calls. Use tiered models (cheap for movement/routine, expensive for conversations/reflections). Cache common prompts. Consider local models for simple decisions.
- **Convex State Size** (if using AI Town): State should stay under 100KB. Monitor and shard worlds if needed.
- **LeLamp hardware latency**: LiveKit is real-time, but LLM response generation adds latency. Pre-compute periodic summaries so push notifications are instant.
- **OpenClaw API stability**: OpenClaw is young and evolving fast. Pin to a specific version, abstract behind adapter layer.

---

## Open Source Frameworks Reference

### Text-Only Multi-Agent

| Framework | Stars | Notes |
|-|-|-|
| [Concordia](https://github.com/google-deepmind/concordia) (DeepMind) | ~1.2k | Game Master pattern, Python, actively maintained |
| [CAMEL](https://github.com/camel-ai/camel) | ~14k | Role-playing agent communication, largest community |
| [OASIS](https://github.com/camel-ai/oasis) | ~2.1k | Social media simulator, scales to 1M agents |
| [AgentVerse](https://github.com/OpenBMB/AgentVerse) | ~4.7k | Task-solving + simulation modes |
| [ChatArena](https://github.com/Farama-Foundation/chatarena) (Farama) | ~1.2k | Multi-agent language games (Werewolf, negotiation) |

### 2D/3D Visual Multi-Agent

| Framework | Stars | Notes |
|-|-|-|
| [Generative Agents](https://github.com/joonspk-research/generative_agents) (Stanford) | ~20k | Original Simulacra implementation, Django + Phaser |
| [AI Town](https://github.com/a16z-infra/ai-town) (a16z) | ~9k | Production-ready JS/TS, Convex + PixiJS, MIT |
| [GPTRPG](https://github.com/dzoba/gptrpg) | ~500 | Lightweight GPT agent in 2D RPG, Phaser |

---

## Verification

1. **Phase 1**: Deploy world, load custom map, spawn 5+ agents with different archetypes, verify personality-consistent movement/talking/memory
2. **Phase 2**: Ask LeLamp "What has Villager 1 been doing?" via voice → accurate narrative response. Wait for push notification → LeLamp physically animates and speaks about an interesting event.
3. **Phase 3**: Non-LeLamp-owner blocked from entry. Two LeLamps with different roles give different perspectives on same event.
