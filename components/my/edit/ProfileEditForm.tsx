"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ProfileImageField } from "./ProfileImageField";
import { ProfileBasicFields } from "./ProfileBasicFields";
import { ProfileRegionField } from "./ProfileRegionField";
import { ProfileReadonlyFields } from "./ProfileReadonlyFields";

function validate(p: {
  nickname: string;
  region_name: string | null;
}): { nickname?: string } {
  const errors: { nickname?: string } = {};
  if (!p.nickname?.trim()) errors.nickname = "닉네임을 입력해 주세요.";
  if (p.nickname && p.nickname.length > 20) errors.nickname = "닉네임은 20자 이내로 입력해 주세요.";
  return errors;
}

export function ProfileEditForm() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [regionName, setRegionName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("ko");
  const [preferredCountry, setPreferredCountry] = useState("PH");
  const [errors, setErrors] = useState<{ nickname?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getMyProfile();
    setProfile(data);
    if (data) {
      setNickname(data.nickname ?? "");
      setAvatarUrl(data.avatar_url ?? null);
      setBio(data.bio ?? "");
      setRegionCode(data.region_code ?? "");
      setRegionName(data.region_name ?? "");
      setPhone(data.phone ?? "");
      setPreferredLanguage(data.preferred_language ?? "ko");
      setPreferredCountry(data.preferred_country ?? "PH");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const err = validate({ nickname: nickname.trim(), region_name: regionName || null });
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    setSaving(true);
    const payload: ProfileUpdatePayload = {
      nickname: nickname.trim(),
      avatar_url: avatarUrl || null,
      bio: bio.trim() || null,
      region_code: regionCode.trim() || null,
      region_name: regionName.trim() || null,
      phone: phone.trim() || null,
      preferred_language: preferredLanguage,
      preferred_country: preferredCountry,
    };
    const result = await updateMyProfile(payload);
    setSaving(false);
    if (result.ok) {
      setMessage({ type: "ok", text: "저장되었습니다." });
      load();
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
      <ProfileRegionField
        regionName={regionName}
        regionCode={regionCode}
        onRegionNameChange={setRegionName}
        onRegionCodeChange={setRegionCode}
      />
      <ProfileReadonlyFields profile={profile} />

      {message && (
        <p
          className={
            message.type === "ok"
              ? "text-[14px] text-green-600"
              : "text-[14px] text-red-600"
          }
        >
          {message.text}
        </p>
      )}

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
