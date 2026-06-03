"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useCallback } from "react";
import ChatPanel from "@/components/ChatPanel";
import SheetViewer from "@/components/SheetViewer";
import ChartViewer from "@/components/ChartViewer";
import { rangeToHighlightSet, applyChangesToData, colIndexToLetter } from "@/lib/sheet-utils";

interface ChartState {
  chartType: "bar" | "line" | "pie";
  data: string[][];
  title?: string;
}

interface UndoEntry {
  label: string;
  items: Array<{ range: string; values: string[][] }>;
}

interface PendingChange {
  action: { type: string; range?: string; values?: string[][] };
  onApply: () => void;
  onCancel: () => void;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [sheetUrl, setSheetUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  const [chart, setChart] = useState<ChartState | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [urlBarOpen, setUrlBarOpen] = useState(true);

  // Fold all pending changes to produce the proposed final state
  const proposedData = pendingChanges.reduce(
    (data, change) =>
      change.action.type === "update"
        ? applyChangesToData(data, change.action.range!, change.action.values!)
        : [...data, ...(change.action.values ?? [])],
    sheetData
  );

  // Union of all changed cell positions
  const previewHighlightSet =
    pendingChanges.length > 0
      ? new Set<string>(
          pendingChanges.flatMap((c) => [
            ...rangeToHighlightSet(
              c.action.type === "update"
                ? c.action.range!
                : `A${sheetData.length + 1}`,
              c.action.values!
            ),
          ])
        )
      : null;

  // Rows are keyed by column letter so the LLM can look up "E9" as row where rowNumber=9, field "E".
  // This avoids off-by-one errors from confusing array index with sheet row number.
  const headers = sheetData[0] ?? [];
  const sheetContext = sheetData.length
    ? {
        headers,
        rowCount: sheetData.length - 1,
        rows: sheetData.map((row, i) => {
          const entry: Record<string, string | number> = { rowNumber: i + 1 };
          headers.forEach((_, ci) => {
            entry[colIndexToLetter(ci)] = row[ci] ?? "";
          });
          return entry;
        }),
        pendingChanges:
          pendingChanges.length > 0
            ? pendingChanges.map((c) => ({
                type: c.action.type,
                range: c.action.range,
                values: c.action.values,
              }))
            : undefined,
        sheetName: activeSheet,
        spreadsheetId,
      }
    : null;

  async function loadSheet() {
    setLoadingSheet(true);
    setChart(null);
    try {
      const metaRes = await fetch(
        `/api/sheets?action=meta&spreadsheetId=${encodeURIComponent(sheetUrl)}`
      );
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({ error: `HTTP ${metaRes.status}` }));
        if (metaRes.status === 401) alert("Session expired — please sign out and sign back in.");
        else alert(`Failed to load sheet: ${err.error ?? metaRes.statusText}`);
        return;
      }
      const meta = await metaRes.json();
      setSheetTitle(meta.title ?? "");
      setSheetNames(meta.sheets ?? []);
      const firstSheet = meta.sheets?.[0] ?? "";
      setActiveSheet(firstSheet);

      const urlMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const id = urlMatch ? urlMatch[1] : sheetUrl;
      setSpreadsheetId(id);

      await fetchSheetData(id, firstSheet);
    } finally {
      setLoadingSheet(false);
    }
  }

  async function fetchSheetData(id: string, sheet: string) {
    const res = await fetch(
      `/api/sheets?spreadsheetId=${encodeURIComponent(id)}&sheet=${encodeURIComponent(sheet)}`
    );
    if (!res.ok) return;
    const { data } = await res.json();
    setSheetData(data ?? []);
  }

  async function switchSheet(name: string) {
    setActiveSheet(name);
    setLoadingSheet(true);
    await fetchSheetData(spreadsheetId, name);
    setLoadingSheet(false);
  }

  async function handleUndo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack((prev) => prev.slice(0, -1));
    for (const item of entry.items) {
      await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", spreadsheetId, range: item.range, values: item.values }),
      });
    }
    setLoadingSheet(true);
    await fetchSheetData(spreadsheetId, activeSheet);
    setLoadingSheet(false);
  }

  const handleAction = useCallback(
    async (action: { type: string; chartType?: "bar" | "line" | "pie"; title?: string }) => {
      if (action.type === "read") {
        setLoadingSheet(true);
        await fetchSheetData(spreadsheetId, activeSheet);
        setLoadingSheet(false);
        return;
      }
      if (action.type === "undo") {
        await handleUndo();
        return;
      }
      if (action.type === "chart" && action.chartType) {
        setChart({ chartType: action.chartType, data: sheetData, title: action.title });
      }
    },
    [spreadsheetId, activeSheet, sheetData, undoStack]
  );

  // Each new preview action is appended to the pending queue
  const handlePreviewAction = useCallback(
    (
      action: { type: string; range?: string; values?: string[][] },
      onApply: () => void,
      onCancel: () => void
    ) => {
      setPendingChanges((prev) => [...prev, { action, onApply, onCancel }]);
    },
    []
  );

  async function confirmPreview() {
    const changes = pendingChanges;
    setPendingChanges([]);

    // Save a single undo entry covering all affected ranges
    const undoItems: Array<{ range: string; values: string[][] }> = [];
    for (const change of changes) {
      if (change.action.type === "update" && change.action.range) {
        const res = await fetch(
          `/api/sheets?action=range&spreadsheetId=${encodeURIComponent(spreadsheetId)}&range=${encodeURIComponent(change.action.range)}`
        );
        if (res.ok) {
          const { data } = await res.json();
          undoItems.push({ range: change.action.range, values: data });
        }
      }
    }
    if (undoItems.length > 0) {
      setUndoStack((prev) => [...prev.slice(-9), { label: "Applied changes", items: undoItems }]);
    }

    // Apply all changes then refresh once
    for (const change of changes) {
      change.onApply();
      const { action } = change;
      await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.type,
          spreadsheetId,
          range: action.range,
          values: action.values,
        }),
      });
    }
    setLoadingSheet(true);
    await fetchSheetData(spreadsheetId, activeSheet);
    setLoadingSheet(false);
  }

  function clearChanges() {
    pendingChanges.forEach((c) => c.onCancel());
    setPendingChanges([]);
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-300">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">EZS</h1>
          <p className="text-gray-400">Chat with your Google Sheets</p>
        </div>
        <button
          onClick={() => signIn("google")}
          className="flex items-center gap-3 bg-white text-gray-800 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    );
  }

  const hasPending = pendingChanges.length > 0;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white">EZS</h1>
          {sheetTitle && <span className="text-gray-400 text-sm">/ {sheetTitle}</span>}
        </div>
        <div className="flex items-center gap-3">
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              title={`Undo: ${undoStack[undoStack.length - 1]?.label}`}
              className="flex items-center gap-1.5 text-sm text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded transition-colors"
            >
              ↩ Undo
              <span className="text-xs text-white">({undoStack[undoStack.length - 1]?.label})</span>
            </button>
          )}
          <span className="text-sm text-gray-400">{session.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-white transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="bg-gray-800 border-b border-gray-700 shrink-0">
        {urlBarOpen && (
          <div className="flex items-center gap-2 px-4 py-2">
            <input
              className="flex-1 bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
              placeholder="Paste Google Sheet URL or ID..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadSheet()}
            />
            <button
              onClick={loadSheet}
              disabled={!sheetUrl.trim() || loadingSheet}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Load
            </button>
            {sheetNames.length > 1 && (
              <div className="flex gap-1 ml-2">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => switchSheet(name)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      activeSheet === name ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setUrlBarOpen((o) => !o)}
          className="w-full flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${urlBarOpen ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          <span>{urlBarOpen ? "Hide URL bar" : "Load a sheet"}</span>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat */}
        <div className="w-80 min-w-[280px] flex flex-col border-r border-gray-700 bg-gray-900">
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 shrink-0">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Chat</span>
          </div>
          <ChatPanel
            sheetContext={sheetContext}
            onAction={handleAction}
            onPreviewAction={handlePreviewAction}
            disabled={!spreadsheetId}
          />
        </div>

        {/* Right: Sheet or split preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sheet/preview header — always visible */}
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasPending ? (
                <>
                  <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">Proposed</span>
                  <span className="text-gray-600 text-xs">/</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Current</span>
                  <span className="ml-1 w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
                </>
              ) : (
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {activeSheet || "Sheet"}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearChanges}
                disabled={!hasPending}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 px-3 py-1 rounded text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmPreview}
                disabled={!hasPending}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-medium transition-colors"
              >
                Apply to Sheet
              </button>
            </div>
          </div>

          {hasPending && previewHighlightSet ? (
            <>
              {/* Proposed (top half) */}
              <div className="flex-1 flex flex-col overflow-hidden border-b border-gray-700">
                <div className="px-3 py-1 bg-green-900/20 border-b border-green-800/40 shrink-0">
                  <span className="text-green-400 text-xs font-semibold uppercase tracking-wide">Proposed</span>
                </div>
                <div className="flex-1 overflow-auto">
                  <SheetViewer data={proposedData} loading={false} highlightCells={previewHighlightSet} />
                </div>
              </div>
              {/* Current (bottom half) */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-3 py-1 bg-gray-700/30 border-b border-gray-700 shrink-0">
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Current</span>
                </div>
                <div className="flex-1 overflow-auto">
                  <SheetViewer data={sheetData} loading={false} highlightCells={previewHighlightSet} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              <SheetViewer data={sheetData} loading={loadingSheet} />
              {chart && (
                <ChartViewer chartType={chart.chartType} data={chart.data} title={chart.title} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
