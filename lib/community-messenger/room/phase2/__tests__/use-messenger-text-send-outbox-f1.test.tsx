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
vi.mock("@/lib/community-messenger/cm-ui-translate", () => ({
  translateCmUi: (key: string) => key,
}));
vi.mock("@/lib/community-messenger/stores/messenger-snackbar-store", () => ({
  showMessengerSnackbar: (msg: string) => {
    snackbar.calls.push(msg);
  },
}));

import {
  __resetMessengerTextSendInflightForTest,
  isOlderThanLoadedWindow,
  useMessengerTextSendOutbox,
  type MessengerTextSendAttemptArgs,
} from "@/lib/community-messenger/room/phase2/use-messenger-text-send-outbox";
import {
  clearMessengerFailedTextSends,
  listMessengerFailedTextSends,
  saveMessengerFailedTextSend,
} from "@/lib/community-messenger/room/messenger-failed-text-store";
import {
  getMessengerOutboundFailedSend,
  type MessengerUnconfirmedTextSend,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";
import { useMessengerPendingRowSeqRef } from "@/lib/community-messenger/room/messenger-pending-row-seq";
import {
  beginActiveComposerFailRestoreSession,
  markActiveComposerDraftEditedDuringOutbound,
} from "@/lib/community-messenger/room/messenger-composer-fail-restore-active";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM = "11111111-1111-4111-8111-111111111111";
type Row = CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };

type Harness = {
  unmount: () => void;
  rows: () => Row[];
  run: (args: MessengerTextSendAttemptArgs) => Promise<boolean>;
  /** 컨트롤러와 같은 규칙의 다음 보내는 중 행 id */
  nextTempId: () => string;
  /** act 없이 시작만 — 응답 전 언마운트 시나리오용 */
  runRaw: (args: MessengerTextSendAttemptArgs) => Promise<boolean>;
  setRows: (rows: Row[]) => void;
  composer: string[];
  authBlocked: { value: boolean };
};

let roots: Root[] = [];
let hosts: HTMLDivElement[] = [];

