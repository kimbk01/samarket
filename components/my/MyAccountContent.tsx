"use client";

import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";
import {
  MYPAGE_ADDRESSES_HREF,
  MYPAGE_REQUIRED_DIBAY_ID_HREF,
} from "@/lib/mypage/mypage-profile-routes";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { peekMeProfileCached } from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import {
  deriveStoreMemberStatus,
  hasStoreTermsConsent,
  type StoreMemberStatus,
} from "@/lib/auth/store-member-policy";
import { formatAtUsername } from "@/lib/users/user-label";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { ProfileVerificationCenter } from "@/components/profile/ProfileVerificationCenter";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import { useRepresentativeFullAddressLine } from "@/hooks/use-representative-address-line";
import { evaluatePublicIdProfileView, resolvePublicIdAtDisplay } from "@/lib/auth/dibay-public-id-ssot";
import type { MessageKey } from "@/lib/i18n/messages";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { resolveAccountPhoneDisplay } from "@/lib/mypage/mask-profile-phone";
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

type BadgeTone = "done" | "needed" | "pending";

function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const cls =
    tone === "done"
      ? Sam.badge.success
      : tone === "needed"
        ? Sam.badge.warning
        : Sam.badge.neutral;
  return <span className={`${cls} shrink-0`}>{children}</span>;
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
 * 계정 (최종 설계 S03) — T5 허브. 그룹 1 계정 정보 · 그룹 2 필수 정보(미완료가 있을 때만) · 그룹 3 인증 센터.
 * 행 탭 = 이동만. 홈과 중복인 상단 프로필 카드·"설정으로"는 두지 않는다(프로필 수정 = 홈 시트).
 */
export function MyAccountContent() {
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(() => peekCachedProfile());
  const [loading, setLoading] = useState(() => profile == null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [linkedCount, setLinkedCount] = useState<number | null | "loading">("loading");
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const addressState = useRepresentativeFullAddressLine();
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

  useEffect(() => {
    void load();
  }, [load]);

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
    t("my_account_username"),
    t("account_phone"),
    t("account_email"),
    t("mypage_s03_linked_login"),
    t("mypage_s03_joined_at"),
    t("my_account_member_status"),
  ] as const;

  if (loading) {
    return <AccountRowsSkeleton labels={skeletonLabels} />;
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
  const atUsername = formatAtUsername(profile.username ?? null);
  const publicIdView = evaluatePublicIdProfileView(profile);
  const dibayIdDisplay =
    resolvePublicIdAtDisplay(profile)?.trim() ||
    profile.username?.trim() ||
    "";
  const hasDibayId = Boolean(dibayIdDisplay);
  const dibayIdValue = atUsername || (dibayIdDisplay ? `@${dibayIdDisplay.replace(/^@/, "")}` : "");
  /** 아이디 변경 불가(변경 완료·잠김) — 값 행만, chevron 없음 */
  const dibayIdChangeable = !hasDibayId || publicIdView.canChangeOnce;
  const formattedPhone =
    formatProfilePhoneForDisplay({
      phone: profile.phone ?? null,
      phone_country_code: profile.phone_country_code ?? null,
      phone_number: profile.phone_number ?? null,
    }) || "";
  const contactVerified = isProfileContactVerified(profile);
  const phoneDisplay = resolveAccountPhoneDisplay({ formattedPhone, verified: contactVerified });
  const storeMemberStatus = deriveStoreMemberStatus(profile);
  const consentDone = hasStoreTermsConsent(profile, getClientRequiredConsentVersions());
  const addressLine = addressState.status === "ready" ? addressState.line?.trim() ?? "" : "";
  const addressDone = Boolean(addressLine);
  const addressPending = !addressDone && addressState.status !== "ready";
  const joinedAt = formatMypageDate(profile.created_at ?? null, { style: "date" });

  const phoneValue =
    phoneDisplay.kind === "verified_with_number" || phoneDisplay.kind === "unverified_with_number"
      ? phoneDisplay.masked
      : phoneDisplay.kind === "missing"
        ? t("account_missing_phone")
        : null;

  const essentialsIncomplete = !hasDibayId || !contactVerified || (!addressDone && !addressPending);

  return (
    <div className="space-y-2" data-testid="account-hub">
      <MyGroup title={t("account_info_title")}>
        <AccountRow first title={t("account_nickname")} value={displayNickname} />
        <AccountRow
          title={t("my_account_username")}
          value={dibayIdValue || t("account_essentials_id_needed")}
          mono={Boolean(dibayIdValue)}
          href={dibayIdChangeable ? MYPAGE_REQUIRED_DIBAY_ID_HREF : undefined}
          testId="account-row-dibay-id"
          badge={
            hasDibayId ? (
              <StatusBadge tone={publicIdView.canChangeOnce ? "pending" : "done"}>
                {publicIdView.canChangeOnce ? t("mypage_s03_id_change_once") : t("mypage_s03_id_change_done")}
              </StatusBadge>
            ) : (
              <StatusBadge tone="needed">{t("account_essentials_needed")}</StatusBadge>
            )
          }
        />
        <AccountRow
          title={t("account_phone")}
          value={phoneValue}
          mono={phoneValue != null && phoneDisplay.kind !== "missing"}
          href={buildPhoneVerificationHref()}
          testId="account-row-phone"
          badge={
            contactVerified ? (
              <StatusBadge tone="done">{t("profile_verification_done")}</StatusBadge>
            ) : (
              <StatusBadge tone="needed">{t("profile_verification_needed")}</StatusBadge>
            )
          }
        />
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

      {essentialsIncomplete ? (
        <div data-testid="account-essentials-block">
          <MyGroup title={t("account_essentials_title")}>
            {!hasDibayId ? (
              <AccountRow
                first
                title={t("account_essentials_id")}
                value={t("account_essentials_id_needed")}
                href={MYPAGE_REQUIRED_DIBAY_ID_HREF}
                badge={<StatusBadge tone="needed">{t("account_essentials_needed")}</StatusBadge>}
              />
            ) : null}
            {!contactVerified ? (
              <AccountRow
                first={hasDibayId}
                title={t("profile_verification_phone")}
                value={t("account_essentials_phone_needed")}
                href={buildPhoneVerificationHref()}
                badge={<StatusBadge tone="needed">{t("profile_verification_needed")}</StatusBadge>}
              />
            ) : null}
            {!addressDone ? (
              <button
                type="button"
                onClick={() => router.push(MYPAGE_ADDRESSES_HREF)}
                className={`${MYPAGE_HOME_ROW_CLASS} ${hasDibayId && contactVerified ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS} text-left`}
              >
                <AddressKindHeadPin kind="master" className="h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-[1rem]" />
                <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>
                  {t("profile_verification_address")}
                </span>
                <StatusBadge tone={addressPending ? "pending" : "needed"}>
                  {addressPending ? t("mypage_account_address_checking") : t("profile_verification_address_needed_short")}
                </StatusBadge>
                <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </MyGroup>
        </div>
      ) : null}

      <ProfileVerificationCenter profile={profile} />
    </div>
  );
}
