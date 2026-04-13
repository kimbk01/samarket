"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Settings = {
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

function Row({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border-b border-sam-border-soft px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[15px] text-sam-fg">{label}</span>
          {description ? <p className="mt-0.5 text-[12px] text-sam-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            checked ? "bg-signature" : "bg-sam-border-soft"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
              checked ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export function AdminNotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [s, setS] = useState<Settings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/notification-settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        table_missing?: boolean;
        settings?: Settings;
      };
      if (res.status === 401) {
        setUnauthorized(true);
        setS(null);
        return;
      }
      if (!j?.ok || !j.settings) {
        setS(null);
        return;
      }
      setUnauthorized(false);
      setTableMissing(j.table_missing === true);
      const x = j.settings;
      setS({
        trade_chat_enabled: x.trade_chat_enabled !== false,
        community_chat_enabled: x.community_chat_enabled !== false,
        order_enabled: x.order_enabled !== false,
        store_enabled: x.store_enabled !== false,
        sound_enabled: x.sound_enabled !== false,
        vibration_enabled: x.vibration_enabled !== false,
      });
    } catch {
      setS(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (partial: Partial<Settings>) => {
      if (!s) return;
      const res = await fetch("/api/me/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j?.ok && typeof window !== "undefined") {
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
        setS((prev) => (prev ? { ...prev, ...partial } : prev));
      } else {
        await load();
      }
    },
    [s, load]
  );

  if (loading) {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }

  if (unauthorized) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        로그인한 계정의 인앱 알림 설정입니다. 관리자 콘솔에도 동일 세션이 필요합니다.
      </p>
    );
  }

  if (!s || tableMissing) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        {tableMissing
          ? "`user_notification_settings` 테이블이 없습니다."
          : "설정을 불러오지 못했습니다."}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="border-b border-sam-border-soft px-4 py-3">
        <h2 className="text-sm font-bold text-sam-fg">인앱 알림 (계정)</h2>
        <p className="mt-1 text-[12px] text-sam-muted">
          `user_notification_settings` 에 저장됩니다.{" "}
          <Link href="/my/settings/notifications" className="font-medium text-signature underline">
            마이페이지 알림 설정
          </Link>
          과 동일합니다.
        </p>
      </div>
      <Row
        label="거래 채팅"
        checked={s.trade_chat_enabled}
        onChange={(v) => void patch({ trade_chat_enabled: v })}
      />
      <Row
        label="커뮤니티 채팅"
        checked={s.community_chat_enabled}
        onChange={(v) => void patch({ community_chat_enabled: v })}
      />
      <Row label="주문 알림" checked={s.order_enabled} onChange={(v) => void patch({ order_enabled: v })} />
      <Row label="매장 알림" checked={s.store_enabled} onChange={(v) => void patch({ store_enabled: v })} />
      <Row label="인앱 알림음" checked={s.sound_enabled} onChange={(v) => void patch({ sound_enabled: v })} />
      <Row label="진동" checked={s.vibration_enabled} onChange={(v) => void patch({ vibration_enabled: v })} />
    </div>
  );
}
