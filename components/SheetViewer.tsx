"use client";

import { useRef, useEffect } from "react";

function colIndexToLetter(index: number): string {
  let result = "";
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

interface SheetViewerProps {
  data: string[][];
  loading: boolean;
  highlightCells?: Set<string>;
  scrollToRow?: number;
}

export default function SheetViewer({ data, loading, highlightCells, scrollToRow }: SheetViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToRow || !containerRef.current) return;
    const rows = containerRef.current.querySelectorAll("tbody tr");
    const rowIndex = scrollToRow - 2; // sheet row N → tbody index N-2
    if (rowIndex >= 0 && rows[rowIndex]) {
      rows[rowIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollToRow]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading sheet data...
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No data. Enter a Google Sheet URL in the panel above.
      </div>
    );
  }

  const headers = data[0];
  const rows = data.slice(1);

  return (
    <div ref={containerRef} className="overflow-auto h-full">
      <table className="min-w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-800">
          <tr>
            <th className="w-10 px-2 py-1 border border-gray-700" />
            {headers.map((_, i) => (
              <th
                key={i}
                className="px-3 py-1 text-center text-xs font-bold text-indigo-400 border border-gray-700 whitespace-nowrap tracking-wide"
              >
                {colIndexToLetter(i)}
              </th>
            ))}
          </tr>
          <tr>
            <th className="w-10 px-2 py-2 text-gray-400 text-xs font-normal border border-gray-700 text-center">
              #
            </th>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-gray-200 border border-gray-700 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-750 even:bg-gray-800/40">
              <td className="px-2 py-1.5 text-gray-500 text-xs border border-gray-700 text-center">
                {ri + 2}
              </td>
              {headers.map((_, ci) => {
                const highlighted = highlightCells?.has(`${ri + 2},${ci}`);
                return (
                  <td
                    key={ci}
                    className={`px-3 py-1.5 border border-gray-700 whitespace-nowrap ${
                      highlighted
                        ? "bg-amber-900/60 text-amber-200 ring-1 ring-inset ring-amber-500/50"
                        : "text-gray-300"
                    }`}
                  >
                    {row[ci] ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
