"use client";

import { AtSign, Check, Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMypageProfileSheetsOptional } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import { MYPAGE_REQUIRED_DIBAY_ID_HREF } from "@/lib/mypage/mypage-profile-routes";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import {
  resolveMypageRequiredInfoRows,
  type MypageRequiredInfoResult,
  type MypageRequiredRow,
  type MypageRequiredRowKey,
  type MypageRequiredRowTone,
} from "@/lib/mypage/mypage-home-required-items";
import type { MessageKey } from "@/lib/i18n/messages";
import { MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

/**
 * 상태 → 색 (real-screen-redesign §11 표). 빨강 글자는 연한 배경 위 대비 4.5:1 이상이 되도록
 * 토큰을 이 카드 안에서만 어둡게 섞는다(전역 토큰 불변). 주황(진행 중·변경 필요)은 토큰을 섞으면 갈색이 되어
 * 연주황 배지 + 진한 주황 글자 고정색을 쓴다(Production 점검 F1). 다크 모드는 원 토큰(이미 밝은 색).
 * 대비 계산 테스트: `lib/mypage/__tests__/mypage-required-info-contrast.test.ts`.
 */
export const MYPAGE_REQUIRED_TONE_CLASS: Record<
  MypageRequiredRowTone,
  { row: string; value: string; badge: string }
> = {
  missing: {
    row: "bg-sam-danger-soft",
    value: "text-[color-mix(in_srgb,var(--sam-danger)_78%,#000)] dark:text-sam-danger",
    badge:
      "border-transparent bg-[color-mix(in_srgb,var(--sam-danger)_78%,#000)] text-white dark:bg-sam-danger dark:text-sam-ink",
  },
  progress: {
    row: "",
    value: "text-sam-muted",
    badge:
      "border-[#F2A65A] bg-transparent text-[#8A3B00] dark:border-sam-warning dark:text-sam-warning",
  },
  complete: {
    row: "",
    value: "text-sam-muted",
    badge: "border-transparent bg-sam-primary text-sam-on-primary",
  },
  action: {
    row: "bg-sam-warning-soft",
    value: "text-[#8A3B00] dark:text-sam-warning",
    badge: "border-[#F2A65A] bg-[#FFE3C2] text-[#8A3B00] dark:border-transparent dark:bg-sam-warning dark:text-sam-ink",
  },
  error: {
    row: "",
    value: "text-sam-muted",
    badge: "border-sam-border bg-transparent text-sam-muted",
  },
};

const ROW_TITLE_KEY: Record<MypageRequiredRowKey, MessageKey> = {
  handle: "mypage_req_row_handle",
  phone: "mypage_req_row_phone",
  address: "mypage_req_row_address",
};

/** 행 높이 고정 — 스켈레톤과 실제 행이 같은 높이(전환 시 흔들림 0) */
const ROW_HEIGHT_CLASS = "min-h-[68px]";

function RowIcon({ rowKey }: { rowKey: MypageRequiredRowKey }) {
  if (rowKey === "address") {
    // 주소 플랫폼 HARD LOCK — 현재 주소 표면은 초록 지도 핀(AddressKindHeadPin)
    return <AddressKindHeadPin kind="master" className="h-5 w-5 shrink-0 justify-center" />;
  }
  const Icon = rowKey === "handle" ? AtSign : Phone;
  return <Icon className="h-5 w-5 shrink-0 text-sam-muted" strokeWidth={2} aria-hidden />;
}

function RequiredRow({
  row,
  first,
  onActivate,
  onRetry,
}: {
  row: MypageRequiredRow;
  first: boolean;
  onActivate: (key: MypageRequiredRowKey) => void;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const tone = MYPAGE_REQUIRED_TONE_CLASS[row.tone];
  const valueText = row.value == null ? null : "text" in row.value ? row.value.text : t(row.value.key);
  const mono = row.value != null && "text" in row.value && row.key !== "address";
  const retry = row.action === "retry";
  const disabled = retry && !onRetry;
  return (
    <li
      data-testid={`mypage-account-row-${row.key}`}
      data-state={row.state}
      data-tone={row.tone}
      className={first ? "" : "border-t border-sam-border-soft"}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => (retry ? onRetry?.() : onActivate(row.key))}
        className={`flex ${ROW_HEIGHT_CLASS} w-full items-center gap-3 px-4 py-2.5 text-left active:bg-sam-pressed-surface md:px-5 ${tone.row}`}
      >
        <RowIcon rowKey={row.key} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-sam-fg">{t(ROW_TITLE_KEY[row.key])}</span>
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 rounded-ui-rect border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${tone.badge}`}
              data-testid={`mypage-account-badge-${row.key}`}
            >
              {row.tone === "complete" ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
              {t(row.badgeKey)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-snug">
            {valueText ? (
              <span className={`truncate ${mono ? "tabular-nums" : ""} ${tone.value}`}>{valueText}</span>
            ) : null}
            {row.subKey ? (
              <span className="shrink-0 truncate text-[12px] text-sam-muted">
                {valueText ? "· " : ""}
                {t(row.subKey)}
              </span>
            ) : null}
          </span>
        </span>
        {row.ctaKey ? (
          <span
            className={`shrink-0 sam-btn sam-btn--sm ${
              row.ctaVariant === "primary" ? "sam-btn--primary" : "sam-btn--secondary"
            }`}
          >
            {t(row.ctaKey)}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** 상태 확정 전 — 3행 고정 높이 스켈레톤 (제목은 실제 글자, 값·배지 자리는 회색 바) */
function RequiredRowsSkeleton() {
  const { t } = useI18n();
  return (
    <ul aria-busy="true" data-testid="mypage-account-rows-skeleton">
      {(["handle", "phone", "address"] as const).map((key, i) => (
        <li key={key} className={i === 0 ? "" : "border-t border-sam-border-soft"}>
          <div className={`flex ${ROW_HEIGHT_CLASS} items-center gap-3 px-4 py-2.5 md:px-5`}>
            <RowIcon rowKey={key} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[14px] font-semibold text-sam-fg">{t(ROW_TITLE_KEY[key])}</span>
              <span className="block h-3 w-24 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
            </span>
            <span className="block h-7 w-14 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 필수 정보 3행 본문 — 홈·계정(S03) 공용. 루트 testid `mypage-account-control-card`.
 * 행 전체 탭 = CTA 와 같은 곳. 오류 행은 [다시 시도].
 */
export function MypageRequiredInfoRowsCard({
  result,
  onActivate,
  onRetry,
  showTitle = true,
}: {
  result: MypageRequiredInfoResult;
  onActivate: (key: MypageRequiredRowKey) => void;
  onRetry?: () => void;
  showTitle?: boolean;
}) {
  const { t } = useI18n();
  const anyError = result.settled && result.rows.some((r) => r.tone === "error");
  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}
      data-testid="mypage-account-control-card"
      data-state={!result.settled ? "loading" : anyError ? "error" : "ready"}
      aria-label={t("mypage_req_card_title")}
    >
      {showTitle ? (
        <h2 className="px-4 pb-1 pt-3 text-[13px] font-semibold text-sam-muted md:px-5">
          {t("mypage_req_card_title")}
        </h2>
      ) : null}
      {result.settled ? (
        <ul>
          {result.rows.map((row, i) => (
            <RequiredRow key={row.key} row={row} first={i === 0} onActivate={onActivate} onRetry={onRetry} />
          ))}
        </ul>
      ) : (
        <RequiredRowsSkeleton />
      )}
    </section>
  );
}

/** 「인증 진행 중」 행이 있을 때만 30초마다 현재 시각 갱신 → TTL 지나면 「인증 만료」로 바뀜 */
export function useRequiredInfoNowMs(hasPending: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasPending) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [hasPending]);
  return nowMs;
}

/**
 * 필수 정보 3행 이동 — 시트 Provider(내정보 홈)가 있으면 시트, 없으면(계정 S03) 같은 내용의 화면.
 * 주소는 항상 `/mypage/addresses` (주소 플랫폼 HARD LOCK).
 */
export function useRequiredInfoActivate(returnTo: string): (key: MypageRequiredRowKey) => void {
  const router = useRouter();
  const sheets = useMypageProfileSheetsOptional();
  return (key) => {
    if (key === "address") {
      router.push(buildMypageAddressesHref(returnTo));
      return;
    }
    if (sheets) {
      sheets.openSheet(key === "handle" ? "dibay-id" : "phone");
      return;
    }
    router.push(key === "handle" ? MYPAGE_REQUIRED_DIBAY_ID_HREF : buildPhoneVerificationHref());
  };
}

/**
 * 필수정보 — 프로필 카드 바로 아래, 아이디·전화번호 인증·대표 주소 3행을 **완료 여부와 관계없이 항상** 표시
 * (real-screen-redesign §11, Owner 승인 2026-10-20). 상태 확정 전 = 3행 스켈레톤, 실패 = 해당 행 「확인 불가」.
 * 주소 상태는 홈 모델이 소유한 `projection.addressStatus`·`addressPublicLabel`·`addressActiveCount` 만 사용
 * (대표주소 훅·주소 재조회 금지 — 루트 네트워크 계약).
 */
export function MypageRequiredInfoSummary({
  projection,
  onProfileRefresh,
  loadFailed = false,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
  /** 조회 실패 — 「확인 중」 고착 대신 해당 행 「확인 불가」 + [다시 시도] */
  loadFailed?: boolean;
}) {
  const profile = projection?.profile ?? null;
  const pendingPhone = profile?.phone_verification_status === "pending";
  const nowMs = useRequiredInfoNowMs(pendingPhone);
  const onActivate = useRequiredInfoActivate("/mypage");

  const result = useMemo(
    () =>
      resolveMypageRequiredInfoRows({
        profile,
        profileFailed: loadFailed && !profile,
        address: {
          status: projection?.addressStatus ?? "unknown",
          label: projection?.addressPublicLabel ?? null,
          activeCount: projection?.addressActiveCount ?? null,
          failed: loadFailed && (projection?.addressStatus ?? "unknown") === "unknown",
        },
        nowMs,
      }),
    [loadFailed, nowMs, profile, projection?.addressActiveCount, projection?.addressPublicLabel, projection?.addressStatus],
  );

  return <MypageRequiredInfoRowsCard result={result} onActivate={onActivate} onRetry={onProfileRefresh} />;
}
