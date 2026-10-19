"use client";

/**
 * 게시글 신고·조치 기록 (설계 §C-0-1 ② 관련 기록). 운영 기록 API 가 아직 없으면(404) 신고 처리함 링크만 보여 준다.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CommunityTimeline } from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { communityJsonFetch } from "@/components/admin/community/posts/community-post-admin-shared";

type AuditRow = {
  id: string | number;
  createdAt: string;
  actorNickname?: string | null;
  action: string;
  reason?: string | null;
};

const ACTION_KO: Record<string, string> = {
  "community_post.status_hidden": "숨김",
  "community_post.status_deleted": "삭제",
  "community_post.status_active": "다시 공개",
  "community_post.content_update": "관리자 본문 수정",
  "community_post.update": "정보 변경",
  "community_post.pin": "상단 고정",
  "community_post.unpin": "고정 해제",
  "community_post.hard_delete": "영구 삭제",
  "community_notice.create": "공지 게시",
  "community_notice.end": "공지 종료",
  "community_notice.update": "공지 수정",
};

export function communityAuditActionLabel(action: string): string {
  return ACTION_KO[action] ?? "기타 조치";
}

export function CommunityPostRecordsTab({
  postId,
  reportCount,
  reloadKey,
}: {
  postId: string;
  reportCount: number;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [err, setErr] = useState<{ code: string; status: number } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancel = false;
    setState("loading");
    void (async () => {
      const sp = new URLSearchParams({ targetType: "community_post", targetId: postId, limit: "100" });
      const r = await communityJsonFetch<{ rows?: AuditRow[] }>(`/api/admin/community/audit?${sp.toString()}`);
      if (cancel) return;
      if (r.ok) {
        setRows(r.json.rows ?? []);
        setState("ready");
      } else if (r.status === 404) {
        setState("unavailable");
      } else {
        setErr({ code: r.code, status: r.status });
        setState("error");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [postId, reloadKey, retry]);

  return (
    <div className="space-y-3" data-community-post-records="1">
      <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]">
        <span className="text-sam-fg">
          받은 신고 <strong>{reportCount.toLocaleString()}</strong>건
        </span>
        <Link
          href={`/admin/community/reports?targetId=${encodeURIComponent(postId)}`}
          className="font-medium text-sky-800 hover:underline"
        >
          신고 처리함에서 보기
        </Link>
      </div>
      <h3 className="text-[13px] font-semibold text-sam-fg">조치 기록</h3>
      {state === "loading" ? <AdminLoadingState ko /> : null}
      {state === "error" && err ? (
        <AdminErrorState ko code={err.code} httpStatus={err.status} onRetry={() => setRetry((n) => n + 1)} />
      ) : null}
      {state === "unavailable" ? (
        <p className="text-[13px] text-sam-muted">조치 기록을 지금은 불러올 수 없습니다. 아래 요약 카드의 마지막 조치를 확인하세요.</p>
      ) : null}
      {state === "ready" && rows ? (
        <CommunityTimeline
          items={rows.map((r) => ({
            id: String(r.id),
            at: r.createdAt,
            actor: r.actorNickname?.trim() || "관리자",
            action: communityAuditActionLabel(r.action),
            reason: r.reason ?? null,
          }))}
        />
      ) : null}
    </div>
  );
}
