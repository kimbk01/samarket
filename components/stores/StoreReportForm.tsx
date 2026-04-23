"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "spam", label: "스팸·도배" },
  { value: "fraud", label: "사기·허위" },
  { value: "illegal", label: "불법·유해" },
  { value: "harassment", label: "괴롭힘·혐오" },
  { value: "misleading", label: "과장·오해 소지" },
  { value: "other", label: "기타" },
];

export function StoreReportForm({
  storeSlug,
  mode,
  productId,
}: {
  storeSlug: string;
  mode: "store" | "product";
  productId?: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!message.trim()) {
      setErr("내용을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/store-reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: storeSlug,
          target_type: mode,
          product_id: mode === "product" ? productId : undefined,
          reason_type: reason,
          message: message.trim(),
        }),
      });
      const json = await res.json();
      if (res.status === 401) {
        setErr("로그인이 필요합니다.");
        return;
      }
      if (json?.error === "report_recent_duplicate") {
        setErr("같은 대상으로 최근에 신고하셨습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!json?.ok) {
        setErr(json?.error ?? "신고 접수에 실패했습니다.");
        return;
      }
      setOk(true);
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <div className="rounded-ui-rect border border-emerald-100 bg-emerald-50/80 p-4 text-[14px] text-emerald-900">
        <p className="font-semibold">신고가 접수되었습니다.</p>
        <p className="mt-1 text-[13px] font-normal text-emerald-800/90">검토 후 필요 시 조치합니다. 허위 신고는 제재 대상이 될 수 있습니다.</p>
        <button
          type="button"
          className="mt-4 text-[14px] font-semibold text-emerald-800 underline"
          onClick={() => router.push(`/stores/${encodeURIComponent(storeSlug)}`)}
        >
          매장으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-[12px] font-normal text-sam-muted">
        {mode === "store"
          ? "이 매장에 대한 신고입니다."
          : "선택한 상품에 대한 신고입니다."}
      </p>
      <label className="block">
        <span className="text-[13px] font-semibold text-sam-fg">사유</span>
        <select
          className="sam-select mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-sam-fg">상세 내용 (최대 2000자)</span>
        <textarea
          className="sam-textarea mt-1 min-h-[96px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder="구체적으로 적어 주시면 검토에 도움이 됩니다."
        />
      </label>
      {err ? <p className="text-[12px] text-red-600">{err}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="sam-btn-primary w-full disabled:opacity-50"
      >
        {busy ? "전송 중…" : "신고 접수"}
      </button>
    </form>
  );
}
