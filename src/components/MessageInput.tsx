import clsx from 'clsx';
import { useMutation, useQuery } from 'convex/react';
import { KeyboardEvent, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';

export function MessageInput({
  worldId,
  engineId,
  humanPlayer,
  conversation,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  humanPlayer: Player;
  conversation: Conversation;
}) {
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const humanName = descriptions?.playerDescriptions.find((p) => p.playerId === humanPlayer.id)
    ?.name;
  const inputRef = useRef<HTMLParagraphElement>(null);
  const writeMessage = useMutation(api.messages.writeMessage);

  const onKeyDown = async (e: KeyboardEvent) => {
    e.stopPropagation();

    if (e.key !== 'Enter') {
      return;
    }

    // Send the current message.
    e.preventDefault();
    if (!inputRef.current) {
      return;
    }
    const text = inputRef.current.innerText;
    inputRef.current.innerText = '';
    if (!text) {
      return;
    }
    const messageUuid = crypto.randomUUID();
    await writeMessage({
      worldId,
      playerId: humanPlayer.id,
      conversationId: conversation.id,
      text,
      messageUuid,
    });
  };
  return (
    <div className="leading-tight mb-6">
      <div className="flex gap-4">
        <span className="uppercase flex-grow">{humanName}</span>
      </div>
      <div className={clsx('bubble', 'bubble-mine')}>
        <p
          className="bg-white -mx-3 -my-1"
          ref={inputRef}
          contentEditable
          style={{ outline: 'none' }}
          tabIndex={0}
          placeholder="Type here"
          onKeyDown={(e) => onKeyDown(e)}
        />
      </div>
    </div>
  );
}
