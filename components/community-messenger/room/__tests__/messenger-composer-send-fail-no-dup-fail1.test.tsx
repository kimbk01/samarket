// @vitest-environment jsdom
/**
 * FAIL-1 (docs/audit/messenger-chat-device-fail-design-2026-11-18.md) — 전송 실패 시 실패 행과 입력창에 같은 글이 둘 다 남음.
 * 실제 입력창 컴포넌트(Phase2Composer·Pass1ComposerShell) + 실제 outbox 훅(`useMessengerTextSendOutbox`) + fetch 모의.
 * 입력창 복원 여부는 outbox 한 곳만 정한다:
 *  - 결과 불명(네트워크·503): 실패 행 1 · 입력창 빈 값
 *  - 확실한 거절(403) + 같은 화면: 실패 행 0 · 입력창 복원(방별 초안 저장 포함)
 *  - 실패 전 입력창 수정(dirty): 복원 안 함
 *  - 재전송 실패(restoreOnFail 없음): 입력창 그대로
 */
import { act, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

type SectorProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
};
const sector = vi.hoisted(() => ({ props: null as SectorProps | null }));

vi.mock("@/lib/community-messenger/cm-ui-translate", () => ({
  translateCmUi: (key: string) => key,
}));
vi.mock("@/lib/community-messenger/stores/messenger-snackbar-store", () => ({
  showMessengerSnackbar: () => undefined,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k }),
}));
/** 입력창 UI(textarea·버튼)만 대체 — draft·onDraftChange·onSend 는 실제 컴포넌트가 넘긴 값 그대로 */
vi.mock("@/components/community-messenger/line-ui", () => ({
  MessengerComposerSector: (props: SectorProps) => {
    sector.props = props;
    return null;
  },
}));
vi.mock("@/components/community-messenger/room/community-messenger-room-phase2-lazy", () => ({
  CommunityMessengerTradeProcessSection: () => null,
  GroupRoomCallOverlay: () => null,
  MessengerTradeChatRoomDetailPrefetch: () => null,
  SeedTradeChatDetailMemoryFromSnapshot: () => null,
  VoiceMessageBubble: () => null,
}));
vi.mock("@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing", () => ({
  useCommunityMessengerRoomTypingPublisher: () => undefined,
}));

