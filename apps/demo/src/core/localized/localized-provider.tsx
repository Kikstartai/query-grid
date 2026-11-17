"use client";

import { useEffect, useState, type ReactNode } from "react";

import { createMemorySource } from "@kikstart/query-grid/memory";
import { QueryGridProvider } from "@kikstart/query-grid-react";
import {
  QueryGridMessagesProvider,
  type QueryGridMessageOverrides,
} from "@kikstart/query-grid-react/components";

import { listTaskRows } from "../tasks/tasks-grid-def";
import {
  localizeTasksDef,
  type Language,
  type LanguageCode,
} from "./languages";
import { AF_MESSAGES } from "./messages-af";
import { AR_MESSAGES } from "./messages-ar";

const MESSAGES: Record<LanguageCode, QueryGridMessageOverrides> = {
  en: {},
  af: AF_MESSAGES,
  ar: AR_MESSAGES,
};

interface LocalizedProps {
  language: Language;
  children: ReactNode;
}

// Menus, drawers and date pickers are portalled to the body, outside the workspace that carries lang and dir.
function useDocumentLanguage(language: Language) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = { lang: root.lang, dir: root.dir };
    root.lang = language.locale;
    root.dir = language.dir;
    return () => {
      root.lang = previous.lang;
      root.dir = previous.dir;
    };
  }, [language]);
}

export function LocalizedMessages({ language, children }: LocalizedProps) {
  useDocumentLanguage(language);
  return (
    <QueryGridMessagesProvider
      locale={language.locale}
      messages={MESSAGES[language.code]}
    >
      {children}
    </QueryGridMessagesProvider>
  );
}

export function LocalizedQueryProvider({ language, children }: LocalizedProps) {
  const [def] = useState(() => localizeTasksDef(language));
  const [source] = useState(() => createMemorySource(def, listTaskRows()));
  return (
    <QueryGridProvider def={def} source={source}>
      {children}
    </QueryGridProvider>
  );
}
