"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRegion } from "@/contexts/RegionContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ProfileBasicFields } from "./ProfileBasicFields";
import { ProfileMapLocationBlock } from "./ProfileMapLocationBlock";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { matchRegionCityFromFullAddress } from "@/lib/profile/match-region-from-full-address";
import { consumeMapAddressPick } from "@/lib/map/map-address-pick-storage";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchMeAddressesListSingleFlight, invalidateMeAddressesListClientCache } from "@/lib/addresses/address-list-client-cache";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  fetchMandatoryAddressGateDeduped,
  invalidateMandatoryAddressGateClientCache,
} from "@/lib/addresses/mandatory-address-gate-client";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import {
  isProfileSetupComplete,
  isProfileSetupMode,
  isProfileSetupPending,
} from "@/lib/auth/profile-setup-flow";
import {
  clearProfileSetupDeferForSession,
  deferProfileSetupForSession,
} from "@/lib/auth/profile-setup-defer.client";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import {
  ProfileEditFormShell,
  ProfileEditSection,
} from "@/components/my/edit/ui/ProfileEditFormShell";
import { ProfileAvatarEditor } from "@/components/my/edit/ui/ProfileAvatarEditor";
import { ProfileReadOnlyInfoCard } from "@/components/my/edit/ui/ProfileReadOnlyInfoCard";
import { ProfileEditHeader } from "@/components/my/edit/ui/ProfileEditHeader";
import { ProfileEditBottomSaveBar } from "@/components/my/edit/ui/ProfileEditBottomSaveBar";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { PROFILE_EDIT_PAGE_BG_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { formatAtUsername } from "@/lib/users/user-label";

export const PROFILE_EDIT_FORM_ID = "dibay-profile-edit-form";

function validate(
  p: { displayName: string },
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): { displayName?: string } {
  const errors: { displayName?: string } = {};
  const trimmed = p.displayName?.trim() ?? "";
  if (!trimmed) errors.displayName = t("profile_edit_err_nickname_required");
  else if (trimmed.length < 2) errors.displayName = t("profile_edit_err_nickname_min");
  else if (trimmed.length > 20) errors.displayName = t("profile_edit_err_nickname_max");
  return errors;
}

export function ProfileEditForm({ backHref = "/mypage" }: { backHref?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupMode = isProfileSetupMode(searchParams);
  const setupNext = useMemo(
    () => sanitizeNextPath(searchParams?.get("next") ?? null),
    [searchParams],
  );
  const setupExitRef = useRef(false);
  const { t } = useI18n();
  const { refreshProfileLocation } = useRegion();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [mapFullAddress, setMapFullAddress] = useState("");
  const [addressStreetLine, setAddressStreetLine] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [errors, setErrors] = useState<{ displayName?: string }>({});
  const [addressList, setAddressList] = useState<UserAddressDTO[] | null>(null);
  const [addressListErr, setAddressListErr] = useState(false);
  const [phoneVerificationSettings, setPhoneVerificationSettings] = useState<{
    enabled: boolean;
    provider: "supabase" | "semaphore";
    guide_text: string;
    resend_cooldown_seconds: number;
  } | null>(null);
  const [addressNeedsBlock, setAddressNeedsBlock] = useState(false);
  const [setupGateReady, setSetupGateReady] = useState(!setupMode);

  const phoneVerifiedForSetup = useMemo(
    () => (profile ? isProfileContactVerified(profile) : false),
    [profile],
  );

  const phoneRequiredForSetup = phoneVerificationSettings?.enabled === true;
  const phoneSatisfiedForSetup = phoneVerifiedForSetup || !phoneRequiredForSetup;

  const refreshSetupGate = useCallback(async () => {
    if (!setupMode) {
      setSetupGateReady(true);
      return;
    }
    try {
      invalidateMandatoryAddressGateClientCache();
      const res = await fetchMandatoryAddressGateDeduped({
        component: "ProfileEditForm",
        reason: "refreshSetupGate",
        bypassCache: true,
      });
      if (res.status === 401) {
        setAddressNeedsBlock(false);
        setSetupGateReady(true);
        return;
      }
      if (!res.ok) {
        setSetupGateReady(true);
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        needsBlock?: boolean;
      };
      if (!json.ok) {
        setSetupGateReady(true);
        return;
      }
      setAddressNeedsBlock(json.authenticated === true && json.needsBlock === true);
      setSetupGateReady(true);
    } catch {
      setSetupGateReady(true);
    }
  }, [setupMode]);

  const load = useCallback(async (opts?: { freshProfile?: boolean; freshAddresses?: boolean }) => {
    setLoading((prev) => (prev ? prev : true));
    setAddressListErr((prev) => (prev ? false : prev));
    if (opts?.freshProfile) {
      invalidateMeProfileDedupedCache();
    }
    if (opts?.freshAddresses) {
      invalidateMeAddressesListClientCache();
    }
    const pick = consumeMapAddressPick();

    const addressesPromise = fetchMeAddressesListSingleFlight()
      .then((result) => {
        if (result.ok) return { ok: true as const, rows: result.rows };
        return { ok: false as const, rows: [] as UserAddressDTO[] };
      })
      .catch((): { ok: false; rows: UserAddressDTO[] } => ({ ok: false, rows: [] }));

    const phoneSettingsPromise = runSingleFlight("me:phone-verification:get", () =>
      fetch("/api/me/phone-verification", { credentials: "include", cache: "no-store" }),
    )
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          verification?: {
            settings?: {
              enabled?: boolean;
              provider?: string;
              guide_text?: string;
              resend_cooldown_seconds?: number;
            };
          };
        };
        if (!res.ok || !j.ok) return null;
        const s = j.verification?.settings;
        if (!s) return null;
        const provider: "supabase" | "semaphore" =
          s.provider === "supabase" ? "supabase" : "semaphore";
        return {
          enabled: s.enabled === true,
          provider,
          guide_text: String(s.guide_text ?? ""),
          resend_cooldown_seconds: Number(s.resend_cooldown_seconds ?? 60) || 60,
        };
      })
      .catch(() => null);

    const [data, addrPack, pvSettings] = await Promise.all([
      getMyProfile(),
      addressesPromise,
      phoneSettingsPromise,
    ]);

    if (!data) {
      setProfile(null);
      setLoading(false);
      return;
    }

    if (!addrPack.ok) setAddressListErr(true);
    setAddressList(addrPack.rows);
    setPhoneVerificationSettings(pvSettings);

    const masterAddr = addrPack.rows.find((a) => a.isDefaultMaster) ?? null;

    let merged: ProfileRow = { ...data };
    if (pick) {
      merged = {
        ...merged,
        latitude: pick.latitude,
        longitude: pick.longitude,
        full_address: pick.fullAddress,
      };
    } else if (
      masterAddr &&
      masterAddr.latitude != null &&
      masterAddr.longitude != null &&
      Number.isFinite(masterAddr.latitude) &&
      Number.isFinite(masterAddr.longitude)
    ) {
      const fa = (masterAddr.fullAddress ?? "").trim();
      merged = {
        ...merged,
        latitude: masterAddr.latitude,
        longitude: masterAddr.longitude,
        full_address: fa || (merged.full_address ?? ""),
      };
    }

    setProfile(merged);
    if (opts?.freshProfile && merged.id) {
      setSupabaseProfileCache(profileRowToClientProfile(merged));
    }
    setDisplayName(merged.display_name ?? merged.nickname ?? "");
    setAvatarUrl(withDefaultAvatar(merged.avatar_url));
    setBio(merged.bio ?? "");
    setMapLat(merged.latitude ?? null);
    setMapLng(merged.longitude ?? null);
    setMapFullAddress((merged.full_address ?? "").trim());
    setAddressStreetLine(pick ? "" : (merged.address_street_line ?? "").trim());
    setAddressDetail(
      pick
        ? (pick.addressDetail ?? "").trim()
        : masterAddr
          ? (masterAddr.unitFloorRoom ?? "").trim()
          : (merged.address_detail ?? "").trim(),
    );
    setLoading(false);
    void refreshSetupGate();
  }, [pathname, refreshSetupGate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!setupMode) return;
    const onUpdated = () => {
      void load({ freshAddresses: true });
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
  }, [setupMode, load]);

  const handlePhoneRefreshProfile = useCallback(async () => {
    invalidateMandatoryAddressGateClientCache();
    await load({ freshProfile: true });
  }, [load]);

  const handleSetupDismiss = useCallback(() => {
    deferProfileSetupForSession();
    invalidateMandatoryAddressGateClientCache();
    // next가 /mypage/... 이면 게이트에 즉시 재진입 — 취소는 항상 홈
    router.replace(POST_LOGIN_PATH);
  }, [router]);

  useEffect(() => {
    if (!setupMode || !setupGateReady || setupExitRef.current || !profile) return;
    if (
      !isProfileSetupComplete({
        needsBlock: addressNeedsBlock,
        phoneVerified: phoneSatisfiedForSetup,
      })
    ) {
      return;
    }
    clearProfileSetupDeferForSession();
    setupExitRef.current = true;
    router.replace(setupNext ?? POST_LOGIN_PATH);
  }, [
    setupMode,
    setupGateReady,
    addressNeedsBlock,
    phoneSatisfiedForSetup,
    setupNext,
    router,
    profile,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const err = validate({ displayName: displayName.trim() }, t);
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    const fa = mapFullAddress.trim();
    if (mapLat == null || mapLng == null || !fa) {
      setMessage({ type: "error", text: t("profile_edit_warn_address_required") });
      return;
    }

    const matched = matchRegionCityFromFullAddress(fa);
    const regionCode = matched ? encodeProfileAppLocationStorage(matched.regionId, matched.cityId) : null;
    const regionName = matched ? buildProfileRegionNameForStorage(matched.regionId, matched.cityId) : null;

    setSaving(true);
    const payload: ProfileUpdatePayload = {
      display_name: displayName.trim(),
      avatar_url: withDefaultAvatar(avatarUrl),
      bio: bio.trim() || null,
      latitude: mapLat,
      longitude: mapLng,
      full_address: fa,
      region_code: regionCode,
      region_name: regionName,
      address_street_line: addressStreetLine.trim() || null,
      address_detail: addressDetail.trim() || null,
    };
    const result = await updateMyProfile(payload);
    setSaving(false);
    if (result.ok) {
      const warn = "warning" in result && result.warning ? result.warning : "";
      setMessage({
        type: "ok",
        text: warn ? t("profile_edit_saved_with_warn", { warn }) : t("profile_edit_saved"),
      });
      await load();
      void refreshProfileLocation();
    } else {
      setMessage({ type: "error", text: result.error });
    }
  };

  if (loading) {
    return (
      <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
        <ProfileEditHeader backHref={backHref} onSetupBack={setupMode ? handleSetupDismiss : undefined} />
        <div className="py-16 text-center text-[15px] text-[#6F4E37]">{t("profile_edit_loading_profile")}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
        <ProfileEditHeader backHref={backHref} onSetupBack={setupMode ? handleSetupDismiss : undefined} />
        <div className="py-16 text-center text-[15px] text-[#6F4E37]">{t("auth_resource_access_denied")}</div>
      </div>
    );
  }

  const atUsername = formatAtUsername(profile.username);
  const showPhoneVerify = phoneVerificationSettings?.enabled === true;
  const setupCompleteInput = {
    needsBlock: addressNeedsBlock,
    phoneVerified: phoneSatisfiedForSetup,
  };
  const setupPending =
    setupMode && setupGateReady && isProfileSetupPending(setupCompleteInput);
  const addressSetupError = setupPending && addressNeedsBlock;
  const phoneSetupError = setupPending && phoneRequiredForSetup && !phoneVerifiedForSetup;

  return (
    <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
      <ProfileEditHeader backHref={backHref} onSetupBack={setupMode ? handleSetupDismiss : undefined} />

      <form id={PROFILE_EDIT_FORM_ID} onSubmit={handleSubmit}>
        <ProfileEditFormShell>
          {setupPending ? (
            <div
              className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2.5 text-[14px] font-medium text-red-700"
              role="status"
            >
              <p>{t("profile_setup_banner")}</p>
              <div className="mt-3">
                <LogoutActionTrigger
                  variant="outlined_button"
                  label={t("mypage_hub_logout")}
                />
              </div>
            </div>
          ) : null}
          {message ? (
            <div
              className={
                message.type === "ok"
                  ? "rounded-ui-rect border border-[#00704A]/25 bg-[#E8F3EE] px-3 py-2.5 text-[14px] font-medium text-[#00704A]"
                  : "rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2.5 text-[14px] font-medium text-red-700"
              }
              role="status"
            >
              {message.text}
            </div>
          ) : null}

          <ProfileEditSection noPadding>
            <div className="flex flex-col items-center px-4 pb-6 pt-6">
              <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={setAvatarUrl} />
            </div>
          </ProfileEditSection>

          <ProfileEditSection title={t("profile_edit_section_basic")}>
            <ProfileBasicFields
              displayName={displayName}
              bio={bio}
              atUsername={atUsername}
              onDisplayNameChange={setDisplayName}
              onBioChange={setBio}
              errors={errors}
            />
          </ProfileEditSection>

          <ProfileEditSection title={t("profile_edit_section_address")}>
            <ProfileMapLocationBlock
              addresses={addressList}
              listError={addressListErr}
              setupError={addressSetupError}
            />
          </ProfileEditSection>

          {showPhoneVerify ? (
            <ProfileEditSection title={t("profile_edit_section_phone")}>
              <PhoneVerificationBox
                compact
                setupError={phoneSetupError}
                snapshot={{
                  phone: profile.phone,
                  phone_verified: profile.phone_verified,
                  phone_verified_at: profile.phone_verified_at ?? null,
                  member_status: profile.member_status ?? null,
                  role: profile.role ?? null,
                  email: profile.auth_login_email ?? profile.email ?? null,
                  provider: profile.provider ?? profile.auth_provider ?? null,
                  auth_provider: profile.auth_provider ?? profile.provider ?? null,
                  settings: phoneVerificationSettings ?? undefined,
                }}
                onRefreshProfile={handlePhoneRefreshProfile}
              />
            </ProfileEditSection>
          ) : null}

          <ProfileEditSection title={t("profile_edit_section_readonly")}>
            <ProfileReadOnlyInfoCard profile={profile} />
          </ProfileEditSection>
        </ProfileEditFormShell>
      </form>

      <ProfileEditBottomSaveBar
        formId={PROFILE_EDIT_FORM_ID}
        backHref={backHref}
        saving={saving}
        onCancel={setupMode ? handleSetupDismiss : undefined}
      />
    </div>
  );
}
