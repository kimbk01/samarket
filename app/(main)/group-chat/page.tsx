"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  APP_MAIN_COLUMN_MAX_WIDTH_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

const INNER = `mx-auto w-full max-w-lg ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

export default function GroupChatHomePage() {
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
        setErr(typeof data?.error === "string" ? data.error : "생성에 실패했습니다.");
        return;
      }
      const id = data?.room?.id as string | undefined;
      if (id) {
        router.push(`/group-chat/${encodeURIComponent(id)}`);
        return;
      }
      setErr("응답에 방 id가 없습니다.");
    } catch {
      setErr("네트워크 오류입니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[60vh] bg-sam-surface px-4 py-6">
      <div className={INNER}>
        <div className="mb-6 flex items-center gap-2">
          <AppBackButton backHref="/chats" preferHistoryBack={false} />
          <h1 className="text-[18px] font-semibold text-sam-fg">그룹 채팅</h1>
        </div>
        <p className="mb-4 text-[14px] text-sam-muted">
          새 방을 만들면 소유자로 입장합니다. 링크로 방 id를 알면 `/group-chat/방id` 로 바로 들어갈 수 있어요.
        </p>
        <label className="mb-2 block text-[13px] font-medium text-sam-fg">방 이름 (선택)</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 동호회 잡담"
          className="mb-4 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-[15px] text-sam-fg outline-none focus:border-sam-fg/30"
          maxLength={200}
        />
        {err ? <p className="mb-3 text-[13px] text-red-600">{err}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void createRoom()}
          className="w-full rounded-ui-rect bg-sam-fg px-4 py-3 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "방 만들기"}
        </button>
        <p className="mt-6 text-center text-[13px] text-sam-muted">
          <Link href="/chats" className="underline">
            거래 채팅 목록
          </Link>
        </p>
      </div>
    </div>
  );
}
