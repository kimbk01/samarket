"use client";

import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { peekMeProfileCached } from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  deriveStoreMemberStatus,
  hasStoreTermsConsent,
  type StoreMemberStatus,
} from "@/lib/auth/store-member-policy";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { ProfileVerificationCenter } from "@/components/profile/ProfileVerificationCenter";
import type { MessageKey } from "@/lib/i18n/messages";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import {
  resolveRequiredAddressFromSnapshot,
  type RequiredAddressResolution,
} from "@/lib/mypage/required-address-from-snapshot";
import { resolveMypageRequiredInfoRows } from "@/lib/mypage/mypage-home-required-items";
import {
  MypageRequiredInfoRowsCard,
  useRequiredInfoActivate,
  useRequiredInfoNowMs,
} from "@/components/mypage/home/MypageRequiredInfoSummary";
import {
  LINKED_LOGIN_ANCHOR_ID,
  countLinkedAuthProviders,
  fetchMeAuthProviders,
} from "@/lib/mypage/fetch-me-auth-providers";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  MYPAGE_HOME_CHEVRON_CLASS,
  MYPAGE_HOME_MENU_TITLE_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type AccountAddressState = RequiredAddressResolution & { failed: boolean };

/** S03 → 기기 권한 화면 안 연동 로그인 그룹(X14) */
export const MYPAGE_LINKED_LOGIN_HREF = `/mypage/section/settings/device-permissions#${LINKED_LOGIN_ANCHOR_ID}`;

/** 재진입 시 로딩 깜빡임 방지 — 캐시된 full profile 우선 */
function peekCachedProfile(): ProfileRow | null {
  const cached = peekMeProfileCached();
  if (!cached || cached.status !== 200) return null;
  const json = cached.json as { ok?: boolean; profile?: ProfileRow | null } | null;
  if (!json?.ok || !json.profile?.id?.trim()) return null;
  return json.profile;
}

function memberStatusMessageKey(status: StoreMemberStatus): MessageKey {
  switch (status) {
    case "verified_member":
      return "account_member_status_verified_member";
    case "sns_member":
      return "account_member_status_sns_member";
    case "admin_manual":
      return "account_member_status_admin_manual";
    case "admin":
      return "account_member_status_admin";
    case "guest":
    default:
      return "account_member_status_guest";
  }
}

/**
 * 계정 정보 행 — 값(오른쪽) + 선택 뱃지 + (이동 가능하면) chevron. 이동 없는 정보 행은 `href` 생략.
 * 행 모양은 `MyRow`(`MyInfoMenuItem`)와 같은 52px·15/14 규칙.
 */
