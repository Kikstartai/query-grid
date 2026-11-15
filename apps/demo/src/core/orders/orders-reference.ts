export interface WeightedOption {
  value: string;
  label: string;
  weight: number;
}

export const ORDER_STATUSES: WeightedOption[] = [
  { value: "completed", label: "Completed", weight: 0.62 },
  { value: "shipped", label: "Shipped", weight: 0.15 },
  { value: "paid", label: "Paid", weight: 0.1 },
  { value: "pending", label: "Pending", weight: 0.06 },
  { value: "cancelled", label: "Cancelled", weight: 0.04 },
  { value: "refunded", label: "Refunded", weight: 0.025 },
  { value: "failed", label: "Failed", weight: 0.005 },
];

export const ORDER_STATUS_TRANSITIONS: [string, string][] = [
  ["pending", "paid"],
  ["pending", "cancelled"],
  ["pending", "failed"],
  ["paid", "shipped"],
  ["paid", "refunded"],
  ["paid", "cancelled"],
  ["shipped", "completed"],
  ["shipped", "refunded"],
  ["completed", "refunded"],
  ["failed", "pending"],
];

export const ORDER_ASSIGNED_SHARE = 0.18;

export const ORDER_ASSIGNEES: WeightedOption[] = [
  { value: "glen", label: "Glen Kitchen", weight: 0.3 },
  { value: "lerato", label: "Lerato Mokoena", weight: 0.25 },
  { value: "pieter", label: "Pieter Botha", weight: 0.2 },
  { value: "priya", label: "Priya Naidoo", weight: 0.15 },
  { value: "kwame", label: "Kwame Mensah", weight: 0.07 },
  { value: "wanjiru", label: "Wanjiru Otieno", weight: 0.03 },
];

export const ORDER_CHANNELS: WeightedOption[] = [
  { value: "web", label: "Web", weight: 0.55 },
  { value: "mobile", label: "Mobile", weight: 0.3 },
  { value: "pos", label: "Point of sale", weight: 0.1 },
  { value: "api", label: "API", weight: 0.04 },
  { value: "phone", label: "Phone", weight: 0.01 },
];

const REGION_NAMES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Nairobi",
  "Lagos",
  "Accra",
  "Kampala",
  "Dar es Salaam",
  "Lusaka",
  "Harare",
  "Gaborone",
  "Windhoek",
  "Maputo",
  "Kigali",
  "Addis Ababa",
  "Cairo",
  "Casablanca",
  "Tunis",
  "Dakar",
  "Abidjan",
  "Luanda",
  "Kinshasa",
  "Antananarivo",
  "Port Louis",
  "Lilongwe",
  "Maseru",
  "Mbabane",
  "Bujumbura",
  "Djibouti",
  "Asmara",
  "Banjul",
  "Freetown",
  "Monrovia",
  "Victoria",
];

function regionCode(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, "-");
}

const REGION_ZIPF_TOTAL = REGION_NAMES.reduce(
  (sum, _name, index) => sum + 1 / (index + 1),
  0,
);

export const ORDER_REGIONS: WeightedOption[] = REGION_NAMES.map(
  (label, index) => ({
    value: regionCode(label),
    label,
    weight: 1 / (index + 1) / REGION_ZIPF_TOTAL,
  }),
);

export const ORDER_PRIORITIES: WeightedOption[] = [
  { value: "normal", label: "Normal", weight: 0.9 },
  { value: "high", label: "High", weight: 0.07 },
  { value: "low", label: "Low", weight: 0.03 },
];
