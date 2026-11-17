import { notFound } from "next/navigation";

import { getLanguage, LANGUAGE_CODES } from "@/core/localized/languages";
import { LocalizedWorkspace } from "@/core/localized/ui/localized-workspace";

interface LocalizedRouteProps {
  code: string;
}

export function generateStaticParams() {
  return LANGUAGE_CODES.map((lang) => ({ lang }));
}

function LocalizedRoute({ code }: LocalizedRouteProps) {
  const language = getLanguage(code);
  if (!language) {
    notFound();
  }
  return <LocalizedWorkspace language={language} />;
}

export default function LocalizedPage({
  params,
}: PageProps<"/localized/[lang]">) {
  return params.then(({ lang }) => <LocalizedRoute code={lang} />);
}