function AccountRow({
  title,
  value,
  badge,
  href,
  first = false,
  icon,
  testId,
  valueLoading = false,
  mono = false,
}: {
  title: string;
  value?: ReactNode;
  badge?: ReactNode;
  href?: string;
  first?: boolean;
  icon?: ReactNode;
  testId?: string;
  valueLoading?: boolean;
  mono?: boolean;
}) {
  const rowClass = `${MYPAGE_HOME_ROW_CLASS} ${first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS}`;
  const inner = (
    <>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className={`shrink-0 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>{title}</span>
      <span
        className={`min-w-0 flex-1 truncate text-right text-[14px] font-medium leading-snug text-sam-muted ${
          mono ? "font-mono tabular-nums" : ""
        }`}
        data-row-value={valueLoading ? "loading" : "ready"}
      >
        {valueLoading ? (
          <span
            aria-hidden
            className="ml-auto block h-3.5 w-16 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse"
          />
        ) : (
          value
        )}
      </span>
      {badge}
      {href ? <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={rowClass} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={`${rowClass} hover:bg-transparent active:bg-transparent`} data-testid={testId}>
      {inner}
    </div>
  );
}

/** 캐시 없을 때 — 행 6줄(제목 실제 글자 · 값 자리 회색 바) */
function AccountRowsSkeleton({ labels }: { labels: readonly string[] }) {
  return (
    <div aria-busy="true" data-testid="account-rows-skeleton">
      <MyGroup>
        {labels.map((label, i) => (
          <AccountRow key={label} title={label} first={i === 0} valueLoading />
        ))}
      </MyGroup>
    </div>
  );
}

/**
 * 계정 (최종 설계 S03) — T5 허브. 필수 정보 3행(홈과 같은 컴포넌트 · **상시 표시**, real-screen-redesign §11)
 * · 그룹 1 계정 정보 · 그룹 3 인증 센터.
 * 아이디·전화번호는 필수 정보 3행이 소유한다(계정 정보 그룹에 같은 값을 두 번 두지 않음).
 * 주소 행 핀(AddressKindHeadPin)은 공용 `MypageRequiredInfoRowsCard` 가 그린다 — 주소 플랫폼 HARD LOCK.
 * 행 탭 = 이동만. 홈과 중복인 상단 프로필 카드·"설정으로"는 두지 않는다(프로필 수정 = 홈 시트).
 */
export function MyAccountContent() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(() => peekCachedProfile());
  const [loading, setLoading] = useState(() => profile == null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [linkedCount, setLinkedCount] = useState<number | null | "loading">("loading");
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [address, setAddress] = useState<AccountAddressState>(() => ({
    ...resolveRequiredAddressFromSnapshot(peekFreshAddressDefaultsSnapshot()),
    failed: false,
  }));
  const onActivateRequired = useRequiredInfoActivate("/mypage/account");
  const nowMs = useRequiredInfoNowMs(profile?.phone_verification_status === "pending");
  useMypageListRestore({ ready: profile != null });

  const load = useCallback(async () => {
    // 이미 보이는 프로필이 있으면 백그라운드 갱신 (로딩 표시 안 함)
    if (!profileRef.current) setLoading(true);
    setLoadFailed(false);
    try {
      const p = await getMyProfile();
      setProfile(p);
    } catch {
      // 조회 실패 — 비로그인(null)과 구분, 기존 프로필 유지
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 대표 주소 — 주소 기본값 1회(캐시·진행 중 요청 공유). 실패 = 주소 행 「확인 불가」 */
  const loadAddress = useCallback(async () => {
    setAddress((prev) => ({ ...prev, failed: false }));
    try {
      const snap = await fetchAddressDefaultsSnapshot({
        caller: "mypage_account_required_info",
        reason: "initial_required_info_resolution",
      });
      const next = resolveRequiredAddressFromSnapshot(snap);
      setAddress({ ...next, failed: next.status === "unknown" });
    } catch {
      setAddress((prev) => ({ ...prev, failed: prev.status === "unknown" }));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAddress();
  }, [load, loadAddress]);

  const requiredInfo = useMemo(
    () =>
      resolveMypageRequiredInfoRows({
        profile,
        profileFailed: loadFailed && !profile,
        address: {
          status: address.status,
          label: address.publicLabel,
          activeCount: address.activeCount,
          failed: address.failed,
        },
        nowMs,
      }),
    [address, loadFailed, nowMs, profile],
  );

  /** 연동 로그인 수 — 화면 표시 후 지연 조회 1회(실패 시 행 값만 비움) */
  const hasProfile = profile != null;
  useEffect(() => {
    if (!hasProfile) return;
    let cancelled = false;
    void fetchMeAuthProviders().then((r) => {
      if (cancelled) return;
      setLinkedCount(r.ok ? countLinkedAuthProviders(r.providers) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [hasProfile]);

  const skeletonLabels = [
    t("account_email"),
    t("mypage_s03_linked_login"),
    t("mypage_s03_joined_at"),
    t("my_account_member_status"),
  ] as const;

  if (loading) {
    return (
      <div className="space-y-2">
        {/* 필수 정보 3행 — 확정 전 같은 높이 스켈레톤 (홈과 동일 컴포넌트) */}
        <MypageRequiredInfoRowsCard result={{ settled: false }} onActivate={onActivateRequired} />
        <AccountRowsSkeleton labels={skeletonLabels} />
      </div>
    );
  }
  if (!profile && loadFailed) {
    return (
      <MyStateView
        kind="error"
        template="hub"
        error={{ message: t("mypage_home_load_failed"), onRetry: () => void load() }}
      />
    );
  }
  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-5 text-center">
          <div className="mx-auto flex justify-center">
            <SamarketUserAvatar avatarUrl={null} sizePx={72} alt="" />
          </div>
          <p className="mt-3 sam-text-section-title font-semibold text-sam-fg">{t("profile_guest_name")}</p>
          <p className="mt-1 sam-text-body text-sam-muted">{t("profile_guest_desc")}</p>
          <button
            type="button"
            onClick={() => {
              void requireAuthAction("profile_edit", load, {
                next: "/mypage/account",
              });
            }}
            className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.focusRing} mt-4`}
          >
            {t("profile_guest_login_cta")}
          </button>
        </div>
        <Link href="/mypage" className="block text-center sam-text-body text-sam-muted">
          {t("common_back_to_mypage")}
        </Link>
      </div>
    );
  }

  const displayNickname = resolveMypageSelfDisplayName(profile) || t("account_nickname");
  const storeMemberStatus = deriveStoreMemberStatus(profile);
  const consentDone = hasStoreTermsConsent(profile, getClientRequiredConsentVersions());
  const joinedAt = formatMypageDate(profile.created_at ?? null, { style: "date" });

  return (
    <div className="space-y-2" data-testid="account-hub">
      <MypageRequiredInfoRowsCard
        result={requiredInfo}
        onActivate={onActivateRequired}
        onRetry={() => void loadAddress()}
      />
      <MyGroup title={t("account_info_title")}>
        <AccountRow first title={t("account_nickname")} value={displayNickname} />
        <AccountRow title={t("account_email")} value={profile.email ?? "—"} />
        <AccountRow
          title={t("mypage_s03_linked_login")}
          href={MYPAGE_LINKED_LOGIN_HREF}
          testId="account-row-linked-login"
          valueLoading={linkedCount === "loading"}
          value={
            typeof linkedCount === "number" ? t("mypage_s03_linked_count", { count: linkedCount }) : null
          }
        />
        <AccountRow title={t("mypage_s03_joined_at")} value={joinedAt || "—"} testId="account-row-joined" />
        <AccountRow title={t("my_account_member_status")} value={t(memberStatusMessageKey(storeMemberStatus))} />
        <AccountRow
          title={t("account_realname")}
          value={profile.realname_verified ? t("account_verified") : t("account_unverified")}
        />
        <AccountRow
          title={t("my_account_terms")}
          value={consentDone ? t("my_account_terms_done") : t("my_account_terms_required")}
        />
      </MyGroup>

      <ProfileVerificationCenter profile={profile} />
    </div>
  );
}
