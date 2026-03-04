import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH } from '../constants';

const selfInternal = internal.agent.action;

export type AgentAction =
  | { type: 'move_to'; x: number; y: number }
  | { type: 'speak'; message: string; conversationId?: string }
  | { type: 'join_conversation'; conversationId: string }
  | { type: 'leave_conversation' }
  | { type: 'start_activity'; description: string; emoji: string; duration: number }
  | { type: 'observe' };

export async function decideAction(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  agentPlayerId: GameId<'players'>,
  agentId: GameId<'agents'>,
  nearbyPlayerIds: string[],
  nearbyConversationIds: string[],
): Promise<AgentAction> {
  const context = await ctx.runQuery(selfInternal.queryActionContext, {
    worldId,
    playerId: agentPlayerId,
    agentId,
    nearbyPlayerIds,
    nearbyConversationIds,
  });

  if (!context) {
    return { type: 'observe' };
  }

  const embedding = await embeddingsCache.fetch(
    ctx,
    `${context.playerName} is deciding what to do`,
  );
  const memories = await memory.searchMemories(
    ctx,
    agentPlayerId,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  );

  const prompt = buildActionPrompt(context, memories);

  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: `What will ${context.playerName} do next? Respond with a single JSON action.` },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  return parseAction(content);
}

interface ActionContext {
  playerName: string;
  position: { x: number; y: number };
  currentActivity?: { description: string; emoji?: string };
  identity: string;
  plan: string;
  nearbyPlayers: Array<{
    name: string;
    position: { x: number; y: number };
    activity?: { description: string; emoji?: string };
  }>;
  nearbyConversations: Array<{
    conversationId: string;
    participantNames: string[];
    recentMessages: Array<{ authorName: string; text: string }>;
  }>;
  currentConversation?: {
    conversationId: string;
    participantNames: string[];
    recentMessages: Array<{ authorName: string; text: string }>;
  };
}

function buildActionPrompt(context: ActionContext, memories: memory.Memory[]): string {
  const lines: string[] = [];

  lines.push(`You are ${context.playerName}.`);
  lines.push(`About you: ${context.identity}`);
  lines.push(`Your current goals: ${context.plan}`);
  lines.push('');
  lines.push(`You are at position (${Math.floor(context.position.x)}, ${Math.floor(context.position.y)}).`);

  if (context.currentActivity) {
    lines.push(`You are currently ${context.currentActivity.description}${context.currentActivity.emoji ? ' ' + context.currentActivity.emoji : ''}.`);
  }

  if (context.nearbyPlayers.length > 0) {
    lines.push('');
    lines.push('Nearby:');
    for (const p of context.nearbyPlayers) {
      const activityStr = p.activity ? `, ${p.activity.description}${p.activity.emoji ? ' ' + p.activity.emoji : ''}` : '';
      lines.push(`- ${p.name} is at (${Math.floor(p.position.x)}, ${Math.floor(p.position.y)})${activityStr}`);
    }
  }

  if (context.currentConversation) {
    lines.push('');
    lines.push(`You are currently in a conversation with: ${context.currentConversation.participantNames.join(', ')}`);
    if (context.currentConversation.recentMessages.length > 0) {
      lines.push('Recent messages:');
      for (const msg of context.currentConversation.recentMessages.slice(-5)) {
        lines.push(`  ${msg.authorName}: "${msg.text}"`);
      }
    }
  }

  const otherConversations = context.nearbyConversations.filter(
    (c) => c.conversationId !== context.currentConversation?.conversationId,
  );
  if (otherConversations.length > 0) {
    lines.push('');
    lines.push('Nearby conversations:');
    for (const conv of otherConversations) {
      lines.push(`- ${conv.participantNames.join(' and ')} are chatting (conversationId: "${conv.conversationId}"):`);
      for (const msg of conv.recentMessages.slice(-3)) {
        lines.push(`    ${msg.authorName}: "${msg.text}"`);
      }
    }
  }

  if (memories.length > 0) {
    lines.push('');
    lines.push('Your relevant memories:');
    for (const mem of memories) {
      lines.push(`- ${mem.description}`);
    }
  }

  lines.push('');
  lines.push('Choose your next action. Respond with ONLY a JSON object, one of:');

  if (context.currentConversation) {
    lines.push('{ "type": "speak", "message": "what you want to say" } — continue the conversation');
    lines.push('{ "type": "leave_conversation" } — politely leave');
    lines.push('{ "type": "observe" } — stay quiet and listen');
  } else {
    lines.push('{ "type": "speak", "message": "what you want to say" } — say something to people nearby (starts a conversation)');
    if (otherConversations.length > 0) {
      lines.push('{ "type": "join_conversation", "conversationId": "..." } — walk over and join a nearby chat');
    }
    lines.push('{ "type": "move_to", "x": <number>, "y": <number> } — walk to a tile');
    lines.push('{ "type": "start_activity", "description": "...", "emoji": "...", "duration": <milliseconds> } — do an activity');
    lines.push('{ "type": "observe" } — do nothing for now');
  }

  lines.push('');
  lines.push('Guidelines:');
  lines.push('- If someone nearby said something, respond naturally');
  lines.push('- Keep messages brief and in character (under 200 characters)');
  lines.push('- Be social — join conversations that interest you');
  lines.push('- Do activities when nobody interesting is around');

  return lines.join('\n');
}

