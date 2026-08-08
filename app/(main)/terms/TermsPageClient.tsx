"use client";

import { LegalDocumentPageClient } from "@/components/legal/LegalDocumentPageClient";

export type TermsInitialDoc = {
  title: string;
  body: string;
  version: string | null;
  source: "cms" | "fallback";
};

type Props = {
  initialByLocale?: {
    ko: TermsInitialDoc;
    en: TermsInitialDoc;
  };
};

export function TermsPageClient({ initialByLocale }: Props) {
  return (
    <LegalDocumentPageClient
      kind="terms"
      fallbackTitleKey="ui_finish_terms_title"
      fallbackBodyKeys={[
        "ui_finish_terms_p1",
        "ui_finish_terms_p2",
        "ui_finish_terms_p3",
        "ui_finish_terms_p4",
      ]}
      initialByLocale={initialByLocale}
    />
  );
}
