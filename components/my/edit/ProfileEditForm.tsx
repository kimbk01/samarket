"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { usePathname, useRouter } from "next/navigation";
import { useRegion } from "@/contexts/RegionContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ProfileImageField } from "./ProfileImageField";
import { ProfileBasicFields } from "./ProfileBasicFields";
import { ProfileMapLocationBlock } from "./ProfileMapLocationBlock";
import { ProfileReadonlyFields } from "./ProfileReadonlyFields";
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
import { ProfileEditFormShell, ProfileEditSection } from "@/components/my/edit/ui/ProfileEditFormShell";
import { ProfileAvatarEditor } from "@/components/my/edit/ui/ProfileAvatarEditor";
import { ProfileReadOnlyInfoCard } from "@/components/my/edit/ui/ProfileReadOnlyInfoCard";

export const PROFILE_EDIT_FORM_ID = "dibay-profile-edit-form";

function validate(
  p: { displayName: string },
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): { displayName?: string } {
  const errors: { displayName?: string } = {};
  if (!p.displayName?.trim()) errors.displayName = t("profile_edit_err_nickname_required");
  if (p.displayName && p.displayName.length > 20) errors.displayName = t("profile_edit_err_nickname_max");
  return errors;
}

export function ProfileEditForm() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { refreshProfileLocation } = useRegion();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
    detail?: string;
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
        if (result.ok) {
          return { ok: true as const, rows: result.rows };
        }
        return { ok: false as const, rows: [] as UserAddressDTO[] };
      })
      .catch((): { ok: false; rows: UserAddressDTO[] } => ({ ok: false, rows: [] }));

    const phoneSettingsPromise = runSingleFlight("me:phone-verification:get", () =>
      fetch("/api/me/phone-verification", { credentials: "include", cache: "no-store" })
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

    const [data, addrPack, pvSettings] = await Promise.all([getMyProfile(), addressesPromise, phoneSettingsPromise]);

    if (!data) {
      setLoading((prev) => (prev ? false : prev));
      const loginUrl = "/login";
      if (typeof window !== "undefined") {
        window.location.replace(loginUrl);
      } else {
        router.replace(loginUrl);
      }
      return;
    }

    if (!addrPack.ok) setAddressListErr((prev) => (prev ? prev : true));
    const rows = addrPack.rows;
    setAddressList(rows);
    setPhoneVerificationSettings(pvSettings);

    const masterAddr = rows.find((a) => a.isDefaultMaster) ?? null;

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
  }, [pathname, router]);

  useEffect(() => {
    load();
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
      setMessage({
        type: "error",
        text: t("profile_edit_warn_address_required"),
      });
      return;
    }

    const matched = matchRegionCityFromFullAddress(fa);
    const regionCode = matched
      ? encodeProfileAppLocationStorage(matched.regionId, matched.cityId)
      : null;
    const regionName = matched
      ? buildProfileRegionNameForStorage(matched.regionId, matched.cityId)
      : null;

    setSaving(true);
    setMessage(null);
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
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("profile_edit_loading_profile")}
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("profile_edit_redirect_login")}
      </div>
    );
  }

  return (
    <form id={PROFILE_EDIT_FORM_ID} onSubmit={handleSubmit} className="space-y-0">
      <ProfileEditFormShell>
        <ProfileEditSection title={t("profile_edit_section_image")} description={t("profile_edit_section_image_desc")}>
          <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={setAvatarUrl} />
        </ProfileEditSection>

        <ProfileEditSection title={t("profile_edit_section_basic")} description={t("profile_edit_section_basic_desc")}>
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
          />
        </ProfileEditSection>

        <ProfileEditSection title={t("profile_edit_section_address")} description={t("profile_edit_section_address_desc")}>
          <ProfileMapLocationBlock addresses={addressList} listError={addressListErr} />
        </ProfileEditSection>

        <ProfileEditSection title={t("profile_edit_section_phone")} description={t("profile_edit_section_phone_desc")}>
          <PhoneVerificationBox
            snapshot={{
              phone: profile.phone,
              phone_verified: profile.phone_verified,
              member_status: profile.member_status ?? null,
              settings: phoneVerificationSettings ?? undefined,
            }}
            onRefreshProfile={load}
          />
        </ProfileEditSection>

        <ProfileEditSection title={t("profile_edit_section_readonly")} description={t("profile_edit_section_readonly_desc")}>
          <ProfileReadOnlyInfoCard profile={profile} />
        </ProfileEditSection>

      {message ? (
        <div className="space-y-1.5">
          <p
            className={
              message.type === "ok"
                ? "sam-text-body text-green-600"
                : "sam-text-body text-red-600"
            }
          >
            {message.text}
          </p>
          {message.type === "ok" && message.detail ? (
            <p className="sam-text-body-secondary leading-relaxed text-amber-900">{message.detail}</p>
          ) : null}
        </div>
      ) : null}

        <div className="flex gap-3 pt-1">
          <Link
            href="/my"
            className="flex-1 rounded-[12px] border border-sam-border py-3 text-center text-[15px] font-semibold text-sam-fg hover:bg-sam-app"
          >
            {t("common_cancel")}
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-[12px] bg-[color:#1C8DB8] py-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? t("profile_edit_saving") : t("common_save")}
          </button>
        </div>
      </ProfileEditFormShell>
    </form>
  );
}
