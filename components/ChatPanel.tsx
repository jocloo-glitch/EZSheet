"use client";

import { useState, useRef, useEffect } from "react";

interface ChatAction {
  type: string;
  text?: string;
  range?: string;
  values?: string[][];
  chartType?: "bar" | "line" | "pie";
  dataRange?: string;
  title?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  actionState?: "pending" | "applied" | "cancelled";
}

interface ChatPanelProps {
  sheetContext: { headers: string[]; rowCount: number; rows: Array<Record<string, string | number>>; pendingChanges?: Array<{ type: string; range?: string; values?: string[][] }> } | null;
  onAction: (action: ChatAction) => void;
  onPreviewAction: (action: ChatAction, onApply: () => void, onCancel: () => void) => void;
  disabled: boolean;
}

export default function ChatPanel({ sheetContext, onAction, onPreviewAction, disabled }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! Load a Google Sheet on the right, then tell me what you'd like to do — read data, edit cells, add rows, or create a chart." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sheetContext, history: historyRef.current }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${json.error ?? res.statusText}` }]);
        return;
      }

      const { action } = json;

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: JSON.stringify(action) },
      ];

      if (action.type === "update" || action.type === "append") {
        const msgIndex = messages.length + 1; // +1 for the user msg we just added
        const label = action.type === "update"
          ? `Ready to update ${action.range} — review the changes on the right.`
          : `Ready to append ${action.values?.length ?? 0} row(s) — review on the right.`;

        setMessages((prev) => {
          const idx = prev.length; // index this message will have
          void idx; // used in closures below
          return [...prev, { role: "assistant", content: label, actionState: "pending" }];
        });

        const pendingIdx = messages.length + 1;

        onPreviewAction(
          action,
          () => {
            setMessages((prev) =>
              prev.map((m, i) => (i === pendingIdx ? { ...m, actionState: "applied" as const } : m))
            );
          },
          () => {
            setMessages((prev) =>
              prev.map((m, i) => (i === pendingIdx ? { ...m, actionState: "cancelled" as const } : m))
            );
          }
        );
        void msgIndex;
      } else {
        const reply = action.text ?? describeAction(action);
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        if (action.type !== "message") onAction(action);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function describeAction(action: ChatAction): string {
    if (action.type === "read") return "Refreshing sheet data...";
    if (action.type === "undo") return "Undoing last change...";
    if (action.type === "chart") return `Creating ${action.chartType} chart${action.title ? `: ${action.title}` : ""}.`;
    return "Done.";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-200"
              }`}
            >
              {m.content}
              {m.actionState === "pending" && (
                <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              {m.actionState === "applied" && (
                <span className="block mt-1 text-xs text-green-400">✓ Applied</span>
              )}
              {m.actionState === "cancelled" && (
                <span className="block mt-1 text-xs text-gray-400">✗ Cancelled</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-gray-400 px-3 py-2 rounded-lg text-sm">Thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-700 px-3 py-3 flex gap-2">
        <input
          className="flex-1 bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
          placeholder={disabled ? "Load a sheet first..." : "Ask me anything about your sheet..."}
          value={input}
          disabled={disabled || loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          disabled={disabled || loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
