"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";
import { philifeOpenChatRoomsUrl } from "@/lib/philife/api";
import { philifeAppPaths } from "@/lib/philife/paths";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";
import { PhilifeTitleWithRegionRow } from "@/components/philife/PhilifeTitleWithRegionRow";

type OpenChatRoomSummary = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  requiresApproval: boolean;
  joinedCount: number;
  maxMembers: number;
  membership: { nickname: string; role: string; status: string } | null;
};

export function OpenChatHubPage() {
  const notificationUnreadCount = useMyNotificationUnreadCount();
  const [discoverRooms, setDiscoverRooms] = useState<OpenChatRoomSummary[]>([]);
  const [myRooms, setMyRooms] = useState<OpenChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"popular" | "latest">("popular");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  const discoverQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sort", sort);
    params.set("limit", "24");
    if (query.trim()) params.set("q", query.trim());
    return params.toString();
  }, [query, sort]);

  const myRoomsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("mine", "1");
    params.set("sort", "latest");
    params.set("limit", "24");
    return params.toString();
  }, []);

  const discoverQueryRef = useRef(discoverQuery);
  const myRoomsQueryRef = useRef(myRoomsQuery);
  discoverQueryRef.current = discoverQuery;
  myRoomsQueryRef.current = myRoomsQuery;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load(opts?: { signal?: AbortSignal }) {
      const signal = opts?.signal;
      const dq = discoverQueryRef.current;
      const mq = myRoomsQueryRef.current;
      setLoading(true);
      setError("");
      try {
        const fetchOpts: RequestInit = {
          cache: "no-store",
          credentials: "include",
          ...(signal ? { signal } : {}),
        };
        const [discoverRes, mineRes] = await Promise.all([
          fetch(philifeOpenChatRoomsUrl(dq), fetchOpts),
          fetch(philifeOpenChatRoomsUrl(mq), fetchOpts),
        ]);

        const discoverJson = (await discoverRes.json()) as { ok?: boolean; rooms?: OpenChatRoomSummary[] };
        const mineJson = (await mineRes.json()) as { ok?: boolean; rooms?: OpenChatRoomSummary[] };

        if (cancelled) return;

        if (!discoverRes.ok || !mineRes.ok || !discoverJson.ok || !mineJson.ok) {
          setError("오픈채팅 목록을 불러오지 못했습니다.");
          setDiscoverRooms([]);
          setMyRooms([]);
          return;
        }

        setDiscoverRooms(discoverJson.rooms ?? []);
        setMyRooms(mineJson.rooms ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (cancelled) return;
        setError("오픈채팅 목록을 불러오지 못했습니다.");
        setDiscoverRooms([]);
        setMyRooms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load({ signal: controller.signal });

    /** bfcache 복원(뒤로가기) 시 이전 React 상태 그대로라 목록이 갱신되지 않는 문제 보정 */
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void load();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [discoverQuery, myRoomsQuery]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <MySubpageHeader
        title={<PhilifeTitleWithRegionRow />}
        backHref="/home"
        preferHistoryBack
        hideCtaStrip
        rightSlot={
          <div className="flex min-w-0 max-w-[140px] shrink-0 items-center justify-end gap-0.5 sm:max-w-none">
            <Link
              href={philifeAppPaths.writeMeeting}
              className="truncate rounded-lg px-2 py-1.5 text-[13px] font-medium text-foreground hover:bg-ig-highlight"
            >
              모임 글쓰기
            </Link>
            <MyHubHeaderActions notificationUnreadCount={notificationUnreadCount} />
          </div>
        }
      />

      <div className={`${APP_MAIN_GUTTER_X_CLASS} space-y-6 pt-2`}>
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <h2 className="text-[17px] font-semibold text-gray-900">오픈채팅 허브</h2>
          <p className="mt-1 text-[13px] leading-5 text-gray-600">
            카카오 오픈채팅처럼 방을 탐색하고, 방마다 다른 닉네임으로 참여할 수 있습니다.
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQuery(queryInput.trim());
                }}
                placeholder="방 제목이나 소개로 검색"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
              />
              <button
                type="button"
                onClick={() => setQuery(queryInput.trim())}
                className="rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white"
              >
                검색
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SortChip active={sort === "popular"} onClick={() => setSort("popular")}>
                인기순
              </SortChip>
              <SortChip active={sort === "latest"} onClick={() => setSort("latest")}>
                최신순
              </SortChip>
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setQueryInput("");
                  }}
                  className="rounded-full border border-gray-200 px-3 py-1 text-[12px] font-medium text-gray-600"
                >
                  검색 초기화
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              href={philifeAppPaths.writeMeeting}
              className="rounded-xl bg-signature px-4 py-2 text-[13px] font-semibold text-white"
            >
              모임 글 쓰기
            </Link>
            <Link
              href={philifeAppPaths.chats}
              className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700"
            >
              기존 채팅 허브
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-gray-900">내 오픈채팅</h3>
            <span className="text-[12px] text-gray-500">{myRooms.length}개</span>
          </div>
          {loading ? (
            <OpenChatEmptyCard text="불러오는 중..." />
          ) : myRooms.length ? (
            <div className="space-y-3">
              {myRooms.map((room) => (
                <OpenChatRoomCard key={room.id} room={room} />
              ))}
            </div>
          ) : (
            <OpenChatEmptyCard text="아직 참여 중인 오픈채팅이 없습니다." />
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-gray-900">탐색</h3>
            <span className="text-[12px] text-gray-500">{discoverRooms.length}개</span>
          </div>
          {query ? (
            <p className="mb-3 text-[12px] text-gray-500">
              검색어: <span className="font-medium text-gray-700">{query}</span>
            </p>
          ) : null}
          {error ? (
            <OpenChatEmptyCard text={error} />
          ) : loading ? (
            <OpenChatEmptyCard text="불러오는 중..." />
          ) : discoverRooms.length ? (
            <div className="space-y-3">
              {discoverRooms.map((room) => (
                <OpenChatRoomCard key={room.id} room={room} />
              ))}
            </div>
          ) : (
            <OpenChatEmptyCard text="지금은 탐색 가능한 오픈채팅이 없습니다." />
          )}
        </section>
      </div>
    </div>
  );
}

function OpenChatRoomCard({ room }: { room: OpenChatRoomSummary }) {
  return (
    <Link
      href={philifeAppPaths.openChatRoom(room.id)}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-[15px] font-semibold text-gray-900">{room.title}</h4>
            <Badge text={room.visibility === "public" ? "공개" : "비공개"} />
            {room.requiresApproval ? <Badge text="승인제" /> : null}
            {room.membership ? <Badge text={room.membership.status === "joined" ? "참여 중" : "대기 중"} /> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-gray-600">
            {room.description || "소개가 아직 없습니다."}
          </p>
        </div>
        <span className="shrink-0 text-[12px] text-gray-500">
          {room.joinedCount}/{room.maxMembers}
        </span>
      </div>
      {room.membership ? (
        <p className="mt-3 text-[12px] text-gray-500">
          내 닉네임: <span className="font-medium text-gray-700">{room.membership.nickname}</span>
        </p>
      ) : null}
    </Link>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      {text}
    </span>
  );
}

function OpenChatEmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-6 text-center text-[13px] text-gray-500 shadow-sm ring-1 ring-black/5">
      {text}
    </div>
  );
}

function SortChip({
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
      className={`rounded-full px-3 py-1 text-[12px] font-medium ${
        active ? "bg-signature text-white" : "border border-gray-200 bg-white text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
