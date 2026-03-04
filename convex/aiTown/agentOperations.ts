import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import { decideAction } from '../agent/action';
import { serializedAgent } from './agent';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});

export const agentDecideAction = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    nearbyPlayers: v.array(v.object(serializedPlayer)),
    nearbyConversations: v.array(v.string()),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const nearbyPlayerIds = args.nearbyPlayers.map((p) => p.id);

    const action = await decideAction(
      ctx,
      args.worldId,
      args.player.id as GameId<'players'>,
      args.agent.id as GameId<'agents'>,
      nearbyPlayerIds,
      args.nearbyConversations,
    );

    console.log(`Agent ${args.agent.id} decided: ${JSON.stringify(action)}`);

    // Random sleep to avoid OCC errors from concurrent agents
    await sleep(Math.random() * 1000);

    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDecideAction',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        action,
      },
    });
  },
});
