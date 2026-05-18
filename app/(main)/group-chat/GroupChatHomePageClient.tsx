"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  APP_MAIN_COLUMN_MAX_WIDTH_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

const INNER = `mx-auto w-full max-w-lg ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

export default function GroupChatHomePageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createRoom() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/group-chat/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data?.error === "string" ? data.error : t("ui_group_chat_create_failed"));
        return;
      }
      const id = data?.room?.id as string | undefined;
      if (id) {
        router.push(`/group-chat/${encodeURIComponent(id)}`);
        return;
      }
      setErr(t("ui_group_chat_no_room_id"));
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[60vh] bg-sam-surface px-4 py-6">
      <div className={INNER}>
        <div className="mb-6 flex items-center gap-2">
          <AppBackButton backHref="/chats" preferHistoryBack={false} />
          <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("ui_group_chat_title")}</h1>
        </div>
        <p className="mb-4 sam-text-body text-sam-muted">
          {t("ui_group_chat_intro")}
        </p>
        <label className="mb-2 block sam-text-body-secondary font-medium text-sam-fg">{t("ui_group_chat_room_name_label")}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("ui_group_chat_room_name_ph")}
          className="mb-4 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg outline-none focus:border-sam-fg/30"
          maxLength={200}
        />
        {err ? <p className="mb-3 sam-text-body-secondary text-red-600">{err}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void createRoom()}
          className="w-full rounded-ui-rect bg-sam-fg px-4 py-3 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {busy ? t("ui_group_chat_creating") : t("ui_group_chat_create_room")}
        </button>
        <p className="mt-6 text-center sam-text-body-secondary text-sam-muted">
          <Link href="/chats" className="underline">
            {t("ui_group_chat_trade_list_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}
