"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { philifeMeetingApi } from "@domain/philife/api";

type ExtraFromApi = {
  id: string;
  title: string;
  description?: string | null;
  room_type: "sub" | "private";
  is_private: boolean;
  linked_chat_room_id: string;
  created_at: string;
};

type ListRow =
  | {
      key: "main";
      kind: "main";
      title: string;
      subtitle: string;
      roomTypeLabel: string;
      isPrivate: false;
      chatRoomId: string | null;
    }
  | {
      key: string;
      kind: "extra";
      title: string;
      subtitle: string;
      roomTypeLabel: string;
      isPrivate: boolean;
      chatRoomId: string;
      extraId: string;
    }
  | {
      key: "demo-sub" | "demo-private";
      kind: "demo";
      title: string;
      subtitle: string;
      roomTypeLabel: string;
      isPrivate: boolean;
      chatRoomId: null;
    };

interface MeetingChatTabProps {
  meetingId: string;
  chatRoomId: string | null;
  viewerStatus: "joined" | "pending" | "left" | "kicked" | "banned" | null;
  isHost?: boolean;
  /** 채팅방 생성 시 참여자 선택 */
  joinedPickMembers?: { userId: string; name: string }[];
  /** tab: 탭 안에서 목록·상세 | full: 오픈채팅 페이지 전체가 채팅 중심 */
  embedMode?: "tab" | "full";
}

type CreateKind = "sub_all" | "sub_selected" | "private_selected";

/**
 * 채팅 탭: 채팅방 목록 → 선택 시 상세(기존 그룹 채팅 UI).
 * Step B: API 목록 + 모임장/공동운영자 채팅방 생성.
 */
