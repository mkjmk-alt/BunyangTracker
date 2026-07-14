import { createSign } from "node:crypto";

type SheetsValue = string | number | boolean;

type GoogleToken = {
  accessToken: string;
  expiresAt: number;
};

type SpreadsheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
      gridProperties?: { rowCount?: number; columnCount?: number };
    };
  }>;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_BATCH_RANGES = 200;

let cachedToken: GoogleToken | null = null;

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수가 없습니다. GOOGLE_SHEETS.md의 설정 절차를 확인해 주세요.`);
  }
  return value;
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function getPrivateKey() {
  const direct = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (direct) return direct.replace(/\\n/g, "\n");

  const encodedJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (encodedJson) {
    const parsed = JSON.parse(Buffer.from(encodedJson, "base64").toString("utf8"));
    if (typeof parsed.private_key === "string") return parsed.private_key;
  }

  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 환경변수가 필요합니다."
  );
}

function getServiceAccountEmail() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  const encodedJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (encodedJson) {
    const parsed = JSON.parse(Buffer.from(encodedJson, "base64").toString("utf8"));
    if (typeof parsed.client_email === "string") return parsed.client_email;
  }

  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_EMAIL 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 환경변수가 필요합니다."
  );
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: getServiceAccountEmail(),
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(getPrivateKey());
  const assertion = `${unsignedToken}.${encodeBase64Url(signature)}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const body = await response.json();
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Google 서비스 계정 인증 실패: ${body.error_description || body.error || response.status}`);
  }

  cachedToken = {
    accessToken: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}

async function googleRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${SHEETS_API_ROOT}/${requireEnvironment("GOOGLE_SHEETS_SPREADSHEET_ID")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets API 오류 (${response.status}): ${detail.slice(0, 500)}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function quotedRange(title: string, suffix: string) {
  return `'${title.replace(/'/g, "''")}'!${suffix}`;
}

function columnName(index: number) {
  let current = index;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export class GoogleSheetsClient {
  async getMetadata() {
    return googleRequest<SpreadsheetMetadata>(
      "?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))"
    );
  }

  async ensureGridCapacity(title: string, requiredRows: number, requiredColumns: number) {
    const metadata = await this.getMetadata();
    const properties = metadata.sheets?.find((sheet) => sheet.properties?.title === title)?.properties;
    if (properties?.sheetId === undefined) throw new Error(`Google Sheets tab not found: ${title}`);

    const currentRows = properties.gridProperties?.rowCount || 0;
    const currentColumns = properties.gridProperties?.columnCount || 0;
    const requests = [];

    if (requiredRows > currentRows) {
      requests.push({
        appendDimension: {
          sheetId: properties.sheetId,
          dimension: "ROWS",
          length: requiredRows - currentRows,
        },
      });
    }
    if (requiredColumns > currentColumns) {
      requests.push({
        appendDimension: {
          sheetId: properties.sheetId,
          dimension: "COLUMNS",
          length: requiredColumns - currentColumns,
        },
      });
    }

    if (requests.length > 0) {
      await googleRequest(":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests }),
      });
    }
  }

  async addSheet(title: string) {
    await googleRequest(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    });
  }

  async formatHeader(sheetId: number, columnCount: number) {
    await googleRequest(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.08, green: 0.12, blue: 0.2 },
                  textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
        ],
      }),
    });
  }

  async batchGet(titles: string[]) {
    if (titles.length === 0) return new Map<string, unknown[][]>();
    const query = new URLSearchParams({ majorDimension: "ROWS" });
    titles.forEach((title) => query.append("ranges", quotedRange(title, "A:ZZ")));
    const result = await googleRequest<{ valueRanges?: Array<{ range?: string; values?: unknown[][] }> }>(
      `/values:batchGet?${query.toString()}`
    );
    const rows = new Map<string, unknown[][]>();
    titles.forEach((title, index) => rows.set(title, result.valueRanges?.[index]?.values || []));
    return rows;
  }

  async updateRows(title: string, rows: Array<{ rowNumber: number; values: SheetsValue[] }>) {
    for (const batch of chunks(rows, MAX_BATCH_RANGES)) {
      await googleRequest("/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: batch.map((row) => ({
            range: quotedRange(title, `A${row.rowNumber}:${columnName(row.values.length)}${row.rowNumber}`),
            majorDimension: "ROWS",
            values: [row.values],
          })),
        }),
      });
    }
  }

  async appendRows(title: string, values: SheetsValue[][]) {
    for (const batch of chunks(values, 200)) {
      if (batch.length === 0) continue;
      await googleRequest(
        `/values/${encodeURIComponent(quotedRange(title, "A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: batch }) }
      );
    }
  }

  async replaceRows(title: string, values: SheetsValue[][]) {
    await this.ensureGridCapacity(
      title,
      Math.max(values.length, 1),
      Math.max(1, ...values.map((row) => row.length))
    );
    await googleRequest(`/values/${encodeURIComponent(quotedRange(title, "A:ZZ"))}:clear`, {
      method: "POST",
      body: "{}",
    });
    for (const [batchIndex, batch] of chunks(values, 200).entries()) {
      if (batch.length === 0) continue;
      const startRow = batchIndex * 200 + 1;
      await googleRequest(`/values/${encodeURIComponent(quotedRange(title, `A${startRow}`))}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ majorDimension: "ROWS", values: batch }),
      });
    }
  }
}
