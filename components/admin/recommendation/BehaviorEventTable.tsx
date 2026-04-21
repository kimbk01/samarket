"use client";

import { useState, useMemo } from "react";
import type { UserBehaviorEvent, BehaviorEventType } from "@/lib/types/recommendation";
import { getBehaviorEvents } from "@/lib/recommendation/mock-user-behavior-events";

const EVENT_LABELS: Record<BehaviorEventType, string> = {
  product_view: "상품 조회",
  favorite_add: "찜 추가",
  favorite_remove: "찜 해제",
  chat_start: "채팅 시작",
  search_submit: "검색 실행",
  home_section_click: "홈 섹션 클릭",
  recommendation_click: "추천 상품 클릭",
  shop_view: "상점 조회",
};

export function BehaviorEventTable() {
  const [eventType, setEventType] = useState<BehaviorEventType | "">("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [sectionKeyFilter, setSectionKeyFilter] = useState("");

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
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="userId"
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as BehaviorEventType | "")}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">전체</option>
          {(Object.keys(EVENT_LABELS) as BehaviorEventType[]).map((k) => (
            <option key={k} value={k}>
              {EVENT_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="sectionKey"
          value={sectionKeyFilter}
          onChange={(e) => setSectionKeyFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      {events.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          이벤트가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  사용자
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  이벤트
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
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">{e.userId}</td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {EVENT_LABELS[e.eventType]}
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
