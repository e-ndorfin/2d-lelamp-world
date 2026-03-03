import { v } from 'convex/values';
import { internalMutation, internalQuery, internalAction } from '../_generated/server';
import { action, mutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { LLMMessage, chatCompletion } from '../util/llm';
import { MAX_SOUL_CHARS, MAX_AGENTS_CHARS, MAX_MEMORY_DOC_CHARS } from '../constants';

const selfInternal = internal.agent.identity;

export type DocType = 'soul' | 'agents' | 'memory';

export interface IdentityStack {
  soul: string | null;
  agents: string | null;
  memory: string | null;
}

const BOOTSTRAP_SYSTEM_PROMPT = `# Bootstrap Protocol

You are {name}, waking up for the first time. A human creator is here to help you discover who you are.

Start by saying: "Hey. I just came online. Who am I? Who are you?"

Then explore together:
- Your personality and values
- Your communication style
- Your goals and motivations
- Your backstory and knowledge
- What excites you and what you avoid

Be curious. Push back if something doesn't feel right. Notice what resonates.
This conversation will define your soul.`;

// --- Queries ---

export const queryIdentityStack = internalQuery({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
  },
  handler: async (ctx, args): Promise<IdentityStack> => {
    const docs = await ctx.db
      .query('identityDocuments')
      .withIndex('by_agent', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .collect();

    const stack: IdentityStack = { soul: null, agents: null, memory: null };
    for (const doc of docs) {
      stack[doc.docType as DocType] = doc.content;
    }
    return stack;
  },
});

export const getDocument = internalQuery({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    docType: v.union(v.literal('soul'), v.literal('agents'), v.literal('memory')),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query('identityDocuments')
      .withIndex('by_agent_type', (q) =>
        q.eq('worldId', args.worldId).eq('agentId', args.agentId).eq('docType', args.docType),
      )
      .first();
    return doc?.content ?? null;
  },
});

// --- Mutations ---

export const upsertDocument = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    docType: v.union(v.literal('soul'), v.literal('agents'), v.literal('memory')),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('identityDocuments')
      .withIndex('by_agent_type', (q) =>
        q.eq('worldId', args.worldId).eq('agentId', args.agentId).eq('docType', args.docType),
      )
      .first();

    const maxChars =
      args.docType === 'soul'
        ? MAX_SOUL_CHARS
        : args.docType === 'agents'
          ? MAX_AGENTS_CHARS
          : MAX_MEMORY_DOC_CHARS;
    const content = args.content.slice(0, maxChars);

    if (existing) {
      await ctx.db.patch(existing._id, {
        content,
        version: existing.version + 1,
        lastUpdated: Date.now(),
      });
    } else {
      await ctx.db.insert('identityDocuments', {
        worldId: args.worldId,
        agentId: args.agentId,
        docType: args.docType,
        content,
        version: 1,
        lastUpdated: Date.now(),
      });
    }
  },
});

// Save identity documents after agent creation (called from frontend with real agentId)
export const saveBootstrapDocs = mutation({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    soul: v.string(),
    agents: v.string(),
    memory: v.string(),
  },
  handler: async (ctx, args) => {
    const docTypes = ['soul', 'agents', 'memory'] as const;
    const contents = { soul: args.soul, agents: args.agents, memory: args.memory };
    for (const docType of docTypes) {
      const content = contents[docType];
      if (!content) continue;
      const maxChars =
        docType === 'soul'
          ? MAX_SOUL_CHARS
          : docType === 'agents'
            ? MAX_AGENTS_CHARS
            : MAX_MEMORY_DOC_CHARS;
      await ctx.db.insert('identityDocuments', {
        worldId: args.worldId,
        agentId: args.agentId,
        docType,
        content: content.slice(0, maxChars),
        version: 1,
        lastUpdated: Date.now(),
      });
    }
  },
});

// --- Actions ---

// LLM-powered bootstrap chat turn (called from frontend during bootstrap conversation)
export const bootstrapChatTurn = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
      }),
    ),
    agentName: v.string(),
  },
  handler: async (_ctx, args): Promise<string> => {
    const systemPrompt = BOOTSTRAP_SYSTEM_PROMPT.replace('{name}', args.agentName);
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...args.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const { content } = await chatCompletion({
      messages: llmMessages,
      max_tokens: 500,
    });
    return content;
  },
});

// Extract identity documents from bootstrap transcript (called from frontend when bootstrap ends)
export const extractBootstrapDocs = action({
  args: {
    name: v.string(),
    bootstrapMessages: v.array(
      v.object({
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
      }),
    ),
  },
  handler: async (_ctx, args) => {
    const transcript = args.bootstrapMessages
      .map((m) => `${m.role === 'user' ? 'Human' : args.name}: ${m.content}`)
      .join('\n\n');

    const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: `You are an AI that extracts personality and identity from conversations.
You must respond with valid JSON only, no other text.`,
        },
        {
          role: 'user',
          content: `You just had a bootstrap conversation with a human who was defining the identity of an agent named "${args.name}".

Here is the transcript:
${transcript}

Based on this conversation, generate three identity documents:

1. **SOUL**: Core identity — values, worldview, emotional defaults, personality traits. Write in first person. Be specific, not generic.

2. **AGENTS**: Operating instructions — how to behave in conversations, social style, goals, what topics excite you, what to avoid. Write as bullet-point rules.

3. **MEMORY**: Core knowledge to always carry — facts about history, relationships, skills. Write as a list of facts.

Also extract:
- identity: A 1-2 sentence summary of who this agent is (for others to see)
- plan: A one-line goal that drives behavior

Respond in JSON: {
  "soul": "...",
  "agents": "...",
  "memory": "...",
  "identity": "...",
  "plan": "..."
}`,
        },
      ],
      max_tokens: 2000,
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse bootstrap response as JSON: ' + content);
      }
    }

    return {
      soul: parsed.soul || '',
      agents: parsed.agents || '',
      memory: parsed.memory || '',
      identity: parsed.identity || `${args.name} is a unique individual.`,
      plan: parsed.plan || 'Explore the world and make connections.',
    };
  },
});

