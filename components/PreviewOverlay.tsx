"use client";

interface ChatAction {
  type: string;
  range?: string;
  values?: string[][];
}

interface PreviewOverlayProps {
  action: ChatAction;
  onApply: () => void;
  onCancel: () => void;
}

export default function PreviewOverlay({ action, onApply, onCancel }: PreviewOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-sm">Preview Changes</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              {action.type === "update" ? `Updating range: ${action.range}` : `Appending ${action.values?.length ?? 0} new row(s)`}
            </p>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <tbody>
              {action.values?.map((row, ri) => (
                <tr key={ri} className="border-t border-gray-700 hover:bg-gray-700/40">
                  {action.type === "update" && (
                    <td className="px-3 py-2 text-gray-500 w-8 text-right">{getRowNumber(action.range, ri)}</td>
                  )}
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 font-mono text-cyan-300 border-l border-gray-700 first:border-l-0">
                      {cell || <span className="text-gray-600 italic">empty</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 px-4 py-3 border-t border-gray-700 bg-gray-800/80">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Apply to Sheet
          </button>
        </div>
      </div>
    </div>
  );
}

function getRowNumber(range: string | undefined, rowIndex: number): string {
  if (!range) return String(rowIndex + 1);
  const match = range.match(/[A-Z]+(\d+)/i);
  if (!match) return String(rowIndex + 1);
  return String(parseInt(match[1]) + rowIndex);
}
