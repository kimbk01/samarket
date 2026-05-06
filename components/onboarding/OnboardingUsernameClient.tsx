"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { Sam } from "@/lib/ui/sam-component-classes";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

type ReserveResp =
  | { ok: true; available: boolean; normalized: string }
  | { ok: false; error: string };

type ConfirmResp =
  | { ok: true; username: string }
  | { ok: false; error: string };

function normalizeUsernameInput(v: string): string {
  return String(v ?? "").trim().toLowerCase().replace(/^@+/, "");
}

export function OnboardingUsernameClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(() => sanitizeNextPath(searchParams?.get("next") ?? null), [searchParams]);
  const target = next ?? POST_LOGIN_PATH;

  const [raw, setRaw] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const normalized = useMemo(() => normalizeUsernameInput(raw), [raw]);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => router.replace(target), 600);
    return () => window.clearTimeout(t);
  }, [done, router, target]);

  const reserve = async () => {
    if (!normalized) return;
    setChecking(true);
    setError(null);
    setAvailable(null);
    try {
      const res = await fetch("/api/me/username/reserve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ReserveResp | null;
      if (!res.ok || !json || json.ok !== true) {
        setError((json as any)?.error || "중복 확인에 실패했습니다.");
        return;
      }
      setAvailable(json.available);
      if (!json.available) {
        setError("이미 사용 중인 @아이디입니다.");
      }
    } catch {
      setError("네트워크 오류로 중복 확인에 실패했습니다.");
    } finally {
      setChecking(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/username/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ConfirmResp | null;
      if (!res.ok || !json || json.ok !== true) {
        setError((json as any)?.error || "저장에 실패했습니다.");
        return;
      }
      try {
        invalidateMeProfileDedupedCache();
      } catch {
        /* ignore */
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
      title="@아이디 설정"
      description="친구추가·멘션·채팅·주문 등에서 계정을 식별하는 고유 아이디입니다. 한 번 설정하면 변경할 수 없습니다."
    >
      <form onSubmit={confirm} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="sam-text-helper text-sam-muted">@아이디</span>
          <div className="flex items-center gap-2">
            <span className="sam-text-body text-sam-muted">@</span>
            <input
              type="text"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setAvailable(null);
                setError(null);
              }}
              maxLength={24}
              disabled={checking || submitting || done}
              className={`${Sam.input.base} flex-1`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="예: boss_market"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void reserve()}
              disabled={checking || submitting || done || !normalized}
              className={`${Sam.btn.secondary} shrink-0 disabled:opacity-50`}
            >
              {checking ? "확인 중…" : "중복 확인"}
            </button>
          </div>
        </label>

        {available === true && !error ? (
          <p role="status" className="sam-text-body-secondary text-sam-success">
            사용 가능한 @아이디입니다.
          </p>
        ) : null}

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
          disabled={submitting || done || available !== true}
          className={`${Sam.btn.primary} mt-2 w-full disabled:opacity-50`}
        >
          {submitting ? "저장 중…" : done ? "이동 중…" : "확정"}
        </button>
      </form>
    </OnboardingShell>
  );
}

