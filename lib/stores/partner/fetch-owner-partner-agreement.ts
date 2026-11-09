import type {
  StorePartnerTermsDocument,
  StorePartnerTermsOffer,
} from "@/lib/stores/partner/store-partner-agreement-contract";

/** 사장님 「입점 계약」 조회 (클라이언트) — 허브 카드·입점 계약 화면 공용. 실패 = null */

export type OwnerPartnerAgreementItem = {
  id: string;
  version: string;
  locale: "ko" | "en";
  source: "application" | "reconsent";
  agreedAt: string;
  freeUntil: string | null;
  feePercentAfter: number | null;
  documentId: string;
};

export type OwnerPartnerTaxonomyName = { slug: string; name: string; nameEn: string | null };

export type OwnerPartnerAgreementResponse = {
  ok?: boolean;
  error?: string;
  agreements?: OwnerPartnerAgreementItem[];
  documents?: Record<string, StorePartnerTermsDocument>;
  taxonomy?: { category: OwnerPartnerTaxonomyName | null; topic: OwnerPartnerTaxonomyName | null };
  current?: StorePartnerTermsOffer;
  needsReconsent?: boolean;
};

export async function fetchOwnerPartnerAgreement(
  storeId: string,
  locale: "ko" | "en"
): Promise<OwnerPartnerAgreementResponse | null> {
  try {
    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(storeId)}/partner-agreement?locale=${locale}`,
      { credentials: "include", cache: "no-store" }
    );
    const json = (await res.json().catch(() => null)) as OwnerPartnerAgreementResponse | null;
    return res.ok && json?.ok ? json : null;
  } catch {
    return null;
  }
}
