"use client";

/**
 * 메시지 「전달하기」 대상 선택 (통합 공유 S6 · Owner G-4·G-5 2026-11-14 · 시안 3절).
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §D-5 · §I-4.
 *
 * - 대상 = 최근 채팅(일반·그룹, 거래·배달 방 제외) + 친구. 최대 5곳.
 * - 시트를 열 때 요청 번호 1개 → 대상마다 결정적 clientMessageId(`fwd:{요청}:{방}`).
 *   「다시 시도」는 같은 번호를 다시 써서, 이미 보낸 방은 DB 고유 인덱스로 다시 보내지지 않는다(알림도 다시 안 감).
 * - 결과는 대상별: 보냄 · 보낼 수 없음(권한·차단·방 종류 — 재시도 목록에서 빠짐) · 실패(재시도 가능).
 * - 친구는 기존 「대화 시작」 API 로 1:1 방을 연 뒤(이미 있으면 그 방) 보낸다.
 */
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayFullSheet } from "@/components/ui/dibay-overlay";
import type { CommunityShareTargetItem } from "@/components/community/share/CommunityShareTargetPicker";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export const MESSENGER_FORWARD_MAX_TARGETS = 5;

export type MessengerForwardSource = {
  roomId: string;
  messageId: string;
  previewText: string;
};

type TargetStatus = "idle" | "sent" | "retry" | "not_allowed";

