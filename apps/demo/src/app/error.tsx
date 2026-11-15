"use client";

import { useEffect } from "react";

import { SiteBrand } from "@/lib/site-brand";

interface RouteErrorProps {
  error: unknown;
  retry: () => void;
}

export default function RouteError({ error, retry }: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page-message" data-page="error">
      <SiteBrand />
      <h1>This page failed to load</h1>
      <p>The grid could not be rendered. Nothing was changed.</p>
      <button type="button" className="page-message-action" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