function mount(initialRows: Row[] = [], opts: { ready?: boolean } = {}): Harness {
  const composer: string[] = [];
  const authBlocked = { value: false };
  const api: {
    rows: Row[];
    ref: { current: (a: MessengerTextSendAttemptArgs) => Promise<boolean> } | null;
    set: ((r: Row[]) => void) | null;
    nextTempId: () => string;
  } = {
    rows: initialRows,
    ref: null,
    set: null,
    nextTempId: () => "",
  };
  function Probe() {
    const [roomMessages, setRoomMessages] = useState<Row[]>(initialRows);
    const roomMessagesRef = useRef<Row[]>(roomMessages);
    roomMessagesRef.current = roomMessages;
    const unconfirmed = useRef<MessengerUnconfirmedTextSend | null>(null);
    const failedIds = useRef<Set<string>>(new Set());
    /** 실제 화면과 같은 순번 규칙(phase1 `pendingMessageIdRef`) — 컨트롤러와 같은 tempId 형식 */
    const seqRef = useMessengerPendingRowSeqRef();
    api.nextTempId = () => `pending:${ROOM}:${seqRef.current++}`;
    const { runTextSendAttemptRef } = useMessengerTextSendOutbox({
      streamRoomId: ROOM,
      restoreReady: opts.ready !== false,
      roomMessages,
      roomMessagesRef,
      setRoomMessages,
      setMessage: (v) => composer.push(v),
      resolveOutboundSender: () => ({ senderId: "me", senderLabel: "me" }),
      nextPendingRowId: () => `pending:${ROOM}:${seqRef.current++}`,
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
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  hosts.push(host);
  roots.push(root);
  act(() => root.render(<Probe />));
  return {
    unmount: () => act(() => root.unmount()),
    rows: () => api.rows,
    run: async (args) => {
      let out = false;
      await act(async () => {
        out = await api.ref!.current(args);
      });
      return out;
    },
    runRaw: (args) => api.ref!.current(args),
    nextTempId: () => api.nextTempId(),
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
  __resetMessengerTextSendInflightForTest();
  snackbar.calls = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearMessengerFailedTextSends();
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

describe("PR-1 검토 #1 응답 전에 방을 나감·재진입", () => {
  it("첫 전송 뒤 나가고 재진입(새 인스턴스) → 4xx 가 와도 글이 사라지지 않고 새 화면에 실패 행", async () => {
    const a = mount();
    a.setRows([optimistic("ta", "cx", "leave me")]);
    const generation = beginActiveComposerFailRestoreSession();
    let resolveFetch: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    let attempt: Promise<boolean> | null = null;
    act(() => {
      attempt = a.runRaw({ tempId: "ta", clientMessageId: "cx", content: "leave me", replyId: "", restoreOnFail: "leave me", failRestoreGeneration: generation });
    });
    a.unmount();
    const b = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    /** 최종 검토 #2: 요청 중에는 새 화면에 「보내는 중」 행(실패 버튼 없음) */
    const sendingRow = b.rows().find((r) => r.clientMessageId === "cx");
    expect(sendingRow?.pending).toBe(true);
    expect(sendingRow?.sendFailed).toBeFalsy();
    expect(getMessengerOutboundFailedSend(sendingRow!.id)).toBeNull();
    await act(async () => {
      resolveFetch(jsonResponse(403, { ok: false, error: "room_readonly" }));
      await attempt;
    });
    expect(a.composer).toEqual([]);
    expect(savedCids()).toEqual(["cx"]);
    const row = b.rows().find((r) => r.clientMessageId === "cx");
    expect(row?.sendFailed).toBe(true);
    expect(row?.content).toBe("leave me");
    expect(getMessengerOutboundFailedSend(row!.id)).not.toBeNull();
  });

  it("나간 뒤 결과 불명(503)도 새 화면에 실패 행 + 보관", async () => {
    const a = mount();
    a.setRows([optimistic("tb", "cy", "x")]);
    let resolveFetch: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    let attempt: Promise<boolean> | null = null;
    act(() => {
      attempt = a.runRaw({ tempId: "tb", clientMessageId: "cy", content: "x", replyId: "", failRestoreGeneration: 0 });
    });
    a.unmount();
    const b = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      resolveFetch(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
      await attempt;
    });
    expect(savedCids()).toEqual(["cy"]);
    expect(b.rows().filter((r) => r.clientMessageId === "cy")).toHaveLength(1);
  });
});

describe("PR-1 검토 #3 보관 실패를 알린다", () => {
  it("기기 저장소 쓰기 거부(용량 초과) → 사유 스낵바, 화면 실패 행은 유지", async () => {
    const h = mount();
    h.setRows([optimistic("tq", "cq", "big")]);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    await h.run({ tempId: "tq", clientMessageId: "cq", content: "big", replyId: "", failRestoreGeneration: 0 });
    spy.mockRestore();
    /** 감사 #1·#3: 시작 때 보관 거부는 조용히, 실패 응답 때 1회만 */
    expect(snackbar.calls.filter((c) => c === "cm_ui_failed_text_not_kept")).toHaveLength(1);
    expect(h.rows().find((r) => r.id === "tq")?.sendFailed).toBe(true);
  });
});

describe("PR-1 검토 #4 불러온 창보다 오래된 deduped 확정 행", () => {
  it("병합하지 않고 실패 행·보관만 제거", async () => {
    saveMessengerFailedTextSend(ROOM, { clientMessageId: "co", content: "old", replyToMessageId: null, createdAt: "2026-11-01T00:00:00.000Z" });
    const loaded = { ...optimistic("srv-new", "other", "newer"), pending: false, createdAt: "2026-11-18T05:00:00.000Z" } as Row;
    const h = mount([loaded]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const row = h.rows().find((r) => r.clientMessageId === "co")!;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, message: { ...optimistic("srv-old", "co", "old"), pending: false, createdAt: "2026-11-01T00:00:00.000Z" } })
    );
    await retry(h, row.id);
    expect(h.rows().map((r) => r.id)).toEqual(["srv-new"]);
    expect(savedCids()).toEqual([]);
  });

  it("isOlderThanLoadedWindow — 확정 행 없으면 false, 같은 시각은 창 안", () => {
    expect(isOlderThanLoadedWindow([], { createdAt: "2026-01-01T00:00:00Z" })).toBe(false);
    const rows = [{ createdAt: "2026-11-18T00:00:00Z" }, { pending: true, createdAt: "2020-01-01T00:00:00Z" }];
    expect(isOlderThanLoadedWindow(rows, { createdAt: "2026-11-18T00:00:00Z" })).toBe(false);
    expect(isOlderThanLoadedWindow(rows, { createdAt: "2026-11-17T23:59:59Z" })).toBe(true);
  });
});

describe("PR-1 재검토(차단) tempId 가 화면 인스턴스 사이에서 겹치지 않는다", () => {
  it("A 에서 보낸 글이 나간 뒤 실패해도 B 의 다른 실패 행 「삭제」·「재전송」이 A 글에 적용되지 않는다", async () => {
    const a = mount();
    const tA = a.nextTempId();
    a.setRows([optimistic(tA, "c-hello", "hello")]);
    let resolveA: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveA = r)));
    let attemptA: Promise<boolean> | null = null;
    act(() => {
      attemptA = a.runRaw({ tempId: tA, clientMessageId: "c-hello", content: "hello", replyId: "", failRestoreGeneration: 0 });
    });
    a.unmount();

    const b = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const tB = b.nextTempId();
    expect(tB).not.toBe(tA);
    b.setRows([optimistic(tB, "c-msg1", "msg1")]);
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    await b.run({ tempId: tB, clientMessageId: "c-msg1", content: "msg1", replyId: "", failRestoreGeneration: 0 });

    // A 의 요청이 시간 초과(결과 불명)로 끝남 → 보관 + 창 이벤트 → B 가 hello 를 복원
    await act(async () => {
      resolveA(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
      await attemptA;
    });
    expect(b.rows().find((r) => r.clientMessageId === "c-hello")?.sendFailed).toBe(true);
    expect(new Set(savedCids())).toEqual(new Set(["c-hello", "c-msg1"]));

    // msg1 행의 「재전송」은 msg1 을 보낸다
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    await retry(b, tB);
    const lastBody = JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body));
    expect(lastBody.content).toBe("msg1");
    expect(lastBody.clientMessageId).toBe("c-msg1");

    // msg1 행의 「삭제」는 msg1 만 지운다 — hello 보관·행 유지
    act(() => getMessengerOutboundFailedSend(tB)!.discard());
    expect(savedCids()).toEqual(["c-hello"]);
    expect(b.rows().map((r) => r.clientMessageId)).toEqual(["c-hello"]);
    // 옛 화면(A)은 언마운트 뒤 핸들러를 등록하지 않는다
    expect(getMessengerOutboundFailedSend(tA)).toBeNull();
  });
});

