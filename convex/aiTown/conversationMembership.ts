import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId, playerId } from './ids';

export const serializedConversationMembership = {
  playerId,
  joined: v.number(),
  status: v.union(
    v.object({ kind: v.literal('walkingOver') }),
    v.object({ kind: v.literal('participating'), started: v.number() }),
  ),
};
export type SerializedConversationMembership = ObjectType<typeof serializedConversationMembership>;

export class ConversationMembership {
  playerId: GameId<'players'>;
  joined: number;
  status:
    | { kind: 'walkingOver' }
    | { kind: 'participating'; started: number };

  constructor(serialized: SerializedConversationMembership) {
    const { playerId, joined, status } = serialized;
    this.playerId = parseGameId('players', playerId);
    this.joined = joined;
    this.status = status;
  }

  serialize(): SerializedConversationMembership {
    const { playerId, joined, status } = this;
    return {
      playerId,
      joined,
      status,
    };
  }
}