const NOT_ALLOWED_ERRORS = new Set([
  "forward_target_not_allowed",
  "forward_source_not_allowed",
  "forward_type_not_allowed",
  "forward_source_not_found",
  "room_blocked",
  "room_archived",
  "room_readonly",
  "room_not_found",
  "blocked_target",
  "rejected_by_peer",
  "cannot_start_chat",
]);

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; roomId?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; roomId?: string };
    if (res.ok && json.ok !== false) return { ok: true, roomId: json.roomId };
    return { ok: false, error: String(json.code ?? json.error ?? `http_${res.status}`) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function MessengerForwardSheet({
  source,
  onClose,
}: {
  source: MessengerForwardSource | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const open = source != null;
  const requestIdRef = useRef<string>("");
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<CommunityShareTargetItem[]>([]);
  const [friends, setFriends] = useState<CommunityShareTargetItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, TargetStatus>>({});
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"pick" | "result">("pick");
  /** 친구 → 1:1 방 id (재시도 때 방을 다시 열지 않게) */
  const friendRoomRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    requestIdRef.current = newRequestId();
    friendRoomRef.current = {};
    setSelected([]);
    setStatus({});
    setPhase("pick");
    let alive = true;
    setLoading(true);
    void fetch("/api/community/share/targets", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; recent?: CommunityShareTargetItem[]; friends?: CommunityShareTargetItem[] }) => {
        if (!alive) return;
        setRecent((j.recent ?? []).filter((x) => x.forwardable !== false));
        setFriends((j.friends ?? []).filter((x) => x.forwardable !== false));
      })
      .catch(() => {
        if (alive) {
          setRecent([]);
          setFriends([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const all = useMemo(() => [...recent, ...friends], [recent, friends]);
  const byId = useMemo(() => new Map(all.map((x) => [x.id, x])), [all]);

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= MESSENGER_FORWARD_MAX_TARGETS) {
          showMessengerSnackbar(t("share_forward_limit", { max: MESSENGER_FORWARD_MAX_TARGETS }));
          return prev;
        }
        return [...prev, id];
      });
    },
    [t]
  );

  const sendOne = useCallback(
    async (target: CommunityShareTargetItem): Promise<TargetStatus> => {
      if (!source) return "retry";
      let roomId = target.kind === "room" ? target.roomId ?? "" : friendRoomRef.current[target.id] ?? "";
      if (!roomId && target.kind === "friend" && target.userId) {
        const r = await postJson("/api/community-messenger/direct/start", { targetUserId: target.userId });
        if (!r.ok || !r.roomId) return r.error && NOT_ALLOWED_ERRORS.has(r.error) ? "not_allowed" : "retry";
        roomId = r.roomId;
        friendRoomRef.current[target.id] = roomId;
      }
      if (!roomId) return "not_allowed";
      const r = await postJson(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/messages/forward`, {
        sourceRoomId: source.roomId,
        sourceMessageId: source.messageId,
        clientMessageId: `fwd:${requestIdRef.current}:${roomId}`,
      });
      if (r.ok) return "sent";
      return r.error && NOT_ALLOWED_ERRORS.has(r.error) ? "not_allowed" : "retry";
    },
    [source]
  );

  const run = useCallback(
    async (ids: string[]) => {
      if (busy || ids.length === 0) return;
      setBusy(true);
      const next: Record<string, TargetStatus> = { ...status };
      for (const id of ids) {
        const target = byId.get(id);
        if (!target) continue;
        next[id] = await sendOne(target);
      }
      setStatus(next);
      setBusy(false);
      const sentCount = Object.values(next).filter((v) => v === "sent").length;
      const unsent = ids.filter((id) => next[id] !== "sent");
      if (unsent.length === 0) {
        showMessengerSnackbar(t("share_forward_done", { count: sentCount }), { variant: "success" });
        onClose();
        return;
      }
      setSelected(unsent.filter((id) => next[id] === "retry"));
      setPhase("result");
    },
    [busy, byId, onClose, sendOne, status, t]
  );

  const sentCount = Object.values(status).filter((v) => v === "sent").length;
  const failed = Object.entries(status).filter(([, v]) => v === "retry" || v === "not_allowed");

  const row = (item: CommunityShareTargetItem, mode: "pick" | "result") => {
    const on = selected.includes(item.id);
    const st = status[item.id];
    const disabled = mode === "result" && st === "not_allowed";
    return (
      <button
        key={item.id}
        type="button"
        disabled={disabled || busy}
        onClick={() => toggle(item.id)}
        className="flex min-h-[56px] w-full items-center gap-3 text-left disabled:opacity-100"
        aria-pressed={on}
      >
        <SamarketThumbnail
          src={item.avatarUrl ?? null}
          alt=""
          size={40}
          roundedClassName="rounded-[15px]"
        />
        <span className="grid min-w-0 flex-1">
          <span className={`truncate text-[15px] ${disabled ? "text-sam-muted" : "text-sam-fg"}`}>{item.label}</span>
          {mode === "result" && st ? (
            <span className={`truncate text-[12px] ${st === "retry" ? "text-sam-danger" : "text-sam-muted"}`}>
              {st === "retry" ? t("share_forward_err_retry") : t("share_forward_err_not_allowed")}
            </span>
          ) : item.subtitle ? (
            <span className="truncate text-[12px] text-sam-muted">{item.subtitle}</span>
          ) : null}
        </span>
        {disabled ? null : (
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
              on ? "border-sam-primary bg-sam-primary text-white" : "border-sam-border"
            }`}
          >
            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
          </span>
        )}
      </button>
    );
  };

  const primaryLabel =
    phase === "pick"
      ? t("share_forward_submit", { count: selected.length })
      : t("share_forward_retry", { count: selected.length });

  return (
    <DibayFullSheet
      open={open}
      onClose={onClose}
      title={t("share_forward_title")}
      actions={[
        {
          key: "forward",
          label: primaryLabel,
          roleTone: "primary",
          disabled: selected.length === 0 || busy,
          loading: busy,
          onClick: () => void run(selected),
        },
      ]}
    >
      <div className="px-4 pb-4" data-cm-forward-sheet={phase}>
        {source ? (
          <p className="mb-3 mt-1 line-clamp-2 rounded-ui-rect border-l-[3px] border-sam-primary bg-sam-app px-3 py-2 text-[13px] text-sam-fg">
            {source.previewText}
          </p>
        ) : null}
        {phase === "result" ? (
          <>
            {sentCount > 0 ? (
              <p className="mb-3 rounded-ui-rect bg-sam-primary-soft px-3 py-2.5 text-[14px] font-semibold text-sam-primary">
                {t("share_forward_done", { count: sentCount })}
              </p>
            ) : null}
            <p className="mb-1 text-[12px] font-semibold text-sam-muted">{t("share_forward_failed_title")}</p>
            {failed.map(([id]) => {
              const item = byId.get(id);
              return item ? row(item, "result") : null;
            })}
          </>
        ) : loading ? (
          <p className="py-8 text-center text-[14px] text-sam-muted">{t("common_loading")}</p>
        ) : all.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-sam-muted">{t("share_forward_empty")}</p>
        ) : (
          <>
            {recent.length > 0 ? (
              <>
                <p className="mb-1 mt-2 text-[12px] font-semibold text-sam-muted">{t("share_forward_recent")}</p>
                {recent.map((x) => row(x, "pick"))}
              </>
            ) : null}
            {friends.length > 0 ? (
              <>
                <p className="mb-1 mt-4 text-[12px] font-semibold text-sam-muted">{t("share_forward_friends")}</p>
                {friends.map((x) => row(x, "pick"))}
              </>
            ) : null}
          </>
        )}
      </div>
    </DibayFullSheet>
  );
}