describe("PR-1 감사 #1 첫 전송 중 앱 종료·새로고침", () => {
  it("전송 시작 → 응답 없이 언마운트 + 메모리 초기화(앱 종료) → 재진입 → 실패 행 1개·추가 요청 0건", async () => {
    const a = mount();
    const t = a.nextTempId();
    a.setRows([optimistic(t, "c-quit", "dont lose me")]);
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    act(() => {
      void a.runRaw({ tempId: t, clientMessageId: "c-quit", content: "dont lose me", replyId: "", restoreOnFail: "dont lose me", failRestoreGeneration: beginActiveComposerFailRestoreSession() });
    });
    expect(savedCids()).toEqual(["c-quit"]);
    a.unmount();
    __resetMessengerTextSendInflightForTest();
    const b = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const rows = b.rows().filter((r) => r.clientMessageId === "c-quit");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sendFailed).toBe(true);
    expect(rows[0]!.content).toBe("dont lose me");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /** 최종 검토 #2: 요청 중 재진입 → 「보내는 중」 행 1개(요청 0건) → 옛 화면 결과로 확정 1개 또는 실패 행 */
  async function startThenReenter(cid: string, content: string) {
    const a = mount();
    const t = a.nextTempId();
    a.setRows([optimistic(t, cid, content)]);
    let resolveA: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveA = r)));
    let attemptA: Promise<boolean> | null = null;
    act(() => {
      attemptA = a.runRaw({ tempId: t, clientMessageId: cid, content, replyId: "", failRestoreGeneration: 0 });
    });
    a.unmount();
    const b = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const finish = async (res: Response) => {
      await act(async () => {
        resolveA(res);
        await attemptA;
      });
    };
    return { b, finish };
  }

  it("같은 앱 실행에서 요청 중에 재진입 → 「보내는 중」 행 1개(실패 버튼 없음)·요청 0건", async () => {
    const { b } = await startThenReenter("c-fly", "flying");
    const rows = b.rows().filter((r) => r.clientMessageId === "c-fly");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pending).toBe(true);
    expect(rows[0]!.sendFailed).toBeFalsy();
    expect(getMessengerOutboundFailedSend(rows[0]!.id)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(savedCids()).toEqual(["c-fly"]);
  });

  it("옛 화면 성공 → 새 화면은 확정 행 1개만(보내는 중 행·보관분 없음, 실시간 없이도)", async () => {
    const { b, finish } = await startThenReenter("c-win", "win");
    await finish(jsonResponse(200, { ok: true, message: { ...optimistic("srv-win", "c-win", "win"), pending: false } }));
    const rows = b.rows().filter((r) => r.clientMessageId === "c-win");
    expect(rows.map((r) => [r.id, Boolean(r.pending)])).toEqual([["srv-win", false]]);
    expect(savedCids()).toEqual([]);
  });

  it("옛 화면 실패 → 새 화면의 그 행이 실패 행(재전송·삭제 동작), 중복 행 0", async () => {
    const { b, finish } = await startThenReenter("c-lose", "lose");
    const sendingId = b.rows().find((r) => r.clientMessageId === "c-lose")!.id;
    await finish(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    const rows = b.rows().filter((r) => r.clientMessageId === "c-lose");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(sendingId);
    expect(rows[0]!.sendFailed).toBe(true);
    const handlers = getMessengerOutboundFailedSend(sendingId);
    expect(handlers).not.toBeNull();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    await retry(b, sendingId);
    const body = JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body));
    expect(body).toMatchObject({ clientMessageId: "c-lose", content: "lose" });
    expect(b.rows().filter((r) => r.clientMessageId === "c-lose")).toHaveLength(1);
    act(() => getMessengerOutboundFailedSend(sendingId)!.discard());
    expect(b.rows().filter((r) => r.clientMessageId === "c-lose")).toHaveLength(0);
    expect(savedCids()).toEqual([]);
  });

  it("시작 저장 성공 → 옛 화면 실패 때 저장 거부 → 확정 행 도착 → 보관분 0", async () => {
    const { b, finish } = await startThenReenter("c-kept0", "kept0");
    expect(savedCids()).toEqual(["c-kept0"]);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await finish(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    spy.mockRestore();
    expect(savedCids()).toEqual(["c-kept0"]);
    b.setRows([...b.rows(), { ...optimistic("srv-kept0", "c-kept0", "kept0"), pending: false } as Row]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(savedCids()).toEqual([]);
  });

  it("옛 화면 실패 + 저장소 거부여도 새 화면에 실패 행(글을 이벤트로 전달)", async () => {
    const { b, finish } = await startThenReenter("c-q", "quota");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await finish(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
    spy.mockRestore();
    const rows = b.rows().filter((r) => r.clientMessageId === "c-q");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sendFailed).toBe(true);
  });

  it("성공 → 시작 때 보관한 분이 남지 않는다", async () => {
    const h = mount();
    h.setRows([optimistic("ts", "c-ok", "fine")]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, message: { ...optimistic("srv-ok", "c-ok", "fine"), pending: false } })
    );
    await h.run({ tempId: "ts", clientMessageId: "c-ok", content: "fine", replyId: "", failRestoreGeneration: 0 });
    expect(savedCids()).toEqual([]);
    expect(h.rows().map((r) => r.id)).toEqual(["srv-ok"]);
  });

  it("늦게 온 같은 cid 확정 행은 보내는 중 행을 대체하고 보관분을 지운다", async () => {
    const h = mount();
    h.setRows([optimistic("tl", "c-late", "late")]);
    let resolveFetch: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    let attempt: Promise<boolean> | null = null;
    act(() => {
      attempt = h.runRaw({ tempId: "tl", clientMessageId: "c-late", content: "late", replyId: "", failRestoreGeneration: 0 });
    });
    expect(savedCids()).toEqual(["c-late"]);
    // 실시간으로 확정 행이 먼저 도착
    h.setRows([...h.rows(), { ...optimistic("srv-late", "c-late", "late"), pending: false } as Row]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(savedCids()).toEqual([]);
    await act(async () => {
      resolveFetch(jsonResponse(503, { ok: false, code: "message_send_unavailable" }));
      await attempt;
    });
    expect(savedCids()).toEqual([]);
  });
});

