"use client";

/**
 * HS-07 — 매장 운영 상세 「추천 매장」 설정 (`stores.is_featured` + 기간 `featured_start_at`/`featured_end_at`).
 * 저장 = 기존 관리자 매장 PATCH `set_store_featured` (감사 기록·캐시 무효화는 서버 auditOk).
 * 확인 단계: 지정 = 노출 켜기와 같은 L2(사유), 해제 = L1.
 */
import { useEffect, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import {
  isoToManilaDateInput,
  manilaDateInputToIso,
} from "@/lib/admin-business/admin-store-featured";

export type AdminStoreFeaturedState = {
  isFeatured: boolean;
  startAt: string | null;
  endAt: string | null;
};

export function AdminStoreFeaturedEditor({
  ko,
  storeName,
  featured,
  busy,
  onRunAction,
}: {
  ko: boolean;
  storeName: string;
  featured: AdminStoreFeaturedState;
  busy: boolean;
  onRunAction: (action: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [from, setFrom] = useState(() => isoToManilaDateInput(featured.startAt));
  const [to, setTo] = useState(() => isoToManilaDateInput(featured.endAt));
  useEffect(() => {
    setFrom(isoToManilaDateInput(featured.startAt));
    setTo(isoToManilaDateInput(featured.endAt));
  }, [featured.startAt, featured.endAt]);

  const periodLabel =
    featured.startAt || featured.endAt
      ? `${featured.startAt ? formatAdminManilaDate(featured.startAt) : ko ? "제한 없음" : "Any"} ~ ${
          featured.endAt ? formatAdminManilaDate(featured.endAt) : ko ? "제한 없음" : "Any"
        }`
      : ko
        ? "기간 제한 없음"
        : "No period";

  const save = async (enable: boolean) => {
    const label = enable ? (ko ? "추천 매장 지정" : "Set featured") : ko ? "추천 매장 해제" : "Unset featured";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(enable ? "exposeStart" : "exposeStop"),
      ko,
      title: `${storeName.trim() || "—"} · ${label}`,
      description: enable
        ? ko
          ? `기간: ${from || "제한 없음"} ~ ${to || "제한 없음"} (필리핀 시간)`
          : `Period: ${from || "any"} ~ ${to || "any"} (PHT)`
        : undefined,
      confirmLabel: label,
    });
    if (!confirmed.ok) return;
    await onRunAction("set_store_featured", {
      enabled: enable,
      ...(enable
        ? {
            featured_start_at: from ? manilaDateInputToIso(from, "start") : null,
            featured_end_at: to ? manilaDateInputToIso(to, "end") : null,
          }
        : {}),
      ...(confirmed.reason ? { reason: confirmed.reason } : {}),
    });
  };

  return (
    <div className="space-y-3" data-admin-store-featured-editor="1">
      <div className="flex flex-wrap items-center gap-2">
        <AdminToneBadge tone={featured.isFeatured ? "progress" : "neutral"}>
          {featured.isFeatured ? (ko ? "추천 매장" : "Featured") : ko ? "추천 아님" : "Not featured"}
        </AdminToneBadge>
        {featured.isFeatured ? <span className="sam-text-helper text-sam-muted">{periodLabel}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 sam-text-helper text-sam-muted">
          {ko ? "시작일" : "From"}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 sam-text-body text-sam-fg"
          />
        </label>
        <label className="inline-flex items-center gap-1 sam-text-helper text-sam-muted">
          {ko ? "종료일" : "To"}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 sam-text-body text-sam-fg"
          />
        </label>
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void save(true)}>
          {featured.isFeatured ? (ko ? "기간 저장" : "Save period") : ko ? "추천 매장 지정" : "Set featured"}
        </AdminActionButton>
        {featured.isFeatured ? (
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void save(false)}>
            {ko ? "추천 매장 해제" : "Unset featured"}
          </AdminActionButton>
        ) : null}
      </div>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "추천 매장은 고객 앱 「추천」 선반 후보가 됩니다. 기간을 정하면 그 기간 안에만 추천으로 노출됩니다(필리핀 시간). 기간이 비어 있으면 해제할 때까지 노출됩니다."
          : "Featured stores become candidates for the customer app's featured shelf. With a period set, they are featured only within that period (PHT). Without a period, they stay featured until unset."}
      </p>
    </div>
  );
}
