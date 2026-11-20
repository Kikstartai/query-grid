import Link from "next/link";
import { Suspense } from "react";

import { memoryCapabilities } from "@kikstart/query-grid/memory";

import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceParts } from "@/lib/workspace-parts";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import { TASK_FILTER_FIELDS } from "../../tasks/tasks-grid-def";
import {
  LANGUAGES,
  listViews,
  localizeTasksDef,
  type Language,
} from "../languages";
import {
  LocalizedMessages,
  LocalizedQueryProvider,
} from "../localized-provider";
import { LocalizedView } from "./localized-view";

interface LocalizedWorkspaceProps {
  language: Language;
}

function LanguageNav({ language }: LocalizedWorkspaceProps) {
  return (
    <nav className="language-nav" aria-label={language.languagesLabel}>
      {LANGUAGES.map((item) => (
        <Link
          key={item.code}
          href={`/localized/${item.code}`}
          lang={item.locale}
          aria-current={item.code === language.code ? "page" : undefined}
        >
          {item.name}
        </Link>
      ))}
    </nav>
  );
}

export function LocalizedWorkspace({ language }: LocalizedWorkspaceProps) {
  const def = localizeTasksDef(language);
  return (
    <div
      className="workspace"
      lang={language.locale}
      dir={language.dir}
      data-source="memory"
      data-language={language.code}
    >
      <header className="workspace-head">
        <SiteBrand />
        <h1>{language.title}</h1>
        <LanguageNav language={language} />
      </header>
      <p className="workspace-note">{language.note}</p>
      <LocalizedMessages language={language}>
        <Suspense
          fallback={
            <WorkspaceSkeleton
              def={def}
              capabilities={memoryCapabilities(def)}
              fields={TASK_FILTER_FIELDS}
            />
          }
        >
          <LocalizedQueryProvider key={language.code} language={language}>
            <WorkspaceParts
              filterFields={TASK_FILTER_FIELDS}
              views={listViews(language)}
            >
              <LocalizedView />
            </WorkspaceParts>
          </LocalizedQueryProvider>
        </Suspense>
      </LocalizedMessages>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
