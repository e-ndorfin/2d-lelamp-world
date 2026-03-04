import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { agentId, conversationId, playerId } from './ids';
import { Game } from './game';
import {
  ACTION_TIMEOUT,
  PROXIMITY_RADIUS,
} from '../constants';
import { FunctionArgs } from 'convex/server';
import { MutationCtx, internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { insertInput } from './insertInput';

export class Agent {
  id: GameId<'agents'>;
  playerId: GameId<'players'>;
  toRemember?: GameId<'conversations'>;
  lastConversation?: number;
  lastReaction?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };

  constructor(serialized: SerializedAgent) {
    const { id, lastConversation, lastReaction, inProgressOperation } = serialized;
    const playerId = parseGameId('players', serialized.playerId);
    this.id = parseGameId('agents', id);
    this.playerId = playerId;
    this.toRemember =
      serialized.toRemember !== undefined
        ? parseGameId('conversations', serialized.toRemember)
        : undefined;
    this.lastConversation = lastConversation;
    this.lastReaction = lastReaction;
    this.inProgressOperation = inProgressOperation;
  }

  tick(game: Game, now: number) {
    const player = game.world.players.get(this.playerId);
    if (!player) {
      throw new Error(`Invalid player ID ${this.playerId}`);
    }
    // Wait for in-progress operation to finish or timeout
    if (this.inProgressOperation) {
      if (now < this.inProgressOperation.started + ACTION_TIMEOUT) {
        return;
      }
      console.log(`Timing out ${JSON.stringify(this.inProgressOperation)}`);
      delete this.inProgressOperation;
    }

    // Remember conversations first
    if (this.toRemember) {
      console.log(`Agent ${this.id} remembering conversation ${this.toRemember}`);
      this.startOperation(game, now, 'agentRememberConversation', {
        worldId: game.worldId,
        playerId: this.playerId,
        agentId: this.id,
        conversationId: this.toRemember,
      });
      delete this.toRemember;
      return;
    }

    // If activity is in progress and we start pathfinding/conversation, end it
    const doingActivity = player.activity && player.activity.until > now;
    const conversation = game.world.playerConversation(player);
    if (doingActivity && (conversation || player.pathfinding)) {
      player.activity!.until = now;
    }

    // LLM decides all actions via agentDecideAction
    const nearbyPlayers = game.world.nearbyPlayers(player.position, PROXIMITY_RADIUS)
      .filter((p) => p.id !== player.id)
      .map((p) => p.serialize());
    const nearbyConversations = game.world.nearbyConversations(player.position, PROXIMITY_RADIUS)
      .map((c) => c.id);

    this.startOperation(game, now, 'agentDecideAction', {
      worldId: game.worldId,
      player: player.serialize(),
      agent: this.serialize(),
      map: game.worldMap.serialize(),
      nearbyPlayers,
      nearbyConversations,
    });
  }

  startOperation<Name extends keyof AgentOperations>(
    game: Game,
    now: number,
    name: Name,
    args: Omit<FunctionArgs<AgentOperations[Name]>, 'operationId'>,
  ) {
    if (this.inProgressOperation) {
      throw new Error(
        `Agent ${this.id} already has an operation: ${JSON.stringify(this.inProgressOperation)}`,
      );
    }
    const operationId = game.allocId('operations');
    console.log(`Agent ${this.id} starting operation ${name} (${operationId})`);
    game.scheduleOperation(name, { operationId, ...args } as any);
    this.inProgressOperation = {
      name,
      operationId,
      started: now,
    };
  }

  serialize(): SerializedAgent {
    return {
      id: this.id,
      playerId: this.playerId,
      toRemember: this.toRemember,
      lastConversation: this.lastConversation,
      lastReaction: this.lastReaction,
      inProgressOperation: this.inProgressOperation,
    };
  }
}

export const serializedAgent = {
  id: agentId,
  playerId: playerId,
  toRemember: v.optional(conversationId),
  lastConversation: v.optional(v.number()),
  lastReaction: v.optional(v.number()),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ),
};
export type SerializedAgent = ObjectType<typeof serializedAgent>;

type AgentOperations = typeof internal.aiTown.agentOperations;

export async function runAgentOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'agentRememberConversation':
      reference = internal.aiTown.agentOperations.agentRememberConversation;
      break;
    case 'agentDecideAction':
      reference = internal.aiTown.agentOperations.agentDecideAction;
      break;
    case 'agentSendMessage':
      // agentSendMessage is an internal mutation, not an action — call it directly
      await ctx.scheduler.runAfter(0, internal.aiTown.agent.agentSendMessage, args);
      return;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  await ctx.scheduler.runAfter(0, reference, args);
}

export const agentSendMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    agentId,
    playerId,
    text: v.string(),
    messageUuid: v.string(),
    leaveConversation: v.boolean(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      text: args.text,
      messageUuid: args.messageUuid,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'agentFinishSendingMessage', {
      conversationId: args.conversationId,
      agentId: args.agentId,
      timestamp: Date.now(),
      leaveConversation: args.leaveConversation,
      operationId: args.operationId,
    });
  },
});
