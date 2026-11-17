import type { BaseGridDef } from "@kikstart/query-grid";
import type { ViewOption } from "@kikstart/query-grid-react/ui";

import { TASKS_GRID_DEF } from "../tasks/tasks-grid-def";

export const LANGUAGE_CODES = ["en", "af", "ar"] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface Language {
  code: LanguageCode;
  locale: string;
  dir: "ltr" | "rtl";
  name: string;
  title: string;
  note: string;
  languagesLabel: string;
  views: Record<ViewOption["view"], string>;
  fields: Record<string, string>;
  options: Record<string, Record<string, string>>;
}

const ENGLISH: Language = {
  code: "en",
  locale: "en-ZA",
  dir: "ltr",
  name: "English",
  title: "Tasks, localized",
  note: "The same grid in three languages. Every string the components render comes from one messages object, and every number, date, plural and list is formatted in the page's locale. The field and option labels are the host's, translated in its def. The task titles and names are data, so they stay as they are stored.",
  languagesLabel: "Language",
  views: { grid: "Grid", list: "List", board: "Board" },
  fields: {},
  options: {},
};

const AFRIKAANS: Language = {
  code: "af",
  locale: "af-ZA",
  dir: "ltr",
  name: "Afrikaans",
  title: "Take, gelokaliseer",
  note: "Dieselfde rooster in drie tale. Elke teks wat die komponente wys, kom uit een boodskap-objek, en elke getal, datum, meervoud en lys word in die bladsy se lokaal geformateer. Die veld- en opsie-etikette is die gasheer s'n, vertaal in sy definisie. Die taaktitels en name is data en bly soos hulle gestoor is.",
  languagesLabel: "Taal",
  views: { grid: "Rooster", list: "Lys", board: "Bord" },
  fields: {
    number: "Taak",
    title: "Titel",
    status: "Status",
    team: "Span",
    priority: "Prioriteit",
    assignee: "Toegewys aan",
    budget: "Begroting",
    estimate: "Ure",
    rate: "Tarief",
    blocked: "Geblokkeer",
    labels: "Etikette",
    start_on: "Begin",
    due_at: "Sperdatum",
    rank: "Rang",
    id: "ID",
  },
  options: {
    status: {
      todo: "Te doen",
      doing: "Aan die gang",
      review: "In hersiening",
      done: "Klaar",
    },
    team: {
      platform: "Platform",
      growth: "Groei",
      billing: "Fakturering",
      support: "Ondersteuning",
    },
    priority: { low: "Laag", normal: "Normaal", high: "Hoog" },
    labels: {
      bug: "Fout",
      feature: "Funksie",
      chore: "Roetine",
      customer: "Kliënt",
      urgent: "Dringend",
    },
  },
};

const ARABIC: Language = {
  code: "ar",
  locale: "ar-EG",
  dir: "rtl",
  name: "العربية",
  title: "المهام، مترجمة",
  note: "الشبكة نفسها بثلاث لغات. كل نص تعرضه المكوّنات يأتي من كائن رسائل واحد، وكل رقم وتاريخ وصيغة جمع وقائمة تُنسَّق بحسب لغة الصفحة. تسميات الحقول والخيارات يملكها التطبيق المضيف، وهي مترجمة في تعريفه. أما عناوين المهام والأسماء فبيانات، فتبقى كما هي مخزّنة.",
  languagesLabel: "اللغة",
  views: { grid: "شبكة", list: "قائمة", board: "لوحة" },
  fields: {
    number: "المهمة",
    title: "العنوان",
    status: "الحالة",
    team: "الفريق",
    priority: "الأولوية",
    assignee: "المكلَّف",
    budget: "الميزانية",
    estimate: "الساعات",
    rate: "السعر",
    blocked: "معطَّلة",
    labels: "الوسوم",
    start_on: "البدء",
    due_at: "الاستحقاق",
    rank: "الترتيب",
    id: "المعرّف",
  },
  options: {
    status: {
      todo: "للتنفيذ",
      doing: "قيد التنفيذ",
      review: "قيد المراجعة",
      done: "منجزة",
    },
    team: {
      platform: "المنصّة",
      growth: "النمو",
      billing: "الفوترة",
      support: "الدعم",
    },
    priority: { low: "منخفضة", normal: "عادية", high: "عالية" },
    labels: {
      bug: "خلل",
      feature: "ميزة",
      chore: "روتيني",
      customer: "عميل",
      urgent: "عاجل",
    },
  },
};

export const LANGUAGES: Language[] = [ENGLISH, AFRIKAANS, ARABIC];

export function getLanguage(code: string): Language | null {
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

export function listViews(language: Language): ViewOption[] {
  return [
    { view: "grid", label: language.views.grid },
    { view: "list", label: language.views.list },
    { view: "board", label: language.views.board },
  ];
}

export function localizeTasksDef(language: Language): BaseGridDef {
  return {
    ...TASKS_GRID_DEF,
    id: `tasks-${language.code}`,
    fields: TASKS_GRID_DEF.fields.map((field) => ({
      ...field,
      label: language.fields[field.key] ?? field.label,
      options: field.options?.map((option) => ({
        ...option,
        label: language.options[field.key]?.[option.value] ?? option.label,
      })),
    })),
  };
}
