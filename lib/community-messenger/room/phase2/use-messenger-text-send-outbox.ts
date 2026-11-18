"use client";

/**
 * 글 전송 시도·실패 행·기기 보관 — `use-messenger-room-phase2-controller.ts` 에서 분리(F1 동작 테스트 대상).
 *
 * F1 (설계 2026-11-18 PR-1 「실패 글 무알림 삭제」) 불변조건 — **사용자 조작 없이 글이 사라지는 경로 0**:
 *  - 실패 글 행·보관분은 ① 사용자 「삭제」 ② 같은 cid 서버 확정 행 ③ 입력창으로 글을 되돌린 첫 전송 거절(M-8) 로만 사라진다.
 *  - 방 진입 시 보관 글은 **실패 상태 행**으로 복원만 하고 요청을 보내지 않는다(자동 재전송 삭제 —
 *    Owner 승인 §6-1 #1 「실패 메시지는 오류 아이콘으로 남고 사용자가 재전송·삭제」).
 *  - 실패 행 재전송이 거절(definitive)되면 행은 실패 상태로 남고 사유 스낵바만 띄운다.
 *  - 로그인 화면 이동(authBlocked)은 보관분을 지우지 않는다(로그인 뒤 같은 방에서 실패 행).
 * F8: 응답 본문 읽기까지 같은 12초 안(`fetchMessengerSendJson`).
 */
