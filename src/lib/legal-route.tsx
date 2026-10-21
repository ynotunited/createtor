import { LegalPage } from "@/components/public/LegalPage";
import { getLegalDoc } from "@/lib/legal";

/** Shared route options for a legal document, keyed by its slug. */
export function legalRouteOptions(slug: string) {
  const doc = getLegalDoc(slug);
  return {
    head: () => ({
      meta: [
        { title: `${doc.title} — Createtor` },
        { name: "description", content: doc.summary },
        { property: "og:title", content: `${doc.title} — Createtor` },
        { property: "og:description", content: doc.summary },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    }),
    component: () => <LegalPage doc={doc} />,
  };
}
