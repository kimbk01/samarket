"use client";

import Link from "next/link";
import { useState } from "react";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import {
  formatPhMobileDisplay,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";

const ROLE_OPTIONS: { value: "normal" | "premium"; label: string }[] = [
  { value: "normal", label: "일반 회원" },
  { value: "premium", label: "특별 회원" },
];

interface CreateMemberFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateMemberForm({ onClose, onSuccess }: CreateMemberFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contactPhoneDigits, setContactPhoneDigits] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [role, setRole] = useState<"normal" | "premium">("normal");
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [createdLoginId, setCreatedLoginId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLocationError(undefined);

    const id = username.trim().toLowerCase();
    if (!id || id.length < 2 || id.length > 64) {
      setError("아이디는 2~64자로 입력하세요.");
      return;
    }
    if (!password || password.length < 4) {
      setError("비밀번호는 4자 이상 입력하세요.");
      return;
    }

    if (region && !city) {
      setLocationError("동네까지 선택해 주세요.");
      return;
    }

    let contactPhoneOut: string | undefined;
    if (contactPhoneDigits.trim()) {
      const n = normalizePhMobileDb(contactPhoneDigits);
      if (!n) {
        setError(`연락처는 ${PH_LOCAL_09_PLACEHOLDER} 형식으로 입력해 주세요.`);
        return;
      }
      contactPhoneOut = n;
    }

    const locationLabel = getLocationLabelIfValid(region, city);
    let contactAddressOut: string | undefined;
    if (locationLabel) {
      contactAddressOut =
        addressDetail.trim().length > 0
          ? `${locationLabel}\n${addressDetail.trim()}`
          : locationLabel;
    } else if (addressDetail.trim()) {
      contactAddressOut = addressDetail.trim();
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: id,
          password,
          displayName: displayName.trim() || id,
          role,
          contactPhone: contactPhoneOut,
          contactAddress: contactAddressOut,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError("로그인이 필요합니다. 로그인 후 다시 시도해 주세요.");
          return;
        }
        if (res.status === 403) {
          setError("관리자만 회원을 추가할 수 있습니다.");
          return;
        }
        setError(data.error || "생성에 실패했습니다.");
        return;
      }
      if (data.ok) {
        onSuccess();
        setCreatedLoginId(id);
      } else {
        setError(data.error || "생성에 실패했습니다.");
      }
    } catch {
      setError("요청 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">회원 수동 입력</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
            DB <code className="rounded bg-gray-100 px-1">test_users</code>에 저장됩니다. 로그인 페이지 또는 내
            정보「아이디 로그인」에서 방금 만든 <strong>로그인 아이디</strong>·비밀번호로 들어가면, 부여된{" "}
            <strong>회원 UUID</strong>로 매장·주문·API가 연결됩니다.
          </p>
        </div>
        {createdLoginId ? (
          <div className="space-y-4 p-5">
            <p className="text-[14px] text-gray-800">
              <strong className="text-gray-900">{createdLoginId}</strong> 계정을 만들었습니다.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-gray-600">
              <li>
                로그인하면 브라우저에 <strong>쿠키</strong>가 저장되어 서버가 이 회원 UUID로 요청을 처리합니다.
              </li>
              <li>
                다른 계정과 <strong>동시에</strong> 쓰려면 <strong>브라우저를 나누세요</strong>(Chrome / Edge
                등) 또는 프로필·시크릿 창으로 쿠키를 분리하세요. 같은 프로필의 탭만 여러 개면 섞일 수 있습니다.
              </li>
              <li>
                회원 목록에서 <strong>회원 UUID</strong>·로그인 아이디를 확인할 수 있고, 상세에서 테스트 안내를
                다시 볼 수 있습니다.
              </li>
            </ul>
            <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
              <Link
                href="/login"
                className="rounded bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90"
              >
                로그인 페이지로
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-gray-300 px-4 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">아이디 (로그인 ID)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={64}
                autoComplete="username"
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder="2~64자 (영문/숫자)"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                maxLength={128}
                autoComplete="new-password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder="4자 이상"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">이름</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder="표시 이름 (없으면 아이디 사용)"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">
                연락처 <span className="font-normal text-gray-400">(선택)</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formatPhMobileDisplay(contactPhoneDigits)}
                onChange={(e) => setContactPhoneDigits(parsePhMobileInput(e.target.value))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
                placeholder={PH_LOCAL_09_PLACEHOLDER}
              />
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
              <LocationSelector
                embedded
                showRequired={false}
                region={region}
                city={city}
                onRegionChange={(id) => {
                  setRegion(id);
                  setCity("");
                  setLocationError(undefined);
                }}
                onCityChange={(id) => {
                  setCity(id);
                  setLocationError(undefined);
                }}
                error={locationError}
                label="거래 지역"
              />
              <div className="mt-3">
                <label className="mb-1 block text-[13px] font-medium text-gray-700">
                  상세 주소 <span className="font-normal text-gray-400">(선택)</span>
                </label>
                <textarea
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  className="w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 text-[14px]"
                  placeholder="건물·동·호, 바랑가이 등 (거래 글과 비교할 때는 위 지역·동네 선택이 같아야 합니다)"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-gray-700">권한</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "normal" | "premium")}
                className="w-full rounded border border-gray-300 px-3 py-2 text-[14px]"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-gray-300 px-4 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-signature px-4 py-2 text-[14px] text-white hover:bg-signature/90 disabled:opacity-50"
              >
                {submitting ? "생성 중…" : "추가"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
