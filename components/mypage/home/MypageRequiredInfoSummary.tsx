"use client";

import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { deriveMemberAccountStatus } from "@/lib/profile/member-account-status";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import {
  resolveMypageHomeRequiredItems,
  type MypageHomeRequiredItem,
} from "@/lib/mypage/mypage-home-required-items";
import type { MessageKey } from "@/lib/i18n/messages";
import { MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

const ITEM_COPY: Record<MypageHomeRequiredItem, { titleKey: MessageKey; ctaKey: MessageKey }> = {
  handle: { titleKey: "mypage_home_required_handle_title", ctaKey: "mypage_home_required_handle_cta" },
  phone: { titleKey: "mypage_home_required_phone_title", ctaKey: "mypage_home_required_phone_cta" },
  address: { titleKey: "mypage_home_required_address_title", ctaKey: "mypage_home_required_address_cta" },
};

/**
 * 필수정보(1-a) — 프로필 블록 아래 인라인, **미완료 항목만** 1줄씩(최종 설계 H0).
 * 셋 다 완료 / 상태 미확정이면 블록 자체 없음. 조회 실패만 한 줄 오류 + [다시 시도].
 * 주소 등록 여부는 홈 모델이 소유한 `projection.addressStatus` 만 사용(대표주소 훅 호출 금지 — 루트 네트워크 계약).
 */
export function MypageRequiredInfoSummary({
  projection,
  onProfileRefresh,
  loadFailed = false,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
  /** 조회 실패 — 「확인 중」 고착 대신 오류 + 재시도 */
  loadFailed?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { openSheet } = useMypageProfileSheets();
  const profile = projection?.profile ?? null;
  const addressRegistered = projection?.addressStatus === "complete";

  const items = useMemo(() => {
    if (!projection || !profile) return [];
    const status = deriveMemberAccountStatus(profile, { hasDefaultAddress: addressRegistered });
    return resolveMypageHomeRequiredItems({
      status,
      phoneStatus: projection.phoneStatus,
      addressStatus: projection.addressStatus,
    });
  }, [addressRegistered, profile, projection]);

  const settled =
    Boolean(projection && profile) &&
    projection?.phoneStatus !== "unknown" &&
    projection?.addressStatus !== "unknown";

  if (loadFailed && !settled) {
    return (
      <section
        className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}
        data-testid="mypage-account-control-card"
        data-state="error"
        role="alert"
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-5">
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-sam-muted">
            {t("mypage_account_control_load_failed")}
          </p>
          {onProfileRefresh ? (
            <button type="button" className="sam-btn sam-btn--secondary sam-btn--sm" onClick={onProfileRefresh}>
              {t("common_retry")}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!settled || items.length === 0) return null;

  const activate = (item: MypageHomeRequiredItem) => {
    if (item === "handle") openSheet("dibay-id");
    else if (item === "phone") openSheet("phone");
    else router.push(buildMypageAddressesHref("/mypage"));
  };

  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}
      data-testid="mypage-account-control-card"
      data-state="incomplete"
    >
      <ul>
        {items.map((item, index) => (
          <li
            key={item}
            data-testid={`mypage-account-row-${item}`}
            className={index === 0 ? "" : "border-t border-sam-border-soft"}
          >
            <button
              type="button"
              onClick={() => activate(item)}
              className="flex min-h-[52px] w-full items-center gap-3 bg-sam-warning-soft px-4 text-left active:bg-sam-pressed-surface md:px-5"
            >
              {item === "address" ? (
                // 주소 플랫폼 HARD LOCK — 현재 주소 표면은 초록 지도 핀(AddressKindHeadPin)
                <AddressKindHeadPin kind="master" className="h-[18px] w-[18px] shrink-0" />
              ) : (
                <AlertCircle className="h-[18px] w-[18px] shrink-0 text-sam-danger" strokeWidth={2} aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-sam-fg">
                {t(ITEM_COPY[item].titleKey)}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-sam-primary">
                {t(ITEM_COPY[item].ctaKey)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
