"use client";

/**
 * 앱 진입 어드민 v3 §2 ⑥ — 「누르면 이동 → 이벤트」 고르기. 이벤트 목록 API(`GET /api/admin/platform-events`, 최근 수정 200건)를
 * 한 번 받아 이름으로 찾는다. 고를 수 있는 이벤트 = 팝업 이벤트 목적지 확인과 같은 규칙(공개 · 시작됨 · 안 끝남,
 * `isLaunchIntroEventPickable`). 값 = 이벤트 id(저장 href 는 `/events/:id`).
 */
import { useEffect, useMemo, useState } from "react";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { isLaunchIntroEventPickable } from "@/lib/launch-intro/pool-admin-view";

export type LaunchIntroEventOption = {
  id: string;
  title: string;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

const REASON_KEY: Record<"not_published" | "not_started" | "ended", MessageKey> = {
  not_published: "admin_launch_intro_v3_f_cta_event_not_published",
  not_started: "admin_launch_intro_v3_f_cta_event_not_started",
  ended: "admin_launch_intro_v3_f_cta_event_ended",
};

/** 이벤트 목록 한 번 받기 (목록 화면의 이벤트 이름 표시에도 쓴다) */
export async function fetchLaunchIntroEventOptions(): Promise<LaunchIntroEventOption[] | null> {
  try {
    const res = await fetch("/api/admin/platform-events", { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; events?: Record<string, unknown>[] };
    if (!res.ok || !j.ok || !Array.isArray(j.events)) return null;
    return j.events.map((e) => ({
      id: String(e.id ?? ""),
      title: String(e.title ?? "").trim(),
      status: typeof e.status === "string" ? e.status : null,
      startsAt: typeof e.startsAt === "string" ? e.startsAt : null,
      endsAt: typeof e.endsAt === "string" ? e.endsAt : null,
    }));
  } catch {
    return null;
  }
}

export function LaunchIntroEventPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (eventId: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [events, setEvents] = useState<LaunchIntroEventOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  /** 고를 수 있는지 판정 기준 시각 — 목록을 받은 때 */
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchLaunchIntroEventOptions().then((list) => {
      if (cancelled) return;
      if (!list) setFailed(true);
      else {
        setNow(Date.now());
        setEvents(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const picked = events?.find((e) => e.id === value) ?? null;
  const pickedState = picked ? isLaunchIntroEventPickable(picked, now) : null;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (events ?? []).filter((e) => !needle || e.title.toLowerCase().includes(needle)).slice(0, 30);
  }, [events, q]);

  return (
    <div className="space-y-2" data-launch-intro-event-picker="">
      <p className="sam-text-helper text-sam-fg" data-launch-intro-event-picked="">
        {value ? t("admin_launch_intro_v3_f_cta_event_picked", { title: picked?.title || value }) : t("admin_launch_intro_v3_f_cta_event_none")}
        {pickedState?.ok ? (
          <span className="ml-2 rounded-full bg-sam-success-soft px-2 text-sam-success">{t("admin_launch_intro_v3_f_cta_event_public")} ✓</span>
        ) : null}
      </p>
      {value && pickedState && !pickedState.ok ? (
        <p role="alert" className="rounded-ui-rect bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-warning">
          {t("admin_launch_intro_v3_f_cta_event_unavailable")}
        </p>
      ) : null}
      {disabled ? null : (
        <>
          <input
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
            placeholder={t("admin_launch_intro_v3_f_cta_event_find")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {failed ? <p className="sam-text-helper text-sam-danger">{t("admin_launch_intro_v3_f_cta_event_load_failed")}</p> : null}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {shown.map((e) => {
              const st = isLaunchIntroEventPickable(e, now);
              return (
                <li key={e.id}>
                  <AdminListItemButton
                    selected={e.id === value}
                    disabled={!st.ok}
                    onClick={() => onChange(e.id)}
                    className="flex items-center justify-between gap-2 border border-sam-border sam-text-body text-sam-fg"
                  >
                    <span className="truncate">{e.title || e.id}</span>
                    <span className={`shrink-0 sam-text-helper ${st.ok ? "text-sam-success" : "text-sam-muted"}`}>
                      {st.ok ? t("admin_launch_intro_v3_f_cta_event_public") : t(REASON_KEY[st.reason])}
                    </span>
                  </AdminListItemButton>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
