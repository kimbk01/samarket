"use client";

import { LegalDocumentPageClient } from "@/components/legal/LegalDocumentPageClient";

export function TermsPageClient() {
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
    />
  );
}
