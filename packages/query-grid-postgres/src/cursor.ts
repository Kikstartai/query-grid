export interface Cursor {
  sortValues: string[];
  id: string;
}

const CURSOR_PARTS_MAX = 8;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify([...cursor.sortValues, cursor.id]),
  ).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length < 2 ||
      parsed.length > CURSOR_PARTS_MAX ||
      !parsed.every((part) => typeof part === "string")
    ) {
      return null;
    }
    const parts = parsed as string[];
    return { sortValues: parts.slice(0, -1), id: parts[parts.length - 1] };
  } catch {
    return null;
  }
}
