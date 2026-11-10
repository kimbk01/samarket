"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext, buildOwnerSupportContext, type SupportContext } from "@/lib/support/support-context";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";
import {
  DeliveryRecruitingHeroLayout,
  DELIVERY_RECRUITING_PRIMARY_CLASS,
} from "@/components/delivery/launch/DeliveryRecruitingHeroLayout";
import { useDeliveryStoreOwnerEntry, type DeliveryStoreOwnerEntry } from "@/lib/delivery/launch/use-delivery-store-owner-entry";
import { resolveDeliveryLaunchTexts, type DeliveryLaunchPublicState } from "@/lib/delivery/launch/delivery-launch-contract";

/**
 * 배달 매장 모집 — 큰 배너 + 기존 고객센터 FAB (Owner 2026-11-10 · 설계 v3.2 §3-1·3-2·3-3).
 * mode 가 recruiting 이고 보는 사람이 확인용 계정이 아닐 때만 StoresHomeHub 가 그린다.
 * - 배너 주 버튼 1개: 마이페이지 「매장」 진입과 같은 판정·문구·경로(매장 신청 / 매장 승인 진행 사항 + 상태 / 매장 진입).
 * - 문의: 배너 버튼 없음. 기존 고객센터 FAB 를 켜고, 누르면 기존 고객센터 팝업 —
 *   매장 없음 = 「매장 입점 문의」, 매장 있음 = 「매장 승인」(신청 화면 FAB 와 같은 유형).
 * - 비로그인은 기존 규칙(S-07)대로 배달 화면 대신 로그인 안내라 여기까지 오지 않는다.
 */

function supportContextFor(owner: DeliveryStoreOwnerEntry | null, enabled: boolean): SupportContext {
  if (owner && owner.gate.kind !== "empty") {
    return buildOwnerSupportContext({
      enabled,
      category: "STORE_APPROVAL",
      sourceSurface: "delivery_recruiting",
      storeId: owner.storeId ?? undefined,
    });
  }
  return buildMemberSupportContext({ enabled, category: "STORE_PARTNERSHIP", sourceSurface: "delivery_recruiting" });
}

export function DeliveryRecruitingHero({ state }: { state: DeliveryLaunchPublicState }) {
  const { t, language } = useI18n();
  const owner = useDeliveryStoreOwnerEntry(true);
  const texts = resolveDeliveryLaunchTexts(state.content, language);

  let primary: ReactNode;
  if (!owner) {
    // 매장 상태 확인 전 — 버튼 자리만 잡는다(잘못된 「매장 신청」을 먼저 보여주지 않음)
    primary = (
      <span className={DELIVERY_RECRUITING_PRIMARY_CLASS} style={{ visibility: "hidden" }} aria-hidden data-delivery-recruiting-cta="pending">
        {t("mypage_hub_store_apply")}
      </span>
    );
  } else {
    const label =
      owner.gate.kind === "empty" ? texts.applyLabel || t(owner.entry.titleKey) : t(owner.entry.titleKey);
    const badge = owner.entry.approvalStatusForBadge
      ? formatStoreApprovalStatusI18n(owner.entry.approvalStatusForBadge, t)
      : null;
    primary = (
      <Link
        href={owner.entry.href}
        prefetch={false}
        className={DELIVERY_RECRUITING_PRIMARY_CLASS}
        data-delivery-recruiting-cta={owner.gate.kind}
      >
        <span>{label}</span>
        {badge ? (
          <span className="rounded-full bg-sam-primary-soft px-2 py-0.5 text-[12px] font-bold text-sam-primary">{badge}</span>
        ) : null}
      </Link>
    );
  }
  return <DeliveryRecruitingHeroLayout state={state} primaryAction={primary} />;
}

/** 안내 띠 모양 — 고객 화면·어드민 미리보기가 같은 모양을 쓴다 */
export function DeliveryRecruitingRibbonPill({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-sam-fg px-3 py-1.5 text-[12px] font-bold text-sam-surface shadow-sm">{text}</span>
  );
}

/** 흐린 목록 위 안내 띠 — 문구는 어드민 「배달 오픈 관리」 문구 칸(비우면 앱 기본 문구) */
export function DeliveryRecruitingRibbon({ state }: { state: DeliveryLaunchPublicState }) {
  const { t, language } = useI18n();
  const text = resolveDeliveryLaunchTexts(state.content, language).ribbon || t("delivery_recruiting_ribbon");
  return (
    <div className="pointer-events-none sticky top-2 z-[2] flex justify-center py-2" data-delivery-recruiting-ribbon>
      <DeliveryRecruitingRibbonPill text={text} />
    </div>
  );
}

/**
 * 매장 모집 중 배달 첫 화면 — 기존 고객센터 FAB 를 켠다(누르면 기존 고객센터 팝업). 새 팝업은 만들지 않는다
 * (Owner 2026-11-10: 「FAB 고객센터는 원래 있던 것, 앱에서 팝업 형식으로 나오는 부분」).
 */
export function DeliveryRecruitingOverlays({ state }: { state: DeliveryLaunchPublicState }) {
  const owner = useDeliveryStoreOwnerEntry(true);
  return <SupportContextProvider value={supportContextFor(owner, state.fabEnabled)}>{null}</SupportContextProvider>;
}
