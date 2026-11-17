// @vitest-environment jsdom
/**
 * F1 (설계 2026-11-18 PR-1) 실패 글 무알림 삭제 — 동작 테스트(실제 훅 + fetch 모의).
 * 완료 조건: 사용자 조작 없이 글이 사라지는 경로 0.
 */
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const snackbar = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/community-messenger/stores/messenger-snackbar-store", () => ({
  showMessengerSnackbar: (msg: string) => {
    snackbar.calls.push(msg);
  },
}));

import { useMessengerTextSendOutbox, type MessengerTextSendAttemptArgs } from "@/lib/community-messenger/room/phase2/use-messenger-text-send-outbox";
import {
  clearMessengerFailedTextSends,
  listMessengerFailedTextSends,
  saveMessengerFailedTextSend,
} from "@/lib/community-messenger/room/messenger-failed-text-store";
import {
  getMessengerOutboundFailedSend,
  type MessengerUnconfirmedTextSend,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";
import {
  beginActiveComposerFailRestoreSession,
  markActiveComposerDraftEditedDuringOutbound,
} from "@/lib/community-messenger/room/messenger-composer-fail-restore-active";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM = "11111111-1111-4111-8111-111111111111";
type Row = CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };

type Harness = {
  rows: () => Row[];
  run: (args: MessengerTextSendAttemptArgs) => Promise<boolean>;
  setRows: (rows: Row[]) => void;
  composer: string[];
  authBlocked: { value: boolean };
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(initialRows: Row[] = [], opts: { ready?: boolean } = {}): Harness {
  const composer: string[] = [];
  const authBlocked = { value: false };
  const api: { rows: Row[]; ref: { current: (a: MessengerTextSendAttemptArgs) => Promise<boolean> } | null; set: ((r: Row[]) => void) | null } = {
    rows: initialRows,
    ref: null,
    set: null,
  };
  let seq = 0;
  function Probe() {
    const [roomMessages, setRoomMessages] = useState<Row[]>(initialRows);
    const roomMessagesRef = useRef<Row[]>(roomMessages);
    roomMessagesRef.current = roomMessages;
    const unconfirmed = useRef<MessengerUnconfirmedTextSend | null>(null);
    const failedIds = useRef<Set<string>>(new Set());
    const { runTextSendAttemptRef } = useMessengerTextSendOutbox({
      streamRoomId: ROOM,
      restoreReady: opts.ready !== false,
      roomMessages,
      roomMessagesRef,
      setRoomMessages,
      setMessage: (v) => composer.push(v),
      resolveOutboundSender: () => ({ senderId: "me", senderLabel: "me" }),
      nextPendingRowId: () => `pending:${ROOM}:${seq++}`,
      unconfirmedTextSendRef: unconfirmed,
      failedOutboundRowIdsRef: failedIds,
      getRoomActionErrorMessage: (e) => `err:${e ?? ""}`,
      redirectIfMessengerAuthBlocked: () => authBlocked.value,
      onTextSendConfirmed: () => undefined,
    });
    api.rows = roomMessages;
    api.ref = runTextSendAttemptRef;
    api.set = setRoomMessages;
    return null;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Probe />));
  return {
    rows: () => api.rows,
    run: async (args) => {
      let out = false;
      await act(async () => {
        out = await api.ref!.current(args);
      });
      return out;
    },
    setRows: (r) => act(() => api.set!(r)),
    composer,
    authBlocked,
  };
}

