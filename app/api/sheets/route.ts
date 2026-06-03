import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSheetData,
  getSpreadsheetMeta,
  updateCells,
  appendRows,
  listSpreadsheets,
  readRange,
  extractSpreadsheetId,
} from "@/lib/google-sheets";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "list") {
      const files = await listSpreadsheets(session.accessToken);
      return NextResponse.json({ files });
    }

    const rawId = searchParams.get("spreadsheetId");
    if (!rawId)
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });

    const spreadsheetId = extractSpreadsheetId(rawId) ?? rawId;

    if (action === "meta") {
      const meta = await getSpreadsheetMeta(session.accessToken, spreadsheetId);
      return NextResponse.json(meta);
    }

    if (action === "range") {
      const range = searchParams.get("range");
      if (!range) return NextResponse.json({ error: "Missing range" }, { status: 400 });
      const data = await readRange(session.accessToken, spreadsheetId, range);
      return NextResponse.json({ data });
    }

    const sheetName = searchParams.get("sheet") ?? undefined;
    const data = await getSheetData(session.accessToken, spreadsheetId, sheetName);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sheets GET error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, spreadsheetId: rawId, range, values } = body;
    const spreadsheetId = extractSpreadsheetId(rawId) ?? rawId;

    if (action === "update") {
      await updateCells(session.accessToken, spreadsheetId, range, values);
    } else if (action === "append") {
      await appendRows(session.accessToken, spreadsheetId, range, values);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sheets POST error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
