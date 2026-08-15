"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";

type Row = Record<string, unknown>;

type ChatSummaryPayload = {
  ok?: boolean;
  meeting_title?: string;
  main_chat_room_id?: string | null;
  extra_room_count?: number;
  private_room_count?: number;
  total_linked_rooms?: number;
  schema_note?: string | null;
  rooms?: Array<{
    room_id: string;
    role: string;
    meeting_chat_room_id?: string | null;
    title: string | null;
    is_private: boolean;
    is_readonly?: boolean | null;
    is_locked?: boolean | null;
    is_blocked?: boolean | null;
    message_count: number;
    hidden_message_count: number;
    report_count: number;
    last_message_at: string | null;
  }>;
  error?: string;
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminCommunityEngineMeetingsClient() {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const emptyCell = t("admin_users_empty_placeholder");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insightId, setInsightId] = useState<string | null>(null);
  const [insight, setInsight] = useState<ChatSummaryPayload | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErr, setInsightErr] = useState("");
  const [roomBusyKey, setRoomBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/admin/community/engine/meetings?limit=60", { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; meetings?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_meeting_engine_err_load"));
        setRows([]);
        return;
      }
      setRows(j.meetings ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadInsight = async (id: string) => {
    if (insightId === id) {
      setInsightId(null);
      setInsight(null);
      setInsightErr("");
      return;
    }
    setInsightId(id);
    setInsightLoading(true);
    setInsightErr("");
    setInsight(null);
    try {
      const res = await fetch(`/api/admin/community/engine/meetings/${encodeURIComponent(id)}/chat-summary`, {
        cache: "no-store",
      });
      const j = (await res.json()) as ChatSummaryPayload;
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? t("admin_meeting_engine_err_insight"));
        return;
      }
      setInsight(j);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setInsightLoading(false);
    }
  };

  const refetchInsight = async (meetingId: string) => {
    if (!meetingId) return;
    setInsightLoading(true);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/community/engine/meetings/${encodeURIComponent(meetingId)}/chat-summary`, {
        cache: "no-store",
      });
      const j = (await res.json()) as ChatSummaryPayload;
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? t("admin_meeting_engine_err_insight_refresh"));
        return;
      }
      setInsight(j);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setInsightLoading(false);
    }
  };

  const postRoomAction = async (meetingId: string, roomId: string, action: string) => {
    const key = `${meetingId}:${roomId}:${action}`;
    setRoomBusyKey(key);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? t("admin_meeting_engine_err_chat_action"));
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const bulkHideRoomMessages = async (meetingId: string, roomId: string) => {
    if (!(await dibayConfirm({ title: t("admin_meeting_engine_confirm_bulk_hide"), confirmTone: "destructive" }))) return;
    setRoomBusyKey(`${meetingId}:bulkhide:${roomId}`);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/messages/bulk-hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: t("admin_meeting_engine_reason_bulk_hide") }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; hidden_count?: number };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? t("admin_meeting_engine_err_bulk_hide"));
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const bulkUnhideRoomMessages = async (meetingId: string, roomId: string) => {
    if (!(await dibayConfirm({ title: t("admin_meeting_engine_confirm_bulk_unhide") }))) return;
    setRoomBusyKey(`${meetingId}:bulkunhide:${roomId}`);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/messages/bulk-unhide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: t("admin_meeting_engine_reason_bulk_unhide") }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; unhidden_count?: number };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? t("admin_meeting_engine_err_bulk_unhide"));
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const deleteExtraMeetingChat = async (meetingId: string, mcrId: string) => {
    if (!(await dibayConfirm({ title: t("admin_meeting_engine_confirm_delete_extra"), confirmTone: "destructive" }))) return;
    setRoomBusyKey(`${meetingId}:del:${mcrId}`);
    setInsightErr("");
    try {
      const res = await fetch(
        `/api/admin/community/engine/meetings/${encodeURIComponent(meetingId)}/meeting-chat-rooms/${encodeURIComponent(mcrId)}`,
        { method: "DELETE" },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? t("admin_meeting_engine_err_delete"));
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const patch = async (
    id: string,
    body: {
      status?: string;
      maxMembers?: number;
      platformApprovalStatus?: string;
      postStatus?: string;
      postHidden?: boolean;
      isClosed?: boolean;
    }
  ) => {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/community/engine/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setErr(j.error ?? t("admin_meeting_engine_err_generic"));
      else await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary"
      >
        {t("admin_meeting_engine_refresh")}
      </button>
      {err ? <p className="sam-text-body-secondary text-red-600">{err}</p> : null}
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="min-w-full text-left sam-text-helper text-sam-fg">
          <thead className="bg-sam-app sam-text-xxs uppercase text-sam-muted">
            <tr>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_title")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_status")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_platform_approval")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_entry")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_visibility")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_capacity")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_reports")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_chat_room")}</th>
              <th className="px-2 py-2">{t("admin_meeting_engine_col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = String(r.id ?? "");
              const isSample = r.is_sample_data === true;
              const ep = String(r.entry_policy ?? r.join_policy ?? "open");
              const approval = String(r.platform_approval_status ?? "pending_approval");
              const postStatus = String(r.post_status ?? "active");
              const reportCount = Number(r.meeting_report_count ?? 0) + Number(r.post_report_count ?? 0);
              const entryLabel =
                ep === "approve"
                  ? t("admin_meeting_engine_entry_approve")
                  : ep === "invite_only"
                    ? t("admin_meeting_engine_entry_invite")
                    : ep === "password"
                      ? t("admin_meeting_engine_entry_password")
                      : t("admin_meeting_engine_entry_open");
              return (
                <Fragment key={id}>
                  <tr className="border-t border-sam-border-soft">
                    <td className="max-w-[180px] truncate px-2 py-2">
                      {String(r.title ?? "")}
                      {isSample ? (
                        <span
                          className="ml-1 rounded bg-signature/10 px-1 py-0.5 sam-text-xxs text-sam-fg"
                          title={t("admin_meeting_engine_sample_title")}
                        >
                          {t("admin_meeting_engine_sample_badge")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{String(r.status ?? "")}</td>
                    <td className="px-2 py-2">
                      {approval === "approved"
                        ? t("admin_meeting_engine_approval_approved")
                        : approval === "rejected"
                          ? t("admin_meeting_engine_approval_rejected")
                          : t("admin_meeting_engine_approval_pending")}
                    </td>
                    <td className="px-2 py-2 sam-text-xxs text-sam-fg">
                      {entryLabel}
                      {ep === "password" && r.has_password ? (
                        <span className="ml-1 text-emerald-700">{t("admin_meeting_engine_password_set")}</span>
                      ) : null}
                      {ep === "password" && !r.has_password ? (
                        <span className="ml-1 text-amber-700">{t("admin_meeting_engine_password_missing")}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {postStatus === "hidden" || r.post_hidden === true
                        ? t("admin_meeting_engine_visibility_hidden")
                        : t("admin_meeting_engine_visibility_visible")}
                    </td>
                    <td className="px-2 py-2">{String(r.max_members ?? "")}</td>
                    <td className="px-2 py-2">
                      {reportCount > 0 ? (
                        <Link href="/admin/philife/meeting-reports" className="text-red-700 underline">
                          {t("admin_meeting_engine_report_count", { count: reportCount })}
                        </Link>
                      ) : (
                        t("admin_meeting_engine_report_count", { count: 0 })
                      )}
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-2 font-mono sam-text-xxs">
                      {r.community_messenger_room_id != null
                        ? String(r.community_messenger_room_id)
                        : r.chat_room_id != null
                          ? String(r.chat_room_id)
                          : emptyCell}
                    </td>
                    <td className="flex flex-wrap gap-1 px-2 py-2">
                      <button
                        type="button"
                        disabled={insightLoading}
                        className={`rounded px-2 py-0.5 ${insightId === id ? "bg-signature/20" : "bg-signature/5"}`}
                        onClick={() => void loadInsight(id)}
                      >
                        {insightId === id ? t("admin_meeting_engine_insight_close") : t("admin_meeting_engine_insight_open")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-emerald-100 px-2 py-0.5"
                        onClick={() =>
                          void patch(id, {
                            platformApprovalStatus: "approved",
                            postStatus: "active",
                            postHidden: false,
                          })
                        }
                      >
                        {t("admin_meeting_engine_action_approve")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-amber-100 px-2 py-0.5"
                        onClick={() =>
                          void patch(id, {
                            platformApprovalStatus: "rejected",
                            postStatus: "hidden",
                            postHidden: true,
                          })
                        }
                      >
                        {t("admin_meeting_engine_action_reject")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-sam-surface-muted px-2 py-0.5"
                        onClick={() => void patch(id, { postStatus: "hidden", postHidden: true })}
                      >
                        {t("admin_meeting_engine_action_hide")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-sky-100 px-2 py-0.5"
                        onClick={() => void patch(id, { postStatus: "active", postHidden: false })}
                      >
                        {t("admin_meeting_engine_action_show")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-red-100 px-2 py-0.5"
                        onClick={() => void patch(id, { status: "ended", isClosed: true })}
                      >
                        {t("admin_meeting_engine_action_force_end")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-sky-100 px-2 py-0.5"
                        onClick={() => void patch(id, { status: "open", isClosed: false })}
                      >
                        {t("admin_meeting_engine_action_reopen")}
                      </button>
                    </td>
                  </tr>
                  {insightId === id ? (
                    <tr className="border-t border-sam-border bg-signature/5">
                      <td colSpan={9} className="px-3 py-3 sam-text-helper text-sam-fg">
                        {insightLoading ? (
                          <p className="text-sam-muted">{t("common_loading")}</p>
                        ) : insightErr ? (
                          <p className="text-red-600">{insightErr}</p>
                        ) : insight ? (
                          <div className="space-y-2">
                            <p className="font-semibold text-sam-fg">{t("admin_meeting_engine_insight_title")}</p>
                            <p className="sam-text-xxs text-sam-muted">
                              {t("admin_meeting_engine_insight_stats", {
                                linked: insight.total_linked_rooms ?? 0,
                                extra: insight.extra_room_count ?? 0,
                                priv: insight.private_room_count ?? 0,
                              })}
                            </p>
                            {insight.schema_note ? (
                              <p className="sam-text-xxs text-amber-800">{insight.schema_note}</p>
                            ) : null}
                            <ul className="space-y-1.5 border-t border-sam-border pt-2">
                              {(insight.rooms ?? []).map((room) => {
                                const mid = insightId ?? "";
                                const ro = room.is_readonly === true;
                                const lk = room.is_locked === true;
                                const blk = room.is_blocked === true;
                                const mcr = room.meeting_chat_room_id ?? null;
                                const isExtra = room.role !== "main" && !!mcr;
                                const lastAt =
                                  room.last_message_at != null
                                    ? new Date(room.last_message_at).toLocaleString(dateLocale)
                                    : "";
                                return (
                                  <li
                                    key={room.room_id}
                                    className="flex flex-col gap-2 rounded border border-sam-surface/80 bg-sam-surface/90 px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
                                  >
                                    <div className="min-w-0">
                                      <span className="font-medium">
                                        {room.title ?? room.room_id.slice(0, 8)}
                                      </span>
                                      <span className="ml-2 sam-text-xxs text-sam-muted">
                                        {room.role === "main" ? t("admin_meeting_engine_room_main") : t("admin_meeting_engine_room_extra")}
                                        {room.is_private ? t("admin_meeting_engine_room_private") : ""}
                                        {ro ? t("admin_meeting_engine_room_readonly") : ""}
                                        {lk ? t("admin_meeting_engine_room_locked") : ""}
                                        {blk ? t("admin_meeting_engine_room_blocked") : ""}
                                      </span>
                                      <div className="mt-0.5 font-mono sam-text-xxs text-sam-meta">{room.room_id}</div>
                                    </div>
                                    <div className="shrink-0 sam-text-xxs text-sam-muted">
                                      <div className="text-right">
                                        {t("admin_meeting_engine_room_msg_stats", {
                                          messages: room.message_count,
                                          hidden: room.hidden_message_count,
                                          reports: room.report_count,
                                        })}
                                        {room.last_message_at ? (
                                          <div className="sam-text-xxs text-sam-meta">
                                            {t("admin_meeting_engine_room_last", { at: lastAt })}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 flex flex-wrap justify-end gap-1">
                                        <Link
                                          href={`/admin/chats/${encodeURIComponent(room.room_id)}`}
                                          className="rounded bg-signature/5 px-2 py-0.5 text-sam-fg underline-offset-2 hover:underline"
                                        >
                                          {t("admin_meeting_engine_open_admin_chat")}
                                        </Link>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-orange-50 px-2 py-0.5 text-orange-900"
                                          onClick={() => void bulkHideRoomMessages(mid, room.room_id)}
                                        >
                                          {t("admin_meeting_engine_bulk_hide_msgs")}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-lime-50 px-2 py-0.5 text-lime-900"
                                          onClick={() => void bulkUnhideRoomMessages(mid, room.room_id)}
                                        >
                                          {t("admin_meeting_engine_bulk_unhide_msgs")}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-amber-50 px-2 py-0.5 text-amber-900"
                                          onClick={() =>
                                            void postRoomAction(mid, room.room_id, ro ? "readonly_off" : "readonly_on")
                                          }
                                        >
                                          {ro ? t("admin_meeting_engine_readonly_off") : t("admin_meeting_engine_readonly_on")}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg"
                                          onClick={() =>
                                            void postRoomAction(mid, room.room_id, lk ? "unarchive_room" : "archive_room")
                                          }
                                        >
                                          {lk ? t("admin_meeting_engine_lock_off") : t("admin_meeting_engine_lock_on")}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-rose-50 px-2 py-0.5 text-rose-900"
                                          onClick={() =>
                                            void postRoomAction(mid, room.room_id, blk ? "unblock_room" : "block_room")
                                          }
                                        >
                                          {blk ? t("admin_meeting_engine_block_off") : t("admin_meeting_engine_block_on")}
                                        </button>
                                        {isExtra ? (
                                          <button
                                            type="button"
                                            disabled={!!roomBusyKey || insightLoading}
                                            className="rounded bg-red-50 px-2 py-0.5 text-red-800"
                                            onClick={() => void deleteExtraMeetingChat(mid, mcr!)}
                                          >
                                            {t("admin_meeting_engine_delete_extra_room")}
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                            {(insight.rooms ?? []).length === 0 ? (
                              <p className="sam-text-xxs text-sam-muted">{t("admin_meeting_engine_no_linked_rooms")}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