import { CommunityMessengerRoomPhase2Composer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer";
import { CommunityMessengerRoomPass1ComposerShell } from "@/components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell";
import {
  MessengerRoomPhase2ComposerProvider,
  type MessengerRoomPhase2ComposerViewModel,
} from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";
import { MessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { MessengerRoomComposerEarlyContext } from "@/lib/community-messenger/room/messenger-room-composer-early-context";
import { useMessengerTextSendOutbox, __resetMessengerTextSendInflightForTest } from "@/lib/community-messenger/room/phase2/use-messenger-text-send-outbox";
import {
  beginActiveComposerFailRestoreSession,
  resolveSendRestoreOnFail,
} from "@/lib/community-messenger/room/messenger-composer-fail-restore-active";
import { clearMessengerFailedTextSends } from "@/lib/community-messenger/room/messenger-failed-text-store";
import {
  getMessengerOutboundFailedSend,
  type MessengerUnconfirmedTextSend,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";
import { clearRoomComposerDraft, readRoomComposerDraft } from "@/lib/community-messenger/room/messenger-room-composer-draft-storage";
import { DIBAY_AUTH_BOUND_USER_ID_KEY } from "@/lib/auth/client-instance-id";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM = "22222222-2222-4222-8222-222222222222";
type Row = CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };
type Kind = "phase2" | "pass1";

const api: {
  rows: Row[];
  message: string;
  sendMessage: ((text?: string, opts?: { fromComposer?: boolean }) => Promise<boolean>) | null;
} = { rows: [], message: "", sendMessage: null };

/**
 * 컨트롤러 `sendMessage`(use-messenger-room-phase2-controller.ts — setMessage("") → beginActiveComposerFailRestoreSession →
 * 보내는 중 행 → runTextSendAttempt(restoreOnFail = 보낸 글))와 같은 순서로 실제 outbox 를 부른다.
 */
function Host({ kind }: { kind: Kind }) {
  const [message, setMessage] = useState("");
  /** 방 화면(phase1)과 같은 복원 1회성 신호 */
  const [composerRestoreNonce, setComposerRestoreNonce] = useState(0);
  const restoreComposerMessage = useCallback((text: string) => {
    setMessage(text);
    setComposerRestoreNonce((n) => n + 1);
  }, []);
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;
  api.rows = rows;
  api.message = message;
  const unconfirmed = useRef<MessengerUnconfirmedTextSend | null>(null);
  const failedIds = useRef<Set<string>>(new Set());
  const seq = useRef(0);
  const { runTextSendAttemptRef } = useMessengerTextSendOutbox({
    streamRoomId: ROOM,
    restoreReady: true,
    roomMessages: rows,
    roomMessagesRef: rowsRef,
    setRoomMessages: setRows,
    restoreComposerMessage,
    resolveOutboundSender: () => ({ senderId: "me", senderLabel: "me" }),
    viewerUserId: "me",
    nextPendingRowId: () => `pending:${ROOM}:${seq.current++}`,
    unconfirmedTextSendRef: unconfirmed,
    failedOutboundRowIdsRef: failedIds,
    getRoomActionErrorMessage: (e) => `err:${e ?? ""}`,
    redirectIfMessengerAuthBlocked: () => false,
    onTextSendConfirmed: () => undefined,
  });
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sendMessage = useCallback(
    async (textOverride?: string, opts?: { fromComposer?: boolean }): Promise<boolean> => {
      const raw = (textOverride ?? message).trim();
      if (!raw) return false;
      setMessage("");
      /** 컨트롤러와 같은 규칙 함수 — 입력창에서 시작한 전송만 복원 대상 */
      const restoreOnFail = resolveSendRestoreOnFail(raw, opts);
      const failRestoreGeneration = restoreOnFail !== undefined ? beginActiveComposerFailRestoreSession() : 0;
      const n = seq.current++;
      const tempId = `pending:${ROOM}:${n}`;
      const clientMessageId = `cid-${n}`;
      const row = {
        id: tempId,
        roomId: ROOM,
        senderId: "me",
        senderLabel: "me",
        messageType: "text",
        content: raw,
        createdAt: "2026-11-18T02:00:00.000Z",
        clientMessageId,
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
      } as Row;
      rowsRef.current = [...rowsRef.current, row];
      setRows((prev) => [...prev, row]);
      return runTextSendAttemptRef.current({
        tempId,
        clientMessageId,
        content: raw,
        replyId: "",
        restoreOnFail,
        failRestoreGeneration,
      });
    },
    [message, runTextSendAttemptRef]
  );
  api.sendMessage = sendMessage;
  const vm = useMemo(
    () =>
      ({
        snapshot: {
          room: { id: ROOM, roomType: "direct", roomStatus: "active", contextMeta: null },
          members: [],
          viewerUserId: "me",
          clientShellPlaceholder: false,
        },
        message,
        composerRestoreNonce,
        roomUnavailable: false,
        busy: null,
        sendMessage,
        setActiveSheet: () => undefined,
        composerTextareaRef,
        voiceRecording: false,
        voiceMicArming: false,
        voiceHandsFree: false,
        voiceRecordElapsedMs: 0,
        voiceLivePreviewBars: [],
        voiceCancelHint: false,
        voiceLockHint: false,
        finalizeVoiceRecording: async () => undefined,
        onVoiceMicPointerDown: () => undefined,
        onVoiceMicPointerMove: () => undefined,
        onVoiceMicPointerUp: () => undefined,
        onVoiceMicPointerCancel: () => undefined,
      }) as unknown as MessengerRoomPhase2ComposerViewModel,
    [message, composerRestoreNonce, sendMessage]
  );
  const phase1 = useMemo(
    () =>
      ({
        notifyComposerTextareaVisibleForSeededBootstrap: () => undefined,
        readSeededSilentHoldGeneration: () => 0,
        loading: false,
        snapshot: vm.snapshot,
        replyToMessage: null,
        setReplyToMessage: () => undefined,
        editingMessage: null,
        setEditingMessage: () => undefined,
        setMessage,
        focusTimelineMessage: async () => undefined,
      }) as unknown as NonNullable<Parameters<typeof MessengerRoomClientPhase1Context.Provider>[0]["value"]>,
    [vm.snapshot]
  );
  let body: ReactNode;
  if (kind === "phase2") {
    body = (
      <MessengerRoomPhase2ComposerProvider value={vm}>
        <CommunityMessengerRoomPhase2Composer />
      </MessengerRoomPhase2ComposerProvider>
    );
  } else {
    body = (
      <MessengerRoomComposerEarlyContext.Provider value={vm}>
        <CommunityMessengerRoomPass1ComposerShell composerEntryVisible />
      </MessengerRoomComposerEarlyContext.Provider>
    );
  }
  return <MessengerRoomClientPhase1Context.Provider value={phase1}>{body}</MessengerRoomClientPhase1Context.Provider>;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function settle() {
  await act(async () => {
    await tick(20);
  });
  await act(async () => {
    await tick(0);
  });
}

let roots: Root[] = [];
let hosts: HTMLDivElement[] = [];

async function mount(kind: Kind) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  hosts.push(host);
  roots.push(root);
  act(() => root.render(<Host kind={kind} />));
  /** Phase2 입력창은 idle 뒤 heavy 기능(vm.message 동기화)을 켠다 */
  await settle();
}

function draft() {
  return sector.props?.draft ?? "";
}
async function type(value: string) {
  await act(async () => {
    sector.props!.onDraftChange(value);
  });
}
/** 전송 버튼 — 응답까지 기다림 */
async function send() {
  await act(async () => {
    await sector.props!.onSend();
  });
  await settle();
}
/** 전송 버튼 — 시작만(응답 전 입력창 수정 시나리오) */
async function sendStart(): Promise<{ done: Promise<void> }> {
  let p: Promise<void> | void = undefined;
  await act(async () => {
    p = sector.props!.onSend();
  });
  /** 객체로 감싼다 — async 함수가 promise 를 그대로 돌려주면 응답까지 기다려 버린다 */
  return { done: Promise.resolve(p) };
}
function failedRows() {
  return api.rows.filter((r) => r.pending && r.sendFailed);
}

const fetchMock = vi.fn();
beforeEach(() => {
  localStorage.setItem(DIBAY_AUTH_BOUND_USER_ID_KEY, "me");
  __resetMessengerTextSendInflightForTest();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearMessengerFailedTextSends();
  clearRoomComposerDraft(ROOM);
  sector.props = null;
});
afterEach(() => {
  for (const r of roots) {
    try {
      act(() => r.unmount());
    } catch {
      /* already unmounted */
    }
  }
  for (const h of hosts) h.remove();
  roots = [];
  hosts = [];
  vi.unstubAllGlobals();
  clearMessengerFailedTextSends();
  clearRoomComposerDraft(ROOM);
});

describe.each<Kind>(["phase2", "pass1"])("FAIL-1 입력창 중복 복원 없음 — %s", (kind) => {
  it("결과 불명(네트워크 예외) → 실패 행 1 · 입력창 빈 값", async () => {
    await mount(kind);
    await type("hello");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await send();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failedRows()).toHaveLength(1);
    expect(failedRows()[0]!.content).toBe("hello");
    expect(draft()).toBe("");
    expect(api.message).toBe("");
    if (kind === "phase2") expect(readRoomComposerDraft(ROOM)).toBe("");
  });

  it("결과 불명(503) → 실패 행 1 · 입력창 빈 값", async () => {
    await mount(kind);
    await type("hello 503");
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable", error: "x" }));
    await send();
    expect(failedRows()).toHaveLength(1);
    expect(draft()).toBe("");
    if (kind === "phase2") expect(readRoomComposerDraft(ROOM)).toBe("");
  });

  it("확실한 거절(403) → 실패 행 0 · 입력창 복원", async () => {
    await mount(kind);
    await type("denied");
    /**
     * 응답은 전송 클릭이 화면에 반영된 뒤 도착한다(실제 네트워크 왕복). 한 act 안에서 바로 응답하면
     * 입력창 비움("")과 복원("denied")이 한 번에 묶여 vm.message 변화가 사라지므로 클릭과 응답을 나눈다.
     */
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    const pending = await sendStart();
    expect(draft()).toBe("");
    expect(api.rows).toHaveLength(1);
    await act(async () => {
      resolveFetch(jsonResponse(403, { ok: false, error: "room_readonly" }));
      await pending.done;
    });
    await settle();
    expect(api.rows).toHaveLength(0);
    expect(draft()).toBe("denied");
    /** 방을 나갔다 와도 입력창에 남도록 방별 초안에도 저장(수정 전 Phase2 입력창이 하던 동작) */
    if (kind === "phase2") expect(readRoomComposerDraft(ROOM)).toBe("denied");
  });

  it("실패 전에 입력창을 고쳤으면(403이라도) 복원하지 않음 — 고친 글 유지 · 실패 행 유지", async () => {
    await mount(kind);
    await type("first");
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    const pending = await sendStart();
    expect(draft()).toBe("");
    await type("second");
    await act(async () => {
      resolveFetch(jsonResponse(403, { ok: false, error: "room_readonly" }));
      await pending.done;
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(draft()).toBe("second");
    expect(failedRows()).toHaveLength(1);
    expect(failedRows()[0]!.content).toBe("first");
  });

  it("재전송 실패(403) → 입력창 그대로", async () => {
    await mount(kind);
    await type("retry me");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await send();
    const row = failedRows()[0]!;
    expect(row).toBeTruthy();
    await type("typing now");
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: "room_readonly" }));
    await act(async () => {
      getMessengerOutboundFailedSend(row.id)!.retry();
      await tick(0);
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(draft()).toBe("typing now");
    expect(failedRows()).toHaveLength(1);
  });
  it("감사 #2: vm.message 가 이미 보낸 글과 같을 때 비움·거절 복원이 한 렌더로 묶여도 입력창 복원", async () => {
    await mount(kind);
    await type("again");
    /** 1회차 거절(클릭·응답 분리) → 입력창·vm.message = "again" */
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    const first = await sendStart();
    await act(async () => {
      resolveFetch(jsonResponse(403, { ok: false, error: "room_readonly" }));
      await first.done;
    });
    await settle();
    expect(draft()).toBe("again");
    expect(api.message).toBe("again");
    /** 2회차: 같은 글을 그대로 전송 — 응답이 같은 act 안에 와서 setMessage("") 와 복원("again")이 한 렌더로 묶임 */
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: "room_readonly" }));
    await send();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(api.rows).toHaveLength(0);
    expect(draft()).toBe("again");
  });
});

describe("FAIL-1 감사 #1: 입력창 밖 전송은 입력창·방별 초안을 건드리지 않음 — phase2", () => {
  it("입력창에 초안 X → 입력창 밖 전송(주문 채팅 확인 등) 403 → 초안 X 유지 · 실패 행 1", async () => {
    await mount("phase2");
    await type("X draft");
    expect(readRoomComposerDraft(ROOM)).toBe("X draft");
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    /** StoreOrderChrome `postChatText`·`sendMatchAck` 처럼 opts 없이 vm.sendMessage(raw) */
    let done!: Promise<boolean>;
    await act(async () => {
      done = api.sendMessage!("ACK");
    });
    await act(async () => {
      resolveFetch(jsonResponse(403, { ok: false, error: "room_readonly" }));
      await done;
    });
    await settle();
    expect(readRoomComposerDraft(ROOM)).toBe("X draft");
    expect(draft()).toBe("X draft");
    expect(failedRows()).toHaveLength(1);
    expect(failedRows()[0]!.content).toBe("ACK");
  });
});