export function MeetingChatTab({
  meetingId,
  chatRoomId: mainChatRoomIdProp,
  viewerStatus,
  isHost = false,
  joinedPickMembers = [],
  embedMode = "tab",
}: MeetingChatTabProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const didAutoOpenMain = useRef(false);
  const [apiMainChatRoomId, setApiMainChatRoomId] = useState<string | null>(null);
  const [extraRooms, setExtraRooms] = useState<ExtraFromApi[]>([]);
  const [useClientDemoExtras, setUseClientDemoExtras] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createKind, setCreateKind] = useState<CreateKind>("sub_all");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const effectiveMainChatId = apiMainChatRoomId ?? mainChatRoomIdProp;

  const loadRooms = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    setSchemaMissing(false);
    try {
      const res = await fetch(philifeMeetingApi(meetingId).chatRooms(), {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
        mainChatRoomId?: string | null;
        extraRooms?: ExtraFromApi[];
        useClientDemoExtras?: boolean;
      };
      if (!res.ok || !j?.ok) {
        if (j?.error === "schema_missing") {
          setSchemaMissing(true);
          setApiMainChatRoomId(null);
          setExtraRooms([]);
          setUseClientDemoExtras(true);
        } else {
          setListError(j?.message ?? j?.error ?? "목록을 불러오지 못했습니다.");
        }
        return;
      }
      setApiMainChatRoomId(j.mainChatRoomId ?? null);
      setExtraRooms(Array.isArray(j.extraRooms) ? j.extraRooms : []);
      setUseClientDemoExtras(!!j.useClientDemoExtras);
    } catch {
      setListError("네트워크 오류가 발생했습니다.");
    } finally {
      setListLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (viewerStatus !== "joined") return;
    void loadRooms();
  }, [viewerStatus, loadRooms]);

  /**
   * 오픈채팅 전체 화면: 메인 방 ID가 서버 props에 이미 있으면 목록 API(loadRooms)를 기다리지 않고 바로 입장.
   * 의존성 배열 길이를 항상 1로 고정(React 19 / Strict에서 가변 길이 이슈 방지).
   */
  const canAutoOpenMainChat = useMemo(() => {
    if (embedMode !== "full" || viewerStatus !== "joined") return false;
    const mainId = String(apiMainChatRoomId ?? mainChatRoomIdProp ?? "").trim();
    if (!mainId) return false;
    const hasMainFromProps = Boolean(String(mainChatRoomIdProp ?? "").trim());
    if (!hasMainFromProps && listLoading) return false;
    return true;
  }, [embedMode, viewerStatus, listLoading, apiMainChatRoomId, mainChatRoomIdProp]);

  useEffect(() => {
    if (!canAutoOpenMainChat) return;
    if (didAutoOpenMain.current) return;
    didAutoOpenMain.current = true;
    setSelectedKey("main");
  }, [canAutoOpenMainChat]);

  const otherMembers = useMemo(
    () => joinedPickMembers.filter((m) => m.userId),
    [joinedPickMembers],
  );

  const rows: ListRow[] = useMemo(() => {
    const main: ListRow = {
      key: "main",
      kind: "main",
      title: "메인 채팅",
      subtitle: effectiveMainChatId
        ? "모든 승인 멤버와 이야기해요."
        : "기본 오픈채팅 (생성 후 입장)",
      roomTypeLabel: "기본",
      isPrivate: false,
      chatRoomId: effectiveMainChatId,
    };

    const extras: ListRow[] = extraRooms.map((r) => ({
      key: `extra:${r.id}`,
      kind: "extra",
      title: r.title,
      subtitle: r.is_private ? "비공개 채팅 · 초대된 멤버만 열람" : "선택된 멤버와 대화",
      roomTypeLabel: r.is_private ? "비공개 채팅" : "서브",
      isPrivate: r.is_private,
      chatRoomId: r.linked_chat_room_id,
      extraId: r.id,
    }));

    const demos: ListRow[] = useClientDemoExtras
      ? [
          {
            key: "demo-sub",
            kind: "demo",
            title: "서브 방 (샘플)",
            subtitle: "서브 채팅 (샘플 · 실제 방은 생성으로 대체)",
            roomTypeLabel: "서브",
            isPrivate: false,
            chatRoomId: null,
          },
          {
            key: "demo-private",
            kind: "demo",
            title: "차량 이동팀",
            subtitle: "비공개 · 초대된 멤버만 (샘플)",
            roomTypeLabel: "비공개",
            isPrivate: true,
            chatRoomId: null,
          },
        ]
      : [];

    return [main, ...extras, ...demos];
  }, [effectiveMainChatId, extraRooms, useClientDemoExtras]);

  const selected = useMemo(() => rows.find((r) => r.key === selectedKey) ?? null, [rows, selectedKey]);

  const goList = useCallback(() => setSelectedKey(null), []);

  const toggleParticipant = useCallback((userId: string) => {
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const submitCreate = async () => {
    setCreateError(null);
    const title = createTitle.trim();
    if (!title) {
      setCreateError("채팅방 이름을 입력하세요.");
      return;
    }
    const kind = createKind;
    const ids = [...selectedParticipantIds];
    if (kind === "sub_all") {
      /* ok */
    } else if (kind === "sub_selected" && ids.length < 1) {
      setCreateError("일부 멤버 모드에서는 최소 1명을 선택하세요.");
      return;
    } else if (kind === "private_selected" && ids.length < 1) {
      setCreateError("비공개 채팅은 초대할 멤버를 1명 이상 선택하세요.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(philifeMeetingApi(meetingId).chatRooms(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: createDesc.trim() || null,
          kind,
          participantUserIds: kind === "sub_all" ? [] : ids,
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
        meetingChatRoom?: ExtraFromApi;
      };
      if (!res.ok || !j?.ok || !j.meetingChatRoom) {
        if (j?.error === "sample_readonly") {
          setCreateError("샘플 모임에서는 생성할 수 없습니다. 실제 DB 모임에서 시도하세요.");
        } else {
          setCreateError(j?.message ?? j?.error ?? "생성에 실패했습니다.");
        }
        return;
      }
      setShowCreate(false);
      setCreateTitle("");
      setCreateDesc("");
      setCreateKind("sub_all");
      setSelectedParticipantIds(new Set());
      await loadRooms();
      setSelectedKey(`extra:${j.meetingChatRoom.id}`);
    } catch {
      setCreateError("네트워크 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  };

  if (viewerStatus !== "joined") {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
        <p className="text-[14px] font-medium text-gray-700">
          {viewerStatus === "pending"
            ? "승인 대기 중입니다. 승인 후 채팅에 참여할 수 있어요."
            : viewerStatus === "banned" || viewerStatus === "kicked"
              ? "이 오픈채팅에는 접근할 수 없습니다."
              : "오픈채팅에 참여하면 open chat에서 대화할 수 있어요."}
        </p>
      </div>
    );
  }

  const fullChat = embedMode === "full";
  const listBackBtnClass = fullChat
    ? "shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-[12px] font-semibold text-gray-800 shadow-sm active:bg-gray-50"
    : "flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-gray-800 shadow-sm active:bg-gray-50";

  /* ── 상세: 메인 방 (실제 채팅) ── */
  if (selected?.kind === "main" && selected.chatRoomId) {
    return (
      <div className={fullChat ? "flex min-h-0 flex-1 flex-col gap-2" : "flex flex-col gap-3"}>
        <button type="button" onClick={goList} className={listBackBtnClass}>
          {fullChat ? (
            "다른 채팅방"
          ) : (
            <>
              <span className="text-gray-500" aria-hidden>
                ←
              </span>
              채팅방 목록
            </>
          )}
        </button>
        <ChatRoomScreen
          roomId={selected.chatRoomId}
          listHref="/chats/philife?tab=inbox"
          embedded
          embeddedFill={fullChat}
        />
      </div>
    );
  }

  /* ── 상세: DB 부가 방 ── */
  if (selected?.kind === "extra" && selected.chatRoomId) {
    return (
      <div className={fullChat ? "flex min-h-0 flex-1 flex-col gap-2" : "flex flex-col gap-3"}>
        <button type="button" onClick={goList} className={listBackBtnClass}>
          {fullChat ? (
            "다른 채팅방"
          ) : (
            <>
              <span className="text-gray-500" aria-hidden>
                ←
              </span>
              채팅방 목록
            </>
          )}
        </button>
        <ChatRoomScreen
          roomId={selected.chatRoomId}
          listHref="/chats/philife?tab=inbox"
          embedded
          embeddedFill={fullChat}
        />
      </div>
    );
  }

  /* ── 상세: 메인 미연결 / 데모 (extra는 위에서 모두 처리) ── */
  if (selected && (selected.kind === "main" || selected.kind === "demo")) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={goList}
          className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-gray-800 shadow-sm active:bg-gray-50"
        >
          <span className="text-gray-500" aria-hidden>
            ←
          </span>
          채팅방 목록
        </button>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-emerald-700">{selected.roomTypeLabel}</p>
              <h2 className="mt-0.5 truncate text-[16px] font-bold text-gray-900">
                {selected.isPrivate ? "🔒 " : ""}
                {selected.title}
              </h2>
              <p className="mt-1 text-[12px] text-gray-500">{selected.subtitle}</p>
            </div>
          </div>
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-gray-700">
              {selected.kind === "main"
                ? "기본 채팅방 없음"
                : selected.isPrivate
                  ? "비공개 채팅 (샘플)"
                  : "서브 채팅 (샘플)"}
            </p>
            <p className="max-w-[280px] text-[12px] leading-relaxed text-gray-500">
              {selected.kind === "main"
                ? "모임 기본 채팅방이 아직 연결되지 않았습니다. 참여 시 자동 생성되거나 운영자에게 문의하세요."
                : selected.kind === "demo"
                  ? "실제 모임에서는 아래 목록의 「채팅방 만들기」로 서브·비공개 방을 만들 수 있어요."
                  : "초대된 멤버만 입장합니다. Step C에서 접근 제한을 더 강화합니다."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── 목록 ── */
  return (
    <div className={fullChat ? "flex min-h-0 flex-1 flex-col gap-3" : "flex flex-col gap-3"}>
      {schemaMissing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          DB에 <code className="rounded bg-amber-100 px-1">meeting_chat_rooms</code> 테이블이 없습니다.
          <code className="ml-1 rounded bg-amber-100 px-1">20260331150000_meeting_chat_rooms.sql</code> 마이그레이션을 적용한 뒤 새로고침하세요.
        </p>
      ) : null}
      {listError ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-800">{listError}</p>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white p-1 shadow-sm">
        {listLoading ? (
          <div className="px-3 py-8 text-center text-[13px] text-gray-500">채팅방 목록 불러오는 중…</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((room) => (
              <li key={room.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(room.key)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[18px]">
                    {room.isPrivate ? "🔒" : "💬"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-bold text-gray-900">{room.title}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                        {room.roomTypeLabel}
                      </span>
                      {room.isPrivate ? (
                        <span className="rounded-full bg-signature/5 px-2 py-0.5 text-[10px] font-semibold text-gray-800">
                          비공개 채팅
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-gray-500">{room.subtitle}</p>
                    {room.chatRoomId === null ? (
                      <p className="mt-1 text-[11px] text-amber-700/90">
                        {room.kind === "main" ? "채팅방 미연결" : room.kind === "demo" ? "샘플" : "연결 예정"}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 self-center text-gray-300" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isHost ? (
        <>
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setCreateError(null);
            }}
            className="w-full rounded-xl border border-dashed border-emerald-400 bg-emerald-50 py-3 text-[13px] font-semibold text-emerald-900 active:bg-emerald-100"
          >
            {showCreate ? "채팅방 만들기 닫기" : "채팅방 만들기"}
          </button>

          {showCreate ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[13px] font-bold text-gray-900">새 채팅방</p>
              {createError ? (
                <p className="mt-2 text-[12px] text-red-600">{createError}</p>
              ) : null}
              <label className="mt-3 block text-[11px] font-semibold text-gray-500">이름</label>
              <input
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="예: 서브 주제, 차량 이동팀"
                maxLength={80}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px]"
              />
              <label className="mt-3 block text-[11px] font-semibold text-gray-500">설명 (선택)</label>
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="참여자에게 보이는 짧은 설명"
                maxLength={500}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
              />

              <p className="mt-3 text-[11px] font-semibold text-gray-500">유형</p>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="mcr-kind"
                    checked={createKind === "sub_all"}
                    onChange={() => setCreateKind("sub_all")}
                  />
                  전체 멤버 (승인된 모든 참가자)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="mcr-kind"
                    checked={createKind === "sub_selected"}
                    onChange={() => setCreateKind("sub_selected")}
                  />
                  일부 멤버만
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="mcr-kind"
                    checked={createKind === "private_selected"}
                    onChange={() => setCreateKind("private_selected")}
                  />
                  비공개 채팅 (초대한 멤버만)
                </label>
              </div>

              {(createKind === "sub_selected" || createKind === "private_selected") && otherMembers.length > 0 ? (
                <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-gray-100 p-2">
                  <p className="mb-2 text-[11px] font-semibold text-gray-500">참여 멤버 선택</p>
                  {otherMembers.map((m) => (
                    <label key={m.userId} className="flex cursor-pointer items-center gap-2 py-1 text-[13px]">
                      <input
                        type="checkbox"
                        checked={selectedParticipantIds.has(m.userId)}
                        onChange={() => toggleParticipant(m.userId)}
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                disabled={creating}
                onClick={() => void submitCreate()}
                className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {creating ? "생성 중…" : "생성하기"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
