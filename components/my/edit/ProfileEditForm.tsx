"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRegion } from "@/contexts/RegionContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ProfileImageField } from "./ProfileImageField";
import { ProfileBasicFields } from "./ProfileBasicFields";
import { StoreAddressLocationSection } from "@/components/stores/StoreAddressLocationSection";
import { STORE_LOCATION_SECTION_HINT_PROFILE_EDIT } from "@/lib/stores/store-address-form-ui";
import { ProfileReadonlyFields } from "./ProfileReadonlyFields";
import { normalizeOptionalPhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  buildProfileRegionNameForStorage,
  decodeProfileAppLocationPair,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { finalizePhilippinesZipCode } from "@/lib/products/zip-to-location";

function validate(p: { nickname: string }): { nickname?: string } {
  const errors: { nickname?: string } = {};
  if (!p.nickname?.trim()) errors.nickname = "닉네임을 입력해 주세요.";
  if (p.nickname && p.nickname.length > 20) errors.nickname = "닉네임은 20자 이내로 입력해 주세요.";
  return errors;
}

export function ProfileEditForm() {
  const { setLanguage } = useI18n();
  const { refreshProfileLocation } = useRegion();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
    /** 주소 컬럼 미마이그레이션 등 부가 안내 */
    detail?: string;
  } | null>(null);

  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [appRegionId, setAppRegionId] = useState("");
  const [appCityId, setAppCityId] = useState("");
  const [philPostZip, setPhilPostZip] = useState("");
  const [addressStreetLine, setAddressStreetLine] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("ko");
  const [preferredCountry, setPreferredCountry] = useState("PH");
  const [errors, setErrors] = useState<{ nickname?: string; phone?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getMyProfile();
    setProfile(data);
    if (data) {
      setNickname(data.nickname ?? "");
      setAvatarUrl(data.avatar_url ?? null);
      setBio(data.bio ?? "");
      const loc = decodeProfileAppLocationPair(data.region_code, data.region_name);
      setAppRegionId(loc.regionId);
      setAppCityId(loc.cityId);
      setPhilPostZip((data.postal_code ?? "").trim());
      setAddressStreetLine((data.address_street_line ?? "").trim());
      setAddressDetail((data.address_detail ?? "").trim());
      setPhone(parsePhMobileInput(data.phone ?? ""));
      setPreferredLanguage(data.preferred_language ?? "ko");
      setPreferredCountry(data.preferred_country ?? "PH");
    } else {
      setAppRegionId("");
      setAppCityId("");
      setPhilPostZip("");
      setAddressStreetLine("");
      setAddressDetail("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const commitPhilippinesZip = useCallback((code: string) => {
    setPhilPostZip(code);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const err = validate({ nickname: nickname.trim() });
    const pr = normalizeOptionalPhMobileDb(phone);
    const nextErr = { ...err, ...(pr.ok ? {} : { phone: pr.error }) };
    setErrors(nextErr);
    if (Object.keys(err).length > 0 || !pr.ok) return;

    setSaving(true);
    setMessage(null);
    const payload: ProfileUpdatePayload = {
      nickname: nickname.trim(),
      avatar_url: avatarUrl ?? null,
      bio: bio.trim() || null,
      region_code: encodeProfileAppLocationStorage(appRegionId, appCityId),
      region_name: buildProfileRegionNameForStorage(appRegionId, appCityId),
      postal_code: finalizePhilippinesZipCode(philPostZip) ?? null,
      address_street_line: addressStreetLine.trim() || null,
      address_detail: addressDetail.trim() || null,
      phone: pr.value,
      preferred_language: preferredLanguage,
      preferred_country: preferredCountry,
    };
    const result = await updateMyProfile(payload);
    setSaving(false);
    if (result.ok) {
      setLanguage(normalizeAppLanguage(preferredLanguage));
      const warn = "warning" in result && result.warning ? result.warning : "";
      setMessage({
        type: "ok",
        text: warn ? `저장되었습니다. ${warn}` : "저장되었습니다.",
      });
      await load();
      void refreshProfileLocation();
    } else {
      setMessage({ type: "error", text: result.error });
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        프로필을 불러오는 중…
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        로그인이 필요합니다.
        <Link href="/my" className="ml-1 text-signature">
          내정보로 이동
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ProfileImageField avatarUrl={avatarUrl} onChangeUrl={setAvatarUrl} />
      <ProfileBasicFields
        nickname={nickname}
        bio={bio}
        phone={phone}
        preferredLanguage={preferredLanguage}
        preferredCountry={preferredCountry}
        onNicknameChange={setNickname}
        onBioChange={setBio}
        onPhoneChange={setPhone}
        onPreferredLanguageChange={setPreferredLanguage}
        onPreferredCountryChange={setPreferredCountry}
        errors={errors}
      />
      <StoreAddressLocationSection
        sectionHint={STORE_LOCATION_SECTION_HINT_PROFILE_EDIT}
        regionId={appRegionId}
        cityId={appCityId}
        onRegionChange={(id) => {
          setAppRegionId(id);
          setAppCityId("");
        }}
        onCityChange={setAppCityId}
        addressStreetLine={addressStreetLine}
        addressDetail={addressDetail}
        onAddressStreetLineChange={setAddressStreetLine}
        onAddressDetailChange={setAddressDetail}
        showRequired={false}
        philippinesZipSeed={philPostZip}
        onPhilippinesZipCommitted={commitPhilippinesZip}
      />
      <ProfileReadonlyFields profile={profile} />

      {message ? (
        <div className="space-y-1.5">
          <p
            className={
              message.type === "ok"
                ? "text-[14px] text-green-600"
                : "text-[14px] text-red-600"
            }
          >
            {message.text}
          </p>
          {message.type === "ok" && message.detail ? (
            <p className="text-[13px] leading-relaxed text-amber-900">{message.detail}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-3">
        <Link
          href="/my"
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center text-[14px] font-medium text-gray-700"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
