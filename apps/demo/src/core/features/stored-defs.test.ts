import { describe, expect, test } from "bun:test";

import { normalizeStoredGridDef } from "@kikstart/query-grid";

import { STORED_DEF_SAMPLES } from "./stored-defs";

function readSample(id: string) {
  const sample = STORED_DEF_SAMPLES.find((item) => item.id === id);
  if (!sample) {
    throw new Error(`no stored def sample ${id}`);
  }
  return normalizeStoredGridDef(JSON.parse(sample.json));
}

describe("the stored def samples", () => {
  test("the valid sample reads back as the def it stores", () => {
    const sample = STORED_DEF_SAMPLES.find((item) => item.id === "valid");
    expect(readSample("valid")).toEqual({
      ok: true,
      def: { ...JSON.parse(sample?.json ?? "{}"), indexes: [] },
    });
  });

  test("the tampered sample is refused with each problem it plants", () => {
    expect(readSample("tampered")).toEqual({
      ok: false,
      problems: [
        { code: "stored_unknown_key", params: { path: "table" } },
        { code: "stored_unknown_key", params: { path: "onLoad" } },
        { code: "stored_invalid", params: { path: "fields.4.key" } },
        {
          code: "stored_duplicate",
          params: { path: "fields.5.key", value: "name" },
        },
        { code: "stored_invalid", params: { path: "fields.6.type" } },
        {
          code: "stored_unknown_field",
          params: { path: "totals.0", field: "salary" },
        },
      ],
    });
  });
});
