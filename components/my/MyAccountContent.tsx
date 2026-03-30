"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";
import type { ProfileRow } from "@/lib/profile/types";

export function MyAccountContent() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const p = await getMyProfile();
    setProfile(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-4 text-center text-[14px] text-gray-500">불러오는 중…</p>;
  }
  if (!profile) {
    return (
      <div className="space-y-3 py-4 text-center text-[14px] text-gray-500">
        <p>로그인이 필요합니다.</p>
        <p>
          <Link href="/login" className="font-medium text-signature underline">
            {isTestUsersSurfaceEnabled() ? "테스트 로그인" : "로그인"}
          </Link>
          {isTestUsersSurfaceEnabled() ? (
            <>
              {" · "}
              <Link href="/signup" className="font-medium text-signature underline">
                회원가입
              </Link>
            </>
          ) : null}
        </p>
        <Link href="/my" className="block text-gray-500">내정보로</Link>
      </div>
    );
  }

  const phoneVerificationStatus = (profile as ProfileRow & { phone_verification_status?: string })
    .phone_verification_status;

  const displayNickname = profile.nickname?.trim() || "닉네임 없음";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[26px] text-gray-400">👤</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-gray-900">{displayNickname}</p>
          <p className="mt-0.5 truncate text-[13px] text-gray-500">회원가입 시 설정한 닉네임이 표시됩니다.</p>
          <Link href="/my/edit" className="mt-2 inline-block text-[14px] font-medium text-signature">
            프로필·사진 수정
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">계정 정보</h2>
          <Link
            href="/my/edit"
            className="text-[14px] font-medium text-signature"
          >
            프로필 수정
          </Link>
        </div>
        <dl className="space-y-3 text-[14px]">
          <div>
            <dt className="text-gray-500">닉네임</dt>
            <dd className="mt-0.5 text-gray-900">{displayNickname}</dd>
          </div>
          <div>
            <dt className="text-gray-500">이메일</dt>
            <dd className="mt-0.5 text-gray-900">{profile.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">연락처</dt>
            <dd className="mt-0.5 text-gray-900">{profile.phone ?? "등록된 연락처 없음"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">실명 인증</dt>
            <dd className="mt-0.5 text-gray-900">{profile.realname_verified ? "완료" : "미인증"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">연락처 인증</dt>
            <dd className="mt-0.5 text-gray-900">
              {profile.phone_verified
                ? "완료"
                : phoneVerificationStatus === "pending"
                  ? "승인 대기"
                  : "미인증"}
            </dd>
          </div>
        </dl>
        {!profile.phone_verified ? (
          <Link
            href="/my/account/phone-verification"
            className="mt-4 block rounded-xl border border-signature/20 bg-signature/5 px-4 py-3 text-center text-[14px] font-semibold text-signature"
          >
            필리핀 전화번호 인증 진행하기
          </Link>
        ) : null}
      </div>
      <Link
        href="/my/settings"
        className="block rounded-xl bg-white px-4 py-3 text-center text-[14px] font-medium text-gray-700 shadow-sm"
      >
        설정
      </Link>
    </div>
  );
}