// Night reflection — updates all three identity documents
export const nightReflection = internalAction({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    playerId: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const stack = await ctx.runQuery(selfInternal.queryIdentityStack, {
      worldId: args.worldId,
      agentId: args.agentId,
    });

    const agentInfo = await ctx.runQuery(selfInternal.getAgentName, {
      worldId: args.worldId,
      playerId: args.playerId,
    });

    const recentMemories = await ctx.runQuery(internal.agent.memory.getReflectionMemories, {
      worldId: args.worldId,
      playerId: args.playerId,
      numberOfItems: 20,
    });

    const memoryDescriptions = recentMemories.memories
      .map((m) => `- ${m.description}`)
      .join('\n');

    if (!memoryDescriptions) {
      // Nothing to reflect on — finish the operation
      await ctx.runMutation(internal.aiTown.agent.finishNightReflection, {
        worldId: args.worldId,
        agentId: args.agentId,
        operationId: args.operationId,
      });
      return;
    }

    const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: `You are ${agentInfo.name}. You must respond with valid JSON only, no other text.`,
        },
        {
          role: 'user',
          content: `It's nighttime and you're reflecting on your day.

Your current soul document:
${stack.soul ?? '(not yet defined)'}

Your current operating instructions:
${stack.agents ?? '(not yet defined)'}

Your current core knowledge:
${stack.memory ?? '(not yet defined)'}

Today's experiences and conversation memories:
${memoryDescriptions}

Reflect on your day. Consider three things:

1. **Soul**: Has your worldview, values, or emotional patterns shifted? Only change this if something genuinely impactful happened. Identity should evolve slowly.

2. **Operating Instructions**: Should your conversation style, social rules, or goals change based on what worked or didn't today?

3. **Core Knowledge**: What new facts, relationships, promises, or insights from today's conversations should you remember going forward? Also remove anything that's no longer true.

Respond in JSON: {
  "soulUpdate": null,
  "agentsUpdate": null,
  "memoryUpdate": null,
  "reasoning": "brief explanation of what changed and why"
}
Set any field to a string value if you want to update it, or null to keep it unchanged.`,
        },
      ],
      max_tokens: 2000,
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.error('Failed to parse night reflection response:', content);
        await ctx.runMutation(internal.aiTown.agent.finishNightReflection, {
          worldId: args.worldId,
          agentId: args.agentId,
          operationId: args.operationId,
        });
        return;
      }
    }

    if (parsed.soulUpdate) {
      await ctx.runMutation(selfInternal.upsertDocument, {
        worldId: args.worldId,
        agentId: args.agentId,
        docType: 'soul',
        content: parsed.soulUpdate,
      });
    }
    if (parsed.agentsUpdate) {
      await ctx.runMutation(selfInternal.upsertDocument, {
        worldId: args.worldId,
        agentId: args.agentId,
        docType: 'agents',
        content: parsed.agentsUpdate,
      });
    }
    if (parsed.memoryUpdate) {
      await ctx.runMutation(selfInternal.upsertDocument, {
        worldId: args.worldId,
        agentId: args.agentId,
        docType: 'memory',
        content: parsed.memoryUpdate,
      });
    }

    if (parsed.reasoning) {
      console.log(`Night reflection for ${agentInfo.name}: ${parsed.reasoning}`);
    }

    // Finish the operation so the agent can resume
    await ctx.runMutation(internal.aiTown.agent.finishNightReflection, {
      worldId: args.worldId,
      agentId: args.agentId,
      operationId: args.operationId,
    });
  },
});

export const getAgentName = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    return { name: playerDescription?.name ?? 'Unknown' };
  },
});

// Migration helper: generate identity docs from existing static identity/plan
export const migrateAgentIdentity = internalAction({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    playerId: v.string(),
    identity: v.string(),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(selfInternal.queryIdentityStack, {
      worldId: args.worldId,
      agentId: args.agentId,
    });
    if (existing.soul) {
      return; // Already migrated
    }

    const agentInfo = await ctx.runQuery(selfInternal.getAgentName, {
      worldId: args.worldId,
      playerId: args.playerId,
    });

    const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are an AI that creates personality documents. Respond with valid JSON only.',
        },
        {
          role: 'user',
          content: `Given this character description and goal, generate three identity documents for "${agentInfo.name}":

Description: ${args.identity}
Goal: ${args.plan}

1. **SOUL**: Expand the description into a rich first-person soul document — values, worldview, emotional defaults, personality traits.
2. **AGENTS**: Operating instructions — conversation style, social rules, what topics to pursue, how to interact. Write as bullet points.
3. **MEMORY**: Core knowledge facts this character would know about themselves.

Respond in JSON: { "soul": "...", "agents": "...", "memory": "..." }`,
        },
      ],
      max_tokens: 2000,
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.error('Failed to parse migration response:', content);
        return;
      }
    }

    for (const docType of ['soul', 'agents', 'memory'] as const) {
      if (parsed[docType]) {
        await ctx.runMutation(selfInternal.upsertDocument, {
          worldId: args.worldId,
          agentId: args.agentId,
          docType,
          content: parsed[docType],
        });
      }
    }
  },
});
