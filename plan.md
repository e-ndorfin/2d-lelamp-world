# Plan: Proximity-Based, Event-Driven, LLM-Autonomous Agent System

## Overview

Transform the agent system from a **polling-based, game-decided, 1:1 conversation** model to a **proximity-based, LLM-driven, event-triggered, group conversation** model.

### Current → Target

| Aspect | Current | Target |
|--------|---------|--------|
| Actions | Game picks random (wander/activity/invite) | LLM decides from structured action set |
| Conversations | 1:1, invite→accept→walkOver→participate | Group, proximity-based, any nearby agent can join |
| Triggers | Pure polling (agent.tick every ~1s) | Polling + event-driven (message nearby → immediate reaction) |
| Feel | Mechanical, cooldown-gated | Organic, reactive, LLM-paced |

---

## Step 1: Add Proximity Utilities to World

**File: `convex/aiTown/world.ts`**

Add helper methods:
- `nearbyPlayers(position, radius)` → returns all players within radius
- `nearbyConversations(position, radius)` → returns conversations where any participant is within radius
- `nearbyAgents(position, radius)` → returns agents whose players are within radius

These will be used by both the tick loop and event triggers.

**File: `convex/constants.ts`**

Add:
- `PROXIMITY_RADIUS = 4` — tiles within which agents can hear/see each other
- `REACTION_COOLDOWN = 3000` — minimum ms between event-triggered reactions (prevents spam)

---

## Step 2: Replace `agentDoSomething` with LLM-Driven `agentDecideAction`

**File: `convex/aiTown/agentOperations.ts`**

Replace `agentDoSomething` with `agentDecideAction`. Instead of random selection, this calls the LLM with full context and gets back a structured action.

**Structured Action Schema** (what the LLM returns as JSON):
```typescript
type AgentAction =
  | { type: 'move_to', x: number, y: number }    // Walk to a location
  | { type: 'speak', message: string }             // Say something aloud (starts/continues conversation)
  | { type: 'start_activity', description: string, emoji: string, duration: number }
  | { type: 'observe' }                            // Do nothing, stay aware
```

**LLM Prompt Context** (sent to the model):
- Agent's identity and plan (from agentDescriptions)
- Agent's current position and current activity (if any)
- Nearby players: names, positions, what they're doing
- Nearby active conversations: recent messages (last 3-5)
- Agent's relevant memories
- Available actions as a JSON schema with descriptions

**New query: `queryActionContext`** in `convex/agent/conversation.ts` (or a new `convex/agent/action.ts`):
- Fetches all the above context
- Returns it in a prompt-ready format

The LLM response is parsed as JSON. If parsing fails, fall back to `{ type: 'observe' }`.

---

## Step 3: Rewrite Conversations for Proximity-Based Groups

**File: `convex/aiTown/conversation.ts`**

Major changes:
- **Remove** the invite/accept/reject/walkingOver state machine entirely
- A conversation is now **location-anchored**: it has a position (midpoint of participants)
- Any agent within `PROXIMITY_RADIUS` of an active conversation can join it
- Conversations are created when an agent uses the `speak` action and there's no existing nearby conversation
- If there IS an existing nearby conversation, the `speak` action adds to it instead

**New Conversation model:**
```typescript
class Conversation {
  id: GameId<'conversations'>;
  created: number;
  position: Point;                    // Anchor position (updated as participants move)
  participants: Map<PlayerId, ConversationMembership>;  // All just 'participating'
  isTyping?: { playerId, messageUuid, since };
  lastMessage?: { author, timestamp };
  numMessages: number;
}
```

**ConversationMembership simplification:**
- Remove `invited` and `walkingOver` states
- Only `participating` remains (with `joined: number` timestamp)
- Add `left?: number` for when someone walks away

**New methods:**
- `Conversation.startAtLocation(game, now, player, position)` — creates a new conversation
- `conversation.addParticipant(player, now)` — agent joins an ongoing conversation
- `conversation.removeParticipant(player, now)` — agent leaves (walked away or chose to leave)

