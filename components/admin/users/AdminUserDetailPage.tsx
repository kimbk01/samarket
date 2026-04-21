"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminUserById, getAdminMemo, setAdminMemo, getActivitySummary } from "@/lib/admin-users/mock-admin-users";
import { getModerationLogsByUserId } from "@/lib/admin-users/mock-user-moderation-logs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminModerationStatusBadge } from "@/components/admin/AdminModerationStatusBadge";
import { AdminUserActionPanel } from "./AdminUserActionPanel";
import { AdminUserModerationLogList } from "./AdminUserModerationLogList";
import { AdminUserSummaryCards } from "./AdminUserSummaryCards";
import {
  AdminTestUserDetail,
  type ApiTestUserRow,
} from "@/components/admin/users/AdminTestUserDetail";
import { AdminUserPointsSection } from "./AdminUserPointsSection";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";

const MEMBER_TYPE_LABELS: Record<string, string> = {
  normal: "일반회원",
  premium: "특별회원",
  admin: "관리자",
};

interface AdminUserDetailPageProps {
  userId: string;
}

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [apiUser, setApiUser] = useState<ApiTestUserRow | "loading" | "absent">("loading");
  const user = getAdminUserById(userId);
  const summary = getActivitySummary(userId);
  const logs = getModerationLogsByUserId(userId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setApiUser("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; user?: ApiTestUserRow };
          if (data.ok && data.user) {
            setApiUser(data.user);
            return;
          }
        }
        setApiUser("absent");
      } catch {
        if (!cancelled) setApiUser("absent");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (apiUser === "loading") {
    return (
      <div className="py-12 text-center sam-text-body text-sam-muted">회원 정보를 불러오는 중…</div>
    );
  }

  if (apiUser !== "absent") {
    return <AdminTestUserDetail user={apiUser} />;
  }

  if (!user) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        회원을 찾을 수 없습니다.
      </div>
    );
  }

  const hasMemo = getAdminMemo(userId);

  const handleSaveMemo = () => {
    setAdminMemo(userId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="회원 상세" backHref="/admin/users" />

      <AdminCard title="기본 정보">
        <div className="flex gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-border-soft" />
          <div className="min-w-0 flex-1">
            <p className="sam-text-body font-semibold text-sam-fg">{user.nickname}</p>
            {showMemberUuid ? (
              <p className="sam-text-body-secondary text-sam-muted">
                ID: {user.id}
                <button
                  type="button"
                  className="ml-2 sam-text-helper font-medium text-signature hover:underline"
                  onClick={() => setShowMemberUuid(false)}
                >
                  숨기기
                </button>
              </p>
            ) : (
              <p className="sam-text-body-secondary text-sam-muted">
                ID 숨김
                <button
                  type="button"
                  className="ml-2 sam-text-helper font-medium text-signature hover:underline"
                  onClick={() => setShowMemberUuid(true)}
                >
                  표시
                </button>
              </p>
            )}
            {user.email && (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{user.email}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AdminModerationStatusBadge status={user.moderationStatus} />
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper text-sam-fg">
                {MEMBER_TYPE_LABELS[user.memberType] ?? user.memberType}
              </span>
            </div>
            <p className="mt-2 sam-text-body-secondary text-sam-muted">
              가입 {new Date(user.joinedAt).toLocaleString("ko-KR")}
              {user.lastActiveAt && (
                <> · 최근활동 {new Date(user.lastActiveAt).toLocaleDateString("ko-KR")}</>
              )}
            </p>
            {user.location && (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">지역: {user.location}</p>
            )}
          </div>
        </div>
      </AdminCard>

      <AdminUserSummaryCards summary={summary} />

      <AdminCard title="거래/상품 요약">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">등록 상품</dt>
            <dd>{user.productCount}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">판매 완료</dt>
            <dd>{user.soldCount}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">신고 수</dt>
            <dd>{user.reportCount}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">채팅 수</dt>
            <dd>{user.chatCount}</dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="회원 메모 (placeholder)">
        {hasMemo && (
          <p className="mb-2 sam-text-body-secondary text-sam-fg">{hasMemo}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="메모 입력"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            className="min-w-0 flex-1 rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
          >
            저장
          </button>
        </div>
      </AdminCard>

      <AdminUserPointsSection userId={userId} />

      <AdminCard title="관리자 액션">
        <AdminUserActionPanel user={user} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard title="제재 이력">
        <AdminUserModerationLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
