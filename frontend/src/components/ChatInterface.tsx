import { useState, useRef, useEffect } from "react";
import type { Field } from "../api";
import { sendMessage } from "../api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  sessionId: string;
  fields: Field[];
  currentField: string;
  language: string;
  answers: Record<string, string>;
  onFieldUpdate: (updates: Record<string, string>) => void;
  onNextField: (field: string) => void;
}

export default function ChatInterface({
  sessionId, fields, currentField, language,
  answers, onFieldUpdate, onNextField
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await sendMessage({
        session_id: sessionId,
        current_field: currentField,
        message: userMsg,
        language,
        history: messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content
        })),
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
      if (res.field_updates) onFieldUpdate(res.field_updates);
      if (res.next_field && res.next_field !== currentField) onNextField(res.next_field);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Something went wrong. Please try again."
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12 text-sm">
            Type a message to start filling your form
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap
              ${m.role === "user"
                ? "bg-blue-500 text-white rounded-br-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
              }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-gray-400">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-400"
            placeholder="Type your answer..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}