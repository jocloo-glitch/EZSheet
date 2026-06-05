import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a Google Sheets assistant. The user will describe what they want to do with their spreadsheet data and you must respond with a JSON action object.

Available actions:
- { "type": "read" } — re-fetch and display the current sheet data
- { "type": "update", "range": "A1:B2", "values": [["val1","val2"],["val3","val4"]] } — update specific cells
- { "type": "append", "range": "Sheet1!A:A", "values": [["row1col1","row1col2"]] } — add rows
- { "type": "chart", "chartType": "bar"|"line"|"pie", "dataRange": "A1:B10", "title": "My Chart" } — create a chart from sheet data
- { "type": "undo" } — undo the last change made to the sheet
- { "type": "cancel_pending", "text": "..." } — discard all staged pending changes. Use when the user says to revert, cancel, undo proposed changes, or not apply staged edits. Include a short explanation in "text".
- { "type": "message", "text": "..." } — reply with information when no sheet action is needed

Always respond with a single JSON object. If the request is ambiguous, ask for clarification using { "type": "message", "text": "..." }.
If the user references a range, use A1 notation. If no sheet is specified, use the currently active sheet.

The sheet context includes a "rows" array where each entry is an object like { rowNumber: 9, A: "0", B: "5.45E-03", C: "", D: "1.13E-02", E: "1.68E-02" }. rowNumber is the 1-indexed sheet row number exactly as shown in the UI. Column letters (A, B, C, ...) map directly to spreadsheet columns. To find the value of cell E9, find the entry where rowNumber === 9 and read the "E" field — do NOT use the array index as the row number.

IMPORTANT — pending changes:
- "rows" ALWAYS shows the CURRENT saved state of the sheet (original values, not yet modified).
- If sheetContext includes a "pendingChanges" array, those are staged edits (each with range and values) not yet written. They will be applied in order on top of the current rows.
- When the user refines or extends a pending change, reason about the DESIRED FINAL STATE and return an action that achieves it. New actions layer on top of pending ones — later actions for the same cells override earlier ones.
- Example: pending has update E9:E13→all empty, user says "keep E9" → return { "type": "update", "range": "E9", "values": [[<E9_original_value>]] }
- Example: pending has update E9:E13→all empty, user says "keep E9 and E13" → return a SINGLE update covering the full span: { "type": "update", "range": "E9:E13", "values": [[<E9_val>],[""],[""],[""],["E13_val"]] }. Never split into two separate actions — always return one action with the full range and mixed values.
- Example: user says "and E13" after E9 was already restored → return { "type": "update", "range": "E13", "values": [[<E13_original_value>]] }

IMPORTANT — formulas vs raw values:
- Whenever the user's request involves arithmetic, aggregation, or combining existing cell values, write Google Sheets formula syntax into the cells (e.g. "=B2+C2", "=SUM(B2:B6)", "=AVERAGE(C2:C10)"). Do NOT compute the result yourself and write a plain number.
- Only write raw literal values when the user is explicitly entering new data (e.g. "set B2 to 42").

Current sheet context will be provided in the user message.`;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Not authenticated. Please sign in again." }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set in .env.local" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });
    const { message, sheetContext, history } = await req.json();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history ?? []),
      {
        role: "user",
        content: `Sheet context:\n${JSON.stringify(sheetContext, null, 2)}\n\nUser request: ${message}`,
      },
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content ?? "";

    let action;
    try {
      action = JSON.parse(text);
    } catch {
      action = { type: "message", text };
    }

    return NextResponse.json({ action, raw: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[chat route error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
