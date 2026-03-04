import { v } from 'convex/values';
import { agentId, conversationId, parseGameId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { point } from '../util/types';
import { Descriptions } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';
import { PROXIMITY_RADIUS } from '../constants';

const actionValidator = v.union(
  v.object({ type: v.literal('move_to'), x: v.number(), y: v.number() }),
  v.object({ type: v.literal('speak'), message: v.string(), conversationId: v.optional(v.string()) }),
  v.object({ type: v.literal('join_conversation'), conversationId: v.string() }),
  v.object({ type: v.literal('leave_conversation') }),
  v.object({
    type: v.literal('start_activity'),
    description: v.string(),
    emoji: v.string(),
    duration: v.number(),
  }),
  v.object({ type: v.literal('observe') }),
);

export const agentInputs = {
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),

  finishDecideAction: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.string(),
      action: actionValidator,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      const action = args.action;

      switch (action.type) {
        case 'move_to': {
          movePlayer(game, now, player, { x: action.x, y: action.y });
          break;
        }
        case 'speak': {
          // Find or create a conversation
          let conversation = game.world.playerConversation(player);

          if (!conversation) {
            // Create a new conversation at the player's position
            const convId = Conversation.create(game, now, player, player.position);
            conversation = game.world.conversations.get(convId)!;
          }

          // The message text is in action.message — insert it via agentSendMessage
          // We schedule it as a pending operation that will insert the message
          const messageUuid = crypto.randomUUID();
          game.scheduleOperation('agentSendMessage', {
            worldId: game.worldId,
            conversationId: conversation.id,
            agentId: agent.id,
            playerId: player.id,
            text: action.message,
            messageUuid,
            leaveConversation: false,
            operationId: args.operationId,
          });
          break;
        }
        case 'join_conversation': {
          const convId = parseGameId('conversations', action.conversationId);
          const conversation = game.world.conversations.get(convId);
          if (conversation) {
            conversation.join(game, now, player);
          } else {
            console.warn(`Conversation ${action.conversationId} not found for join`);
          }
          break;
        }
        case 'leave_conversation': {
          const conversation = game.world.playerConversation(player);
          if (conversation) {
            conversation.leave(game, now, player);
          }
          break;
        }
        case 'start_activity': {
          player.activity = {
            description: action.description,
            emoji: action.emoji,
            until: now + action.duration,
          };
          break;
        }
        case 'observe': {
          // Do nothing
          break;
        }
      }
      return null;
    },
  }),

  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),

  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      const playerId = Player.join(
        game,
        now,
        description.name,
        description.character,
        description.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastReaction: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: description.identity,
          plan: description.plan,
        }),
      );
      return { agentId };
    },
  }),

  createCustomAgent: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      identity: v.string(),
      plan: v.string(),
    },
    handler: (game, now, args) => {
      const playerId = Player.join(game, now, args.name, args.character, args.identity);
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastReaction: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: args.identity,
          plan: args.plan,
        }),
      );
      return { agentId };
    },
  }),
};
