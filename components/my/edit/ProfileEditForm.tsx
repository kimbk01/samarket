"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRegion } from "@/contexts/RegionContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ProfileBasicFields } from "./ProfileBasicFields";
import { ProfileMapLocationBlock } from "./ProfileMapLocationBlock";
import { normalizeOptionalPhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { matchRegionCityFromFullAddress } from "@/lib/profile/match-region-from-full-address";
import { consumeMapAddressPick } from "@/lib/map/map-address-pick-storage";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchMeAddressesListSingleFlight } from "@/lib/addresses/address-list-client-cache";
import {
  ProfileEditFormShell,
  ProfileEditSection,
} from "@/components/my/edit/ui/ProfileEditFormShell";
import { ProfileAvatarEditor } from "@/components/my/edit/ui/ProfileAvatarEditor";
import { ProfileReadOnlyInfoCard } from "@/components/my/edit/ui/ProfileReadOnlyInfoCard";
import { ProfileEditHeader } from "@/components/my/edit/ui/ProfileEditHeader";
import { ProfileEditBottomSaveBar } from "@/components/my/edit/ui/ProfileEditBottomSaveBar";
import { PROFILE_EDIT_FIELD_LABEL_CLASS, PROFILE_EDIT_INPUT_CLASS, PROFILE_EDIT_PAGE_BG_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { formatAtUsername } from "@/lib/users/user-label";

export const PROFILE_EDIT_FORM_ID = "dibay-profile-edit-form";

function validate(
  p: { displayName: string },
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): { displayName?: string } {
  const errors: { displayName?: string } = {};
  if (!p.displayName?.trim()) errors.displayName = t("profile_edit_err_nickname_required");
  if (p.displayName && p.displayName.length > 20) errors.displayName = t("profile_edit_err_nickname_max");
  return errors;
}

export function ProfileEditForm({ backHref = "/mypage" }: { backHref?: string }) {
  const pathname = usePathname();
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
  const [phone, setPhone] = useState("");
  const [preferredCountry, setPreferredCountry] = useState("PH");
  const [errors, setErrors] = useState<{ displayName?: string; phone?: string }>({});
  const [addressList, setAddressList] = useState<UserAddressDTO[] | null>(null);
  const [addressListErr, setAddressListErr] = useState(false);
  const [phoneVerificationSettings, setPhoneVerificationSettings] = useState<{
    enabled: boolean;
    provider: "supabase" | "semaphore";
    guide_text: string;
    resend_cooldown_seconds: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setAddressListErr((prev) => (prev ? false : prev));
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
    setDisplayName(merged.display_name ?? merged.nickname ?? "");
    setAvatarUrl(merged.avatar_url ?? null);
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
    setPhone(parsePhMobileInput(merged.phone ?? ""));
    setPreferredCountry(merged.preferred_country ?? "PH");
    setLoading(false);
  }, [pathname]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const err = validate({ displayName: displayName.trim() }, t);
    const pr = normalizeOptionalPhMobileDb(phone);
    const nextErr = { ...err, ...(pr.ok ? {} : { phone: pr.error }) };
    setErrors(nextErr);
    if (Object.keys(err).length > 0 || !pr.ok) return;

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
      avatar_url: avatarUrl ?? null,
      bio: bio.trim() || null,
      latitude: mapLat,
      longitude: mapLng,
      full_address: fa,
      region_code: regionCode,
      region_name: regionName,
      address_street_line: addressStreetLine.trim() || null,
      address_detail: addressDetail.trim() || null,
      phone: pr.value,
      preferred_country: preferredCountry,
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

  const atUsername = formatAtUsername(profile.username);
  const showPhoneVerify = phoneVerificationSettings?.enabled === true;

  return (
    <div className={PROFILE_EDIT_PAGE_BG_CLASS}>
      <ProfileEditHeader backHref={backHref} />

      <form id={PROFILE_EDIT_FORM_ID} onSubmit={handleSubmit}>
        <ProfileEditFormShell>
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
            <div className="flex flex-col items-center px-4 pb-5 pt-6">
              <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={setAvatarUrl} />
              <div className="mt-5 w-full max-w-sm space-y-3">
                <div>
                  <label className={PROFILE_EDIT_FIELD_LABEL_CLASS}>{t("profile_edit_nickname_label")}</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("profile_edit_nickname_placeholder")}
                    className={PROFILE_EDIT_INPUT_CLASS}
                    autoComplete="nickname"
                  />
                  {errors.displayName ? (
                    <p className="mt-1 text-[12px] text-red-600">{errors.displayName}</p>
                  ) : null}
                </div>
                <div>
                  <p className={PROFILE_EDIT_FIELD_LABEL_CLASS}>{t("profile_edit_username_label")}</p>
                  <p className="mt-1 rounded-ui-rect border border-[#D4E9E2]/80 bg-[#F2F0EB]/60 px-3 py-2.5 text-[15px] font-medium text-[#6F4E37]">
                    {atUsername || "—"}
                  </p>
                </div>
              </div>
            </div>
          </ProfileEditSection>

          <ProfileEditSection title={t("profile_edit_section_basic")}>
            <ProfileBasicFields
              displayName={displayName}
              bio={bio}
              phone={phone}
              preferredCountry={preferredCountry}
              onDisplayNameChange={setDisplayName}
              onBioChange={setBio}
              onPhoneChange={setPhone}
              onPreferredCountryChange={setPreferredCountry}
              errors={errors}
              hideDisplayName
            />
          </ProfileEditSection>

          <ProfileEditSection title={t("profile_edit_section_address")}>
            <ProfileMapLocationBlock addresses={addressList} listError={addressListErr} />
          </ProfileEditSection>

          {showPhoneVerify ? (
            <ProfileEditSection title={t("my_phone_verify_title")}>
              <PhoneVerificationBox
                compact
                snapshot={{
                  phone: profile.phone,
                  phone_verified: profile.phone_verified,
                  member_status: profile.member_status ?? null,
                  settings: phoneVerificationSettings ?? undefined,
                }}
                onRefreshProfile={load}
              />
            </ProfileEditSection>
          ) : null}

          <ProfileEditSection title={t("profile_edit_section_readonly")}>
            <ProfileReadOnlyInfoCard profile={profile} />
          </ProfileEditSection>
        </ProfileEditFormShell>
      </form>

      <ProfileEditBottomSaveBar formId={PROFILE_EDIT_FORM_ID} backHref={backHref} saving={saving} />
    </div>
  );
}