import { useEffect, useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { buildReplyPreviewSnapshot } from "@/lib/community-messenger/message-actions/message-reply-policy";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";
import { pickMessengerApiErrorField } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { MESSENGER_TEXT_SEND_TIMEOUT_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import {
  fetchMessengerSendJson,
  type MessengerSendFetchJsonResult,
} from "@/lib/community-messenger/room/messenger-send-fetch-json";
import {
  clearMessengerOutboundFailedSend,
  isMessengerOutboundRowDisplayed,
  markMessengerOutboundRowFailed,
  markMessengerOutboundRowRetrying,
  nextUnconfirmedTextSendAfterFailure,
  nextUnconfirmedTextSendAfterSuccess,
  registerMessengerOutboundFailedSend,
  type MessengerUnconfirmedTextSend,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";
import { shouldRestoreActiveComposerAfterSendFail } from "@/lib/community-messenger/room/messenger-composer-fail-restore-active";
import { writeRoomComposerDraft } from "@/lib/community-messenger/room/messenger-room-composer-draft-storage";
import {
  type MessengerFailedTextSend,
  listMessengerFailedTextSends,
  hasMessengerFailedTextSendInDeviceStorage,
  isMessengerFailedTextSendOwnedBy,
  pruneMessengerFailedTextSendsConfirmed,
  removeMessengerFailedTextSend,
  saveMessengerFailedTextSend,
} from "@/lib/community-messenger/room/messenger-failed-text-store";
import {
  classifyMessengerSendFailure,
  messengerUploadFallbackErrorCode,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";

type RoomRow = CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };

export type MessengerTextSendAttemptArgs = {
  tempId: string;
  clientMessageId: string;
  content: string;
  replyId: string;
  /** 첫 전송(입력창에서 막 나온 글)만 — 거절 시 입력창 복원(M-8) 판단 */
  restoreOnFail?: string;
  failRestoreGeneration: number;
};

export type MessengerTextSendOutboxDeps = {
  streamRoomId: string;
  /** 방 스냅샷 준비 — 보관 글 복원 시점 */
  restoreReady: boolean;
  roomMessages: readonly RoomRow[];
  roomMessagesRef: MutableRefObject<RoomRow[]>;
  setRoomMessages: Dispatch<SetStateAction<RoomRow[]>>;
  setMessage: (value: string) => void;
  /** 복원 행의 보낸 사람(낙관 행과 같은 규칙) */
  resolveOutboundSender: () => { senderId: string; senderLabel: string } | null;
  /** 감사 D-3: 현재 로그인 사용자 id — 보관 항목에 넣고, 복원은 같은 사용자 항목만. 비어 있으면 복원을 미룬다 */
  viewerUserId: string;
  nextPendingRowId: () => string;
  unconfirmedTextSendRef: MutableRefObject<MessengerUnconfirmedTextSend | null>;
  failedOutboundRowIdsRef: MutableRefObject<Set<string>>;
  getRoomActionErrorMessage: (error?: string) => string;
  redirectIfMessengerAuthBlocked: (res: Response, json: { error?: unknown; code?: unknown }) => boolean;
  /** 확정 행 병합 뒤 부수 효과(모니터링·presence·소리·부트스트랩 정리) — 행·보관 처리는 이 훅이 한다 */
  onTextSendConfirmed: (args: {
    clientMessageId: string;
    message: CommunityMessengerMessage | null;
    elapsedMs: number;
    /** 검토 #4: 확정 행이 불러온 창보다 오래돼 병합하지 않음 — 본문 재조회 불필요 */
    outsideLoadedWindow?: boolean;
    /** 최종 검토 #2: 다른(옛) 화면의 성공을 이 화면이 반영 — 전송 지표·presence·소리 생략, 본문 재조회만 */
    fromOtherScreen?: boolean;
  }) => void;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * PR-1 감사 #1·최종 검토 #2: 지금 요청 중인 글(방:cid) — 앱 실행(메모리) 동안만. 전송을 시작할 때 글을 기기에 미리 보관하므로,
 * 다른 화면의 진입 복원은 이 집합에 있는 글을 실패 행이 아니라 **「보내는 중」 행**(버튼 없음, 요청 0건)으로 보여 준다.
 * 그 요청이 끝나면 옛 화면이 창 이벤트로 알린다 — 성공: 확정 이벤트(보내는 중 행 → 확정 행), 실패: 저장 이벤트(→ 실패 행).
 * 앱이 종료되면 비므로 다음 실행에서는 보관 글이 실패 행(요청 0건)으로 복원된다(자동 재전송 없음 — Owner 승인 §6-1 #1).
 */
const inflightTextSendKeys = new Set<string>();
const inflightKey = (roomId: string, cid: string) => `${roomId.trim()}:${cid.trim()}`;
export function isMessengerTextSendInflight(roomId: string, clientMessageId: string): boolean {
  return inflightTextSendKeys.has(inflightKey(roomId, clientMessageId));
}
/** 테스트 전용 — 앱 종료(메모리 초기화) 흉내 */
export function __resetMessengerTextSendInflightForTest(): void {
  inflightTextSendKeys.clear();
}

/**
 * 최종 감사 D2: 이 요청의 보낸 사용자 글을 지금 보관해도 되는가 — 현재 바인딩된 사용자(`getBoundAuthUserId`, 로그인 때
 * `bindAuthUserId`, 로그아웃·계정 전환 wipe 때 `clearBoundAuthUserId`)와 같을 때만. 세션이 없거나 다른 계정이면 false.
 */
function canPersistFailedTextForSender(senderUserId: string | null): boolean {
  const sender = (senderUserId ?? "").trim();
  if (!sender) return false;
  const bound = getBoundAuthUserId();
  return Boolean(bound && bound === sender);
}

/** 다른(옛) 인스턴스가 실패 글을 보관했음을 같은 방 화면에 알리는 창 이벤트 */
export const MESSENGER_FAILED_TEXT_SAVED_EVENT = "samarket:cm:failed-text-saved";
export type MessengerFailedTextSavedDetail = {
  roomId: string;
  clientMessageId: string;
  /** 보관 성공 여부 — 저장소가 거부해도 글 자체는 실어 보내 새 화면이 실패 행으로 보여 준다 */
  kept: boolean;
  content?: string;
  replyToMessageId?: string | null;
  createdAt?: string;
  /** 감사 D-3: 보낸 사용자 id */
  senderUserId?: string | null;
};
/** 최종 검토 #2: 다른(옛) 인스턴스의 요청이 성공했음을 같은 방 화면에 알리는 창 이벤트(보내는 중 행 → 확정 행) */
export const MESSENGER_TEXT_SEND_CONFIRMED_EVENT = "samarket:cm:text-send-confirmed";
export type MessengerTextSendConfirmedDetail = {
  roomId: string;
  clientMessageId: string;
  message: CommunityMessengerMessage | null;
};
function dispatchTextSendConfirmed(detail: MessengerTextSendConfirmedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MESSENGER_TEXT_SEND_CONFIRMED_EVENT, { detail }));
}

/** 확정 행이 지금 불러온 확정 메시지 중 가장 오래된 것보다 오래됐는가(같은 시각은 창 안) */
export function isOlderThanLoadedWindow(
  rows: readonly { pending?: boolean; createdAt?: string | null }[],
  message: { createdAt?: string | null }
): boolean {
  const t = new Date(String(message.createdAt ?? "")).getTime();
  if (!Number.isFinite(t)) return false;
  let oldest = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    if (r.pending) continue;
    const rt = new Date(String(r.createdAt ?? "")).getTime();
    if (Number.isFinite(rt) && rt < oldest) oldest = rt;
  }
  return Number.isFinite(oldest) && t < oldest;
}

export function useMessengerTextSendOutbox(deps: MessengerTextSendOutboxDeps) {
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    depsRef.current = deps;
  });
  const { streamRoomId, restoreReady, roomMessages } = deps;
  const viewerUserId = deps.viewerUserId.trim();

  /**
   * P1 (Owner 2026-11-18 「권장안대로 반영」): 결과 불명 실패 글을 기기 저장소에 보관 → 방을 나갔다 와도 실패 행 유지.
   * 이 방에서 보관 중인 cid — 보관소(localStorage)를 매 렌더 읽지 않도록 메모리에 둔다.
   */
  const persistedFailedTextCidsRef = useRef<Set<string>>(new Set());
  /**
   * 보관분 삭제 — PR-1 최종 검토 #3: **그 글을 보관한 방 id**(전송 시작·행 등록 때 잡아 둔 값)로 지운다.
   * 화면이 다른 방으로 바뀌어 메모리 집합이 새로 만들어져도 옛 방 보관분이 남지 않게, 저장소는 집합과 무관하게 지운다.
   */
  const forgetPersistedFailedText = (roomId: string, clientMessageId: string) => {
    const cid = clientMessageId.trim();
    const rid = roomId.trim();
    if (!cid || !rid) return;
    persistedFailedTextCidsRef.current.delete(cid);
    removeMessengerFailedTextSend(rid, cid);
  };

  /** 같은 cid 확정 행이 화면에 오면(늦은 서버 저장·실시간·재전송 성공) 보관에서 제거 */
  useEffect(() => {
    const cids = persistedFailedTextCidsRef.current;
    if (cids.size === 0) return;
    const confirmed = new Set<string>();
    for (const m of roomMessages) {
      if (m.pending) continue;
      const c = trimText(m.clientMessageId);
      if (c && cids.has(c)) confirmed.add(c);
    }
    if (confirmed.size === 0) return;
    pruneMessengerFailedTextSendsConfirmed(streamRoomId, confirmed);
    for (const c of confirmed) cids.delete(c);
  }, [roomMessages, streamRoomId]);

  /** 최신 렌더의 콜백·상태를 쓰도록 ref 로 호출(재전송 클로저가 오래된 렌더를 잡지 않게) */
  const runTextSendAttemptRef = useRef<(args: MessengerTextSendAttemptArgs) => Promise<boolean>>(async () => false);

  /** 실패 글 행의 재전송·삭제 핸들러 등록 — 전송 실패 직후와 방 진입 복원이 같이 쓴다 */
  const registerFailedTextRowHandlers = ({
    tempId,
    clientMessageId,
    content,
    replyId,
  }: {
    tempId: string;
    clientMessageId: string;
    content: string;
    replyId: string;
  }) => {
    /** 행을 등록한 방 — 삭제 때 이 방 보관분을 지운다(최종 검토 #3) */
    const rowRoomId = depsRef.current.streamRoomId;
    const retry = () => {
      const d = depsRef.current;
      clearMessengerOutboundFailedSend(tempId);
      if (!isMessengerOutboundRowDisplayed(d.roomMessagesRef.current, tempId)) {
        // 이미 확정 행(같은 cid)이 도착해 실패 행이 사라졌다 — 재전송 불필요.
        d.failedOutboundRowIdsRef.current.delete(tempId);
        return;
      }
      d.setRoomMessages((prev) => markMessengerOutboundRowRetrying(prev, tempId));
      void runTextSendAttemptRef.current({
        tempId,
        clientMessageId,
        content,
        replyId,
        failRestoreGeneration: 0,
      });
    };
    /** 사용자 「삭제」 — 행·보관분을 지우는 유일한 사용자 조작 */
    const discard = () => {
      const d = depsRef.current;
      clearMessengerOutboundFailedSend(tempId);
      d.failedOutboundRowIdsRef.current.delete(tempId);
      forgetPersistedFailedText(rowRoomId, clientMessageId);
      d.setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
      if (d.unconfirmedTextSendRef.current?.clientMessageId === clientMessageId) {
        d.unconfirmedTextSendRef.current = null;
      }
    };
    registerMessengerOutboundFailedSend(tempId, { retry, discard });
    depsRef.current.failedOutboundRowIdsRef.current.add(tempId);
  };

  /**
   * 방 진입 시 1회 — 보관된 실패 글을 **실패 상태 행**(경고 + 재전송·삭제)으로 복원한다. 요청은 보내지 않는다.
   * F1: 예전 자동 재전송(silentFailure)은 승인안에 없던 작업자 추가였고, 거절되면 글을 알림 없이 지웠다 → 삭제.
   * 서버가 이미 저장했다면 사용자가 재전송할 때 같은 cid 로 나가 서버 UNIQUE 멱등(deduped)으로 확정 행이 된다.
   */
  const restoredFailedTextRoomRef = useRef<string | null>(null);
  /**
   * 설계 3판 B-D2: 이 화면이 진입 복원을 마치기 **전에** 온 저장 이벤트(옛 화면의 실패, 글 내용 포함)를 담아 두는 메모리 대기열.
   * 저장소가 쓰기를 거부하면 보관분이 없어 이 이벤트가 글의 유일한 사본이다 — 버리면 화면·저장소 어디에도 남지 않았다.
   * 진입 복원 때 보관분과 같은 규칙(같은 cid 행이 있으면 건너뜀)으로 합친다. 방이 바뀌거나 언마운트되면 비운다.
   */
  const earlySavedEventsRef = useRef<{ roomId: string; entries: MessengerFailedTextSend[] }>({ roomId: "", entries: [] });
  /** 최종 검토 #2: 다른 화면에서 요청 중인 글의 「보내는 중」 행 — cid → 이 화면의 tempId */
  const sendingMirrorRowsRef = useRef<Map<string, string>>(new Map());
  /** 보관 글 → 실패 상태 행. 같은 cid 확정 행이 있으면 보관에서 지우고, 같은 cid 행(전송 중·실패)이 있으면 건너뛴다. */
  const restoreFailedTextRows = (roomId: string, entries: MessengerFailedTextSend[]) => {
    const d = depsRef.current;
    const sender = d.resolveOutboundSender();
    if (!sender || entries.length === 0) return;
    /** 감사 D-3: 보낸 사용자 id 가 있으면 지금 사용자 것만, 없는 옛 항목은 main 과 같이 복원(다시 저장하지 않음) */
    const viewer = d.viewerUserId.trim();
    entries = entries.filter((e) => isMessengerFailedTextSendOwnedBy(e, viewer));
    if (entries.length === 0) return;
    const current = d.roomMessagesRef.current;
    const confirmed = new Set<string>();
    const pendingCids = new Set<string>();
    for (const m of current) {
      const c = trimText(m.clientMessageId);
      if (!c) continue;
      if (m.pending) pendingCids.add(c);
      else confirmed.add(c);
    }
    for (const e of entries) persistedFailedTextCidsRef.current.add(e.clientMessageId);
    if (confirmed.size) {
      pruneMessengerFailedTextSendsConfirmed(roomId, confirmed);
      for (const c of confirmed) persistedFailedTextCidsRef.current.delete(c);
    }
    const rows: RoomRow[] = [];
    for (const e of entries) {
      if (confirmed.has(e.clientMessageId) || pendingCids.has(e.clientMessageId)) continue;
      const tempId = d.nextPendingRowId();
      const replyId = (e.replyToMessageId ?? "").trim();
      const replySource = replyId ? current.find((m) => m.id === replyId && !m.pending) : undefined;
      const replySnap = replySource ? buildReplyPreviewSnapshot(replySource) : null;
      /**
       * 최종 검토 #2: 다른 화면(같은 앱 실행)에서 아직 요청 중인 글은 「보내는 중」 행으로 보여 준다(레거시: 보내는 중 글 유지).
       * 요청은 보내지 않고 재전송·삭제 버튼도 없다. 그 요청이 끝나면 창 이벤트로 확정 행 교체 또는 실패 행 전환.
       */
      const sending = isMessengerTextSendInflight(roomId, e.clientMessageId);
      rows.push({
        id: tempId,
        roomId,
        senderId: sender.senderId,
        senderLabel: sender.senderLabel,
        messageType: "text",
        content: e.content,
        createdAt: e.createdAt,
        clientMessageId: e.clientMessageId,
        isMine: true,
        /** F1: 「전송 중」이 아니라 실패 상태로 복원(경고 + 재전송·삭제). 진행 중이면 보내는 중(sendFailed 없음) */
        pending: true,
        ...(sending ? {} : { sendFailed: true }),
        callKind: null,
        callStatus: null,
        ...(replySnap
          ? {
              replyToMessageId: replySnap.messageId,
              replyPreviewText: replySnap.previewText,
              replyPreviewType: replySnap.messageType,
              replySenderLabelSnapshot: replySnap.senderLabel,
            }
          : {}),
      } as RoomRow);
      if (sending) {
        sendingMirrorRowsRef.current.set(e.clientMessageId, tempId);
      } else {
        registerFailedTextRowHandlers({ tempId, clientMessageId: e.clientMessageId, content: e.content, replyId });
      }
    }
    if (rows.length === 0) return;
    d.setRoomMessages((prev) => mergeRoomMessages(prev, rows));
  };
  useEffect(() => {
    if (!restoreReady || !streamRoomId) return;
    if (restoredFailedTextRoomRef.current === streamRoomId) return;
    if (!depsRef.current.resolveOutboundSender()) return;
    /** 감사 D-3: 사용자 id 를 알 때까지 복원을 미룬다(누구의 글인지 가릴 수 없으므로) */
    if (!viewerUserId) return;
    restoredFailedTextRoomRef.current = streamRoomId;
    persistedFailedTextCidsRef.current = new Set();
    sendingMirrorRowsRef.current = new Map();
    const stored = listMessengerFailedTextSends(streamRoomId);
    /** B-D2: 복원 전에 온 저장 이벤트 중 보관분에 없는 글을 합친다(같은 방만) */
    const early = earlySavedEventsRef.current;
    earlySavedEventsRef.current = { roomId: "", entries: [] };
    const storedCids = new Set(stored.map((e) => e.clientMessageId));
    const queued =
      early.roomId === streamRoomId ? early.entries.filter((e) => !storedCids.has(e.clientMessageId)) : [];
    restoreFailedTextRows(streamRoomId, [...stored, ...queued]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 방 진입 시 1회(스냅샷 준비 시점)만
  }, [restoreReady, streamRoomId, viewerUserId]);

  /**
   * PR-1 검토 #1: 이 훅 인스턴스가 마운트돼 있는가 — 전송 응답이 왔을 때 화면(입력창·행)이 그대로인지 판단.
   * 12초 안에 방을 나갔거나 다시 들어와(새 인스턴스) 응답을 받은 옛 인스턴스는 입력창 복원을 할 수 없다.
   */
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * PR-1 검토 #1: 다른(옛) 인스턴스가 이 방의 실패 글을 보관하면, 지금 열려 있는 인스턴스가 바로 실패 행으로 보여 준다
   * (진입 복원은 이미 끝났으므로). 같은 cid 행이 이미 있으면 건너뛴다.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    /** 옛 화면의 요청이 실패(결과 불명·거절) — 보내는 중 행이면 실패 행으로 바꾸고, 없으면 보관분으로 실패 행 복원 */
    const onSaved = (ev: Event) => {
      const detail = (ev as CustomEvent<MessengerFailedTextSavedDetail>).detail;
      const d = depsRef.current;
      const rid = d.streamRoomId;
      if (!detail?.roomId || detail.roomId !== rid) return;
      const cid = trimText(detail.clientMessageId);
      if (!cid) return;
      if (restoredFailedTextRoomRef.current !== rid) {
        /** B-D2: 아직 진입 복원 전 — 버리지 않고 대기열에(글 내용이 있을 때만, 같은 cid 는 1건) */
        if (typeof detail.content !== "string") return;
        const q = earlySavedEventsRef.current.roomId === rid ? earlySavedEventsRef.current : { roomId: rid, entries: [] };
        earlySavedEventsRef.current = {
          roomId: rid,
          entries: [
            ...q.entries.filter((e) => e.clientMessageId !== cid),
            {
              clientMessageId: cid,
              content: detail.content,
              replyToMessageId: detail.replyToMessageId ?? null,
              createdAt: detail.createdAt ?? new Date().toISOString(),
              savedAt: Date.now(),
              senderUserId: detail.senderUserId ?? null,
            },
          ],
        };
        return;
      }
      const mirrorTempId = sendingMirrorRowsRef.current.get(cid);
      if (mirrorTempId) {
        sendingMirrorRowsRef.current.delete(cid);
        if (isMessengerOutboundRowDisplayed(d.roomMessagesRef.current, mirrorTempId)) {
          /**
           * 최종 검토 후속 #3: 저장소에 그 cid 보관분(전송 시작 때 저장)이 있으면 kept 와 관계없이 집합에 넣는다 —
           * 확정 행이 오면 prune 이 지울 수 있게.
           */
          if (detail.kept || listMessengerFailedTextSends(rid).some((e) => e.clientMessageId === cid)) {
            persistedFailedTextCidsRef.current.add(cid);
          }
          registerFailedTextRowHandlers({
            tempId: mirrorTempId,
            clientMessageId: cid,
            content: detail.content ?? "",
            replyId: (detail.replyToMessageId ?? "").trim(),
          });
          d.setRoomMessages((prev) => markMessengerOutboundRowFailed(prev, mirrorTempId));
          return;
        }
      }
      const entry =
        listMessengerFailedTextSends(rid).find((e) => e.clientMessageId === cid) ??
        (typeof detail.content === "string"
          ? {
              clientMessageId: cid,
              content: detail.content,
              replyToMessageId: detail.replyToMessageId ?? null,
              createdAt: detail.createdAt ?? new Date().toISOString(),
              savedAt: Date.now(),
              senderUserId: detail.senderUserId ?? null,
            }
          : null);
      if (entry) restoreFailedTextRows(rid, [entry]);
    };
    /**
     * 옛 화면의 요청이 성공 — 보내는 중 행을 확정 행으로(실시간이 늦거나 오지 않아도 남지 않게).
     * 확정 행 병합은 기존 `mergeRoomMessages`(같은 cid 보내는 중 행 제외)를 그대로 쓴다.
     */
    const onConfirmed = (ev: Event) => {
      const detail = (ev as CustomEvent<MessengerTextSendConfirmedDetail>).detail;
      const d = depsRef.current;
      const rid = d.streamRoomId;
      if (!detail?.roomId || detail.roomId !== rid) return;
      const cid = trimText(detail.clientMessageId);
      const mirrorTempId = cid ? sendingMirrorRowsRef.current.get(cid) : undefined;
      if (!cid || !mirrorTempId) return;
      sendingMirrorRowsRef.current.delete(cid);
      persistedFailedTextCidsRef.current.delete(cid);
      const message = detail.message ?? null;
      if (message?.id && !isOlderThanLoadedWindow(d.roomMessagesRef.current, message)) {
        d.setRoomMessages((prev) =>
          mergeRoomMessages(
            prev.filter((item) => item.id !== mirrorTempId),
            [message]
          )
        );
        return;
      }
      d.setRoomMessages((prev) => prev.filter((item) => item.id !== mirrorTempId));
      /** 본문 없는 성공 — 확정 행을 다시 불러오도록(전송 지표·소리는 그 화면 몫이라 생략) */
      if (!message) d.onTextSendConfirmed({ clientMessageId: cid, message: null, elapsedMs: 0, fromOtherScreen: true });
    };
    window.addEventListener(MESSENGER_FAILED_TEXT_SAVED_EVENT, onSaved);
    window.addEventListener(MESSENGER_TEXT_SEND_CONFIRMED_EVENT, onConfirmed);
    return () => {
      window.removeEventListener(MESSENGER_FAILED_TEXT_SAVED_EVENT, onSaved);
      window.removeEventListener(MESSENGER_TEXT_SEND_CONFIRMED_EVENT, onConfirmed);
      earlySavedEventsRef.current = { roomId: "", entries: [] };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 최신 값은 depsRef 로 읽는다
  }, []);

  /**
   * P1 B-2 #11 (appendix-P1-send-status-design.md B-4): 글 전송 1회 시도.
   * - 성공: 확정 행으로 교체
   * - definitive(4xx·ok:false) + 글을 입력창에 되돌린 경우(첫 전송·M-8): 행 삭제 + 스낵바 — 글은 입력창에 있으므로 손실 없음
   * - 그 밖의 모든 실패(indeterminate: 네트워크·시간 초과 12초·408/425·5xx·본문 유실 / 실패 행 재전송의 definitive /
   *   입력창 복원 불가 definitive / 로그인 화면 이동): 행을 「전송 실패」로 유지 + 기기 보관. 같은 tempId·cid 로 재전송
   *   (서버 UNIQUE 멱등 → 1행). 행은 사용자의 「삭제」 또는 같은 cid 확정 행으로만 사라진다(F1 무손실).
   */
  const runTextSendAttempt = async ({
    tempId,
    clientMessageId,
    content,
    replyId,
    restoreOnFail,
    failRestoreGeneration,
  }: MessengerTextSendAttemptArgs): Promise<boolean> => {
    const d = depsRef.current;
    const roomId = d.streamRoomId;
    /** 응답이 왔을 때 같은 인스턴스·같은 방인가(검토 #1) */
    const sameScreen = () => mountedRef.current && depsRef.current.streamRoomId === roomId;
    const latencyKey = cmReceiveLatencyKey({ roomId, clientMessageId });
    cmReceiveLatencyMark(latencyKey, { send_api_start_ms: cmReceiveLatencyNow() });
    const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
    /**
     * PR-1 감사 #1: 전송을 **시작할 때** 글을 기기에 보관한다 — 입력창·초안은 이미 비워졌으므로, 응답 전에 앱이 종료·새로고침되면
     * 예전에는 글이 어디에도 남지 않았다. 성공·입력창 복원은 이 보관분을 지운다(`forgetPersistedFailedText`).
     * 여기서 저장소가 거부해도 스낵바는 띄우지 않는다(실패 응답 때 1회만).
     */
    const inflight = inflightKey(roomId, clientMessageId);
    inflightTextSendKeys.add(inflight);
    const startRow = d.roomMessagesRef.current.find((item) => item.id === tempId);
    /** 감사 D-3: 보낸 사용자 — 전송 시작 때 잡아 둔다(요청 중 계정이 바뀌어도 원래 사용자 것으로 보관) */
    const senderUserId = d.viewerUserId.trim() || null;
    if (canPersistFailedTextForSender(senderUserId)) {
      saveMessengerFailedTextSend(roomId, {
        clientMessageId,
        content,
        replyToMessageId: replyId || null,
        createdAt: startRow?.createdAt ?? new Date().toISOString(),
        senderUserId,
      });
    }
    /** 감사 D1: 기기 저장소가 거부해도 메모리 보관소에 들어가므로 항상 추적(확정 행이 오면 prune 이 두 곳 모두 지움) */
    persistedFailedTextCidsRef.current.add(clientMessageId);
    /**
     * F8: 응답 본문 읽기까지 같은 12초 안에서 끝낸다.
     * CHAT-03: fetch 예외(네트워크/비행기 모드/시간 초과 abort) — res null, 서버 커밋 여부 불명(indeterminate).
     */
    let sent: MessengerSendFetchJsonResult<{ ok?: boolean; error?: string; message?: CommunityMessengerMessage }>;
    try {
      sent = await fetchMessengerSendJson(`${communityMessengerRoomResourcePath(roomId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          clientMessageId,
          ...(replyId ? { replyToMessageId: replyId } : {}),
        }),
        timeoutMs: MESSENGER_TEXT_SEND_TIMEOUT_MS,
      });
    } finally {
      /** 요청이 끝나면(성공·실패·예외 모두) 진행 중에서 뺀다 — 이후 처리(보관·창 이벤트)는 진행 중이 아님 */
      inflightTextSendKeys.delete(inflight);
    }
    const res = sent.res;
    const jsonParsed = sent.jsonParsed;
    const json = sent.json as { ok?: boolean; error?: string; code?: string; message?: CommunityMessengerMessage };
    if (res) cmReceiveLatencyMark(latencyKey, { send_api_done_ms: cmReceiveLatencyNow() });
    const createdAt = typeof json.message?.createdAt === "string" ? json.message.createdAt : "";
    if (createdAt) cmReceiveLatencyMark(latencyKey, { db_message_created_at: createdAt });
    if (res && res.ok && json.ok) {
      const elapsedMs =
        typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
      clearMessengerOutboundFailedSend(tempId);
      d.failedOutboundRowIdsRef.current.delete(tempId);
      forgetPersistedFailedText(roomId, clientMessageId);
      d.unconfirmedTextSendRef.current = nextUnconfirmedTextSendAfterSuccess(
        d.unconfirmedTextSendRef.current,
        clientMessageId
      );
      const confirmedMessage = json.message;
      /** 최종 검토 #2: 옛 화면이면 지금 열린 같은 방 화면의 「보내는 중」 행을 확정 행으로 바꾸게 알린다 */
      if (!sameScreen()) {
        dispatchTextSendConfirmed({
          roomId,
          clientMessageId,
          message: confirmedMessage?.id
            ? !trimText(confirmedMessage.clientMessageId)
              ? { ...confirmedMessage, clientMessageId }
              : confirmedMessage
            : null,
        });
      }
      /**
       * PR-1 검토 #4: deduped 재전송이 돌려준 확정 행이 지금 불러온 창의 가장 오래된 메시지보다 오래되면 병합하지 않는다
       * (병합하면 「이전 불러오기」 커서가 그 행으로 당겨져 사이 메시지를 건너뜀). 실패 행·보관만 지운다 — 서버 저장 확인됨.
       */
      if (confirmedMessage?.id && isOlderThanLoadedWindow(d.roomMessagesRef.current, confirmedMessage)) {
        d.setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        d.onTextSendConfirmed({ clientMessageId, message: null, elapsedMs, outsideLoadedWindow: true });
        return true;
      }
      if (confirmedMessage?.id) {
        const withCid =
          !trimText(confirmedMessage.clientMessageId) && clientMessageId
            ? { ...confirmedMessage, clientMessageId }
            : confirmedMessage;
        d.setRoomMessages((prev) =>
          mergeRoomMessages(
            prev.filter(
              (item) => item.id !== tempId && !(item.pending && item.clientMessageId === clientMessageId)
            ),
            [withCid]
          )
        );
        d.onTextSendConfirmed({ clientMessageId, message: withCid, elapsedMs });
        return true;
      }
      d.onTextSendConfirmed({ clientMessageId, message: null, elapsedMs });
      return true;
    }
    /*
     * C-5: 5xx·408·본문 유실·네트워크 예외처럼 서버 커밋 여부를 알 수 없으면 (내용, cid) 를 보존 → 같은 내용 재전송이
     * 같은 cid 로 나가 서버 UNIQUE 멱등으로 1행만 남는다. 명시적 4xx 거절이면 보존분 폐기.
     */
    const failure = res
      ? classifyMessengerSendFailure({ status: res.status, jsonParsed })
      : classifyMessengerSendFailure({ networkError: true });
    d.unconfirmedTextSendRef.current = nextUnconfirmedTextSendAfterFailure(
      d.unconfirmedTextSendRef.current,
      { content, clientMessageId },
      failure
    );
    const authBlocked = res ? d.redirectIfMessengerAuthBlocked(res, json) : false;
    const failureMessage = () =>
      d.getRoomActionErrorMessage(
        res
          ? pickMessengerApiErrorField(json) || (jsonParsed ? undefined : messengerUploadFallbackErrorCode(res.status))
          : "message_send_failed"
      );
    /**
     * F1: definitive 거절이라도 행을 지우는 것은 **글을 입력창에 되돌린 경우만**(첫 전송·M-8).
     * 실패 행 재전송(restoreOnFail 없음)·입력창이 다른 글로 바뀐 경우·위치 공유 등 입력창 밖 글은 행을 실패 상태로 남긴다.
     * 로그인 화면 이동(authBlocked)은 보관분을 지우지 않아 로그인 뒤 같은 방에서 실패 행으로 다시 보인다.
     */
    if (failure === "definitive" && !authBlocked) {
      const restoreComposer = shouldRestoreActiveComposerAfterSendFail({
        sendGeneration: failRestoreGeneration,
        restoreOnFail,
      });
      /**
       * PR-1 검토 #1: 입력창 복원은 **같은 인스턴스가 마운트돼 있고 같은 방**일 때만. 아니면(12초 안에 나감·재진입)
       * setMessage 가 무효라 글이 사라지므로, 아래 실패 행 보관 경로로 간다.
       */
      if (restoreComposer && sameScreen()) {
        clearMessengerOutboundFailedSend(tempId);
        d.failedOutboundRowIdsRef.current.delete(tempId);
        forgetPersistedFailedText(roomId, clientMessageId);
        d.setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        d.setMessage(restoreOnFail!);
        /**
         * FAIL-1: 방을 나갔다 와도 되돌린 글이 입력창에 남도록 방별 초안에도 저장한다
         * (전에는 Phase2 입력창의 자체 복원 블록이 하던 일 — 입력창 동기화 effect 는 초안을 쓰지 않는다).
         */
        writeRoomComposerDraft(roomId, restoreOnFail!);
        showMessengerSnackbar(failureMessage(), { variant: "error" });
        return false;
      }
    }
    /**
     * 최종 감사 D3: 실패 안내(「재전송을 눌러 주세요」 등)는 이 화면에 실패 행·재전송 버튼이 있을 때만.
     * 옛 화면(나감·재진입·다른 방)이면 띄우지 않는다 — 실패 행은 같은 방 화면이 있으면 그 화면에, 없으면 재진입 때 보인다.
     */
    if (!authBlocked && sameScreen()) {
      showMessengerSnackbar(failureMessage(), { variant: "error" });
    }
    /**
     * 최종 감사 D2: 요청 중 로그아웃(wipe)·계정 전환 뒤 늦게 온 실패 응답은 보낸 사용자 ≠ 지금 바인딩된 사용자(또는 세션 없음)
     * → 보관·저장 실패 안내·창 이벤트 모두 하지 않는다(이전 계정 글을 기기·메모리에 다시 쓰지 않게).
     */
    if (!canPersistFailedTextForSender(senderUserId)) {
      clearMessengerOutboundFailedSend(tempId);
      d.failedOutboundRowIdsRef.current.delete(tempId);
      return false;
    }
    /** P1 (Owner 2026-11-18): 방을 나갔다 와도 실패 행이 남도록 기기 저장소에 보관 */
    const rowCreatedAt =
      d.roomMessagesRef.current.find((item) => item.id === tempId)?.createdAt ?? new Date().toISOString();
    /** 리뷰 #2: 같은 cid 확정 행이 이미 화면에 있으면(늦게 도착한 서버 저장) 보관하지 않는다 */
    const alreadyConfirmed = d.roomMessagesRef.current.some(
      (item) => !item.pending && trimText(item.clientMessageId) === clientMessageId
    );
    if (alreadyConfirmed) {
      /** 시작 때 보관한 분 — 서버 확정 행이 있으므로 지운다 */
      forgetPersistedFailedText(roomId, clientMessageId);
      if (!sameScreen()) dispatchTextSendConfirmed({ roomId, clientMessageId, message: null });
    } else {
      /** 감사 D-2: 전송 시작 때 기기 저장소에 이미 보관됐는가(그러면 이번 쓰기가 거부돼도 글은 기기에 남아 있다) */
      const alreadyOnDevice = hasMessengerFailedTextSendInDeviceStorage(roomId, clientMessageId);
      const kept = saveMessengerFailedTextSend(roomId, {
        clientMessageId,
        content,
        replyToMessageId: replyId || null,
        createdAt: rowCreatedAt,
        senderUserId,
      });
      /** 감사 D1: 거부돼도 메모리 보관소(앱 실행 중)에 있으므로 추적은 항상 */
      persistedFailedTextCidsRef.current.add(clientMessageId);
      if (!kept && !alreadyOnDevice) {
        /** 검토 #3: 기기 저장소가 거부(용량 초과·사생활 모드) — 앱을 닫으면 사라질 수 있음을 알린다(메모리 보관·화면 행은 유지) */
        showMessengerSnackbar(translateCmUi("cm_ui_failed_text_not_kept"), { variant: "error" });
      }
      /**
       * 검토 #1·최종 검토 #2: 옛 인스턴스면 지금 열린 같은 방 화면에 실패 행으로 알린다(보내는 중 행이면 실패 행으로 전환).
       * 보관이 거부돼도 글을 실어 보내 새 화면이 보여 준다.
       */
      if (!sameScreen() && typeof window !== "undefined") {
        const detail: MessengerFailedTextSavedDetail = {
          roomId,
          clientMessageId,
          kept,
          content,
          replyToMessageId: replyId || null,
          createdAt: rowCreatedAt,
          senderUserId,
        };
        window.dispatchEvent(new CustomEvent(MESSENGER_FAILED_TEXT_SAVED_EVENT, { detail }));
      }
    }
    /**
     * PR-1 재검토(차단): 옛 화면(언마운트·다른 방)은 행·핸들러를 만들지 않는다 — 보관 + 창 이벤트만.
     * 언마운트 정리 뒤 등록하면 전역 레지스트리에 남고, 지금 열린 화면이 그 글을 자기 행으로 복원한다.
     */
    if (!sameScreen()) {
      clearMessengerOutboundFailedSend(tempId);
      return false;
    }
    registerFailedTextRowHandlers({ tempId, clientMessageId, content, replyId });
    d.setRoomMessages((prev) => markMessengerOutboundRowFailed(prev, tempId));
    return false;
  };
  useLayoutEffect(() => {
    runTextSendAttemptRef.current = runTextSendAttempt;
  });

  return { runTextSendAttemptRef };
}