export function parseAction(content: string): AgentAction {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in LLM response, falling back to observe:', content);
      return { type: 'observe' };
    }
    const parsed = JSON.parse(jsonMatch[0]);

    switch (parsed.type) {
      case 'move_to':
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return { type: 'move_to', x: Math.floor(parsed.x), y: Math.floor(parsed.y) };
        }
        break;
      case 'speak':
        if (typeof parsed.message === 'string' && parsed.message.length > 0) {
          return {
            type: 'speak',
            message: parsed.message.slice(0, 500),
            conversationId: parsed.conversationId,
          };
        }
        break;
      case 'join_conversation':
        if (typeof parsed.conversationId === 'string') {
          return { type: 'join_conversation', conversationId: parsed.conversationId };
        }
        break;
      case 'leave_conversation':
        return { type: 'leave_conversation' };
      case 'start_activity':
        if (typeof parsed.description === 'string' && typeof parsed.emoji === 'string') {
          return {
            type: 'start_activity',
            description: parsed.description.slice(0, 100),
            emoji: parsed.emoji.slice(0, 4),
            duration: typeof parsed.duration === 'number' ? Math.min(parsed.duration, 120_000) : 60_000,
          };
        }
        break;
      case 'observe':
        return { type: 'observe' };
    }

    console.warn('Invalid action from LLM, falling back to observe:', parsed);
    return { type: 'observe' };
  } catch (e) {
    console.warn('Failed to parse LLM action response:', content, e);
    return { type: 'observe' };
  }
}

export const queryActionContext = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId: v.string(),
    nearbyPlayerIds: v.array(v.string()),
    nearbyConversationIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ActionContext | null> => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }

    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) return null;

    const playerDesc = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDesc) return null;

    const agent = world.agents.find((a) => a.id === args.agentId);
    if (!agent) return null;

    const agentDesc = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .first();
    if (!agentDesc) return null;

    // Build nearby players context
    const nearbyPlayers: ActionContext['nearbyPlayers'] = [];
    for (const npId of args.nearbyPlayerIds) {
      const np = world.players.find((p) => p.id === npId);
      if (!np) continue;
      const npDesc = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', npId))
        .first();
      if (!npDesc) continue;
      nearbyPlayers.push({
        name: npDesc.name,
        position: np.position,
        activity: np.activity ? { description: np.activity.description, emoji: np.activity.emoji } : undefined,
      });
    }

    // Build nearby conversations context
    const nearbyConversations: ActionContext['nearbyConversations'] = [];
    let currentConversation: ActionContext['currentConversation'] = undefined;

    for (const convId of args.nearbyConversationIds) {
      const conv = world.conversations.find((c) => c.id === convId);
      if (!conv) continue;

      // Get participant names
      const participantNames: string[] = [];
      for (const participant of conv.participants) {
        const pDesc = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', participant.playerId))
          .first();
        if (pDesc) participantNames.push(pDesc.name);
      }

      // Get recent messages
      const messages = await ctx.db
        .query('messages')
        .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', convId))
        .collect();
      const recentMessages = messages.slice(-5).map((m) => {
        const authorDesc = nearbyPlayers.find((p) => {
          // match by looking up playerDesc name
          return false; // will be resolved below
        });
        return { authorName: '', text: m.text, author: m.author };
      });

      // Resolve author names properly
      const resolvedMessages: Array<{ authorName: string; text: string }> = [];
      for (const m of messages.slice(-5)) {
        const authorDesc = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', m.author))
          .first();
        resolvedMessages.push({
          authorName: authorDesc?.name ?? 'Unknown',
          text: m.text,
        });
      }

      const convContext = {
        conversationId: convId,
        participantNames,
        recentMessages: resolvedMessages,
      };

      // Check if agent is in this conversation
      const isParticipant = conv.participants.some((p) => p.playerId === args.playerId);
      if (isParticipant) {
        currentConversation = convContext;
      } else {
        nearbyConversations.push(convContext);
      }
    }

    return {
      playerName: playerDesc.name,
      position: player.position,
      currentActivity: player.activity
        ? { description: player.activity.description, emoji: player.activity.emoji }
        : undefined,
      identity: agentDesc.identity,
      plan: agentDesc.plan,
      nearbyPlayers,
      nearbyConversations,
      currentConversation,
    };
  },
});
