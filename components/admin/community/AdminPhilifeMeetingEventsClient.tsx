"use client";

/**
 * 모임 운영 로그 (설계 §C-9). 필터(모임·유형·페이지)는 URL 에 둔다 → 새로고침·복귀 시 유지.
 * 열: 시각(상대 + PHT) · 모임(Admin 모임 화면 링크) · 행위자 · 대상 회원 · 유형 · 내용.
 * 모임 이름 검색은 서버가 아직 지원하지 않아, 모임 목록의 「운영 로그」 링크(meetingId)로 좁힌다.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MEETING_EVENT_TYPES,
  MEETING_EVENT_TYPE_LABEL_KEYS,
  formatMeetingEventDescription,
  isMeetingEventType,
} from "@/lib/neighborhood/meeting-event-format";
import type { AdminMeetingEventRow } from "@/lib/neighborhood/types";
import { philifeAppPaths } from "@domain/philife/paths";
import {
  COMMUNITY_TD,
  CommunityAuthorCell,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityResetFilters,
  CommunitySelect,
  CommunityTable,
  CommunityTimeCell,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { communityJsonFetch } from "@/components/admin/community/posts/community-post-admin-shared";

const PAGE = 50;

export function AdminPhilifeMeetingEventsClient() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const { get, set, reset, page } = useCommunityQueryState();
  const meetingId = get("meetingId").trim();
  const typeFilter = get("type");

  const [events, setEvents] = useState<AdminMeetingEventRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const buildQuery = useCallback(
    (extra: Record<string, string>) => {
      const sp = new URLSearchParams(extra);
      if (meetingId) sp.set("meetingId", meetingId);
      if (typeFilter) sp.set("type", typeFilter);
      return sp.toString();
    },
    [meetingId, typeFilter]
  );

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      const r = await communityJsonFetch<{ events?: AdminMeetingEventRow[]; hasMore?: boolean }>(
        `/api/admin/meeting-events?${buildQuery({ limit: String(PAGE), offset: String((page - 1) * PAGE) })}`
      );
      if (cancel) return;
      if (r.ok) {
        setEvents(r.json.events ?? []);
        setHasMore(r.json.hasMore === true);
        setLoadErr(null);
      } else {
        setEvents([]);
        setHasMore(false);
        setLoadErr({ code: r.code, status: r.status });
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [buildQuery, page, reloadKey]);

  const meetingTitle = meetingId ? events.find((e) => e.meeting_id === meetingId)?.meeting_title?.trim() || "선택한 모임" : "";

  let body: ReactNode;
  if (loading) body = <AdminLoadingState ko={ko} />;
  else if (loadErr) body = <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={reload} />;
  else if (events.length === 0) body = <AdminEmptyState ko={ko} message={t("admin_meeting_events_empty")} />;
  else
    body = (
      <CommunityTable head={["시각", "모임", "행위자", "대상 회원", "유형", "내용"]}>
        {events.map((e) => {
          const typeLabel = isMeetingEventType(e.event_type) ? t(MEETING_EVENT_TYPE_LABEL_KEYS[e.event_type]) : "기타";
          return (
            <tr key={e.id} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={e.created_at} />
              </td>
              <td className={`${COMMUNITY_TD} max-w-[14rem]`}>
                <button
                  type="button"
                  className="line-clamp-2 text-left font-medium text-sam-fg hover:underline"
                  title="이 모임 기록만 보기"
                  onClick={() => set({ meetingId: e.meeting_id })}
                >
                  {e.meeting_title || "이름 없음"}
                </button>
                <span className="flex flex-wrap gap-2 text-[12px]">
                  <Link
                    href={`/admin/community/meetings?meetingId=${encodeURIComponent(e.meeting_id)}`}
                    className="text-sky-800 hover:underline"
                  >
                    Admin 모임 화면
                  </Link>
                  <Link href={philifeAppPaths.meeting(e.meeting_id)} target="_blank" rel="noreferrer" className="text-sky-800 hover:underline">
                    {t("admin_meeting_events_meeting_detail")}
                  </Link>
                </span>
              </td>
              <td className={COMMUNITY_TD}>
                {e.actor_user_id ? (
                  <CommunityAuthorCell userId={e.actor_user_id} nickname={e.actor_name} />
                ) : (
                  <span className="text-sam-muted">{e.actor_name || "시스템"}</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                {e.target_user_id ? (
                  <CommunityAuthorCell userId={e.target_user_id} nickname={e.target_name} />
                ) : (
                  <span className="text-sam-muted">—</span>
                )}
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{typeLabel}</td>
              <td className={`${COMMUNITY_TD} max-w-[min(480px,50vw)]`}>{formatMeetingEventDescription(e, t)}</td>
            </tr>
          );
        })}
      </CommunityTable>
    );

  return (
    <CommunityListShell
      title={t("admin_meeting_events_page_title")}
      description="모임 안에서 일어난 가입·강퇴·설정 변경 등 운영 기록을 확인합니다."
      actions={
        <>
          <AdminActionLink href="/admin/community/meetings" variant="neutral">
            모임 목록
          </AdminActionLink>
          <AdminActionButton
            variant="neutral"
            onClick={() => window.location.assign(`/api/admin/meeting-events?${buildQuery({ format: "csv", limit: "500", offset: "0" })}`)}
          >
            {t("admin_meeting_events_csv")}
          </AdminActionButton>
          <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
            새로고침
          </AdminActionButton>
        </>
      }
      filters={
        <>
          <CommunityFilterField label={t("admin_meeting_events_type_label")}>
            <CommunitySelect
              value={typeFilter}
              onChange={(v) => set({ type: v })}
              options={[
                { value: "", label: "전체 유형" },
                ...MEETING_EVENT_TYPES.map((ev) => ({ value: ev, label: t(MEETING_EVENT_TYPE_LABEL_KEYS[ev]) })),
              ]}
            />
          </CommunityFilterField>
          {meetingId ? (
            <span className="flex items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 py-1 text-[12px] text-sam-fg">
              모임: {meetingTitle}
              <button type="button" className="ml-1 text-sam-muted underline" onClick={() => set({ meetingId: null })}>
                해제
              </button>
            </span>
          ) : (
            <span className="pb-1.5 text-[12px] text-sam-muted">모임 이름을 누르면 그 모임 기록만 봅니다.</span>
          )}
          {meetingId || typeFilter ? <CommunityResetFilters onReset={() => reset()} /> : null}
        </>
      }
      footer={
        !loading && !loadErr && (events.length > 0 || page > 1) ? (
          <CommunityPagination
            page={page}
            pageSize={PAGE}
            total={hasMore ? null : (page - 1) * PAGE + events.length}
            onPage={(p) => set({ page: p > 1 ? p : null }, { keepPage: true })}
          />
        ) : null
      }
    >
      {body}
    </CommunityListShell>
  );
}
