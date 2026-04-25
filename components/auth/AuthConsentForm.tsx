"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";

export function AuthConsentForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next")?.trim() || POST_LOGIN_PATH;
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!agreeTerms || !agreePrivacy) {
      setError("이용약관과 개인정보처리방침에 모두 동의해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/legal-consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agreeTerms: true, agreePrivacy: true }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error || "동의를 저장하지 못했습니다.");
        return;
      }
      invalidateMeProfileDedupedCache();
      router.replace(next.startsWith("/") ? next : POST_LOGIN_PATH);
    } catch {
      setError("동의를 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-sam-fg">서비스 이용 동의</h1>
      <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
        SNS 최초 로그인 후에는 이용약관과 개인정보처리방침 동의가 필요합니다. 동의 완료 후 글쓰기, 채팅, 거래, 신고 기능을 이용할 수 있습니다.
      </p>

      <div className="mt-5 space-y-3 rounded-ui-rect border border-sam-border bg-sam-app/60 p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1" />
          <span className="sam-text-body text-sam-fg">
            이용약관에 동의합니다.{" "}
            <Link href="/terms" target="_blank" className="text-signature underline">
              이용약관 보기
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="mt-1" />
          <span className="sam-text-body text-sam-fg">
            개인정보처리방침에 동의합니다.{" "}
            <Link href="/privacy" target="_blank" className="text-signature underline">
              개인정보처리방침 보기
            </Link>
          </span>
        </label>
      </div>

      <div className="mt-5 rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-sam-fg">
        부적절한 콘텐츠, 사기, 혐오, 개인정보 노출, 불법 거래는 금지되며 신고와 차단 기능을 통해 관리됩니다.
      </div>

      {error ? <p className="mt-4 sam-text-body-secondary text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="mt-5 w-full rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "저장 중…" : "동의하고 계속하기"}
      </button>
    </div>
  );
}
