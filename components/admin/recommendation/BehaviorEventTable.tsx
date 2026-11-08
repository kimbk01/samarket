"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useState, useMemo } from "react";
import type { UserBehaviorEvent, BehaviorEventType } from "@/lib/types/recommendation";
import { getBehaviorEvents } from "@/lib/recommendation/recommendation-behavior-state";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const EVENT_LABEL_KEYS: Record<BehaviorEventType, MessageKey> = {
  product_view: "admin_rec_event_product_view",
  favorite_add: "admin_rec_event_favorite_add",
  favorite_remove: "admin_rec_event_favorite_remove",
  chat_start: "admin_rec_event_chat_start",
  search_submit: "admin_rec_event_search_submit",
  home_section_click: "admin_rec_event_home_section_click",
  recommendation_click: "admin_rec_event_recommendation_click",
  shop_view: "admin_rec_event_shop_view",
};

export function BehaviorEventTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /**
   * 필터 — 주소 보존 (R7): `?status=`(이벤트 유형) · `?q=`(userId) · `?section=`(sectionKey).
   * 유형은 즉시 적용, userId·sectionKey 는 [조회]/Enter 로 적용.
   */
  const lq = useAdminListQuery<"section">({
    statuses: Object.keys(EVENT_LABEL_KEYS),
    extras: ["section"],
  });
  const eventType = lq.query.status as BehaviorEventType | "";
  const userIdFilter = lq.query.q;
  const sectionKeyFilter = lq.query.extras.section;
  const [sectionDraft, setSectionDraft] = useState<{ applied: string; value: string }>({
    applied: sectionKeyFilter,
    value: sectionKeyFilter,
  });
  // 주소의 sectionKey 가 바뀌면(초기화·뒤로가기) 입력값을 다시 맞춘다
  let sectionInput = sectionDraft.value;
  if (sectionDraft.applied !== sectionKeyFilter) {
    sectionInput = sectionKeyFilter;
    setSectionDraft({ applied: sectionKeyFilter, value: sectionKeyFilter });
  }

  const events = useMemo(
    () =>
      getBehaviorEvents({
        userId: userIdFilter.trim() || undefined,
        eventType: eventType || undefined,
        sectionKey: sectionKeyFilter.trim() || undefined,
      }),
    [eventType, userIdFilter, sectionKeyFilter]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={() => lq.patch({ q: lq.draft.q, extras: { section: sectionInput.trim() } })}
        onReset={lq.reset}
        showPeriod={false}
        searchPlaceholder="userId"
        status={{
          value: eventType,
          onChange: lq.setStatus,
          label: t("admin_event"),
          options: (Object.keys(EVENT_LABEL_KEYS) as BehaviorEventType[]).map((k) => ({ value: k, label: t(EVENT_LABEL_KEYS[k]) })),
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          sectionKey
          <input
            type="text"
            value={sectionInput}
            onChange={(e) => setSectionDraft({ applied: sectionKeyFilter, value: e.target.value })}
            className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
            name="section"
          />
        </label>
      </AdminFilterBar>
      {events.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={eventType || userIdFilter || sectionKeyFilter ? undefined : t("admin_rec_no_events")}
          onReset={eventType || userIdFilter || sectionKeyFilter ? lq.reset : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_recommendation_col_time")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_recommendation_col_user")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_recommendation_col_event")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  productId
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  sectionKey
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  query
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(e.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">{e.userId}</td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {t(EVENT_LABEL_KEYS[e.eventType])}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">{e.productId ?? "-"}</td>
                  <td className="px-3 py-2.5 text-sam-muted">{e.sectionKey ?? "-"}</td>
                  <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                    {e.query ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
