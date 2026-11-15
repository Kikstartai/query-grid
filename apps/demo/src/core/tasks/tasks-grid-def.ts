import type { FieldOption, BaseGridDef, GridRow } from "@kikstart/query-grid";

export const TASK_COUNT = 400;
export const TASK_FILTER_FIELDS = [
  "status",
  "team",
  "priority",
  "assignee",
  "budget",
  "estimate",
  "due_at",
];

const TASK_STATUSES: FieldOption[] = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "In progress" },
  { value: "review", label: "In review" },
  { value: "done", label: "Done" },
];

export const TASK_TRANSITIONS: [string, string][] = [
  ["todo", "doing"],
  ["doing", "todo"],
  ["doing", "review"],
  ["review", "doing"],
  ["review", "done"],
  ["done", "review"],
];

const TEAMS: FieldOption[] = [
  { value: "platform", label: "Platform" },
  { value: "growth", label: "Growth" },
  { value: "billing", label: "Billing" },
  { value: "support", label: "Support" },
];

const PRIORITIES: FieldOption[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const ASSIGNEES = [
  "Ayanda Zulu",
  "Lerato Mokoena",
  "Pieter Botha",
  "Priya Naidoo",
  "Kwame Mensah",
  "Wanjiru Otieno",
  "Sarah Williams",
  "Daniel Roberts",
];

const VERBS = [
  "Fix",
  "Design",
  "Review",
  "Migrate",
  "Document",
  "Test",
  "Ship",
];
const SUBJECTS = [
  "invoice export",
  "login flow",
  "search index",
  "onboarding email",
  "rate limiter",
  "audit log",
  "pricing page",
  "webhook retries",
  "mobile layout",
  "usage report",
];

export const TASKS_GRID_DEF: BaseGridDef = {
  id: "tasks",
  defaultSort: { field: "due_at", direction: "asc" },
  facet: { field: "status" },
  totals: ["budget"],
  quick: ["title", "assignee", "number"],
  fields: [
    {
      key: "number",
      label: "Task",
      type: "integer",
      width: 90,
      pinned: true,
    },
    { key: "title", label: "Title", type: "text", width: 240 },
    {
      key: "status",
      label: "Status",
      type: "enum",
      options: TASK_STATUSES,
      width: 130,
    },
    {
      key: "team",
      label: "Team",
      type: "enum",
      options: TEAMS,
      width: 120,
    },
    {
      key: "priority",
      label: "Priority",
      type: "enum",
      options: PRIORITIES,
      width: 110,
    },
    {
      key: "assignee",
      label: "Assignee",
      type: "text",
      lookup: { labelField: "assignee" },
      width: 170,
    },
    {
      key: "budget",
      label: "Budget",
      type: "money",
      currency: "USD",
      width: 120,
    },
    {
      key: "estimate",
      label: "Hours",
      type: "integer",
      width: 90,
    },
    {
      key: "due_at",
      label: "Due",
      type: "datetime",
      width: 180,
    },
    { key: "id", label: "ID", type: "id", hidden: true },
  ],
};

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

export function listTaskRows(): GridRow[] {
  const random = createRandom(20261113);
  const start = Date.UTC(2026, 10, 1, 9);
  return Array.from({ length: TASK_COUNT }, (_, index) => ({
    id: `00000000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
    number: index + 1,
    title: `${pick(random, VERBS)} ${pick(random, SUBJECTS)}`,
    status: pick(random, TASK_STATUSES).value,
    team: pick(random, TEAMS).value,
    priority: pick(random, PRIORITIES).value,
    assignee: pick(random, ASSIGNEES),
    budget: (5 + Math.floor(random() * 195)) * 1000,
    estimate: 1 + Math.floor(random() * 40),
    due_at: new Date(
      start + Math.floor(random() * 90 * 24) * 3_600_000,
    ).toISOString(),
  }));
}
