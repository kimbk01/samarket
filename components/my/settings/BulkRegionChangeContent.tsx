"use client";

import { useState } from "react";

export function BulkRegionChangeContent() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = () => {
    setError((prev) => (prev === null ? prev : null));
    setSuccess((prev) => (prev === null ? prev : null));
    setConfirming((prev) => (prev ? prev : true));
  };

  const handleConfirm = async () => {
    setBusy((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    setSuccess((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/me/posts/bulk-region", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updatedCount?: number;
        location?: { label?: string | null; source?: string | null };
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : "동네를 일괄 변경하지 못했습니다.");
        return;
      }
      const label = typeof json.location?.label === "string" ? json.location.label : "선택한 기본 동네";
      const count = Number.isFinite(json.updatedCount) ? Number(json.updatedCount) : 0;
      setSuccess(`${label} 기준으로 판매 글 ${count}건의 동네를 변경했습니다.`);
      setConfirming((prev) => (prev ? false : prev));
    } catch {
      setError("동네를 일괄 변경하지 못했습니다.");
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">
        대표 주소를 우선 사용하고, 없으면 거래·생활 기본 주소 순으로 쓰며, 모두 없으면 프로필 지역을 기준으로 등록한 판매 글의 동네를 한 번에 변경합니다.
      </p>
      {success ? <div className="rounded-ui-rect bg-emerald-50 px-4 py-3 sam-text-body-secondary text-emerald-700">{success}</div> : null}
      {error ? <div className="rounded-ui-rect bg-red-50 px-4 py-3 sam-text-body-secondary text-red-600">{error}</div> : null}
      {!confirming ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {busy ? "변경 중" : "동네 일괄 변경"}
        </button>
      ) : (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <p className="sam-text-body text-sam-fg">정말 현재 기본 지역 기준으로 판매 글 동네를 일괄 변경하시겠습니까?</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming((prev) => (prev ? false : prev))}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body text-sam-fg"
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="rounded bg-signature px-3 py-1.5 sam-text-body font-medium text-white"
            >
              {busy ? "적용 중" : "확인"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
