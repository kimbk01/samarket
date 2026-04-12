"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminAuditJsonViewer } from "./AdminAuditJsonViewer";

type AuditDetailLog = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string;
  target_id: string | null;
  action: string;
  before_json: unknown;
  after_json: unknown;
  ip: string | null;
  user_agent?: string | null;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  product: "상품",
  user: "회원",
  chat: "채팅",
  report: "신고",
  review: "리뷰",
  setting: "설정",
  auth: "관리자 인증",
  user_settings: "내 설정",
  store_order: "주문",
};

function getRelatedHref(log: AuditDetailLog): string | null {
  switch (log.target_type) {
    case "product":
      return log.target_id ? `/admin/products/${log.target_id}` : null;
    case "user":
    case "user_settings":
      return log.target_id ? `/admin/users/${log.target_id}` : null;
    case "chat":
      return log.target_id ? `/admin/chats/${log.target_id}` : null;
    case "report":
      return log.target_id ? `/admin/reports/${log.target_id}` : null;
    case "review":
      return log.target_id ? `/admin/reviews/${log.target_id}` : null;
    case "setting":
      return "/admin/settings";
    case "store_order":
      return "/admin/orders";
    default:
      return null;
  }
}

interface AdminAuditDetailPageProps {
  logId: string;
}

export function AdminAuditDetailPage({ logId }: AdminAuditDetailPageProps) {
  const [log, setLog] = useState<AuditDetailLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/audit-logs/${encodeURIComponent(logId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          log?: AuditDetailLog;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json?.ok || !json.log) {
          setError(json?.error ?? "not_found");
          setLog(null);
          return;
        }
        setError(null);
        setLog(json.log);
      } catch {
        if (!cancelled) {
          setError("network_error");
          setLog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logId]);

  const relatedHref = log ? getRelatedHref(log) : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="로그 상세" backHref="/admin/audit-logs" />
      {loading ? (
        <div className="py-8 text-center text-[14px] text-sam-muted">불러오는 중…</div>
      ) : null}
      {!loading && error ? (
        <div className="rounded-ui-rect border border-red-100 bg-red-50 px-4 py-5 text-[14px] text-red-700">
          로그를 불러오지 못했습니다.
        </div>
      ) : null}
      {!loading && !error && !log ? (
        <div className="py-8 text-center text-[14px] text-sam-muted">로그를 찾을 수 없습니다.</div>
      ) : null}
      {log ? (
        <>

      <AdminCard title="기본 정보">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd className="font-medium text-sam-fg">{log.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">유형</dt>
            <dd>{CATEGORY_LABELS[log.target_type] ?? log.target_type}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">액션</dt>
            <dd>{log.action}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">행위자</dt>
            <dd>{log.actor_id ? `${log.actor_type} (${log.actor_id})` : log.actor_type}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">대상</dt>
            <dd>{log.target_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">IP</dt>
            <dd className="text-sam-fg">{log.ip ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">일시</dt>
            <dd>{new Date(log.created_at).toLocaleString("ko-KR")}</dd>
          </div>
          {log.user_agent ? (
            <div>
              <dt className="text-sam-muted">User-Agent</dt>
              <dd className="break-all text-sam-fg">{log.user_agent}</dd>
            </div>
          ) : null}
        </dl>
      </AdminCard>

      {(log.before_json !== undefined || log.after_json !== undefined) && (
        <AdminCard title="변경 데이터">
          <div className="space-y-3">
            <AdminAuditJsonViewer label="변경 전" data={log.before_json} />
            <AdminAuditJsonViewer label="변경 후" data={log.after_json} />
          </div>
        </AdminCard>
      )}

      {relatedHref && (
        <AdminCard title="관련 화면">
          <Link
            href={relatedHref}
            className="text-[14px] font-medium text-signature hover:underline"
          >
            관련 관리 화면으로 이동
          </Link>
        </AdminCard>
      )}
        </>
      ) : null}
    </div>
  );
}