function optimistic(id: string, cid: string, content: string): Row {
  return {
    id,
    roomId: ROOM,
    senderId: "me",
    senderLabel: "me",
    messageType: "text",
    content,
    createdAt: "2026-11-18T01:00:00.000Z",
    clientMessageId: cid,
    isMine: true,
    pending: true,
    callKind: null,
    callStatus: null,
  } as Row;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn();
beforeEach(() => {
  snackbar.calls = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearMessengerFailedTextSends();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  clearMessengerFailedTextSends();
});

async function retry(h: Harness, rowId: string) {
  const handlers = getMessengerOutboundFailedSend(rowId);
  expect(handlers).not.toBeNull();
  await act(async () => {
    handlers!.retry();
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return h;
}

function savedCids() {
  return listMessengerFailedTextSends(ROOM).map((e) => e.clientMessageId);
}

describe("F1 방 진입 복원", () => {
  it("보관 글 진입 → 요청 0 · 실패 상태 행(재전송·삭제 등록)", async () => {
    saveMessengerFailedTextSend(ROOM, { clientMessageId: "c1", content: "hello", replyToMessageId: null, createdAt: "2026-11-18T01:00:00.000Z" });
    const h = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const row = h.rows().find((r) => r.clientMessageId === "c1")!;
    expect(row).toBeTruthy();
    expect(row.pending).toBe(true);
    expect(row.sendFailed).toBe(true);
    expect(row.content).toBe("hello");
    expect(getMessengerOutboundFailedSend(row.id)).not.toBeNull();
    expect(snackbar.calls).toEqual([]);
  });

  it("같은 cid 확정 행이 이미 있으면 복원하지 않고 보관에서 지운다(서버 저장 확인)", async () => {
    saveMessengerFailedTextSend(ROOM, { clientMessageId: "c1", content: "hello", replyToMessageId: null, createdAt: "2026-11-18T01:00:00.000Z" });
    const confirmed = { ...optimistic("srv-1", "c1", "hello"), pending: false } as Row;
    const h = mount([confirmed]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.rows().filter((r) => r.clientMessageId === "c1")).toHaveLength(1);
    expect(savedCids()).toEqual([]);
  });
});

describe("F1 실패 행 재전송", () => {
  async function restoredRow() {
    saveMessengerFailedTextSend(ROOM, { clientMessageId: "c1", content: "hello", replyToMessageId: null, createdAt: "2026-11-18T01:00:00.000Z" });
    const h = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const row = h.rows().find((r) => r.clientMessageId === "c1")!;
    return { h, rowId: row.id };
  }

  it("재전송 503(message_send_unavailable) → 행 유지(실패 상태) · 보관 유지 · 스낵바", async () => {
    const { h, rowId } = await restoredRow();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable", error: "x" }));
    await retry(h, rowId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.clientMessageId).toBe("c1");
    const row = h.rows().find((r) => r.id === rowId)!;
    expect(row.sendFailed).toBe(true);
    expect(savedCids()).toEqual(["c1"]);
    expect(snackbar.calls).toEqual(["err:message_send_unavailable"]);
  });

  it("재전송 403(업무 거절) → 행 유지(실패 상태) + 사유 스낵바 · 보관 유지", async () => {
    const { h, rowId } = await restoredRow();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: "blocked_target", code: "blocked_target" }));
    await retry(h, rowId);
    expect(h.rows().find((r) => r.id === rowId)?.sendFailed).toBe(true);
    expect(savedCids()).toEqual(["c1"]);
    expect(snackbar.calls).toEqual(["err:blocked_target"]);
  });

  it("재전송 네트워크 예외 → 행 유지", async () => {
    const { h, rowId } = await restoredRow();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await retry(h, rowId);
    expect(h.rows().find((r) => r.id === rowId)?.sendFailed).toBe(true);
    expect(savedCids()).toEqual(["c1"]);
  });

  it("재전송 deduped(서버가 이미 저장) → 확정 행으로 교체 · 보관 제거", async () => {
    const { h, rowId } = await restoredRow();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        message: { ...optimistic("srv-1", "c1", "hello"), pending: false },
      })
    );
    await retry(h, rowId);
    expect(h.rows().find((r) => r.id === rowId)).toBeUndefined();
    expect(h.rows().find((r) => r.id === "srv-1")?.pending).toBe(false);
    expect(savedCids()).toEqual([]);
  });

  it("삭제(사용자) → 행·보관 제거, 요청 없음", async () => {
    const { h, rowId } = await restoredRow();
    act(() => getMessengerOutboundFailedSend(rowId)!.discard());
    expect(h.rows().find((r) => r.id === rowId)).toBeUndefined();
    expect(savedCids()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("로그인 화면 이동(authBlocked) → 보관분을 지우지 않고 행 유지 · 스낵바 없음", async () => {
    const { h, rowId } = await restoredRow();
    h.authBlocked.value = true;
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { ok: false, error: "auth_required" }));
    await retry(h, rowId);
    expect(h.rows().find((r) => r.id === rowId)?.sendFailed).toBe(true);
    expect(savedCids()).toEqual(["c1"]);
    expect(snackbar.calls).toEqual([]);
  });
});

describe("F1 첫 전송", () => {
  it("첫 전송 403 → 행 제거 + 입력창 복원(M-8) — 글은 입력창에", async () => {
    const h = mount();
    h.setRows([optimistic("t1", "c9", "draft text")]);
    const generation = beginActiveComposerFailRestoreSession();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: "room_readonly" }));
    await h.run({ tempId: "t1", clientMessageId: "c9", content: "draft text", replyId: "", restoreOnFail: "draft text", failRestoreGeneration: generation });
    expect(h.rows().find((r) => r.id === "t1")).toBeUndefined();
    expect(h.composer).toEqual(["draft text"]);
    expect(snackbar.calls).toEqual(["err:room_readonly"]);
    expect(savedCids()).toEqual([]);
  });

  it("첫 전송 403 인데 입력창에 다른 글을 쓰는 중(복원 불가) → 행 유지(실패 상태) + 보관", async () => {
    const h = mount();
    h.setRows([optimistic("t2", "c8", "first")]);
    const generation = beginActiveComposerFailRestoreSession();
    markActiveComposerDraftEditedDuringOutbound();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: "room_readonly" }));
    await h.run({ tempId: "t2", clientMessageId: "c8", content: "first", replyId: "", restoreOnFail: "first", failRestoreGeneration: generation });
    expect(h.rows().find((r) => r.id === "t2")?.sendFailed).toBe(true);
    expect(h.composer).toEqual([]);
    expect(savedCids()).toEqual(["c8"]);
  });

  it("입력창 밖 글(위치 공유 등 restoreOnFail 없음) 403 → 행 유지(실패 상태)", async () => {
    const h = mount();
    h.setRows([optimistic("t3", "c7", "location")]);
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: "room_readonly" }));
    await h.run({ tempId: "t3", clientMessageId: "c7", content: "location", replyId: "", failRestoreGeneration: 0 });
    expect(h.rows().find((r) => r.id === "t3")?.sendFailed).toBe(true);
    expect(savedCids()).toEqual(["c7"]);
  });

  it("첫 전송 503 → 실패 행 + 보관(방을 나갔다 와도 남음)", async () => {
    const h = mount();
    h.setRows([optimistic("t4", "c6", "hi")]);
    const generation = beginActiveComposerFailRestoreSession();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    await h.run({ tempId: "t4", clientMessageId: "c6", content: "hi", replyId: "", restoreOnFail: "hi", failRestoreGeneration: generation });
    expect(h.rows().find((r) => r.id === "t4")?.sendFailed).toBe(true);
    expect(h.composer).toEqual([]);
    expect(savedCids()).toEqual(["c6"]);
  });
});
