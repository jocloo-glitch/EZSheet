export function colIndexToLetter(index: number): string {
  let result = "";
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

export function colLetterToIndex(col: string): number {
  let result = 0;
  const upper = col.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1;
}

export function parseRangeStart(range: string): { startRow: number; startCol: number } | null {
  const rangeStr = range.includes("!") ? range.split("!")[1] : range;
  const match = rangeStr.match(/^([A-Z]+)(\d+)/i);
  if (!match) return null;
  return {
    startRow: parseInt(match[2]),       // 1-indexed sheet row number
    startCol: colLetterToIndex(match[1]),
  };
}

// Keys are "sheetRowNumber,colIndex" where sheetRowNumber is 1-indexed.
// In SheetViewer: rows[ri] = sheet row ri+2, so the lookup key is `${ri+2},${ci}`.
export function rangeToHighlightSet(range: string, values: string[][]): Set<string> {
  const set = new Set<string>();
  const start = parseRangeStart(range);
  if (!start) return set;
  values.forEach((rowValues, ri) => {
    rowValues.forEach((_, ci) => {
      set.add(`${start.startRow + ri},${start.startCol + ci}`);
    });
  });
  return set;
}

// Returns a deep copy of data with values written starting at the parsed range position.
export function applyChangesToData(data: string[][], range: string, values: string[][]): string[][] {
  const result = data.map((row) => [...row]);
  const start = parseRangeStart(range);
  if (!start) return result;
  // data[0] = sheet row 1 (header), data[k] = sheet row k+1
  // sheet row startRow → data index startRow - 1
  values.forEach((rowValues, ri) => {
    const dataIdx = start.startRow - 1 + ri;
    if (dataIdx >= 0 && dataIdx < result.length) {
      rowValues.forEach((val, ci) => {
        const colIdx = start.startCol + ci;
        while (result[dataIdx].length <= colIdx) result[dataIdx].push("");
        result[dataIdx][colIdx] = val;
      });
    }
  });
  return result;
}
