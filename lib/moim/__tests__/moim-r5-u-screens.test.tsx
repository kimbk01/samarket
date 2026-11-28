// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import { MOIM_ACTIONS } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 R5 U — 화면 렌더 (설계 BC-user-manage.md R-A 시험).
 * 고치기 전: 종료 모임 글 상세에 댓글 입력칸·⋮ 「수정」 · 경고 모임 위임 배너에 [수락] · 시작한 일정 수정 화면이 폼으로 열림.
 */

const h = vi.hoisted(() => ({
  detail: null as unknown,
  post: null as unknown,
  schedule: null as unknown,
  respond: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string; code?: string }),
  replace: vi.fn(),
}));

vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k, language: "ko" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
  usePathname: () => "/moim/m1/posts/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/layout/use-register-main-tier1-header", () => ({ useRegisterMainTier1Header: () => undefined }));
vi.mock("@/lib/moim/use-moim-notification-read", () => ({ useMoimNotificationRead: () => undefined }));
vi.mock("@/components/moim/MoimReportSheet", () => ({ MoimReportSheet: () => null, inMoimSheet: (c: string) => c }));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayActionSheet: () => null,
  dibayConfirm: async () => true,
  DibayToast: () => null,
}));
vi.mock("@/lib/moim/moim-client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/moim-client-api")>("@/lib/moim/moim-client-api");
  return {
    ...actual,
    moimApi: {
      detail: async () => ({ ok: true, moim: h.detail }),
      post: async () => ({ ok: true, post: h.post, comments: [], commentsBefore: null, viewerIsMember: true }),
      schedule: async () => ({ ok: true, schedule: h.schedule, participants: [] }),
      respondHostTransfer: (...a: unknown[]) => h.respond(...(a as [])),
    },
  };
});

import { HostTransferBanner } from "@/components/moim/MoimDetailScreen";
import { MoimPostDetailScreen } from "@/components/moim/MoimPostDetailScreen";
import { MoimScheduleFormScreen } from "@/components/moim/MoimScheduleFormScreen";

function moim(over: Partial<MoimDetailDto> = {}): MoimDetailDto {
  return {
    id: "m1",
    name: "M",
    intro: "",
    coverImageUrl: null,
    category: null,
    topicLabel: null,
    cityLabel: null,
    joinMode: "instant",
    capacity: null,
    memberCount: 3,
    ageMinBirthYear: null,
    ageMaxBirthYear: null,
    status: "active",
    platformState: "normal",
    createdAt: "",
    updatedAt: "",
    lastActivityAt: "",
    host: null,
    joinQuestions: [],
    boards: [],
    pinnedNotices: [],
    recentPosts: [],
    upcomingSchedules: [],
    closedRetentionDays: null,
    can: Object.fromEntries(MOIM_ACTIONS.map((a) => [a, false])) as MoimDetailDto["can"],
    permissionOverrides: {},
    viewer: {
      loggedIn: true,
      status: "active",
      role: "co_host",
      nickname: "me",
      avatarUrl: null,
      bio: null,
      pendingRequestId: null,
      banned: false,
      incomingHostTransferId: null,
      outgoingHostTransfer: null,
      roomId: null,
    },
    ...over,
  };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  h.respond.mockClear();
  h.replace.mockClear();
  (await import("@/lib/moim/moim-detail-cache")).invalidateMoimDetailCache();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => Promise.resolve());
};

describe("C7 위임 배너", () => {
  it("경고 모임: [수락] 없이 안내 + [거절]만 · 일반 모임: [수락] 있음", async () => {
    await act(async () => root.render(<HostTransferBanner transferId="t1" moim={{ status: "active", platformState: "warned" }} onDone={() => undefined} onToast={() => undefined} />));
    expect(host.textContent).toContain("moim_transfer_banner_blocked");
    expect(host.textContent).not.toContain("common_accept");
    expect(host.textContent).toContain("common_reject");
    await act(async () => root.render(<HostTransferBanner transferId="t1" moim={{ status: "active", platformState: "normal" }} onDone={() => undefined} onToast={() => undefined} />));
    expect(host.textContent).toContain("common_accept");
  });

  it("낡은 요청으로 실패하면 다시 불러온다(onDone) — 배너가 남지 않게", async () => {
    const onDone = vi.fn();
    h.respond.mockResolvedValueOnce({ ok: false, error: "moim_transfer_not_found" });
    await act(async () => root.render(<HostTransferBanner transferId="t1" moim={{ status: "active", platformState: "normal" }} onDone={onDone} onToast={() => undefined} />));
    const accept = [...host.querySelectorAll("button")].find((b) => b.textContent === "common_accept")!;
    await act(async () => accept.click());
    await flush();
    expect(onDone).toHaveBeenCalled();
  });
});

describe("B2 종료 모임 글 상세", () => {
  const post = {
    id: "p1",
    moimId: "m1",
    boardId: "b1",
    boardKind: "custom",
    boardName: "My board",
    title: "T",
    body: "B",
    images: [],
    visibility: "members",
    isPinned: false,
    commentCount: 0,
    author: { userId: "me", nickname: "me", avatarUrl: null, role: "member", isActiveMember: true },
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    viewerIsAuthor: true,
  };

  it("댓글 입력칸 없음 · 하단 = 상태 안내 (⋮ 항목은 moim-r5-u-state-gate 의 판정 시험)", async () => {
    h.detail = moim({ status: "closed" });
    h.post = post;
    await act(async () => root.render(<MoimPostDetailScreen moimId="m1" postId="p1" />));
    await flush();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector('[data-testid="moim-post-footer-readonly"]')?.textContent).toBe("moim_screen_closed_notice");
  });

  it("활동 모임이면 입력칸이 있다 (같은 화면, 상태만 다름)", async () => {
    h.detail = moim();
    h.post = post;
    await act(async () => root.render(<MoimPostDetailScreen moimId="m1" postId="p1" />));
    await flush();
    expect(host.querySelector("textarea")).not.toBeNull();
  });
});

describe("C9 시작한 일정 수정 주소", () => {
  it("시작한 일정을 열면 폼 대신 「수정할 수 없어요」 안내", async () => {
    h.detail = moim();
    h.schedule = {
      id: "s1",
      moimId: "m1",
      title: "S",
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: null,
      placeText: "",
      description: "",
      images: [],
      capacity: null,
      joinMode: "first_come",
      askMotivation: false,
      status: "recruiting",
      confirmedCount: 1,
      host: { userId: "me", nickname: "me", avatarUrl: null, role: "host", isActiveMember: true },
      createdAt: "",
      updatedAt: "",
      viewer: { status: "confirmed", isHost: true, canManage: true, roomId: null },
    };
    await act(async () => root.render(<MoimScheduleFormScreen moimId="m1" scheduleId="s1" />));
    await flush();
    expect(host.textContent).toContain("moim_schedule_edit_unavailable");
    expect(host.querySelector('input[type="date"]')).toBeNull();
  });
});
