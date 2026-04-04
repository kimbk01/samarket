"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  MeetingOpenChatIdentityMode,
  MeetingOpenChatJoinAs,
  MeetingOpenChatJoinType,
} from "@/lib/meeting-open-chat/types";
import { philifeAppPaths } from "@/lib/philife/paths";

function formatCreateError(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "title_required":
      return "방 제목을 입력해 주세요.";
    case "password_too_short":
      return "비밀번호는 4자 이상이어야 합니다.";
    case "open_nickname_required":
      return "닉네임 참여를 선택한 경우 방장 닉네임을 입력해 주세요.";
    case "realname_required":
      return "실명 참여를 쓰려면 프로필에 실명이 있어야 합니다.";
    default:
      return code.length < 100 ? code : "생성에 실패했습니다.";
  }
}

export function MeetingOpenChatCreateClient({
  meetingId,
  chatApiBasePath,
  chatRouteBasePath,
}: {
  meetingId: string;
  /** 예: `/api/community/meetings/{id}/group-chat` — 생략 시 group-chat API */
  chatApiBasePath?: string;
  /** 예: `/philife/meetings/{id}/group-chat` — 생략 시 group-chat 목록 경로 */
  chatRouteBasePath?: string;
}) {
  const router = useRouter();
  const resolvedApiBase =
    (chatApiBasePath?.trim() ||
      `/api/community/meetings/${encodeURIComponent(meetingId)}/group-chat`) as string;
  const resolvedRouteBase =
    (chatRouteBasePath?.trim() || philifeAppPaths.meetingGroupChat(meetingId)) as string;
  const [title, setTitle] = useState("");
  const [joinType, setJoinType] = useState<MeetingOpenChatJoinType>("free");
  const [identityMode, setIdentityMode] = useState<MeetingOpenChatIdentityMode>("realname");
  const [ownerJoinAs, setOwnerJoinAs] = useState<MeetingOpenChatJoinAs>("realname");
  const [joinPassword, setJoinPassword] = useState("");
  const [openNickname, setOpenNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(
        `${resolvedApiBase}/rooms`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            joinType,
            identityMode,
            ownerJoinAs,
            joinPassword: joinType === "password" ? joinPassword : undefined,
            openNickname: identityMode === "nickname_optional" && ownerJoinAs === "nickname" ? openNickname : undefined,
            maxMembers: 300,
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; room?: { id: string }; error?: string };
      if (!res.ok || !json.ok || !json.room?.id) {
        setErr(json.error ?? "생성 실패");
        return;
      }
      router.replace(`${resolvedRouteBase}/${encodeURIComponent(json.room.id)}`);
    } finally {
      setBusy(false);
    }
  };

  const listHref = resolvedRouteBase;
  const joinTypeSummary =
    joinType === "password" ? "목록에서 방을 누르면 비밀번호 팝업으로 바로 입장합니다." : "목록에서 방을 누르면 바로 참여합니다.";
  const identitySummary =
    identityMode === "realname"
      ? "참여자는 모두 프로필 실명으로 표시됩니다."
      : ownerJoinAs === "nickname"
        ? "참여자는 실명 또는 닉네임 중 선택 가능하고, 방장은 닉네임으로 시작합니다."
        : "참여자는 실명 또는 닉네임 중 선택 가능하고, 방장은 실명으로 시작합니다.";

  return (
    <div className="min-h-[60vh] bg-[#f7f7f7] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link href={listHref} className="text-sm text-emerald-700">
          ← 목록
        </Link>
        <h1 className="flex-1 text-center text-base font-bold">새 채팅방</h1>
        <span className="w-10" />
      </div>

      {err && <p className="mb-2 text-center text-sm text-red-600">{formatCreateError(err)}</p>}

      <label className="mt-2 block text-xs font-semibold text-gray-700">방 제목</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[13px] font-bold text-gray-900">참여 설정</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          모든 참여는 실제 가입 계정에 연결됩니다. 여기서는 입장 방식과 방 안 표시 이름만 정합니다.
        </p>

        <label className="mt-4 block text-xs font-semibold text-gray-700">입장 방식</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setJoinType("free")}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              joinType === "free"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            즉시 참여
          </button>
          <button
            type="button"
            onClick={() => setJoinType("password")}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              joinType === "password"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            비밀번호 참여
          </button>
        </div>
      </div>

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

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[13px] font-bold text-gray-900">표시 이름 설정</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          실명 방은 참여자가 프로필 실명으로 바로 들어오고, 닉네임 방은 실명 또는 닉네임 중 하나를 선택해 참여합니다.
        </p>

        <label className="mt-4 block text-xs font-semibold text-gray-700">방 기본 표시 방식</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setIdentityMode("realname");
              setOwnerJoinAs("realname");
            }}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              identityMode === "realname"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            실명 참여
          </button>
          <button
            type="button"
            onClick={() => setIdentityMode("nickname_optional")}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              identityMode === "nickname_optional"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            닉네임 참여
          </button>
        </div>

        {identityMode === "realname" ? (
          <div className="mt-3 rounded-xl bg-gray-50 px-3 py-3 text-[12px] text-gray-600">
            방장도 프로필 실명으로 바로 생성됩니다.
          </div>
        ) : (
          <>
            <label className="mt-4 block text-xs font-semibold text-gray-700">방장 표시 이름</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOwnerJoinAs("realname")}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                  ownerJoinAs === "realname"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                실명으로 생성
              </button>
              <button
                type="button"
                onClick={() => setOwnerJoinAs("nickname")}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                  ownerJoinAs === "nickname"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                닉네임으로 생성
              </button>
            </div>

            {ownerJoinAs === "nickname" && (
              <>
                <label className="mt-3 block text-xs font-semibold text-gray-700">방장 닉네임</label>
                <input
                  value={openNickname}
                  onChange={(e) => setOpenNickname(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  maxLength={40}
                  placeholder="방에서 쓸 닉네임"
                />
              </>
            )}
          </>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-[13px] font-bold text-emerald-900">생성 미리보기</p>
        <p className="mt-2 text-[12px] leading-relaxed text-emerald-800">{joinTypeSummary}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-emerald-800">{identitySummary}</p>
      </div>

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