**Modified `tick()`:**
- Check all agents within `PROXIMITY_RADIUS` of conversation position
- Auto-add agents that are close and not yet participating
- Auto-remove agents that have moved away beyond radius
- Orient all participants towards conversation center (not just 2 players)

---

## Step 4: Update Agent Tick Loop

**File: `convex/aiTown/agent.ts`**

The `tick()` method changes significantly:

```
Agent.tick(now):
  1. If inProgressOperation exists and not timed out → wait

  2. If toRemember set → startOperation('agentRememberConversation')

  3. If idle (no conversation, no activity, not pathfinding)
     AND enough time since last decision:
       → startOperation('agentDecideAction', {
           worldId, player, agent, map,
           nearbyPlayers,        // NEW: all players within PROXIMITY_RADIUS
           nearbyConversations,  // NEW: active conversations + recent messages
         })

  4. If in a conversation and it's our turn to speak
     (lastMessage wasn't from us, or no messages yet):
       → startOperation('agentDecideAction', { ...same context })
       // The LLM may choose to speak, observe, or leave

  5. If in a conversation too long → auto-leave (safety valve)
```

Key differences:
- No more invite/accept/reject logic in tick
- No more walking-over-to-start-conversation
- Conversations start instantly when agents speak near each other
- The LLM decides whether to continue talking, not the game loop

**New fields on Agent:**
- `lastReaction?: number` — timestamp of last event-triggered reaction
- Remove `lastInviteAttempt` (no more invites)

---

## Step 5: Add Event Trigger System

**File: `convex/aiTown/agentInputs.ts`**

When a message is sent (via `agentFinishSendingMessage`), we need to trigger nearby agents:

**Modified `agentFinishSendingMessage` handler:**
```
After processing the message:
  1. Get the speaking player's position
  2. Find all agents within PROXIMITY_RADIUS
  3. For each nearby agent:
     - If no inProgressOperation
     - If not on reaction cooldown
     → Add to a "pendingReactions" list on the game
```

**New mechanism in `game.ts`:**
- After processing inputs, check for pending reactions
- For each pending reaction, schedule an `agentDecideAction` operation for that agent
- This happens within the same tick, so the agent reacts almost immediately

This way, when Bob says something and Alice is nearby:
1. Bob's message is processed as an input
2. The input handler sees Alice is within proximity
3. Alice's `agentDecideAction` is scheduled immediately
4. Alice responds in the next few seconds (LLM call time), not after 15s

---

## Step 6: Update LLM Conversation Prompts for Groups

**File: `convex/agent/conversation.ts`**

Replace `startConversationMessage`, `continueConversationMessage`, `leaveConversationMessage` with a unified approach that works through the `agentDecideAction` path:

When the LLM chooses `{ type: 'speak', message: '...' }`, the message is the LLM's output directly. No need for separate start/continue/leave message generation — the LLM decides what to say (including goodbyes) as part of its action decision.

**Modified `queryPromptData`:**
- Accept multiple `otherPlayerIds` instead of a single `otherPlayerId`
- Return all participants' descriptions
- Include recent messages from ALL participants (not just two)

**Modified `previousMessages`:**
- Format as group chat: `"Alice: Hey everyone!"` instead of `"Alice to Bob: Hey"`

---

## Step 7: Update Input Handlers

**File: `convex/aiTown/agentInputs.ts`**

Replace `finishDoSomething` with `finishDecideAction`:
```typescript
finishDecideAction: inputHandler({
  args: {
    operationId: string,
    agentId,
    // The LLM's chosen action:
    action: v.union(
      v.object({ type: v.literal('move_to'), x: v.number(), y: v.number() }),
      v.object({ type: v.literal('speak'), message: v.string() }),
      v.object({ type: v.literal('start_activity'), description: v.string(), emoji: v.string(), duration: v.number() }),
      v.object({ type: v.literal('observe') }),
    ),
  },
  handler: (game, now, args) => {
    // Clear inProgressOperation
    // Execute the action:
    switch (args.action.type):
      'move_to' → movePlayer(...)
      'speak' → find/create nearby conversation, insert message, trigger nearby agents
      'start_activity' → set player.activity
      'observe' → do nothing (agent will be prompted again on next tick or event)
  },
})
```

