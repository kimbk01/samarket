"use client";

/**
 * 게시글 신고·조치 기록 (설계 §C-0-1 ② 관련 기록). 운영 기록 API 가 아직 없으면(404) 신고 처리함 링크만 보여 준다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
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

const ACTION_KEY: Record<string, MessageKey> = {
  "community_post.status_hidden": "admin_community_postrec_action_hidden",
  "community_post.status_deleted": "admin_community_postrec_action_deleted",
  "community_post.status_active": "admin_community_postrec_action_active",
  "community_post.content_update": "admin_community_postrec_action_content_update",
  "community_post.update": "admin_community_postrec_action_update",
  "community_post.pin": "admin_community_postrec_action_pin",
  "community_post.unpin": "admin_community_postrec_action_unpin",
  "community_post.hard_delete": "admin_community_postrec_action_hard_delete",
  "community_notice.create": "admin_community_postrec_action_notice_create",
  "community_notice.end": "admin_community_postrec_action_notice_end",
  "community_notice.update": "admin_community_postrec_action_notice_update",
};

/** `lang` 생략 시 한국어. */
export function communityAuditActionLabel(action: string, lang: string = "ko"): string {
  return translateBy(lang, ACTION_KEY[action] ?? "admin_community_postrec_action_other");
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
  const { t, language } = useI18n();
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
          {t("admin_community_postrec_reports_received")} <strong>{t("admin_count_items", { n: formatAdminNumber(reportCount) })}</strong>
        </span>
        <Link
          href={`/admin/community/reports?targetId=${encodeURIComponent(postId)}`}
          className="font-medium text-sam-info hover:underline"
        >
          {t("admin_community_postrec_view_in_reports")}
        </Link>
      </div>
      <h3 className="text-[13px] font-semibold text-sam-fg">{t("admin_community_postrec_title")}</h3>
      {state === "loading" ? <AdminLoadingState ko /> : null}
      {state === "error" && err ? (
        <AdminErrorState ko code={err.code} httpStatus={err.status} onRetry={() => setRetry((n) => n + 1)} />
      ) : null}
      {state === "unavailable" ? (
        <p className="text-[13px] text-sam-muted">{t("admin_community_postrec_unavailable")}</p>
      ) : null}
      {state === "ready" && rows ? (
        <CommunityTimeline
          items={rows.map((r) => ({
            id: String(r.id),
            at: r.createdAt,
            actor: r.actorNickname?.trim() || t("admin_community_postrec_admin"),
            action: communityAuditActionLabel(r.action, language),
            reason: r.reason ?? null,
          }))}
        />
      ) : null}
    </div>
  );
}
