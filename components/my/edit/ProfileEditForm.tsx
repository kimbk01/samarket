"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRegion } from "@/contexts/RegionContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import { isDibayIdComplete } from "@/lib/auth/dibay-signup-status";
import { hasValidDisplayName } from "@/lib/auth/post-login-profile-policy";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import {
  isProfileSetupMode,
  isProfileSetupPending,
} from "@/lib/auth/profile-setup-flow";
import {
  deferProfileSetupForSession,
} from "@/lib/auth/profile-setup-defer.client";
import { normalizeRequiredSlugFromUrl } from "@/lib/profile/profile-requirements";
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
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import {
  buildProfileEditIncompleteBody,
  captureProfileEditFormSnapshot,
  computeProfileEditFieldComplete,
  isProfileEditFormDirty,
  listIncompleteProfileEditFields,
  type ProfileEditFieldKey,
  type ProfileEditFormSnapshot,
  validateOptionalNickname,
} from "@/lib/profile/profile-edit-form-helpers";

export const PROFILE_EDIT_FORM_ID = "dibay-profile-edit-form";

export function ProfileEditForm({ backHref = "/mypage" }: { backHref?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupMode = isProfileSetupMode(searchParams);
  const setupNext = useMemo(
    () =>
      sanitizeNextPath(
        searchParams?.get("returnTo") ?? searchParams?.get("next") ?? null,
      ),
    [searchParams],
  );
  const requiredSlugs = useMemo(() => {
    const raw = searchParams?.get("required") ?? "";
    return new Set(
      raw
        .split(",")
        .map((s) => normalizeRequiredSlugFromUrl(s))
        .filter(Boolean),
    );
  }, [searchParams]);
  const isRequiredSlug = useCallback((slug: string) => requiredSlugs.has(slug), [requiredSlugs]);
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
  const [baselineSnapshot, setBaselineSnapshot] = useState<ProfileEditFormSnapshot | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [incompleteConfirmOpen, setIncompleteConfirmOpen] = useState(false);
  const [pendingIncompleteFields, setPendingIncompleteFields] = useState<ProfileEditFieldKey[]>([]);
  const leaveAfterDiscardRef = useRef<"back" | "setup_dismiss">("back");

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
    const nextDisplayName = merged.display_name ?? merged.nickname ?? "";
    setDisplayName(nextDisplayName);
    const nextAvatarUrl = withDefaultAvatar(merged.avatar_url);
    setAvatarUrl(nextAvatarUrl);
    const nextBio = merged.bio ?? "";
    setBio(nextBio);
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
    setBaselineSnapshot(
      captureProfileEditFormSnapshot({
        displayName: nextDisplayName,
        bio: nextBio,
        avatarUrl: nextAvatarUrl,
      }),
    );
    setLoading(false);
    void refreshSetupGate();
  }, [pathname, refreshSetupGate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (requiredSlugs.size === 0 || loading) return;
    const slug = [...requiredSlugs][0];
    const el = document.querySelector(`[data-profile-field="${slug}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [requiredSlugs, loading]);

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
    router.replace(POST_LOGIN_PATH);
  }, [router]);

  const currentSnapshot = useMemo(
    () => captureProfileEditFormSnapshot({ displayName, bio, avatarUrl }),
    [displayName, bio, avatarUrl],
  );
  const isDirty = isProfileEditFormDirty(baselineSnapshot, currentSnapshot);

  const executeLeave = useCallback(() => {
    if (leaveAfterDiscardRef.current === "setup_dismiss") {
      handleSetupDismiss();
      return;
    }
    router.push(backHref);
  }, [backHref, handleSetupDismiss, router]);

  const requestLeave = useCallback(
    (mode: "back" | "setup_dismiss") => {
      leaveAfterDiscardRef.current = mode;
      if (isDirty) {
        setLeaveConfirmOpen(true);
        return;
      }
      executeLeave();
    },
    [executeLeave, isDirty],
  );

  const handleLeaveDiscard = useCallback(() => {
    setLeaveConfirmOpen(false);
    executeLeave();
  }, [executeLeave]);

  const incompleteFieldLabels = useMemo(
    (): Record<ProfileEditFieldKey, string> => ({
      nickname: t("profile_edit_incomplete_label_nickname"),
      phone: t("profile_edit_incomplete_label_phone"),
      address: t("profile_edit_incomplete_label_address"),
      dibay_id: t("profile_edit_incomplete_label_dibay_id"),
    }),
    [t],
  );

  const showPhoneVerify = phoneVerificationSettings?.enabled === true;

  const fieldComplete = useMemo(() => {
    if (!profile) {
      return {
        nickname: true,
        phone: true,
        address: true,
        dibay_id: true,
      };
    }
    return computeProfileEditFieldComplete({
      profile,
      displayName,
      addressList,
      phoneVerificationEnabled: showPhoneVerify,
    });
  }, [profile, displayName, addressList, showPhoneVerify]);

  const tryNavigateAfterRequirementSave = useCallback(async (profileOverride?: ProfileRow | null) => {
    if (!setupNext) return;
    const currentProfile = profileOverride ?? profile;
    if (requiredSlugs.size === 0) {
      router.replace(setupNext);
      return;
    }
    let ready = true;
    if (requiredSlugs.has("nickname")) {
      ready = hasValidDisplayName({ display_name: displayName, nickname: currentProfile?.nickname });
    }
    if (ready && requiredSlugs.has("phone") && currentProfile) {
      ready = isProfileContactVerified(currentProfile);
    }
    if (ready && requiredSlugs.has("dibay_id") && currentProfile) {
      ready = isDibayIdComplete({
        dibay_id: currentProfile.dibay_id,
        dibay_id_locked: currentProfile.dibay_id_locked,
        username: currentProfile.username,
        username_confirmed: currentProfile.dibay_id_locked === true ? true : null,
      });
    }
    if (ready && requiredSlugs.has("address")) {
      invalidateMandatoryAddressGateClientCache();
      const res = await fetchMandatoryAddressGateDeduped({
        component: "ProfileEditForm",
        reason: "tryNavigateAfterRequirementSave",
        bypassCache: true,
      });
      if (res.ok) {
        const json = (await res.json()) as { needsBlock?: boolean; authenticated?: boolean };
        ready = json.authenticated === true && json.needsBlock !== true;
      } else {
        ready = false;
      }
    }
    if (ready) router.replace(setupNext);
  }, [router, setupNext, requiredSlugs, displayName, profile]);

  const handleDibayIdConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      const normalized = confirmedDibayId.trim().toLowerCase();
      if (!normalized) return;
      const nextProfile: ProfileRow | null = profile
        ? {
            ...profile,
            dibay_id: normalized,
            dibay_id_locked: true,
            username: normalized,
            onboarding_status: "completed",
            onboarding_completed_at: profile.onboarding_completed_at ?? new Date().toISOString(),
          }
        : null;
      if (nextProfile) setProfile(nextProfile);
      invalidateMeProfileDedupedCache();
      if (nextProfile) {
        setSupabaseProfileCache(profileRowToClientProfile(nextProfile));
      }
      await load({ freshProfile: true });
      await tryNavigateAfterRequirementSave(nextProfile);
    },
    [load, profile, tryNavigateAfterRequirementSave],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const err = validateOptionalNickname(displayName, {
      min: t("profile_edit_err_nickname_min"),
      max: t("profile_edit_err_nickname_max"),
    });
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    const trimmedName = displayName.trim();
    const fa = mapFullAddress.trim();
    const hasMap = mapLat != null && mapLng != null && Boolean(fa);

    const payload: ProfileUpdatePayload = {
      avatar_url: withDefaultAvatar(avatarUrl),
      bio: bio.trim() || null,
    };

    if (trimmedName.length >= 2) {
      payload.display_name = trimmedName;
    }

    if (hasMap) {
      const matched = matchRegionCityFromFullAddress(fa);
      const regionCode = matched ? encodeProfileAppLocationStorage(matched.regionId, matched.cityId) : null;
      const regionName = matched ? buildProfileRegionNameForStorage(matched.regionId, matched.cityId) : null;
      payload.latitude = mapLat;
      payload.longitude = mapLng;
      payload.full_address = fa;
      payload.region_code = regionCode;
      payload.region_name = regionName;
      payload.address_street_line = addressStreetLine.trim() || null;
      payload.address_detail = addressDetail.trim() || null;
    }

    setSaving(true);
    const result = await updateMyProfile(payload);
    setSaving(false);
    if (result.ok) {
      const warn = "warning" in result && result.warning ? result.warning : "";
      setMessage({
        type: "ok",
        text: warn ? t("profile_edit_saved_with_warn", { warn }) : t("profile_edit_saved"),
      });
      setBaselineSnapshot(currentSnapshot);
      await load();
      void refreshProfileLocation();

      const [freshProfile, freshAddrPack] = await Promise.all([
        getMyProfile(),
        fetchMeAddressesListSingleFlight().catch(() => ({ ok: false as const, rows: [] as UserAddressDTO[] })),
      ]);
      const freshRows = freshAddrPack.ok ? freshAddrPack.rows : addressList ?? [];
      const completeAfterSave = computeProfileEditFieldComplete({
        profile: freshProfile ?? profile!,
        displayName: trimmedName,
        addressList: freshRows,
        phoneVerificationEnabled: showPhoneVerify,
      });
      const missing = listIncompleteProfileEditFields(completeAfterSave, showPhoneVerify);
      if (missing.length > 0) {
        setPendingIncompleteFields(missing);
        setIncompleteConfirmOpen(true);
      } else if (setupNext) {
        await tryNavigateAfterRequirementSave(freshProfile ?? profile);
      }
    } else {
      setMessage({ type: "error", text: result.error });
    }
  };

  if (loading) {
    return (
      <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
        <ProfileEditHeader backHref={backHref} />
        <div className="py-16 text-center text-[15px] text-[#6F4E37]">{t("profile_edit_loading_profile")}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
        <ProfileEditHeader backHref={backHref} />
        <div className="py-16 text-center text-[15px] text-[#6F4E37]">{t("auth_resource_access_denied")}</div>
      </div>
    );
  }

  const dibayIdLocked = profile.dibay_id_locked === true;
  const usernameComplete = isDibayIdComplete({
    dibay_id: profile.dibay_id,
    dibay_id_locked: profile.dibay_id_locked,
    username: profile.username,
    username_confirmed: profile.dibay_id_locked === true ? true : null,
  });
  const sectionHighlight = (slug: string) =>
    isRequiredSlug(slug) ? "rounded-ui-rect ring-2 ring-[#00704A]/40" : undefined;
  const setupCompleteInput = {
    needsBlock: addressNeedsBlock,
    phoneVerified: phoneSatisfiedForSetup,
  };
  const setupPending =
    setupMode && setupGateReady && isProfileSetupPending(setupCompleteInput);
  const addressSetupError = setupPending && addressNeedsBlock;
  const phoneSetupError = setupPending && phoneRequiredForSetup && !phoneVerifiedForSetup;

  const incompleteBodyDetail = buildProfileEditIncompleteBody(
    pendingIncompleteFields,
    incompleteFieldLabels,
  );

  return (
    <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
      <MobileConfirmBottomSheet
        open={leaveConfirmOpen}
        onCancel={() => setLeaveConfirmOpen(false)}
        title={t("profile_edit_leave_title")}
        description={t("profile_edit_leave_body")}
        cancelLabel={t("profile_edit_leave_stay")}
        confirmLabel={t("profile_edit_leave_discard")}
        confirmTone="danger"
        onConfirm={handleLeaveDiscard}
        zIndexClass="z-[70]"
        ariaLabel={t("profile_edit_leave_aria")}
        interactionMode="blocking"
      />
      <MobileConfirmBottomSheet
        open={incompleteConfirmOpen}
        onCancel={() => {
          setIncompleteConfirmOpen(false);
          setPendingIncompleteFields([]);
        }}
        title={t("profile_edit_save_incomplete_title")}
        description={
          incompleteBodyDetail
            ? `${t("profile_edit_save_incomplete_body")}\n${incompleteBodyDetail}`
            : t("profile_edit_save_incomplete_body")
        }
        cancelLabel={t("profile_edit_save_incomplete_later")}
        confirmLabel={t("profile_edit_save_incomplete_stay")}
        confirmTone="primary"
        onConfirm={() => {
          setIncompleteConfirmOpen(false);
          setPendingIncompleteFields([]);
          const slug = pendingIncompleteFields[0];
          if (slug) {
            document.querySelector(`[data-profile-field="${slug}"]`)?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        }}
        zIndexClass="z-[70]"
        ariaLabel={t("profile_edit_save_incomplete_aria")}
        interactionMode="blocking"
      />
      <ProfileEditHeader
        backHref={backHref}
        onBack={() => requestLeave(setupMode ? "setup_dismiss" : "back")}
      />

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

          <ProfileEditSection
            title={t("profile_edit_section_basic")}
            className={sectionHighlight("nickname")}
          >
            <div data-profile-field="nickname">
              <ProfileBasicFields
                displayName={displayName}
                bio={bio}
                dibayId={profile.dibay_id ?? null}
                dibayIdLocked={dibayIdLocked}
                username={profile.username ?? profile.dibay_id ?? null}
                usernameComplete={usernameComplete}
                usernameHighlighted={isRequiredSlug("dibay_id")}
                nicknameComplete={fieldComplete.nickname}
                dibayIdComplete={fieldComplete.dibay_id}
                onDisplayNameChange={setDisplayName}
                onBioChange={setBio}
                onDibayIdConfirmed={handleDibayIdConfirmed}
                errors={errors}
              />
            </div>
          </ProfileEditSection>

          <ProfileEditSection
            title={t("profile_edit_section_address")}
            className={sectionHighlight("address")}
          >
            <div data-profile-field="address">
              <ProfileMapLocationBlock
                addresses={addressList}
                listError={addressListErr}
                setupError={addressSetupError}
                fieldIncomplete={!fieldComplete.address}
              />
            </div>
          </ProfileEditSection>

          {showPhoneVerify ? (
            <ProfileEditSection
              title={t("profile_edit_section_phone")}
              className={sectionHighlight("phone")}
            >
              <div data-profile-field="phone">
                <PhoneVerificationBox
                compact
                setupError={phoneSetupError}
                fieldIncomplete={!fieldComplete.phone}
                snapshot={{
                  phone: profile.phone,
                  phone_country_code: profile.phone_country_code ?? null,
                  phone_number: profile.phone_number ?? null,
                  phone_verified: profile.phone_verified,
                  phone_verified_at: profile.phone_verified_at ?? null,
                  member_status: profile.member_status ?? null,
                  role: profile.role ?? null,
                  email: profile.auth_login_email ?? profile.email ?? null,
                  provider: profile.provider ?? profile.auth_provider ?? null,
                  auth_provider: profile.auth_provider ?? profile.provider ?? null,
                  settings: phoneVerificationSettings ?? undefined,
                }}
                onRefreshProfile={async () => {
                  await handlePhoneRefreshProfile();
                  await tryNavigateAfterRequirementSave();
                }}
              />
              </div>
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
        onCancel={() => requestLeave(setupMode ? "setup_dismiss" : "back")}
      />
    </div>
  );
}
