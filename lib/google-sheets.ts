import { google } from "googleapis";

function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

export async function getSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName?: string
) {
  const sheets = getSheetsClient(accessToken);
  const range = sheetName ? `${sheetName}!A1:ZZ10000` : "A1:ZZ10000";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values ?? [];
}

export async function getSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string
) {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return {
    title: res.data.properties?.title,
    sheets: res.data.sheets?.map((s) => s.properties?.title) ?? [],
  };
}

export async function updateCells(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
) {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
) {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

export async function listSpreadsheets(accessToken: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
    pageSize: 50,
  });
  return res.data.files ?? [];
}

export async function readRange(
  accessToken: string,
  spreadsheetId: string,
  range: string
) {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values ?? [];
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(urlOrId)) return urlOrId;
  return null;
}
