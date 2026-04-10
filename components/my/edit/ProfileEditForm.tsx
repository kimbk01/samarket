"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { useRegion } from "@/contexts/RegionContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ProfileImageField } from "./ProfileImageField";
import { ProfileBasicFields } from "./ProfileBasicFields";
import { ProfileMapLocationBlock } from "./ProfileMapLocationBlock";
import { ProfileReadonlyFields } from "./ProfileReadonlyFields";
import { normalizeOptionalPhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { matchRegionCityFromFullAddress } from "@/lib/profile/match-region-from-full-address";
import { consumeMapAddressPick } from "@/lib/map/map-address-pick-storage";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function validate(p: { nickname: string }): { nickname?: string } {
  const errors: { nickname?: string } = {};
  if (!p.nickname?.trim()) errors.nickname = "닉네임을 입력해 주세요.";
  if (p.nickname && p.nickname.length > 20) errors.nickname = "닉네임은 20자 이내로 입력해 주세요.";
  return errors;
}

export function ProfileEditForm() {
  const router = useRouter();
  const pathname = usePathname();
  const { setLanguage } = useI18n();
  const { refreshProfileLocation } = useRegion();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
    detail?: string;
  } | null>(null);

  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [mapFullAddress, setMapFullAddress] = useState("");
  const [addressStreetLine, setAddressStreetLine] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("ko");
  const [preferredCountry, setPreferredCountry] = useState("PH");
  const [errors, setErrors] = useState<{ nickname?: string; phone?: string }>({});
  const [addressList, setAddressList] = useState<UserAddressDTO[] | null>(null);
  const [addressListErr, setAddressListErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAddressListErr(false);
    const pick = consumeMapAddressPick();
    const data = await getMyProfile();
    if (!data) {
      setLoading(false);
      const next =
        pathname && pathname.startsWith("/") ? pathname : MYPAGE_PROFILE_EDIT_HREF;
      const loginUrl = `/login?next=${encodeURIComponent(next)}`;
      if (typeof window !== "undefined") {
        window.location.replace(loginUrl);
      } else {
        router.replace(loginUrl);
      }
      return;
    }

    let rows: UserAddressDTO[] = [];
    try {
      const ar = await fetch("/api/me/addresses", { credentials: "include" });
      const aj = (await ar.json()) as { ok?: boolean; addresses?: UserAddressDTO[] };
      if (ar.ok && aj.ok && Array.isArray(aj.addresses)) rows = aj.addresses;
      else setAddressListErr(true);
    } catch {
      setAddressListErr(true);
    }
    setAddressList(rows);

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
    setNickname(merged.nickname ?? "");
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
    setPreferredLanguage(merged.preferred_language ?? "ko");
    setPreferredCountry(merged.preferred_country ?? "PH");
    setLoading(false);
  }, [pathname, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const err = validate({ nickname: nickname.trim() });
    const pr = normalizeOptionalPhMobileDb(phone);
    const nextErr = { ...err, ...(pr.ok ? {} : { phone: pr.error }) };
    setErrors(nextErr);
    if (Object.keys(err).length > 0 || !pr.ok) return;

    const fa = mapFullAddress.trim();
    if (mapLat == null || mapLng == null || !fa) {
      setMessage({
        type: "error",
        text: "주소 관리에서 대표 주소를 등록하거나, 지도로 위치를 지정해 주세요.",
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
      nickname: nickname.trim(),
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
        로그인 화면으로 이동 중…
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
      <ProfileMapLocationBlock addresses={addressList} listError={addressListErr} />
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
          className="flex-1 rounded-ui-rect border border-gray-300 py-2.5 text-center text-[14px] font-medium text-gray-700"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
