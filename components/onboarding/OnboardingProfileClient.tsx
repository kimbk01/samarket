"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 로그인 직후 닉네임/필수 프로필이 비어있으면 도착하는 화면 (스펙 1-B, 8).
 *
 * - 닉네임만 받는 최소 폼. 다른 필드는 `/my/edit` 에서 수정한다.
 * - 저장 성공 시 `router.replace(next || /home)` 으로 강제 이동한다 (스펙 9).
 * - 저장 중 버튼 disabled, 실패 시 폼 유지 + 에러 표시.
 */
export function OnboardingProfileClient({ initialNickname }: { initialNickname: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () => sanitizeNextPath(searchParams?.get("next") ?? null),
    [searchParams]
  );
  const target = next ?? POST_LOGIN_PATH;

  const [nickname, setNickname] = useState(initialNickname.trim());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (initialNickname.trim().length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/profile", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { profile?: { nickname?: string | null } } | null;
        const seed = (json?.profile?.nickname ?? "").trim();
        if (!cancelled && seed.length > 0) {
          setNickname(seed);
        }
      } catch {
        /* 초기 닉네임 가져오기는 실패해도 폼은 동작 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialNickname]);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => router.replace(target), 600);
    return () => window.clearTimeout(t);
  }, [done, router, target]);

  const trimmed = nickname.trim();
  const isInvalid = trimmed.length === 0 || trimmed.length > 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || done) return;
    if (isInvalid) {
      setError("닉네임은 1~20자 이내로 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || json?.ok === false) {
        setError(json?.error || "저장에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      // 같은 닉네임을 다른 화면(MyProfileCard·RegionProvider 등)이 dedupe 캐시로 바라보고 있어,
      // 저장 직후 즉시 새 값을 보도록 캐시를 끊어준다.
      try {
        invalidateMeProfileDedupedCache();
      } catch {
        /* 캐시 무효화 실패는 흐름을 막지 않는다. */
      }
      setDone(true);
    } catch {
      setError("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell
      title="프로필 설정"
      description="앱에서 사용할 닉네임을 입력해 주세요. 나중에 내정보에서 다시 바꿀 수 있습니다."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="sam-text-helper text-sam-muted">닉네임</span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            disabled={submitting || done}
            className={Sam.input.base}
            autoFocus
          />
        </label>
        {error ? (
          <p role="alert" className="sam-text-body-secondary text-red-600">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="sam-text-body-secondary text-sam-success">
            저장되었습니다. 잠시 후 자동으로 이동합니다…
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || done || isInvalid}
          className={`${Sam.btn.primary} mt-2 w-full disabled:opacity-50`}
        >
          {submitting ? "저장 중…" : done ? "이동 중…" : "다음"}
        </button>
      </form>
    </OnboardingShell>
  );
}
