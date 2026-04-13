"use client";

import Link from "next/link";
import type {
  RecentProduct,
  RecentUser,
  RecentReport,
  RecentChat,
  RecentReview,
} from "@/lib/types/admin-dashboard";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  PRODUCT_STATUS_LABELS,
  REPORT_STATUS_LABELS,
} from "@/lib/admin-dashboard/admin-dashboard-utils";

interface AdminRecentActivityPanelsProps {
  products: RecentProduct[];
  users: RecentUser[];
  reports: RecentReport[];
  chats: RecentChat[];
  reviews: RecentReview[];
  loading?: boolean;
}

/** 서울은 일광절약 없음 — Node/브라우저 ICU 차이·SSR 시각 차로 인한 하이드레이션 불일치 방지 */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function seoulWallParts(ms: number) {
  const t = new Date(ms + SEOUL_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
  };
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 서버·클라이언트 동일 문자열 보장(하이드레이션 안전).
 * Date.now()·상대시각 분기 없음 — ISO만으로 서울 벽시계 M/D HH:mm.
 */
function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const ev = seoulWallParts(d.getTime());
    return `${ev.mo}/${ev.d} ${pad2(ev.h)}:${pad2(ev.mi)}`;
  } catch {
    return "-";
  }
}

export function AdminRecentActivityPanels({
  products,
  users,
  reports,
  chats,
  reviews,
  loading,
}: AdminRecentActivityPanelsProps) {
  const emptyLabel = loading ? "불러오는 중…" : "없음";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <AdminCard title="최근 등록 상품">
        <ul className="space-y-2">
          {products.length === 0 ? (
            <li className="text-[13px] text-sam-muted">{emptyLabel}</li>
          ) : (
            products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/products/${p.id}`}
                  className="block truncate text-[13px] text-sam-fg hover:text-signature"
                >
                  {p.title}
                </Link>
                <span className="text-[11px] text-sam-muted">
                  {PRODUCT_STATUS_LABELS[p.status] ?? p.status} · {formatDate(p.createdAt)}
                </span>
              </li>
            ))
          )}
        </ul>
        <Link
          href="/admin/products"
          className="mt-2 block text-[12px] text-signature hover:underline"
        >
          전체 →
        </Link>
      </AdminCard>

      <AdminCard title="최근 가입 회원">
        <ul className="space-y-2">
          {users.length === 0 ? (
            <li className="text-[13px] text-sam-muted">{emptyLabel}</li>
          ) : (
            users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="block truncate text-[13px] text-sam-fg hover:text-signature"
                >
                  {u.nickname}
                </Link>
                <span className="text-[11px] text-sam-muted">
                  {u.memberType} · {formatDate(u.joinedAt)}
                </span>
              </li>
            ))
          )}
        </ul>
        <Link
          href="/admin/users"
          className="mt-2 block text-[12px] text-signature hover:underline"
        >
          전체 →
        </Link>
      </AdminCard>

      <AdminCard title="최근 신고">
        <ul className="space-y-2">
          {reports.length === 0 ? (
            <li className="text-[13px] text-sam-muted">{emptyLabel}</li>
          ) : (
            reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/reports/${r.id}`}
                  className="block truncate text-[13px] text-sam-fg hover:text-signature"
                >
                  [{r.targetType}] {r.reasonLabel}
                </Link>
                <span className="text-[11px] text-sam-muted">
                  {REPORT_STATUS_LABELS[r.status] ?? r.status} · {formatDate(r.createdAt)}
                </span>
              </li>
            ))
          )}
        </ul>
        <Link
          href="/admin/reports"
          className="mt-2 block text-[12px] text-signature hover:underline"
        >
          전체 →
        </Link>
      </AdminCard>

      <AdminCard title="최근 채팅방">
        <ul className="space-y-2">
          {chats.length === 0 ? (
            <li className="text-[13px] text-sam-muted">{emptyLabel}</li>
          ) : (
            chats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/chats/${c.id}`}
                  className="block truncate text-[13px] text-sam-fg hover:text-signature"
                >
                  {c.productTitle}
                </Link>
                <span className="text-[11px] text-sam-muted">
                  {formatDate(c.lastMessageAt)}
                </span>
              </li>
            ))
          )}
        </ul>
        <Link
          href="/admin/chats"
          className="mt-2 block text-[12px] text-signature hover:underline"
        >
          전체 →
        </Link>
      </AdminCard>

      <AdminCard title="최근 리뷰">
        <ul className="space-y-2">
          {reviews.length === 0 ? (
            <li className="text-[13px] text-sam-muted">{emptyLabel}</li>
          ) : (
            reviews.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/reviews/${r.id}`}
                  className="block truncate text-[13px] text-sam-fg hover:text-signature"
                >
                  {r.reviewerNickname} → {r.targetNickname} ★{r.rating}
                </Link>
                <span className="text-[11px] text-sam-muted">
                  {formatDate(r.createdAt)}
                </span>
              </li>
            ))
          )}
        </ul>
        <Link
          href="/admin/reviews"
          className="mt-2 block text-[12px] text-signature hover:underline"
        >
          전체 →
        </Link>
      </AdminCard>
    </div>
  );
}
