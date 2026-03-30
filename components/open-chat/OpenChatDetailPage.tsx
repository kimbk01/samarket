"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { philifeOpenChatRoomApi } from "@/lib/philife/api";
import { philifeAppPaths } from "@/lib/philife/paths";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";

type OpenChatRoomDetail = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  requiresApproval: boolean;
  joinedCount: number;
  pendingCount: number;
  bannedCount: number;
  noticeCount: number;
  maxMembers: number;
  allowSearch: boolean;
  inviteCode: string | null;
  entryQuestion: string | null;
  status: "active" | "hidden" | "suspended" | "archived";
  linkedChatRoomId: string;
  ownerUserId: string;
  canManage: boolean;
  canAssignModerators: boolean;
  canJoin: boolean;
  joinRequestStatus: "pending" | "approved" | "rejected" | "cancelled" | "expired" | null;
  membership: {
    nickname: string;
    role: "owner" | "moderator" | "member";
    status: "joined" | "pending" | "left" | "kicked" | "rejected";
  } | null;
  activeNotice: {
    id: string;
    title: string;
    body: string;
    visibility: "members" | "public";
    createdAt: string;
  } | null;
  members?: Array<{
    userId: string;
    nickname: string;
    role: "owner" | "moderator" | "member";
    status: "joined" | "pending" | "left" | "kicked" | "rejected";
    joinedAt: string | null;
    isMessageBlinded: boolean;
    messageBlindedAt: string | null;
    messageBlindReason: string | null;
  }>;
  blindedMembers?: Array<{
    userId: string;
    nickname: string;
    role: "owner" | "moderator" | "member";
    blindedAt: string;
    blindReason: string;
  }>;
  pendingRequests?: Array<{
    userId: string;
    nickname: string;
    requestMessage: string;
    requestedAt: string;
  }>;
  bans?: Array<{
    id: string;
    userId: string;
    nickname: string;
    reason: string;
    createdAt: string;
  }>;
};

