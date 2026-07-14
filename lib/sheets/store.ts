import { GoogleSheetsClient } from "./client";
import { recordToRow, rowToRecord, SHEETS_SCHEMA, SHEETS_TABLE_NAMES, tableHeaders } from "./schema";
import type { SheetsTableMap, SheetsTableName } from "./types";

type TableRows<K extends SheetsTableName> = Array<{ record: SheetsTableMap[K]; rowNumber: number }>;

function sameRow(left: Array<string | number | boolean>, right: unknown[]) {
  const normalizedRight = left.map((_, index) => right[index] ?? "");
  return JSON.stringify(left) === JSON.stringify(normalizedRight);
}

export class GoogleSheetsStore {
  private readonly client = new GoogleSheetsClient();

  async initialize() {
    let metadata = await this.client.getMetadata();
    let sheetIds = new Map(
      (metadata.sheets || []).flatMap((sheet) => {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        return title && sheetId !== undefined ? [[title, sheetId] as const] : [];
      })
    );

    for (const table of SHEETS_TABLE_NAMES) {
      const definition = SHEETS_SCHEMA[table];
      if (!sheetIds.has(definition.title)) await this.client.addSheet(definition.title);
    }

    metadata = await this.client.getMetadata();
    sheetIds = new Map(
      (metadata.sheets || []).flatMap((sheet) => {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        return title && sheetId !== undefined ? [[title, sheetId] as const] : [];
      })
    );

    for (const table of SHEETS_TABLE_NAMES) {
      const definition = SHEETS_SCHEMA[table];
      const headers = tableHeaders(table);
      const current = await this.client.batchGet([definition.title]);
      const currentHeaders = current.get(definition.title)?.[0] || [];
      if (currentHeaders.length === 0) {
        await this.client.updateRows(definition.title, [{ rowNumber: 1, values: headers }]);
      } else if (headers.some((header, index) => currentHeaders[index] !== header)) {
        throw new Error(`'${definition.title}' 탭의 헤더가 예상 스키마와 다릅니다. 기존 열 순서를 확인해 주세요.`);
      }
      const sheetId = sheetIds.get(definition.title);
      if (sheetId !== undefined) await this.client.formatHeader(sheetId, headers.length);
    }
  }

  async read<K extends SheetsTableName>(table: K): Promise<SheetsTableMap[K][]> {
    const result = await this.readWithRows(table);
    return result.map((row) => row.record);
  }

  async readMany<K extends SheetsTableName>(tables: K[]): Promise<{ [P in K]: SheetsTableMap[P][] }> {
    const definitions = tables.map((table) => SHEETS_SCHEMA[table]);
    const response = await this.client.batchGet(definitions.map((definition) => definition.title));
    const result: Partial<{ [P in K]: SheetsTableMap[P][] }> = {};

    tables.forEach((table) => {
      result[table] = this.parseRows(table, response.get(SHEETS_SCHEMA[table].title) || []).map((row) => row.record) as never;
    });

    return result as { [P in K]: SheetsTableMap[P][] };
  }

  async append<K extends SheetsTableName>(table: K, records: SheetsTableMap[K][]) {
    if (records.length === 0) return;
    await this.client.appendRows(SHEETS_SCHEMA[table].title, records.map((record) => recordToRow(table, record)));
  }

  async upsert<K extends SheetsTableName>(table: K, records: SheetsTableMap[K][], key?: keyof SheetsTableMap[K] & string) {
    if (records.length === 0) return { inserted: 0, updated: 0 };
    const definition = SHEETS_SCHEMA[table];
    const keyName = key || definition.key;
    const existing = await this.readWithRows(table);
    const byKey = new Map(existing.map((row) => [String(row.record[keyName]), row]));
    const updates: Array<{ rowNumber: number; values: Array<string | number | boolean> }> = [];
    const inserts: SheetsTableMap[K][] = [];

    for (const record of records) {
      const current = byKey.get(String(record[keyName]));
      if (!current) {
        inserts.push(record);
        continue;
      }
      const values = recordToRow(table, record);
      if (!sameRow(values, recordToRow(table, current.record))) {
        updates.push({ rowNumber: current.rowNumber, values });
      }
    }

    if (updates.length > 0) await this.client.updateRows(definition.title, updates);
    if (inserts.length > 0) await this.append(table, inserts);
    return { inserted: inserts.length, updated: updates.length };
  }

  async replace<K extends SheetsTableName>(table: K, records: SheetsTableMap[K][]) {
    const values = [tableHeaders(table), ...records.map((record) => recordToRow(table, record))];
    await this.client.replaceRows(SHEETS_SCHEMA[table].title, values);
  }

  async updateByKey<K extends SheetsTableName>(
    table: K,
    keyValue: string,
    patch: Partial<SheetsTableMap[K]>,
    key?: keyof SheetsTableMap[K] & string
  ) {
    const definition = SHEETS_SCHEMA[table];
    const keyName = key || definition.key;
    const existing = await this.readWithRows(table);
    const current = existing.find((row) => String(row.record[keyName]) === keyValue);
    if (!current) return null;
    const next = { ...current.record, ...patch } as SheetsTableMap[K];
    await this.client.updateRows(definition.title, [{ rowNumber: current.rowNumber, values: recordToRow(table, next) }]);
    return next;
  }

  async deleteWhere<K extends SheetsTableName>(table: K, predicate: (record: SheetsTableMap[K]) => boolean) {
    const current = await this.read(table);
    const kept = current.filter((record) => !predicate(record));
    if (kept.length === current.length) return 0;
    await this.replace(table, kept);
    return current.length - kept.length;
  }

  private async readWithRows<K extends SheetsTableName>(table: K): Promise<TableRows<K>> {
    const definition = SHEETS_SCHEMA[table];
    const response = await this.client.batchGet([definition.title]);
    return this.parseRows(table, response.get(definition.title) || []);
  }

  private parseRows<K extends SheetsTableName>(table: K, rows: unknown[][]): TableRows<K> {
    if (rows.length === 0) {
      throw new Error(`Google Sheets의 '${SHEETS_SCHEMA[table].title}' 탭이 초기화되지 않았습니다. npm run sheets:setup을 실행해 주세요.`);
    }

    const expectedHeaders = tableHeaders(table);
    const actualHeaders = rows[0].map(String);
    const indexes = expectedHeaders.map((header) => actualHeaders.indexOf(header));
    const missing = expectedHeaders.filter((_, index) => indexes[index] === -1);
    if (missing.length > 0) {
      throw new Error(`'${SHEETS_SCHEMA[table].title}' 탭에 필수 열이 없습니다: ${missing.join(", ")}`);
    }

    return rows.slice(1).flatMap((sourceRow, index) => {
      const normalized = indexes.map((columnIndex) => sourceRow[columnIndex] ?? "");
      if (normalized.every((value) => value === "")) return [];
      return [{ record: rowToRecord(table, normalized), rowNumber: index + 2 }];
    });
  }
}

export const sheetsStore = new GoogleSheetsStore();
