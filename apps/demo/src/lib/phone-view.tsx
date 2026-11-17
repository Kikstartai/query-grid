"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

const PHONE_QUERY = "(max-width: 640px)";

interface PhoneDefaultViewProps {
  view: string;
}

export function PhoneDefaultView({ view }: PhoneDefaultViewProps) {
  const [current, setView] = useQueryState(
    "view",
    parseAsString.withOptions({ history: "replace" }),
  );
  const [initial] = useState(current);
  useEffect(() => {
    if (initial !== null || !matchMedia(PHONE_QUERY).matches) {
      return;
    }
    // In development the Next router takes its first action only once every mount effect has run.
    const timer = setTimeout(() => void setView(view));
    return () => clearTimeout(timer);
  }, [initial, setView, view]);
  return null;
}
