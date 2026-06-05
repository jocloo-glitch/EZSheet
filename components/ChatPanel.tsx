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
  const [listening, setListening] = useState(false);
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
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

  function startVoice() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceUnsupported(true);
      setTimeout(() => setVoiceUnsupported(false), 3000);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e: any) => { setInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }

  function describeAction(action: ChatAction): string {
    if (action.type === "read") return "Refreshing sheet data...";
    if (action.type === "undo") return "Undoing last change...";
    if (action.type === "cancel_pending") return action.text ?? "Staged changes cancelled. You can also use the Cancel button at any time.";
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

      {voiceUnsupported && (
        <div className="px-3 pb-1 text-xs text-amber-400">Voice input requires Chrome or Edge</div>
      )}
      <div className="border-t border-gray-700 px-3 py-3 flex gap-2">
        <input
          className={`flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors ${
            disabled
              ? "bg-gray-700 text-gray-500 placeholder-gray-600"
              : "bg-gray-600 text-gray-100 placeholder-white/70 border-2 border-indigo-700 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-700"
          }`}
          placeholder={disabled ? "Load a sheet first..." : "Ask me anything about your sheet..."}
          value={input}
          disabled={disabled || loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={startVoice}
          disabled={disabled || loading}
          title="Voice input"
          className={`p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            listening
              ? "bg-red-600 animate-pulse text-white"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 8a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V22h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-2.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z"/>
          </svg>
        </button>
        <button
          onClick={send}
          disabled={disabled || loading || !input.trim()}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white ${
            input.trim() && !disabled
              ? "bg-indigo-600 hover:bg-indigo-500 cursor-pointer"
              : "bg-gray-700 opacity-40 cursor-not-allowed"
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}
