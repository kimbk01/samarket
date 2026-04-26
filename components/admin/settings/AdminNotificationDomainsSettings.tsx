"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { invalidateNotificationSoundConfigCache } from "@/lib/notifications/notification-sound-engine";
import { AdminNotificationSoundPreview } from "@/components/admin/settings/AdminNotificationSoundPreview";
import { AdminMessengerCallSoundsSection } from "@/components/admin/settings/AdminMessengerCallSoundsSection";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";

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
  community_direct_chat: "1:1 채팅",
  community_group_chat: "그룹채팅",
  community_chat: "커뮤니티 채팅(레거시)",
  order: "주문 알림",
  store: "매장 알림",
};

const VISIBLE_NOTIFICATION_DOMAINS: NotificationDomain[] = [
  "community_direct_chat",
  "community_group_chat",
  "trade_chat",
  "order",
  "store",
];

export function AdminNotificationDomainsSettings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState<NotificationDomain | null>(null);
  const [clearBusy, setClearBusy] = useState<NotificationDomain | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setErr((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/admin/notification-settings", { credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; items?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "불러오지 못했습니다.");
        return;
      }
      const byType = new Map((j.items ?? []).map((r) => [r.type, r]));
      const legacyCommunity = byType.get("community_chat");
      const merged = VISIBLE_NOTIFICATION_DOMAINS.map((type) => {
        const r =
          byType.get(type) ??
          ((type === "community_direct_chat" || type === "community_group_chat") ? legacyCommunity : undefined);
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
      setLoading((prev) => (prev ? false : prev));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = useCallback((type: NotificationDomain, partial: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, ...partial } : r)));
  }, []);

  const save = useCallback(async () => {
    setSaving((prev) => (prev ? prev : true));
    setErr((prev) => (prev === null ? prev : null));
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
      setSaving((prev) => (prev ? false : prev));
    }
  }, [rows]);

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
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-6 sam-text-body text-ui-muted">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="알림·알림음 (도메인)" />
      <p className="sam-text-body text-ui-muted">
        1:1 채팅, 그룹채팅, 거래채팅, 주문, 매장 알림음을 각각 분리해 설정합니다. 통화 수발신/연결음과
        매장·배달 전용 알림음도 이 화면에서 함께 관리할 수 있습니다.
      </p>
      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
        <AdminCard key={r.type} title={LABELS[r.type]}>
          <div className="space-y-3 px-1 py-2">
            <label className="flex items-center justify-between gap-3 sam-text-body">
              <span>알림 사용</span>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => patchRow(r.type, { enabled: e.target.checked })}
              />
            </label>
            <div className="space-y-2">
              <span className="sam-text-body-secondary text-ui-muted">알림음 파일</span>
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
                  className={`inline-flex cursor-pointer rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-1.5 sam-text-body-secondary text-ui-fg hover:bg-ui-hover ${
                    uploadBusy === r.type ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {uploadBusy === r.type ? "업로드 중…" : "내 PC에서 파일 선택"}
                </label>
                <button
                  type="button"
                  disabled={clearBusy === r.type || uploadBusy === r.type || !r.sound_url}
                  className="rounded-ui-rect border border-ui-border px-3 py-1.5 sam-text-body-secondary text-ui-muted hover:bg-ui-hover disabled:opacity-50"
                  onClick={() => void clearUploadedSound(r.type)}
                >
                  {clearBusy === r.type ? "해제 중…" : "업로드 해제(기본음)"}
                </button>
              </div>
              <AdminNotificationSoundPreview soundUrl={r.sound_url} volume={r.volume} />
            </div>
            <label className="flex items-center gap-3 sam-text-body">
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
            <label className="flex items-center gap-3 sam-text-body">
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
            <label className="flex items-center gap-3 sam-text-body">
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
          </div>
        </AdminCard>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminGlobalAlertSoundSection
          title="매장·배달 알림음"
          description="배달 신규 주문, 매장 측 즉시 확인용 기본 알림음입니다. 기본음으로 두거나 업로드 파일로 교체할 수 있습니다."
          codeKey="admin_settings.store_delivery_alert_sound"
          apiPath="/api/admin/store-delivery-alert-sound"
          onAfterMutation={invalidateStoreDeliveryAlertSoundCache}
        />
        <AdminGlobalAlertSoundSection
          title="매장·배달 채팅 연결음"
          description="주문 확인, 배달채팅 일치 확인 등 매장·배달 대화 흐름에서 쓰는 전용 연결음입니다."
          codeKey="admin_settings.order_match_chat_alert_sound"
          apiPath="/api/admin/order-match-chat-alert-sound"
          onAfterMutation={bustOrderMatchAlertSoundCache}
        />
      </div>

      <button
        type="button"
        disabled={saving}
        className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        onClick={() => void save()}
      >
        {saving ? "저장 중…" : "저장"}
      </button>

      <div className="border-t border-ui-border pt-8">
        <AdminMessengerCallSoundsSection />
      </div>
    </div>
  );
}
