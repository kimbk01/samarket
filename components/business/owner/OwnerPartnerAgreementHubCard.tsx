"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { fetchOwnerPartnerAgreement } from "@/lib/stores/partner/fetch-owner-partner-agreement";

/**
 * 사장님 허브 — 현재 게시된 입점 약관에 동의 기록이 없을 때만 카드 1개 (설계 v2 §4-5).
 * 안내만 — 다른 기능은 막지 않는다. 조회 실패·동의 완료면 아무것도 그리지 않는다.
 */
export function OwnerPartnerAgreementHubCard({ storeId }: { storeId: string }) {
  const { t, language } = useI18n();
  const locale = language === "en" ? "en" : "ko";
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const sid = storeId.trim();
    if (!sid) return;
    let cancelled = false;
    void fetchOwnerPartnerAgreement(sid, locale).then((json) => {
      if (cancelled) return;
      const v = json?.needsReconsent ? json.current?.terms?.version ?? null : null;
      setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, locale]);

  if (!version) return null;
  return (
    <div
      className="mb-3 rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft p-4"
      data-owner-partner-hub-card="1"
    >
      <h2 className="sam-text-body-lg font-semibold text-sam-fg">{t("owner_partner_reconsent_card_title")}</h2>
      <p className="mt-1 sam-text-body text-sam-fg">{t("owner_partner_reconsent_card_body", { version })}</p>
      <Link href={OwnerRoutes.partnerAgreement(storeId)} className={`mt-3 inline-flex ${OwnerCta.primary}`}>
        {t("owner_partner_hub_card_btn")}
      </Link>
    </div>
  );
}
