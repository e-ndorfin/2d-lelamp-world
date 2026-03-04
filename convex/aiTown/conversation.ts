import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { conversationId, playerId } from './ids';
import { Player } from './player';
import { inputHandler } from './inputHandler';

import { CONVERSATION_DISTANCE, PROXIMITY_RADIUS } from '../constants';
import { distance, normalize, vector } from '../util/geometry';
import { Point, point } from '../util/types';
import { Game } from './game';
import { stopPlayer, blocked, movePlayer } from './movement';
import { ConversationMembership, serializedConversationMembership } from './conversationMembership';
import { parseMap, serializeMap } from '../util/object';

export class Conversation {
  id: GameId<'conversations'>;
  creator: GameId<'players'>;
  created: number;
  position: Point;
  lastMessage?: {
    author: GameId<'players'>;
    timestamp: number;
  };
  numMessages: number;
  participants: Map<GameId<'players'>, ConversationMembership>;

  constructor(serialized: SerializedConversation) {
    const { id, creator, created, lastMessage, numMessages, participants, position } = serialized;
    this.id = parseGameId('conversations', id);
    this.creator = parseGameId('players', creator);
    this.created = created;
    this.position = position;
    this.lastMessage = lastMessage && {
      author: parseGameId('players', lastMessage.author),
      timestamp: lastMessage.timestamp,
    };
    this.numMessages = numMessages;
    this.participants = parseMap(participants, ConversationMembership, (m) => m.playerId);
  }

  tick(game: Game, now: number) {
    // Transition walkingOver → participating when close to conversation position
    for (const [pid, member] of this.participants.entries()) {
      if (member.status.kind === 'walkingOver') {
        const player = game.world.players.get(pid);
        if (!player) continue;
        const dist = distance(player.position, this.position);
        if (dist < CONVERSATION_DISTANCE) {
          stopPlayer(player);
          member.status = { kind: 'participating', started: now };
          console.log(`Player ${pid} arrived at conversation ${this.id}`);
        }
      }
    }

    // Auto-remove participants who walked beyond PROXIMITY_RADIUS
    for (const [pid, member] of this.participants.entries()) {
      if (member.status.kind === 'participating') {
        const player = game.world.players.get(pid);
        if (!player) continue;
        if (distance(player.position, this.position) > PROXIMITY_RADIUS) {
          console.log(`Player ${pid} walked away from conversation ${this.id}`);
          this.removeParticipant(game, now, pid);
        }
      }
    }

    // Orient participating players to face the center of the conversation
    const participatingPlayers: Player[] = [];
    for (const [pid, member] of this.participants.entries()) {
      if (member.status.kind === 'participating') {
        const player = game.world.players.get(pid);
        if (player) participatingPlayers.push(player);
      }
    }

    if (participatingPlayers.length >= 2) {
      // Calculate center of all participating players
      const center = {
        x: participatingPlayers.reduce((sum, p) => sum + p.position.x, 0) / participatingPlayers.length,
        y: participatingPlayers.reduce((sum, p) => sum + p.position.y, 0) / participatingPlayers.length,
      };
      for (const player of participatingPlayers) {
        if (!player.pathfinding) {
          const v = normalize(vector(player.position, center));
          if (v) {
            player.facing = v;
          }
        }
      }
    }

    // If no participants left, clean up the conversation
    if (this.participants.size === 0) {
      this.stop(game, now);
    }
  }

  static create(game: Game, now: number, player: Player, position: Point): GameId<'conversations'> {
    const id = game.allocId('conversations');
    console.log(`Creating conversation ${id} at (${position.x}, ${position.y})`);
    game.world.conversations.set(
      id,
      new Conversation({
        id,
        created: now,
        creator: player.id,
        position,
        numMessages: 0,
        participants: [
          { playerId: player.id, joined: now, status: { kind: 'participating', started: now } },
        ],
      }),
    );
    return id;
  }

  join(game: Game, now: number, player: Player) {
    if (this.participants.has(player.id)) {
      console.log(`Player ${player.id} already in conversation ${this.id}`);
      return;
    }
    console.log(`Player ${player.id} joining conversation ${this.id}`);
    this.participants.set(
      player.id,
      new ConversationMembership({
        playerId: player.id,
        joined: now,
        status: { kind: 'walkingOver' },
      }),
    );
    // Pathfind to conversation position
    movePlayer(game, now, player, {
      x: Math.floor(this.position.x),
      y: Math.floor(this.position.y),
    });
  }

  removeParticipant(game: Game, now: number, playerId: GameId<'players'>) {
    this.participants.delete(playerId);
    const agent = [...game.world.agents.values()].find((a) => a.playerId === playerId);
    if (agent) {
      agent.lastConversation = now;
      agent.toRemember = this.id;
    }
    if (this.participants.size === 0) {
      this.stop(game, now);
    }
  }

  stop(game: Game, now: number) {
    for (const [pid] of this.participants.entries()) {
      const agent = [...game.world.agents.values()].find((a) => a.playerId === pid);
      if (agent) {
        agent.lastConversation = now;
        agent.toRemember = this.id;
      }
    }
    game.world.conversations.delete(this.id);
  }

  leave(game: Game, now: number, player: Player) {
    const member = this.participants.get(player.id);
    if (!member) {
      throw new Error(`Couldn't find membership for ${this.id}:${player.id}`);
    }
    this.removeParticipant(game, now, player.id);
  }

  serialize(): SerializedConversation {
    const { id, creator, created, position, lastMessage, numMessages } = this;
    return {
      id,
      creator,
      created,
      position,
      lastMessage,
      numMessages,
      participants: serializeMap(this.participants),
    };
  }
}

export const serializedConversation = {
  id: conversationId,
  creator: playerId,
  created: v.number(),
  position: point,
  lastMessage: v.optional(
    v.object({
      author: playerId,
      timestamp: v.number(),
    }),
  ),
  numMessages: v.number(),
  participants: v.array(v.object(serializedConversationMembership)),
};
export type SerializedConversation = ObjectType<typeof serializedConversation>;

export const conversationInputs = {
  finishSendingMessage: inputHandler({
    args: {
      playerId,
      conversationId,
      timestamp: v.number(),
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${conversationId}`);
      }
      conversation.lastMessage = { author: playerId, timestamp: args.timestamp };
      conversation.numMessages++;
      return null;
    },
  }),

  joinConversation: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${conversationId}`);
      }
      conversation.join(game, now, player);
      return null;
    },
  }),

  leaveConversation: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${conversationId}`);
      }
      conversation.leave(game, now, player);
      return null;
    },
  }),
};
