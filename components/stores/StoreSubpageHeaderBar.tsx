"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliverySubpageHeader } from "@/components/stores/chrome/DeliverySubpageHeader";
import { useStoreDetailBackPress } from "@/components/stores/StoreDetailBackRow";

/**
 * 매장 하위 화면(정보·신고) 로컬 헤더 — S3-06: 리뷰·장바구니와 같은 `DeliverySubpageHeader` 하나로 통일.
 * 전역 1단은 `/stores/[slug]/*` 에서 숨김이라 이 헤더가 safe-top·뒤로를 소유한다.
 * 뒤로 목적지 = 배달 Back SSOT(`resolveDibayBackTarget`: 정보·신고 → 매장 메뉴 PUSH) — 5a3144b0b 회귀 복원 (D-03).
 */
export function StoreSubpageHeaderBar({
  title,
  storeSlug,
}: {
  title: string;
  storeSlug: string;
  /** @deprecated 제목 요소는 `DeliverySubpageHeader`(DetailHeader) 가 소유 — 호출부 호환용 */
  as?: "h1" | "h2";
}) {
  const { t } = useI18n();
  const onBack = useStoreDetailBackPress(storeSlug);
  return <DeliverySubpageHeader title={title} onBack={onBack} backLabel={t("nav_back")} />;
}