export function OpenChatDetailPage({ roomId, inviteCode }: { roomId: string; inviteCode?: string }) {
  const router = useRouter();
  const notificationUnreadCount = useMyNotificationUnreadCount();
  const api = philifeOpenChatRoomApi(roomId);
  const [room, setRoom] = useState<OpenChatRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [noticeVisibility, setNoticeVisibility] = useState<"members" | "public">("members");
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsVisibility, setSettingsVisibility] = useState<"public" | "private">("public");
  const [settingsRequiresApproval, setSettingsRequiresApproval] = useState(false);
  const [settingsAllowSearch, setSettingsAllowSearch] = useState(true);
  const [settingsMaxMembers, setSettingsMaxMembers] = useState(300);
  const [settingsEntryQuestion, setSettingsEntryQuestion] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const detailUrl = inviteCode ? `${api.detail()}?inviteCode=${encodeURIComponent(inviteCode)}` : api.detail();
      const res = await fetch(detailUrl, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; room?: OpenChatRoomDetail; error?: string };
      if (!res.ok || !json.ok || !json.room) {
        setError(json.error || "오픈채팅 정보를 불러오지 못했습니다.");
        setRoom(null);
        return;
      }
      setRoom(json.room);
      setNickname(json.room.membership?.nickname ?? "");
    } catch {
      setError("오픈채팅 정보를 불러오지 못했습니다.");
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [roomId, inviteCode]);

  useEffect(() => {
    setNoticeText(room?.activeNotice?.body ?? room?.activeNotice?.title ?? "");
    setNoticeVisibility(room?.activeNotice?.visibility ?? "members");
  }, [room?.activeNotice?.id, room?.activeNotice?.title, room?.activeNotice?.body, room?.activeNotice?.visibility]);

  useEffect(() => {
    setSettingsTitle(room?.title ?? "");
    setSettingsDescription(room?.description ?? "");
    setSettingsVisibility(room?.visibility ?? "public");
    setSettingsRequiresApproval(room?.requiresApproval ?? false);
    setSettingsAllowSearch(room?.allowSearch ?? true);
    setSettingsMaxMembers(room?.maxMembers ?? 300);
    setSettingsEntryQuestion(room?.entryQuestion ?? "");
    setInviteCopied(false);
    setInviteLinkCopied(false);
  }, [
    room?.id,
    room?.title,
    room?.description,
    room?.visibility,
    room?.requiresApproval,
    room?.allowSearch,
    room?.maxMembers,
    room?.entryQuestion,
  ]);

  async function handleJoin() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.join(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          requestMessage,
          inviteCode,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "입장 처리에 실패했습니다.");
        return;
      }
      await load();
    } catch {
      setError("입장 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.leave(), { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "퇴장 처리에 실패했습니다.");
        return;
      }
      router.replace(philifeAppPaths.openChat);
    } catch {
      setError("퇴장 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleNicknameUpdate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.nickname(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "닉네임 변경에 실패했습니다.");
        return;
      }
      await load();
    } catch {
      setError("닉네임 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function mutateRequest(url: string, method: "POST" | "PATCH" | "DELETE", payload?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.message || json.error || "처리에 실패했습니다.");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("처리에 실패했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNotice() {
    const ok = await mutateRequest(api.notice(), "POST", {
      title: "",
      body: noticeText,
      visibility: noticeVisibility,
    });
    if (ok) {
      setNoticeText("");
      setNoticeVisibility("members");
    }
  }

  async function handleUpdateNotice() {
    if (!room?.activeNotice?.id) return;
    await mutateRequest(api.noticeItem(room.activeNotice.id), "PATCH", {
      title: "",
      body: noticeText,
      visibility: noticeVisibility,
      isPinned: true,
    });
  }

  async function handleDeleteNotice() {
    if (!room?.activeNotice?.id) return;
    await mutateRequest(api.noticeItem(room.activeNotice.id), "DELETE");
  }

  async function handleSaveRoomSettings() {
    await mutateRequest(api.detail(), "PATCH", {
      title: settingsTitle,
      description: settingsDescription,
      visibility: settingsVisibility,
      requiresApproval: settingsRequiresApproval,
      allowSearch: settingsVisibility === "public" ? settingsAllowSearch : false,
      maxMembers: settingsMaxMembers,
      entryQuestion: settingsEntryQuestion,
    });
  }

  async function handleRegenerateInviteCode() {
    await mutateRequest(api.detail(), "PATCH", { regenerateInviteCode: true });
  }

  async function handleCopyInviteCode() {
    if (!room?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(room.inviteCode);
      setInviteCopied(true);
    } catch {
      setError("초대 코드를 복사하지 못했습니다.");
    }
  }

  async function handleCopyInviteLink() {
    if (!room?.inviteCode || typeof window === "undefined") return;
    try {
      const inviteUrl = `${window.location.origin}${philifeAppPaths.openChatInvite(room.id, room.inviteCode)}`;
      await navigator.clipboard.writeText(inviteUrl);
      setInviteLinkCopied(true);
    } catch {
      setError("초대 링크를 복사하지 못했습니다.");
    }
  }

  const currentMembershipRole = room?.membership?.role ?? null;
  const visibleJoinedMembers = (room?.members ?? []).filter((member) => member.status === "joined");
  const canActOnMember = (member: NonNullable<OpenChatRoomDetail["members"]>[number]) => {
    if (!room?.canManage) return false;
    if (member.userId === room.ownerUserId) return false;
    if (currentMembershipRole === "moderator") return member.role === "member";
    return true;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <MySubpageHeader
        title={room?.title ?? "오픈채팅"}
        subtitle="커뮤니티"
        backHref={philifeAppPaths.openChat}
        preferHistoryBack
        hideCtaStrip
        showHubQuickActions
        notificationUnreadCount={notificationUnreadCount}
      />

      <div className={`${APP_MAIN_GUTTER_X_CLASS} space-y-4 pt-2`}>
        {loading ? (
          <SectionCard>불러오는 중...</SectionCard>
        ) : error && !room ? (
          <SectionCard>{error}</SectionCard>
        ) : room ? (
          <>
            {inviteCode && !room.membership ? (
              <SectionCard>
                <h2 className="text-[14px] font-semibold text-gray-900">초대 링크로 들어왔어요</h2>
                <p className="mt-2 text-[13px] leading-5 text-gray-600">
                  이 링크로는 초대된 방의 상세를 바로 볼 수 있습니다. 닉네임을 입력하고 참여하거나, 승인제가 켜져 있으면
                  가입 요청을 보내세요.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge text="초대 링크 진입" />
                  {room.visibility === "private" ? <Badge text="비공개 초대방" /> : null}
                  {room.requiresApproval ? <Badge text="승인 후 입장" /> : <Badge text="바로 입장 가능" />}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard>
              <div className="flex flex-wrap items-center gap-2">
                <Badge text={room.visibility === "public" ? "공개" : "비공개"} />
                {room.requiresApproval ? <Badge text="승인제" /> : null}
                <Badge text={`${room.joinedCount}/${room.maxMembers}명`} />
                {room.membership ? <Badge text={room.membership.status === "joined" ? "참여 중" : "대기 중"} /> : null}
              </div>
              <p className="mt-3 text-[14px] leading-6 text-gray-700">
                {room.description || "소개가 아직 없습니다."}
              </p>
            </SectionCard>

            {room.activeNotice ? (
              <SectionCard>
                <h2 className="text-[14px] font-semibold text-gray-900">공지</h2>
                <p className="mt-2 text-[14px] text-gray-700">
                  {room.activeNotice.body?.trim() || room.activeNotice.title?.trim() || "등록된 공지가 없습니다."}
                </p>
              </SectionCard>
            ) : null}

            {room.membership?.status === "joined" ? (
              <SectionCard>
                <h2 className="text-[14px] font-semibold text-gray-900">내 상태</h2>
                <p className="mt-2 text-[13px] text-gray-600">
                  현재 닉네임: <span className="font-semibold text-gray-800">{room.membership.nickname}</span>
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={24}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                    placeholder="방 닉네임"
                  />
                  <button
                    type="button"
                    onClick={handleNicknameUpdate}
                    disabled={busy}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-700"
                  >
                    변경
                  </button>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleLeave}
                    disabled={busy || room.membership.role === "owner"}
                    className="rounded-xl border border-red-200 px-4 py-2 text-[13px] font-medium text-red-600 disabled:opacity-50"
                  >
                    {room.membership.role === "owner" ? "방장은 퇴장 불가" : "방 나가기"}
                  </button>
                  <Link
                    href={`/chats/${encodeURIComponent(room.linkedChatRoomId)}`}
                    className="rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white"
                  >
                    채팅방 열기
                  </Link>
                </div>
              </SectionCard>
            ) : (
              <SectionCard>
                <h2 className="text-[14px] font-semibold text-gray-900">참여하기</h2>
                {room.joinRequestStatus === "pending" ? (
                  <p className="mt-2 text-[13px] text-amber-700">가입 요청이 대기 중입니다.</p>
                ) : room.canJoin ? (
                  <>
                    <input
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={24}
                      className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                      placeholder="이 방에서 사용할 닉네임"
                    />
                    {(room.requiresApproval || room.visibility === "private") ? (
                      <textarea
                        value={requestMessage}
                        onChange={(e) => setRequestMessage(e.target.value)}
                        maxLength={1000}
                        className="mt-3 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                        placeholder="운영자에게 남길 가입 메시지"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={handleJoin}
                      disabled={busy}
                      className="mt-3 rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white"
                    >
                      {room.requiresApproval || room.visibility === "private" ? "가입 요청하기" : "바로 입장하기"}
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-gray-500">현재는 이 방에 참여할 수 없습니다.</p>
                )}
              </SectionCard>
            )}

            {room.membership?.status === "joined" ? (
              <SectionCard>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-semibold text-gray-900">참가자 목록</h2>
                    <p className="mt-1 text-[12px] text-gray-500">현재 입장한 참여자를 읽기 전용으로 볼 수 있어요.</p>
                  </div>
                  <Badge text={`${visibleJoinedMembers.length}명`} />
                </div>
                {visibleJoinedMembers.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {visibleJoinedMembers.map((member) => (
                      <div key={`${member.userId}-directory`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-gray-900">
                            {member.nickname}
                            <span className="ml-2 text-[12px] font-normal text-gray-500">
                              {member.role === "owner" ? "방장" : member.role === "moderator" ? "운영진" : "멤버"}
                            </span>
                          </p>
                          <p className="mt-1 text-[12px] text-gray-500">
                            {member.joinedAt ? new Date(member.joinedAt).toLocaleString() : "입장 시각 없음"}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {member.userId === room.ownerUserId ? (
                            <Badge text="방장" />
                          ) : member.role === "moderator" ? (
                            <Badge text="부방장" />
                          ) : (
                            <Badge text="참여 중" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-gray-500">표시할 참여자가 없습니다.</p>
                )}
              </SectionCard>
            ) : null}

            {room.canManage ? (
              <>
                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">운영 요약</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <StatBadge label="참여 중" value={`${room.joinedCount}명`} />
                    <StatBadge label="가입 대기" value={`${room.pendingCount}건`} />
                    <StatBadge label="차단" value={`${room.bannedCount}명`} />
                    <StatBadge label="공지" value={`${room.noticeCount}건`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge text={room.status === "active" ? "운영 중" : room.status} />
                    {room.inviteCode ? <Badge text={`초대코드 ${room.inviteCode}`} /> : null}
                  </div>
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">방 설정</h2>
                  <input
                    value={settingsTitle}
                    onChange={(e) => setSettingsTitle(e.target.value)}
                    maxLength={80}
                    className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                    placeholder="방 제목"
                  />
                  <textarea
                    value={settingsDescription}
                    onChange={(e) => setSettingsDescription(e.target.value)}
                    maxLength={1000}
                    className="mt-3 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                    placeholder="방 소개"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ToggleButton active={settingsVisibility === "public"} onClick={() => setSettingsVisibility("public")}>
                      공개방
                    </ToggleButton>
                    <ToggleButton active={settingsVisibility === "private"} onClick={() => setSettingsVisibility("private")}>
                      비공개방
                    </ToggleButton>
                  </div>
                  <input
                    type="number"
                    min={Math.max(room.joinedCount, 2)}
                    max={2000}
                    value={settingsMaxMembers}
                    onChange={(e) => setSettingsMaxMembers(Math.max(Number(e.target.value) || room.joinedCount || 2, room.joinedCount, 2))}
                    className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                  />
                  <label className="mt-3 flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={settingsRequiresApproval}
                      onChange={(e) => setSettingsRequiresApproval(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300"
                    />
                    <span>참여 전에 관리자 승인을 받도록 설정</span>
                  </label>
                  <label className="mt-3 flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={settingsAllowSearch}
                      onChange={(e) => setSettingsAllowSearch(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300"
                      disabled={settingsVisibility === "private"}
                    />
                    <span>검색 결과에 방 노출하기</span>
                  </label>
                  <textarea
                    value={settingsEntryQuestion}
                    onChange={(e) => setSettingsEntryQuestion(e.target.value)}
                    maxLength={500}
                    className="mt-3 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                    placeholder="입장 질문"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveRoomSettings}
                      disabled={busy || !settingsTitle.trim()}
                      className="rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      설정 저장
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateInviteCode}
                      disabled={busy}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 disabled:opacity-50"
                    >
                      초대 코드 재발급
                    </button>
                    {room.inviteCode ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCopyInviteCode}
                          disabled={busy}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 disabled:opacity-50"
                        >
                          {inviteCopied ? "복사됨" : "초대 코드 복사"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyInviteLink}
                          disabled={busy}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 disabled:opacity-50"
                        >
                          {inviteLinkCopied ? "링크 복사됨" : "초대 링크 복사"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">
                    {room.activeNotice ? "현재 공지 관리" : "운영 공지 등록"}
                  </h2>
                  <input
                    value={noticeText}
                    onChange={(e) => setNoticeText(e.target.value)}
                    maxLength={200}
                    className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                    placeholder="공지 문구를 한 줄로 입력하세요"
                  />
                  <select
                    value={noticeVisibility}
                    onChange={(e) => setNoticeVisibility(e.target.value === "public" ? "public" : "members")}
                    className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
                  >
                    <option value="members">멤버 공개</option>
                    <option value="public">전체 공개</option>
                  </select>
                  <div className="mt-3 flex gap-2">
                    {room.activeNotice ? (
                      <>
                        <button
                          type="button"
                          onClick={handleUpdateNotice}
                          disabled={busy || !noticeText.trim()}
                          className="rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                        >
                          공지 수정
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteNotice}
                          disabled={busy}
                          className="rounded-xl border border-red-200 px-4 py-2 text-[13px] font-medium text-red-600 disabled:opacity-50"
                        >
                          공지 삭제
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCreateNotice}
                        disabled={busy || !noticeText.trim()}
                        className="rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        공지 등록
                      </button>
                    )}
                  </div>
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">가입 요청 관리</h2>
                  {room.pendingRequests && room.pendingRequests.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {room.pendingRequests.map((request) => (
                        <div key={request.userId} className="rounded-xl border border-gray-100 p-3">
                          <p className="text-[14px] font-medium text-gray-900">{request.nickname}</p>
                          <p className="mt-1 text-[12px] text-gray-500">{new Date(request.requestedAt).toLocaleString()}</p>
                          {request.requestMessage ? (
                            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-gray-600">{request.requestMessage}</p>
                          ) : null}
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void mutateRequest(api.approve(), "POST", { userId: request.userId })}
                              disabled={busy}
                              className="rounded-xl bg-signature px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                            >
                              승인
                            </button>
                            <button
                              type="button"
                              onClick={() => void mutateRequest(api.reject(), "POST", { userId: request.userId })}
                              disabled={busy}
                              className="rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 disabled:opacity-50"
                            >
                              거절
                            </button>
                            <button
                              type="button"
                              onClick={() => void mutateRequest(api.ban(), "POST", { userId: request.userId, reason: "manager_banned" })}
                              disabled={busy}
                              className="rounded-xl border border-red-200 px-3 py-2 text-[12px] font-medium text-red-600 disabled:opacity-50"
                            >
                              차단
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-gray-500">대기 중인 가입 요청이 없습니다.</p>
                  )}
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">부방장 관리</h2>
                  {room.members && room.members.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {room.members
                        .filter((member) => member.status === "joined")
                        .map((member) => (
                          <div key={member.userId} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-medium text-gray-900">
                                {member.nickname}
                                <span className="ml-2 text-[12px] font-normal text-gray-500">
                                  {member.role === "owner" ? "방장" : member.role === "moderator" ? "운영진" : "멤버"}
                                </span>
                              </p>
                              <p className="mt-1 text-[12px] text-gray-500">
                                {member.joinedAt ? new Date(member.joinedAt).toLocaleString() : "입장 시각 없음"}
                              </p>
                            </div>
                            {member.userId !== room.ownerUserId && room.canAssignModerators ? (
                              <div className="flex shrink-0 gap-2">
                                {member.role === "member" ? (
                                  <button
                                    type="button"
                                    onClick={() => void mutateRequest(api.moderator(), "POST", { userId: member.userId })}
                                    disabled={busy}
                                    className="rounded-xl border border-sky-200 px-3 py-2 text-[12px] font-medium text-sky-700 disabled:opacity-50"
                                  >
                                    부방장 지정
                                  </button>
                                ) : member.role === "moderator" ? (
                                  <button
                                    type="button"
                                    onClick={() => void mutateRequest(api.unmoderator(), "POST", { userId: member.userId })}
                                    disabled={busy}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 disabled:opacity-50"
                                  >
                                    부방장 해제
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <Badge text={member.role === "owner" ? "방장" : member.role === "moderator" ? "부방장" : "멤버"} />
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-gray-500">표시할 멤버가 없습니다.</p>
                  )}
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">참여 멤버 제재</h2>
                  {room.members && room.members.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {room.members
                        .filter((member) => member.status === "joined")
                        .map((member) => (
                          <div key={`${member.userId}-actions`} className="rounded-xl border border-gray-100 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-medium text-gray-900">
                                  {member.nickname}
                                  <span className="ml-2 text-[12px] font-normal text-gray-500">
                                    {member.role === "owner" ? "방장" : member.role === "moderator" ? "운영진" : "멤버"}
                                  </span>
                                </p>
                                <p className="mt-1 text-[12px] text-gray-500">
                                  {member.joinedAt ? new Date(member.joinedAt).toLocaleString() : "입장 시각 없음"}
                                </p>
                                {member.isMessageBlinded ? (
                                  <p className="mt-1 text-[12px] text-amber-700">
                                    블라인드 중{member.messageBlindReason ? ` · ${member.messageBlindReason}` : ""}
                                  </p>
                                ) : null}
                              </div>
                              {!canActOnMember(member) ? (
                                <Badge text={member.userId === room.ownerUserId ? "방장" : "관리 불가"} />
                              ) : (
                                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void mutateRequest(api.kick(), "POST", { userId: member.userId })}
                                    disabled={busy}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 disabled:opacity-50"
                                  >
                                    강퇴
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void mutateRequest(api.ban(), "POST", { userId: member.userId, reason: "manager_banned" })}
                                    disabled={busy}
                                    className="rounded-xl border border-red-200 px-3 py-2 text-[12px] font-medium text-red-600 disabled:opacity-50"
                                  >
                                    차단
                                  </button>
                                  {member.isMessageBlinded ? (
                                    <button
                                      type="button"
                                      onClick={() => void mutateRequest(api.unblind(), "POST", { userId: member.userId })}
                                      disabled={busy}
                                      className="rounded-xl border border-amber-200 px-3 py-2 text-[12px] font-medium text-amber-700 disabled:opacity-50"
                                    >
                                      블라인드 해제
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void mutateRequest(api.blind(), "POST", { userId: member.userId, reason: "manager_blinded" })}
                                      disabled={busy}
                                      className="rounded-xl border border-amber-200 px-3 py-2 text-[12px] font-medium text-amber-700 disabled:opacity-50"
                                    >
                                      블라인드
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-gray-500">표시할 멤버가 없습니다.</p>
                  )}
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">블라인드 목록</h2>
                  {room.blindedMembers && room.blindedMembers.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {room.blindedMembers.map((member) => (
                        <div key={`${member.userId}-blind`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-medium text-gray-900">
                              {member.nickname}
                              <span className="ml-2 text-[12px] font-normal text-gray-500">
                                {member.role === "owner" ? "방장" : member.role === "moderator" ? "운영진" : "멤버"}
                              </span>
                            </p>
                            <p className="mt-1 text-[12px] text-gray-500">{new Date(member.blindedAt).toLocaleString()}</p>
                            {member.blindReason ? (
                              <p className="mt-1 text-[12px] text-amber-700">{member.blindReason}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void mutateRequest(api.unblind(), "POST", { userId: member.userId })}
                            disabled={busy}
                            className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 disabled:opacity-50"
                          >
                            블라인드 해제
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-gray-500">현재 블라인드된 사용자가 없습니다.</p>
                  )}
                </SectionCard>

                <SectionCard>
                  <h2 className="text-[14px] font-semibold text-gray-900">차단 목록</h2>
                  {room.bans && room.bans.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {room.bans.map((ban) => (
                        <div key={ban.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-medium text-gray-900">{ban.nickname}</p>
                            <p className="mt-1 text-[12px] text-gray-500">{new Date(ban.createdAt).toLocaleString()}</p>
                            {ban.reason ? (
                              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-gray-600">{ban.reason}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void mutateRequest(api.unban(), "POST", { userId: ban.userId })}
                            disabled={busy}
                            className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 disabled:opacity-50"
                          >
                            차단 해제
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-gray-500">현재 차단된 사용자가 없습니다.</p>
                  )}
                </SectionCard>
              </>
            ) : null}

            {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">{children}</section>;
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      {text}
    </span>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-3 py-3 ring-1 ring-gray-100">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-[14px] font-medium ${
        active ? "border-signature bg-signature/10 text-signature" : "border-gray-200 bg-white text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
