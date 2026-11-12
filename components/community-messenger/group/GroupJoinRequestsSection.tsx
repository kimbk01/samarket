"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type JoinRequestRow = {
  id: string;
  userId: string;
  userLabel?: string | null;
  username?: string | null;
  linkName?: string | null;
  requestedAt: string;
};

type GroupJoinRequestsSectionProps = {
  roomId: string;
  canManage: boolean;
};

/**
 * 그룹 서랍 — 승인제 초대 링크로 들어온 가입 요청 승인·거절.
 * 초대 링크 자체는 서랍의 「초대 링크 복사」 버튼 1개만 둔다 (Owner 2026-11-12) — 주소 표시·재생성·비활성화·
 * 새 링크·링크 목록은 이 화면에 두지 않는다. 기존 승인제 링크로 오는 요청은 여기서 처리한다.
 */
export function GroupJoinRequestsSection({ roomId, canManage }: GroupJoinRequestsSectionProps) {
  const { safeT } = useI18n();
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [decideBusy, setDecideBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId || !canManage) return;
    const res = await fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/join-requests`);
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; requests?: JoinRequestRow[] };
    if (res.ok && json.ok) setRequests(json.requests ?? []);
  }, [canManage, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(requestId: string, decision: "approved" | "rejected") {
    if (decideBusy) return;
    setDecideBusy(requestId);
    try {
      await fetch(`/api/community-messenger/group-rooms/${encodeURIComponent(roomId)}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
      });
      await refresh();
    } finally {
      setDecideBusy(null);
    }
  }

  if (!canManage) return null;

  return (
    <div className="mt-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] p-4">
      <p className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">
        {safeT("cm_ui_group_join_requests_title")}
      </p>
      {requests.length === 0 ? (
        <p className={`${OverlayUi.caption} mt-1`}>{safeT("cm_ui_group_join_requests_empty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {requests.map((req) => (
            <li key={req.id} className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-3">
              <p className="text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">
                {req.userLabel || req.username || req.userId.slice(0, 8)}
              </p>
              {req.linkName ? <p className={OverlayUi.caption}>{req.linkName}</p> : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={decideBusy === req.id}
                  className={OverlayUi.btn.secondaryDanger}
                  onClick={() => void decide(req.id, "rejected")}
                >
                  {safeT("cm_ui_group_join_reject")}
                </button>
                <button
                  type="button"
                  disabled={decideBusy === req.id}
                  className={OverlayUi.btn.primary}
                  onClick={() => void decide(req.id, "approved")}
                >
                  {safeT("cm_ui_group_join_approve")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
