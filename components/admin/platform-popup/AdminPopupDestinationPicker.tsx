"use client";

/**
 * 앱 진입 어드민 v3 §4 「누르면 이동」 (Owner 2026-11-17 「v3대로 진행」).
 * 칩: 이벤트 · 매장 · 거래 글 · 커뮤니티 글 · 앱 화면 · 외부 링크.
 * - 이벤트: 기존 이벤트 목록 API(`GET /api/admin/platform-events` 최근 200건)에서 제목으로 찾아 고른다.
 * - 매장: 기존 매장 고르기(`FeedAdStoreDestinationPicker` · 공개 매장만 · slug).
 * - 거래 글·커뮤니티 글: 찾기 API 가 없어 ID 입력 + 저장 전 확인(제목 · 공개 여부).
 * 고른 대상은 저장 전에 서버가 앱과 같은 공개 판정으로 확인한다(`destination-lookup`).
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { FeedAdStoreDestinationPicker } from "@/components/admin/feed-ads/FeedAdStoreDestinationPicker";
import type { MessageKey } from "@/lib/i18n/message-key";
import type { PlatformPopupAdminDestinationLookup } from "@/lib/platform-popup/admin-destination-lookup";

export type AdminPopupDestinationValue = { ctaType: string; ctaTarget: string; externalUrl: string };

const KINDS: ReadonlyArray<{ type: string; key: MessageKey }> = [
  { type: "event_detail", key: "admin_popup_v3_dest_event" },
  { type: "store", key: "admin_popup_v3_dest_store" },
  { type: "trade_listing", key: "admin_popup_v3_dest_trade" },
  { type: "community_post", key: "admin_popup_v3_dest_community" },
  { type: "internal_page", key: "admin_popup_v3_dest_page" },
  { type: "external_url", key: "admin_popup_v3_dest_external" },
];

type EventOpt = { id: string; title: string; status: string };

const INPUT = "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-sm text-sam-fg";

function lookupErrorKey(error: string | null): MessageKey {
  if (error === "target_deleted") return "admin_popup_v3_dest_deleted";
  if (error === "target_hidden") return "admin_popup_v3_dest_hidden";
  if (error === "target_expired") return "admin_popup_v3_dest_expired";
  return "admin_popup_v3_dest_invalid";
}

export function AdminPopupDestinationPicker({
  value,
  onChange,
  disabled,
}: {
  value: AdminPopupDestinationValue;
  onChange: (next: AdminPopupDestinationValue) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [events, setEvents] = useState<EventOpt[] | null>(null);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [eventQuery, setEventQuery] = useState("");
  const [lookup, setLookup] = useState<PlatformPopupAdminDestinationLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  /** 빌드 전 감사 A6: 확인 요청 자체가 실패(HTTP 오류·연결 끊김) — 「먼저 고르세요」가 아니라 오류로 보인다 */
  const [lookupFailed, setLookupFailed] = useState(false);

  const isEvent = value.ctaType === "event_detail";
  useEffect(() => {
    if (!isEvent || events) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/platform-events", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          events?: Array<{ id: string; title: string; status: string }>;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setEventsFailed(true);
          return;
        }
        setEvents((json.events ?? []).map((e) => ({ id: e.id, title: e.title, status: e.status })));
      } catch {
        if (!cancelled) setEventsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEvent, events]);

  const eventMatches = useMemo(() => {
    const q = eventQuery.trim().toLowerCase();
    return (events ?? []).filter((e) => !q || e.title.toLowerCase().includes(q) || e.id === q).slice(0, 30);
  }, [events, eventQuery]);

  // 저장 전 확인 — 앱과 같은 공개 판정 (입력 멈춘 뒤 0.4초)
  useEffect(() => {
    const hasTarget = value.ctaType === "external_url" ? value.externalUrl.trim() : value.ctaTarget.trim();
    if (!hasTarget) {
      // A6: 조회 중에 대상을 비우면 「확인 중」에서 멈추지 않게 함께 푼다
      setLookup(null);
      setLookupBusy(false);
      setLookupFailed(false);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      setLookupBusy(true);
      setLookupFailed(false);
      const qs = new URLSearchParams({
        ctaType: value.ctaType,
        ctaTarget: value.ctaTarget,
        externalUrl: value.externalUrl,
      });
      fetch(`/api/admin/platform-popup-campaigns/destination-lookup?${qs.toString()}`, { credentials: "same-origin" })
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<PlatformPopupAdminDestinationLookup>;
          if (cancelled) return;
          const ok = res.ok && json.ok;
          setLookup(ok ? (json as PlatformPopupAdminDestinationLookup) : null);
          setLookupFailed(!ok);
        })
        .catch(() => {
          if (cancelled) return;
          setLookup(null);
          setLookupFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLookupBusy(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [value.ctaType, value.ctaTarget, value.externalUrl]);

  const set = (patch: Partial<AdminPopupDestinationValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2" data-admin-popup-destination-picker="1">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <AdminChipButton
            key={k.type}
            selected={value.ctaType === k.type}
            disabled={disabled}
            onClick={() => {
              if (value.ctaType === k.type) return;
              onChange({ ctaType: k.type, ctaTarget: "", externalUrl: "" });
            }}
            data-admin-popup-dest-kind={k.type}
          >
            {t(k.key)}
          </AdminChipButton>
        ))}
      </div>

      {value.ctaType === "event_detail" ? (
        <div className="space-y-1">
          <input
            className={INPUT}
            placeholder={t("admin_popup_v3_dest_event_search")}
            value={eventQuery}
            disabled={disabled}
            onChange={(e) => setEventQuery(e.target.value)}
            data-admin-popup-event-search="1"
          />
          {eventsFailed ? <p className="text-xs text-sam-danger">{t("admin_popup_v3_dest_event_load_failed")}</p> : null}
          <ul className="max-h-44 space-y-1 overflow-y-auto">
            {eventMatches.map((e) => (
              <li key={e.id}>
                <AdminListItemButton
                  selected={value.ctaTarget === e.id}
                  disabled={disabled}
                  onClick={() => set({ ctaTarget: e.id, externalUrl: "" })}
                  className="flex items-center justify-between gap-2 border border-sam-border text-sm text-sam-fg"
                >
                  <span className="truncate">{e.title || e.id}</span>
                  <span className="shrink-0 text-xs text-sam-muted">
                    {t(e.status === "published" ? "admin_popup_v3_dest_event_published" : "admin_popup_v3_dest_event_not_published")}
                  </span>
                </AdminListItemButton>
              </li>
            ))}
            {events && eventMatches.length === 0 ? (
              <li className="text-xs text-sam-muted">{t("admin_popup_v3_dest_event_none")}</li>
            ) : null}
          </ul>
        </div>
      ) : value.ctaType === "store" ? (
        <FeedAdStoreDestinationPicker
          value={value.ctaTarget}
          disabled={disabled}
          onChange={(slug) => set({ ctaTarget: slug, externalUrl: "" })}
        />
      ) : value.ctaType === "external_url" ? (
        <label className="block text-sm">
          {t("admin_popup_v3_dest_external_label")}
          <input
            className={INPUT}
            value={value.externalUrl}
            disabled={disabled}
            placeholder="https://"
            onChange={(e) => set({ externalUrl: e.target.value, ctaTarget: "" })}
          />
        </label>
      ) : (
        <label className="block text-sm">
          {t(
            value.ctaType === "trade_listing"
              ? "admin_popup_v3_dest_trade_id"
              : value.ctaType === "community_post"
                ? "admin_popup_v3_dest_community_id"
                : "admin_popup_v3_dest_page_path"
          )}
          <input
            className={`${INPUT} ${value.ctaType === "internal_page" ? "" : "font-mono"}`}
            value={value.ctaTarget}
            disabled={disabled}
            placeholder={value.ctaType === "internal_page" ? "/market" : ""}
            onChange={(e) => set({ ctaTarget: e.target.value.trim(), externalUrl: "" })}
            data-admin-popup-dest-input="1"
          />
        </label>
      )}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-xs" data-admin-popup-dest-lookup={lookup ? (lookup.available ? "ok" : "fail") : lookupFailed ? "error" : "none"}>
        {lookupBusy ? (
          <span className="text-sam-muted">{t("admin_popup_v3_dest_checking")}</span>
        ) : lookupFailed ? (
          <span className="text-sam-danger">{t("admin_popup_v3_dest_lookup_failed")}</span>
        ) : !lookup ? (
          <span className="text-sam-muted">{t("admin_popup_v3_dest_pick_first")}</span>
        ) : lookup.available ? (
          <span className="text-sam-primary">
            ✓ {lookup.title ? t("admin_popup_v3_dest_ok_titled", { title: lookup.title }) : t("admin_popup_v3_dest_ok")}
            {lookup.href ? <span className="ml-1 font-mono text-sam-muted">{lookup.href}</span> : null}
          </span>
        ) : (
          <span className="text-sam-danger">
            ✕ {lookup.title ? `「${lookup.title}」 ` : ""}
            {t(lookupErrorKey(lookup.error))}
          </span>
        )}
      </div>
    </div>
  );
}