describe("PR-1 최종 검토 #3 보관분은 전송 시작 때의 방 id 로 지운다", () => {
  it("요청 중 화면이 다른 방으로 바뀐 뒤 성공 → 처음 방의 보관분이 지워진다", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const ctl: { setRoom: ((r: string) => void) | null; run: ((a: MessengerTextSendAttemptArgs) => Promise<boolean>) | null } = {
      setRoom: null,
      run: null,
    };
    function Probe() {
      const [roomId, setRoomId] = useState(ROOM);
      const [rows, setRows] = useState<Row[]>([optimistic("tr", "c-room", "room")]);
      const rowsRef = useRef<Row[]>(rows);
      rowsRef.current = rows;
      const unconfirmed = useRef<MessengerUnconfirmedTextSend | null>(null);
      const failedIds = useRef<Set<string>>(new Set());
      const seqRef = useMessengerPendingRowSeqRef();
      const { runTextSendAttemptRef } = useMessengerTextSendOutbox({
        streamRoomId: roomId,
        restoreReady: true,
        roomMessages: rows,
        roomMessagesRef: rowsRef,
        setRoomMessages: setRows,
        setMessage: () => undefined,
        resolveOutboundSender: () => ({ senderId: "me", senderLabel: "me" }),
        nextPendingRowId: () => `pending:${roomId}:${seqRef.current++}`,
        unconfirmedTextSendRef: unconfirmed,
        failedOutboundRowIdsRef: failedIds,
        getRoomActionErrorMessage: (e) => `err:${e ?? ""}`,
        redirectIfMessengerAuthBlocked: () => false,
        onTextSendConfirmed: () => undefined,
      });
      ctl.setRoom = setRoomId;
      ctl.run = (a) => runTextSendAttemptRef.current(a);
      return null;
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    hosts.push(host);
    act(() => root.render(<Probe />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    let resolveFetch: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFetch = r)));
    let attempt: Promise<boolean> | null = null;
    act(() => {
      attempt = ctl.run!({ tempId: "tr", clientMessageId: "c-room", content: "room", replyId: "", failRestoreGeneration: 0 });
    });
    expect(listMessengerFailedTextSends(ROOM).map((e) => e.clientMessageId)).toEqual(["c-room"]);
    act(() => ctl.setRoom!(OTHER));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      resolveFetch(jsonResponse(200, { ok: true, message: { ...optimistic("srv-room", "c-room", "room"), pending: false } }));
      await attempt;
    });
    expect(listMessengerFailedTextSends(ROOM)).toEqual([]);
  });
});
