"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { NOTIFICATION_DOMAINS } from "@/lib/notifications/notification-domains";
import {
  invalidateNotificationSoundConfigCache,
  playDomainNotificationSound,
} from "@/lib/notifications/notification-sound-engine";

type Row = {
  type: NotificationDomain;
  sound_url: string | null;
  volume: number;
  repeat_count: number;
  cooldown_seconds: number;
  enabled: boolean;
};

const LABELS: Record<NotificationDomain, string> = {
  trade_chat: "거래 채팅",
  community_chat: "커뮤니티·모임 채팅",
  order: "주문·배달",
  store: "매장·상점",
};

export function AdminNotificationDomainsSettings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState<NotificationDomain | null>(null);
  const [clearBusy, setClearBusy] = useState<NotificationDomain | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-settings", { credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; items?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "불러오지 못했습니다.");
        return;
      }
      const byType = new Map((j.items ?? []).map((r) => [r.type, r]));
      const merged = NOTIFICATION_DOMAINS.map((type) => {
        const r = byType.get(type);
        return {
          type,
          sound_url: r?.sound_url ?? null,
          volume: typeof r?.volume === "number" ? r.volume : 0.7,
          repeat_count: typeof r?.repeat_count === "number" ? r.repeat_count : 1,
          cooldown_seconds: typeof r?.cooldown_seconds === "number" ? r.cooldown_seconds : 3,
          enabled: r?.enabled !== false,
        };
      });
      setRows(merged);
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = useCallback((type: NotificationDomain, partial: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, ...partial } : r)));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "저장 실패");
        return;
      }
      invalidateNotificationSoundConfigCache();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }, [rows]);

  const testSound = useCallback((type: NotificationDomain) => {
    void playDomainNotificationSound(type);
  }, []);

  const uploadSoundFile = useCallback(async (type: NotificationDomain, file: File) => {
    setUploadBusy(type);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("file", file);
      const res = await fetch("/api/admin/notification-settings/upload-sound", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sound_url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.message ?? j.error ?? "업로드에 실패했습니다.");
        return;
      }
      if (typeof j.sound_url === "string") {
        patchRow(type, { sound_url: j.sound_url });
      }
      invalidateNotificationSoundConfigCache();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setUploadBusy(null);
    }
  }, [patchRow]);

  const clearUploadedSound = useCallback(async (type: NotificationDomain) => {
    setClearBusy(type);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ type, sound_url: null }] }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "초기화 실패");
        return;
      }
      patchRow(type, { sound_url: null });
      invalidateNotificationSoundConfigCache();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setClearBusy(null);
    }
  }, [patchRow]);

  if (loading) {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-6 text-[14px] text-ui-muted">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="알림·알림음 (도메인)" />
      <p className="text-[14px] text-ui-muted">
        거래/커뮤니티/주문/매장 알림을 분리해 설정합니다. 알림음은 PC에서 MP3·WAV 등 파일을 선택해
        업로드합니다. 쿨다운은 동일 채팅방(ref) 기준 서버에서 인앱 알림 빈도를 제한합니다.
      </p>
      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {err}
        </div>
      ) : null}

      {rows.map((r) => (
        <AdminCard key={r.type} title={LABELS[r.type]}>
          <div className="space-y-3 px-1 py-2">
            <label className="flex items-center justify-between gap-3 text-[14px]">
              <span>알림 사용</span>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => patchRow(r.type, { enabled: e.target.checked })}
              />
            </label>
            <div className="space-y-2">
              <span className="text-[13px] text-ui-muted">알림음 파일</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
                  className="hidden"
                  id={`notif-domain-sound-${r.type}`}
                  disabled={uploadBusy === r.type}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadSoundFile(r.type, f);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor={`notif-domain-sound-${r.type}`}
                  className={`inline-flex cursor-pointer rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-1.5 text-[13px] text-ui-fg hover:bg-ui-hover ${
                    uploadBusy === r.type ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {uploadBusy === r.type ? "업로드 중…" : "내 PC에서 파일 선택"}
                </label>
                <button
                  type="button"
                  disabled={clearBusy === r.type || uploadBusy === r.type || !r.sound_url}
                  className="rounded-ui-rect border border-ui-border px-3 py-1.5 text-[13px] text-ui-muted hover:bg-ui-hover disabled:opacity-50"
                  onClick={() => void clearUploadedSound(r.type)}
                >
                  {clearBusy === r.type ? "해제 중…" : "업로드 해제(기본음)"}
                </button>
              </div>
              <p className="break-all text-[12px] text-ui-muted">
                {r.sound_url?.trim()
                  ? `현재: ${r.sound_url.trim()}`
                  : "현재: 앱 기본 알림음(내장)"}
              </p>
              <label className="block text-[12px] text-ui-muted">
                고급: URL 직접 입력 후 아래 「저장」
                <input
                  className="mt-1 w-full rounded-ui-rect border border-ui-border px-2 py-1.5 text-[13px] text-ui-fg"
                  value={r.sound_url ?? ""}
                  placeholder="https://… 또는 /sounds/notification.wav"
                  onChange={(e) => patchRow(r.type, { sound_url: e.target.value || null })}
                />
              </label>
            </div>
            <label className="flex items-center gap-3 text-[14px]">
              볼륨
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={r.volume}
                onChange={(e) => patchRow(r.type, { volume: Number(e.target.value) })}
              />
              <span className="text-ui-muted">{r.volume.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-3 text-[14px]">
              반복 (1~5)
              <input
                type="number"
                min={1}
                max={5}
                className="w-16 rounded-ui-rect border border-ui-border px-2 py-1"
                value={r.repeat_count}
                onChange={(e) =>
                  patchRow(r.type, {
                    repeat_count: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-3 text-[14px]">
              쿨다운(초)
              <input
                type="number"
                min={0}
                max={600}
                className="w-20 rounded-ui-rect border border-ui-border px-2 py-1"
                value={r.cooldown_seconds}
                onChange={(e) =>
                  patchRow(r.type, {
                    cooldown_seconds: Math.max(0, Math.min(600, Number(e.target.value) || 0)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="rounded-ui-rect border border-ui-border bg-ui-hover px-3 py-1.5 text-[13px] text-ui-fg"
              onClick={() => testSound(r.type)}
            >
              테스트 재생
            </button>
          </div>
        </AdminCard>
      ))}

      <button
        type="button"
        disabled={saving}
        className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        onClick={() => void save()}
      >
        {saving ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}
