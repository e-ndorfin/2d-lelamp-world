import { useCallback, useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function BootstrapChat({
  agentName,
  onTranscriptReady,
}: {
  agentName: string;
  onTranscriptReady: (messages: ChatMessage[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrapChatTurn = useAction(api.agent.identity.bootstrapChatTurn);
  const prevNameRef = useRef(agentName);

  // Get initial agent message when component mounts or name changes
  useEffect(() => {
    if (!agentName.trim()) return;
    if (messages.length > 0 && prevNameRef.current === agentName) return;
    prevNameRef.current = agentName;

    setMessages([]);
    setLoading(true);
    bootstrapChatTurn({ messages: [], agentName })
      .then((response) => {
        const msg: ChatMessage = { role: 'assistant', content: response };
        setMessages([msg]);
        onTranscriptReady([msg]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentName]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await bootstrapChatTurn({
        messages: updatedMessages,
        agentName,
      });
      const assistantMsg: ChatMessage = { role: 'assistant', content: response };
      const allMessages = [...updatedMessages, assistantMsg];
      setMessages(allMessages);
      onTranscriptReady(allMessages);
    } catch (err) {
      console.error('Bootstrap chat error:', err);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, agentName, bootstrapChatTurn, onTranscriptReady]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const userMessageCount = messages.filter((m) => m.role === 'user').length;

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm mb-1">Bootstrap Conversation</label>
      <p className="text-xs text-brown-400 mb-1">
        Chat with your new agent to help it discover its identity. Send at least 3 messages.
      </p>
      <div
        ref={scrollRef}
        className="bg-brown-900 border border-brown-700 rounded p-3 h-[250px] overflow-y-auto flex flex-col gap-2"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded px-3 py-2 max-w-[85%] ${
              msg.role === 'assistant'
                ? 'bg-brown-700 text-brown-100 self-start'
                : 'bg-clay-700 text-brown-100 self-end'
            }`}
          >
            <span className="text-xs text-brown-400 block mb-0.5">
              {msg.role === 'assistant' ? agentName : 'You'}
            </span>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="text-sm text-brown-400 self-start animate-pulse">
            {agentName} is thinking...
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Help define this agent's personality..."
          disabled={loading || !agentName.trim()}
          className="flex-1 bg-brown-900 text-brown-100 border border-brown-700 rounded px-2 py-1 text-sm disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="button text-sm disabled:opacity-40"
        >
          <span>Send</span>
        </button>
      </div>
      <p className="text-xs text-brown-500">
        {userMessageCount < 3
          ? `${3 - userMessageCount} more message${3 - userMessageCount === 1 ? '' : 's'} needed`
          : 'Ready to create agent'}
      </p>
    </div>
  );
}
