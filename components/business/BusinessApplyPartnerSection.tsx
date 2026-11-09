"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { StorePartnerPledgeFields } from "@/components/stores/partner/StorePartnerPledgeFields";
import type {
  StorePartnerAgreementInput,
  StorePartnerTermsOffer,
} from "@/lib/stores/partner/store-partner-agreement-contract";

/** 신청서가 제출 판정에 쓰는 서약 상태 */
export type BusinessApplyPartnerState = {
  /** 게시된 약관이 있어 서약이 필요한지 (불러오기 전·실패 = false — 서버가 최종 판정) */
  required: boolean;
  /** 제출 본문 `partner_agreement` (서약이 필요 없으면 null) */
  input: StorePartnerAgreementInput | null;
};

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; offer: StorePartnerTermsOffer };

/**
 * 입점 신청서 「입점·수수료 서약 (필수)」 — 업종 칸 아래 (설계 v2 §4-5).
 * 업종을 바꾸면 요율을 다시 조회한다. 게시된 약관이 없으면 「약관 준비 중」 안내만 (서약 없이 신청 가능).
 */
export function BusinessApplyPartnerSection({
  categoryPrimarySlug,
  categorySubSlug,
  primaryLabel,
  subLabel,
  refreshKey = 0,
  onStateChange,
}: {
  categoryPrimarySlug: string;
  categorySubSlug: string;
  primaryLabel: string;
  subLabel: string;
  /** 서버가 버전 불일치를 알리면 늘려서 다시 불러온다 */
  refreshKey?: number;
  /** 안정된 함수(상태 setter 등)를 넘긴다 */
  onStateChange: (state: BusinessApplyPartnerState) => void;
}) {
  const { t, language } = useI18n();
  const locale = language === "en" ? "en" : "ko";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [agree, setAgree] = useState({ agreeTerms: false, agreeFee: false });
  const [retry, setRetry] = useState(0);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    setLoad({ kind: "loading" });
    const qs = new URLSearchParams({
      categorySlug: categoryPrimarySlug,
      topicSlug: categorySubSlug,
      locale,
    });
    void (async () => {
      try {
        const res = await fetch(`/api/stores/partner-terms?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as (StorePartnerTermsOffer & { ok?: boolean }) | null;
        if (seq !== seqRef.current) return;
        if (!res.ok || !json?.ok) {
          setLoad({ kind: "error" });
          return;
        }
        setLoad({
          kind: "ready",
          offer: {
            terms: json.terms ?? null,
            freeUntil: json.freeUntil ?? null,
            freePromoActive: json.freePromoActive === true,
            feePercentAfter: typeof json.feePercentAfter === "number" ? json.feePercentAfter : null,
            feeScope: json.feeScope ?? null,
          },
        });
      } catch {
        if (seq === seqRef.current) setLoad({ kind: "error" });
      }
    })();
  }, [categoryPrimarySlug, categorySubSlug, locale, refreshKey, retry]);

  /** 약관 버전이 바뀌면(다시 불러온 문서가 다르면) 체크를 지운다 — 본 적 없는 문서에 동의하지 않게 */
  const termsId = load.kind === "ready" ? load.offer.terms?.id ?? "" : "";
  const termsVersion = load.kind === "ready" ? load.offer.terms?.version ?? "" : "";
  useEffect(() => {
    setAgree({ agreeTerms: false, agreeFee: false });
  }, [termsId, termsVersion]);

  const terms = load.kind === "ready" ? load.offer.terms : null;
  useEffect(() => {
    if (!terms) {
      onStateChange({ required: false, input: null });
      return;
    }
    onStateChange({
      required: true,
      input: {
        documentId: terms.id,
        version: terms.version,
        locale: terms.locale,
        agreeTerms: agree.agreeTerms,
        agreeFee: agree.agreeFee,
      },
    });
  }, [terms, agree, onStateChange]);

  const onRetry = useCallback(() => setRetry((n) => n + 1), []);

  /** 요율이 걸린 단계 이름 — 세부업종 정책이면 세부업종, 그 밖에는 1차 업종 */
  const categoryLabel =
    load.kind === "ready" && load.offer.feeScope === "topic" ? subLabel || primaryLabel : primaryLabel || subLabel;

  return (
    <OwnerStoreAdminDashSection title={t("partner_apply_section_title")}>
      {load.kind === "loading" ? (
        <p className="sam-text-body text-sam-muted" role="status">
          {t("partner_loading")}
        </p>
      ) : load.kind === "error" ? (
        <div className="space-y-2">
          <p className="sam-text-body text-sam-danger" role="alert">
            {t("partner_load_failed")}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 sam-text-body font-medium text-sam-fg"
          >
            {t("partner_retry_btn")}
          </button>
        </div>
      ) : !load.offer.terms ? (
        <p className="sam-text-body text-sam-muted" data-store-partner-terms-preparing="1">
          {t("partner_apply_terms_preparing")}
        </p>
      ) : (
        <StorePartnerPledgeFields
          offer={load.offer}
          categoryLabel={categoryLabel}
          agreeTerms={agree.agreeTerms}
          agreeFee={agree.agreeFee}
          onChange={setAgree}
        />
      )}
    </OwnerStoreAdminDashSection>
  );
}
