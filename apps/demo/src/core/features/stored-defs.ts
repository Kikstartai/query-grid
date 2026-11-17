export interface StoredDefSample {
  id: string;
  label: string;
  json: string;
}

const VALID = {
  id: "stages",
  orderField: "position",
  defaultSort: { field: "position", direction: "asc" },
  fields: [
    { key: "id", label: "ID", type: "id", hidden: true },
    { key: "name", label: "Name", type: "text" },
    {
      key: "state",
      label: "State",
      type: "enum",
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
      render: "badge",
      tones: { open: "info", closed: "neutral" },
    },
    { key: "position", label: "Order", type: "integer" },
  ],
};

const TAMPERED = {
  ...VALID,
  table: "users",
  onLoad: "alert(1)",
  totals: ["salary"],
  fields: [
    ...VALID.fields,
    { key: "constructor", label: "Constructor", type: "text" },
    { key: "name", label: "Name again", type: "text" },
    { key: "notes", label: "Notes", type: "html" },
  ],
};

export const STORED_DEF_SAMPLES: StoredDefSample[] = [
  { id: "valid", label: "A valid def", json: JSON.stringify(VALID, null, 2) },
  {
    id: "tampered",
    label: "A tampered def",
    json: JSON.stringify(TAMPERED, null, 2),
  },
];
