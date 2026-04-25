"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
import { StoreAddressStreetDetailGrid } from "@/components/stores/StoreAddressStreetDetailGrid";
import { STORE_LOCATION_SECTION_HINT_ADMIN_CREATE_MEMBER } from "@/lib/stores/store-address-form-ui";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import {
  formatPhMobileDisplay,
  normalizePhMobileDb,
  parsePhMobileInput,
  PH_LOCAL_MOBILE_RULE_MESSAGE_KO,
} from "@/lib/utils/ph-mobile";
const ACCOUNT_TYPE_OPTIONS: { value: "development_member" | "operations_member" | "admin"; label: string }[] = [
  { value: "development_member", label: "개발용 정회원" },
  { value: "operations_member", label: "운영용 정회원" },
  { value: "admin", label: "관리자" },
];

interface CreateMemberFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateMemberForm({ onClose, onSuccess }: CreateMemberFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactPhoneDigits, setContactPhoneDigits] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [addressStreetLine, setAddressStreetLine] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [accountType, setAccountType] = useState<"development_member" | "operations_member" | "admin">("development_member");
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [createdLoginId, setCreatedLoginId] = useState<string | null>(null);
  const [createdLoginEmail, setCreatedLoginEmail] = useState<string | null>(null);

  const resolvedAuthEmailPreview = useMemo(() => {
    const custom = email.trim().toLowerCase();
    if (!custom) return { kind: "need_email" as const, value: null as string | null };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom)) return { kind: "invalid_custom" as const, value: custom };
    return { kind: "explicit" as const, value: custom };
  }, [email]);

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
    if (!nickname.trim() || nickname.trim().length > 20) {
      setError("닉네임은 1~20자로 입력하세요.");
      return;
    }
    if (!name.trim() || name.trim().length > 50) {
      setError("이름은 1~50자로 입력하세요.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("이메일 형식이 올바르지 않습니다.");
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
        setError(PH_LOCAL_MOBILE_RULE_MESSAGE_KO);
        return;
      }
      contactPhoneOut = n;
    }

    const locationLabel = getLocationLabelIfValid(region, city);
    const lines: string[] = [];
    if (locationLabel) lines.push(locationLabel);
    const sub = [addressStreetLine.trim(), addressDetail.trim()].filter(Boolean).join(" · ");
    if (sub) lines.push(sub);
    const contactAddressOut = lines.length > 0 ? lines.join("\n") : undefined;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: id,
          password,
          nickname: nickname.trim(),
          name: name.trim(),
          email: email.trim(),
          accountType,
          contactPhone: contactPhoneOut,
          contactAddress: contactAddressOut,
          regionCode: region.trim() || undefined,
          cityCode: city.trim() || undefined,
          addressStreetLine: addressStreetLine.trim() || undefined,
          addressDetail: addressDetail.trim() || undefined,
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
        const em =
          typeof data.user?.email === "string" && data.user.email.trim()
            ? data.user.email.trim()
            : email.trim();
        setCreatedLoginEmail(em);
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect bg-sam-surface shadow-xl">
        <div className="border-b border-sam-border px-5 py-4">
          <h2 className="text-lg font-semibold text-sam-fg">회원 수동 입력</h2>
          <p className="mt-1 sam-text-helper text-sam-muted">auth.users · profiles · test_users</p>
        </div>
        {createdLoginId ? (
          <div className="space-y-4 p-5">
            <p className="sam-text-body text-sam-fg">
              <strong>{createdLoginId}</strong> 생성됨. 로그인 이메일:{" "}
              <code className="rounded bg-sam-surface-muted px-1">{createdLoginEmail}</code>
            </p>
            <div className="flex flex-wrap gap-2 border-t border-sam-border pt-4">
              <Link
                href="/login"
                className="rounded bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90"
              >
                로그인 페이지로
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-sam-border px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
              >
                닫기
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">아이디 (로그인 ID)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={64}
                autoComplete="username"
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder="2~64자 (영문/숫자)"
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                maxLength={128}
                autoComplete="new-password"
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder="4자 이상"
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">닉네임</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder="서비스에서 표시할 닉네임"
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder="실명 또는 운영용 이름"
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder="reviewer@samarket.app"
              />
            </div>
            <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/60 px-3 py-2">
              <p className="sam-text-xxs text-sam-muted">Auth 이메일</p>
              <code className="mt-0.5 block break-all sam-text-body-secondary text-sam-fg">
                {resolvedAuthEmailPreview.kind === "need_email"
                  ? "—"
                  : resolvedAuthEmailPreview.kind === "invalid_custom"
                    ? "이메일 형식 오류"
                    : resolvedAuthEmailPreview.value}
              </code>
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                연락처 <span className="font-normal text-sam-meta">(선택)</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formatPhMobileDisplay(contactPhoneDigits)}
                onChange={(e) => setContactPhoneDigits(parsePhMobileInput(e.target.value))}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={PH_LOCAL_09_PLACEHOLDER}
              />
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
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
                showZipLookup={false}
              />
              <p className="mt-2 sam-text-helper leading-relaxed text-sam-muted">
                {STORE_LOCATION_SECTION_HINT_ADMIN_CREATE_MEMBER}
              </p>
              <div className="mt-2">
                <StoreAddressStreetDetailGrid
                  addressStreetLine={addressStreetLine}
                  addressDetail={addressDetail}
                  onAddressStreetLineChange={setAddressStreetLine}
                  onAddressDetailChange={setAddressDetail}
                  inputClassName="w-full rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">권한 유형</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as "development_member" | "operations_member" | "admin")}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
              >
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50/70 px-3 py-2 sam-text-body-secondary text-sam-fg">
              관리자 수동 생성 계정은 `provider = admin_manual`, `phone_verified = true`, `status = active(정회원 파생)` 기준으로 즉시 사용 가능합니다.
            </div>

            {error && <p className="sam-text-body-secondary text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-sam-border pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-sam-border px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-signature px-4 py-2 sam-text-body text-white hover:bg-signature/90 disabled:opacity-50"
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
