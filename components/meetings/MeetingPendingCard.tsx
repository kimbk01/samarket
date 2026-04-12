"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { philifeMeetingApi } from "@domain/philife/api";
import { formatKorDateTime } from "@/lib/ui/format-meeting-date";

interface MeetingPendingCardProps {
  meetingId: string;
  hostUserId: string;
  requestedAt?: string | null;
}

export function MeetingPendingCard({ meetingId, hostUserId, requestedAt }: MeetingPendingCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mApi = philifeMeetingApi(meetingId);

  const onCancel = async () => {
    if (!confirm("참여 신청을 취소하시겠어요?")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(mApi.leave(), { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "신청 취소에 실패했습니다.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onInquiry = () => {
    if (!hostUserId) return;
    router.push(`/chats/new?peerId=${encodeURIComponent(hostUserId)}`);
  };

  return (
    <div className="mx-0 mt-4 overflow-hidden rounded-ui-rect border border-amber-200 bg-sam-surface shadow-sm">
      {/* 상단 상태 바 */}
      <div className="flex items-center gap-3 bg-amber-50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <span className="text-[20px]">⏳</span>
        </div>
        <div>
          <p className="text-[15px] font-bold text-amber-900">승인 대기 중</p>
          <p className="text-[12px] text-amber-700">
            운영자가 참여 요청을 검토하고 있어요
          </p>
        </div>
      </div>

      {/* 안내 내용 */}
      <div className="px-5 py-4">
        <ul className="space-y-2 text-[13px] text-sam-muted">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
            승인되면 모임 상세를 이용할 수 있어요.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
            승인 시 알림을 받을 수 있습니다.
          </li>
          {requestedAt && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-sam-meta">·</span>
              <span className="text-sam-meta">신청일: {formatKorDateTime(requestedAt)}</span>
            </li>
          )}
        </ul>

        {err && <p className="mt-3 text-[12px] text-red-600">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onInquiry}
            className="flex-1 rounded-ui-rect border border-sam-border py-3 text-[13px] font-semibold text-sam-fg hover:bg-sam-app"
          >
            운영자 문의
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCancel()}
            className="flex-1 rounded-ui-rect bg-amber-500 py-3 text-[13px] font-semibold text-white disabled:opacity-50 hover:bg-amber-600"
          >
            {busy ? "처리 중…" : "신청 취소"}
          </button>
        </div>
      </div>
    </div>
  );
}
