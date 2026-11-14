export interface Cursor {
  sortValue: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.sortValue, cursor.id])).toString(
    "base64url",
  );
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return null;
    }
    return { sortValue: parsed[0], id: parsed[1] };
  } catch {
    return null;
  }
}
