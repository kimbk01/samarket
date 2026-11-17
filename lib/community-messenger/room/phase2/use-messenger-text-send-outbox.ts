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
import { fetchMessengerSendJson } from "@/lib/community-messenger/room/messenger-send-fetch-json";
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
import {
  listMessengerFailedTextSends,
  pruneMessengerFailedTextSendsConfirmed,
  removeMessengerFailedTextSend,
  saveMessengerFailedTextSend,
} from "@/lib/community-messenger/room/messenger-failed-text-store";
import {
  classifyMessengerSendFailure,
  messengerUploadFallbackErrorCode,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

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
  }) => void;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function useMessengerTextSendOutbox(deps: MessengerTextSendOutboxDeps) {
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    depsRef.current = deps;
  });
  const { streamRoomId, restoreReady, roomMessages } = deps;

  /**
   * P1 (Owner 2026-11-18 「권장안대로 반영」): 결과 불명 실패 글을 기기 저장소에 보관 → 방을 나갔다 와도 실패 행 유지.
   * 이 방에서 보관 중인 cid — 보관소(localStorage)를 매 렌더 읽지 않도록 메모리에 둔다.
   */
  const persistedFailedTextCidsRef = useRef<Set<string>>(new Set());
  const forgetPersistedFailedText = (clientMessageId: string) => {
    const cid = clientMessageId.trim();
    if (!cid || !persistedFailedTextCidsRef.current.has(cid)) return;
    persistedFailedTextCidsRef.current.delete(cid);
    removeMessengerFailedTextSend(depsRef.current.streamRoomId, cid);
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
      forgetPersistedFailedText(clientMessageId);
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
  useEffect(() => {
    if (!restoreReady || !streamRoomId) return;
    if (restoredFailedTextRoomRef.current === streamRoomId) return;
    const d = depsRef.current;
    const sender = d.resolveOutboundSender();
    if (!sender) return;
    restoredFailedTextRoomRef.current = streamRoomId;
    const entries = listMessengerFailedTextSends(streamRoomId);
    persistedFailedTextCidsRef.current = new Set(entries.map((e) => e.clientMessageId));
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
    if (confirmed.size) {
      pruneMessengerFailedTextSendsConfirmed(streamRoomId, confirmed);
      for (const c of confirmed) persistedFailedTextCidsRef.current.delete(c);
    }
    const rows: RoomRow[] = [];
    for (const e of entries) {
      if (confirmed.has(e.clientMessageId) || pendingCids.has(e.clientMessageId)) continue;
      const tempId = d.nextPendingRowId();
      const replyId = (e.replyToMessageId ?? "").trim();
      const replySource = replyId ? current.find((m) => m.id === replyId && !m.pending) : undefined;
      const replySnap = replySource ? buildReplyPreviewSnapshot(replySource) : null;
      rows.push({
        id: tempId,
        roomId: streamRoomId,
        senderId: sender.senderId,
        senderLabel: sender.senderLabel,
        messageType: "text",
        content: e.content,
        createdAt: e.createdAt,
        clientMessageId: e.clientMessageId,
        isMine: true,
        /** F1: 「전송 중」이 아니라 실패 상태로 복원(경고 + 재전송·삭제) */
        pending: true,
        sendFailed: true,
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
      registerFailedTextRowHandlers({ tempId, clientMessageId: e.clientMessageId, content: e.content, replyId });
    }
    if (rows.length === 0) return;
    d.setRoomMessages((prev) => mergeRoomMessages(prev, rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 방 진입 시 1회(스냅샷 준비 시점)만
  }, [restoreReady, streamRoomId]);

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
    const latencyKey = cmReceiveLatencyKey({ roomId, clientMessageId });
    cmReceiveLatencyMark(latencyKey, { send_api_start_ms: cmReceiveLatencyNow() });
    const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
    /**
     * F8: 응답 본문 읽기까지 같은 12초 안에서 끝낸다.
     * CHAT-03: fetch 예외(네트워크/비행기 모드/시간 초과 abort) — res null, 서버 커밋 여부 불명(indeterminate).
     */
    const sent = await fetchMessengerSendJson<{ ok?: boolean; error?: string; message?: CommunityMessengerMessage }>(
      `${communityMessengerRoomResourcePath(roomId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          clientMessageId,
          ...(replyId ? { replyToMessageId: replyId } : {}),
        }),
        timeoutMs: MESSENGER_TEXT_SEND_TIMEOUT_MS,
      }
    );
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
      forgetPersistedFailedText(clientMessageId);
      d.unconfirmedTextSendRef.current = nextUnconfirmedTextSendAfterSuccess(
        d.unconfirmedTextSendRef.current,
        clientMessageId
      );
      const confirmedMessage = json.message;
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
      if (restoreComposer) {
        clearMessengerOutboundFailedSend(tempId);
        d.failedOutboundRowIdsRef.current.delete(tempId);
        forgetPersistedFailedText(clientMessageId);
        d.setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        d.setMessage(restoreOnFail!);
        showMessengerSnackbar(failureMessage(), { variant: "error" });
        return false;
      }
    }
    if (!authBlocked) {
      showMessengerSnackbar(failureMessage(), { variant: "error" });
    }
    /** P1 (Owner 2026-11-18): 방을 나갔다 와도 실패 행이 남도록 기기 저장소에 보관 */
    const rowCreatedAt =
      d.roomMessagesRef.current.find((item) => item.id === tempId)?.createdAt ?? new Date().toISOString();
    /** 리뷰 #2: 같은 cid 확정 행이 이미 화면에 있으면(늦게 도착한 서버 저장) 보관하지 않는다 */
    const alreadyConfirmed = d.roomMessagesRef.current.some(
      (item) => !item.pending && trimText(item.clientMessageId) === clientMessageId
    );
    if (!alreadyConfirmed) {
      saveMessengerFailedTextSend(roomId, {
        clientMessageId,
        content,
        replyToMessageId: replyId || null,
        createdAt: rowCreatedAt,
      });
      persistedFailedTextCidsRef.current.add(clientMessageId);
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