---

## Step 8: Schema & Data Changes

**File: `convex/aiTown/schema.ts`**

- Update `conversations` to include `position` field
- Simplify `conversationMembership` to remove `invited`/`walkingOver`

**File: `convex/aiTown/conversationMembership.ts`**
- Simplify status to just `{ kind: 'participating', started: number }`

**Migration:** This changes the world document shape. Will need `npx convex run testing:wipeAllTables` + `npx convex run init` to reseed.

---

## Step 9: Update Constants

**File: `convex/constants.ts`**

```typescript
// NEW
export const PROXIMITY_RADIUS = 4;           // Tiles - agents can hear/see within this range
export const REACTION_COOLDOWN = 3000;        // ms - min time between event-triggered reactions
export const DECIDE_ACTION_COOLDOWN = 10000;  // ms - min time between autonomous decisions (polling)
export const MAX_CONVERSATION_PARTICIPANTS = 5; // Max agents in one conversation

// MODIFY
export const CONVERSATION_COOLDOWN = 5000;    // Reduce from 15s to 5s (more organic)
export const MAX_CONVERSATION_MESSAGES = 20;  // Increase from 8 (group chats go longer)

// REMOVE
// INVITE_ACCEPT_PROBABILITY (no invites)
// INVITE_TIMEOUT (no invites)
// MIDPOINT_THRESHOLD (no walking over)
// AWKWARD_CONVERSATION_TIMEOUT (LLM decides when to talk)
```

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `convex/constants.ts` | Modify | Add proximity constants, remove invite constants |
| `convex/aiTown/world.ts` | Modify | Add `nearbyPlayers()`, `nearbyConversations()`, `nearbyAgents()` |
| `convex/aiTown/agent.ts` | **Major rewrite** | New tick loop, remove invite logic, add event reaction support |
| `convex/aiTown/agentOperations.ts` | **Major rewrite** | Replace `agentDoSomething` with `agentDecideAction` |
| `convex/aiTown/conversation.ts` | **Major rewrite** | Remove invite system, add proximity-based group conversations |
| `convex/aiTown/conversationMembership.ts` | Modify | Simplify to just 'participating' status |
| `convex/aiTown/agentInputs.ts` | **Major rewrite** | Replace `finishDoSomething` with `finishDecideAction`, add event triggers |
| `convex/agent/conversation.ts` | **Major rewrite** | Group conversation prompts, unified action-decision prompt |
| `convex/aiTown/inputs.ts` | Minor | Updated imports (automatic) |
| `convex/aiTown/game.ts` | Modify | Support pending reactions in save/dispatch |
| `convex/aiTown/schema.ts` | Modify | Update conversation schema |
| `data/characters.ts` | Modify | Update agent plans to reflect new autonomous behavior |

---

## Implementation Order

1. **Constants & utilities first** (Steps 1, 9) — low risk, no behavior change
2. **Conversation rewrite** (Step 3) — core data model change
3. **Agent tick & action system** (Steps 2, 4, 7) — new behavior loop
4. **Event triggers** (Step 5) — reactive layer on top
5. **LLM prompts** (Step 6) — make it all sound natural
6. **Schema & migration** (Step 8) — wipe and reseed

---

## Risks & Mitigations

- **LLM latency**: Each action decision requires an LLM call (~2-5s). Mitigated by having agents `observe` (no-op) as a valid action, so they don't block.
- **LLM cost**: More frequent calls. Mitigated by `DECIDE_ACTION_COOLDOWN` (10s polling) and `REACTION_COOLDOWN` (3s events).
- **JSON parsing failures**: LLM might not return valid JSON. Mitigated by fallback to `observe` action.
- **Operation lock contention**: If an agent is mid-LLM-call when an event fires, it can't react. Mitigated by the existing timeout mechanism — events are best-effort, the next tick will catch it.
- **Conversation spam**: Multiple agents all speaking at once. Mitigated by `isTyping` lock and `MAX_CONVERSATION_PARTICIPANTS`.
