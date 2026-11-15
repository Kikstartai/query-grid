import Link from "next/link";

import { SiteBrand } from "@/lib/site-brand";

export default function NotFound() {
  return (
    <main className="page-message" data-page="not-found">
      <SiteBrand />
      <h1>Page not found</h1>
      <p>There is no demo at this address.</p>
      <Link className="page-message-action" href="/">
        Back to the start
      </Link>
    </main>
  );
}
