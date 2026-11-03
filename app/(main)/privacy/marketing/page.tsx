import { LegalDocumentPageClient } from "@/components/legal/LegalDocumentPageClient";
import { loadPublishedAppLegalDocument } from "@/lib/legal/load-published-legal-document";
import { MARKETING_CONSENT_DEFAULT } from "@/lib/legal/marketing-consent-default";

export const dynamic = "force-dynamic";

/** 혜택·이벤트 수신 동의(선택) 전문 — 어드민 `/admin/app/legal` 의 marketing 문서. 가입 동의 전에도 열린다. */
export default async function MarketingConsentPage() {
  const [koRow, enRow] = await Promise.all([
    loadPublishedAppLegalDocument("marketing", "ko"),
    loadPublishedAppLegalDocument("marketing", "en"),
  ]);
  const seed = (row: typeof koRow) =>
    row?.title && row?.body
      ? { title: row.title, body: row.body, version: row.version || null, source: "cms" as const }
      : undefined;

  return (
    <LegalDocumentPageClient
      kind="marketing"
      fallbackTitleKey="legal_marketing_consent_title"
      fallbackBodyKeys={[]}
      initialByLocale={{ ko: seed(koRow), en: seed(enRow) }}
      staticFallbackByLocale={MARKETING_CONSENT_DEFAULT}
    />
  );
}
