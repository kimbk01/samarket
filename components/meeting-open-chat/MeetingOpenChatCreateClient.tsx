"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MeetingOpenChatJoinType } from "@/lib/meeting-open-chat/types";
import { philifeAppPaths } from "@/lib/philife/paths";

export function MeetingOpenChatCreateClient({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [joinType, setJoinType] = useState<MeetingOpenChatJoinType>("free");
  const [joinPassword, setJoinPassword] = useState("");
  const [openNickname, setOpenNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            joinType,
            joinPassword: joinType === "password" ? joinPassword : undefined,
            openNickname,
            maxMembers: 300,
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; room?: { id: string }; error?: string };
      if (!res.ok || !json.ok || !json.room?.id) {
        setErr(json.error ?? "생성 실패");
        return;
      }
      router.replace(
        `/philife/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/${encodeURIComponent(json.room.id)}`
      );
    } finally {
      setBusy(false);
    }
  };

  const listHref = philifeAppPaths.meetingOpenChat(meetingId);

  return (
    <div className="min-h-[60vh] bg-[#f7f7f7] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link href={listHref} className="text-sm text-emerald-700">
          ← 목록
        </Link>
        <h1 className="flex-1 text-center text-base font-bold">새 채팅방</h1>
        <span className="w-10" />
      </div>

      {err && <p className="mb-2 text-center text-sm text-red-600">{err}</p>}

      <label className="mt-2 block text-xs font-semibold text-gray-700">방 제목</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />

      <label className="mt-3 block text-xs font-semibold text-gray-700">입장 방식</label>
      <select
        value={joinType}
        onChange={(e) => setJoinType(e.target.value as MeetingOpenChatJoinType)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      >
        <option value="free">공개 (바로 입장)</option>
        <option value="password">비밀번호</option>
        <option value="approval">승인</option>
      </select>

      {joinType === "password" && (
        <>
          <label className="mt-3 block text-xs font-semibold text-gray-700">비밀번호 (4자 이상)</label>
          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </>
      )}

      <label className="mt-3 block text-xs font-semibold text-gray-700">내 채팅 닉네임 (방장)</label>
      <input
        value={openNickname}
        onChange={(e) => setOpenNickname(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        maxLength={40}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-6 w-full rounded-full bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        만들기
      </button>
    </div>
  );
}
