"use client";

/**
 * 푸시·알림 발송 — 받은 사람 · 다시 보내기 · 반복 설정 · 알림음 · 업데이트 내역 (Owner 구현 승인 2026-11-02 · 시안 v3).
 * 숫자는 서버의 회원 단위 계산 하나(campaign-list-service `memberOutcomes`)를 목록·창이 함께 쓴다.
 */
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminNotificationSoundPreview } from "@/components/admin/settings/AdminNotificationSoundPreview";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { campaignSkipReasonLabel, pushFailureLabel } from "@/lib/admin/notification-campaigns/campaign-recipient-labels";
import { campaignCreateErrorMessage } from "@/lib/admin/notification-campaigns/campaign-create-form";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { getNotificationItem } from "@/lib/notifications/notification-item-registry";
import { campaignResultBadge } from "@/lib/admin/notification-campaigns/campaign-list-kind";
import { campaignStatusLabel } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { adminIsoToManilaInput } from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { displayNotificationSoundAssetLabel } from "@/lib/notifications/notification-sound-display-filename";
import { SOUND_MAX_BYTES } from "@/lib/notifications/notification-sound-ssot-admin-validation";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";

export type SentKind = "notice" | "system" | "event" | "marketing";

export const SENT_KIND_LABEL: Record<SentKind | "update", MessageKey> = {
  notice: "admin_notifications_kind_notice",
  system: "admin_notifications_kind_system",
  event: "admin_notifications_kind_event",
  marketing: "admin_notifications_kind_marketing",
  update: "admin_notifications_kind_update",
};

/** 분류 → 알림음 키 (알림 항목 SSOT 의 캠페인 항목과 같은 키). */
export function soundEventKeyForKind(kind: SentKind): string {
  const item =
    kind === "notice"
      ? getNotificationItem("campaign_notice")
      : kind === "system"
        ? getNotificationItem("campaign_system")
        : getNotificationItem("campaign_marketing");
  return item?.soundEventKey ?? "admin_notice_received";
}

export type MemberStats = {
  target: number;
  inbox: number;
  push_ok: number;
  push_fail: number;
  push_none: number;
  /** 혜택·이벤트 푸시 미동의 (2026-11-03) — 예전 응답엔 없을 수 있다 */
  push_optout?: number;
  /** 회원이 끈 설정·방해금지 (재감사 A-3) — 예전 응답엔 없을 수 있다 */
  push_setting_off?: number;
  /** 방해 금지 시간 (최종 감사 M-1) — 예전 응답엔 없을 수 있다 */
  push_quiet?: number;
  opened: number;
};

export type SentRecurrence = {
  kind: "daily" | "weekly" | "monthly";
  time: string;
  weekday: number | null;
  startAt: string | null;
  endAt: string | null;
};

export type SentRowLite = {
  id: string;
  title: string;
  body?: string | null;
  kind: SentKind;
  targetLabel: string;
  sentAtLabel: string;
  destination: string;
  stats: MemberStats | null;
  /** 결과 배지(campaignResultBadge) — 캠페인 상태·발송 방식. */
  status: string;
  sendMode: string | null;
  /** 캠페인 채널 — 알림함 전용이면 결과 배지가 푸시를 보지 않는다 (확정 설계 B-13) */
  channel?: string | null;
  /** 진행 중·일시정지 반복이면 지금 주기 — 「반복 설정」이 이 반복을 바꾼다(새 반복을 만들지 않음). */
  recurrence: SentRecurrence | null;
};

export type ModalDone = { message: string; id?: string | null; tab?: "completed" | "in_progress" };

/** 「결과」 열·받은 사람 머리 (시안 v3) — 같은 판정(campaignResultBadge). */
export function SentResultBadge({
  status,
  sendMode,
  stats,
  channel,
  ko,
}: {
  status: string;
  sendMode: string | null;
  stats: MemberStats | null;
  channel?: string | null;
  ko: boolean;
}) {
  const b = campaignResultBadge({ status, sendMode, stats, channel });
  const tone: Record<Exclude<typeof b, "status">, [MessageKey, string]> = {
    pending: ["admin_notifications_result_pending", "border-sam-info text-sam-info bg-sam-info-soft"],
    repeating: ["admin_notifications_result_repeating", "border-sam-info text-sam-info bg-sam-info-soft"],
    fail: ["admin_notifications_result_fail", "border-sam-danger text-sam-danger bg-sam-danger-soft"],
    none: ["admin_notifications_result_none", "border-sam-border text-sam-fg bg-sam-app"],
    ok: ["admin_notifications_result_ok", "border-sam-success text-sam-success bg-sam-success-soft"],
    empty: ["admin_notifications_result_empty", "border-sam-border text-sam-muted bg-sam-app"],
    inbox_only: ["admin_notifications_result_inbox_only", "border-sam-success text-sam-success bg-sam-success-soft"],
  };
  if (b === "status") {
    return (
      <span className="inline-block rounded-sm border border-sam-border bg-sam-app px-1.5 py-0.5 text-[12px] text-sam-muted">
        {campaignStatusLabel(status, ko ? "ko" : "en")}
      </span>
    );
  }
  const [key, cls] = tone[b];
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[12px] ${cls}`}>
      {translateBy(ko ? "ko" : "en", key)}
    </span>
  );
}

/** 분류의 지금 알림음 파일 이름 — 「알림음 설정」과 같은 값(/api/admin/notification-sound-ssot). */
export function useCategorySoundLabel(kind: SentKind | null, ko: boolean, reloadKey = 0): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    const key = soundEventKeyForKind(kind);
    void fetch("/api/admin/notification-sound-ssot", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; assets?: SoundAsset[]; events?: SoundEvent[]; mappings?: SoundMapping[] }) => {
        if (cancelled || !j.ok) return;
        const ev = (j.events ?? []).find((e) => e.event_key === key) ?? null;
        const m = (j.mappings ?? []).find((x) => x.event_key === key) ?? null;
        if (m?.use_device_default) {
          setLabel(translateBy(ko ? "ko" : "en", "admin_notifications_device_default"));
          return;
        }
        const assetId = m?.asset_id ?? ev?.default_asset_id ?? null;
        const asset = (j.assets ?? []).find((a) => a.id === assetId);
        setLabel(displayNotificationSoundAssetLabel(asset, translateBy(ko ? "ko" : "en", "admin_notifications_default")));
      })
      .catch(() => {
        if (!cancelled) setLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, ko, reloadKey]);
  return label;
}

function useTx(ko: boolean) {
  return (key: MessageKey, vars?: Record<string, unknown>) => translateBy(ko ? "ko" : "en", key, vars);
}

export function Modal({
  open,
  onClose,
  title,
  head,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  head?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <DibayOverlayRoot open onClose={onClose} dismissible placement="center" zRole="dialog">
      <div
        className={`${OverlayUi.dialogPanel} ${wide ? "!max-w-5xl" : "!max-w-lg"} flex max-h-[88vh] w-full flex-col overflow-hidden !p-0`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--overlay-border)] px-4 py-3">
          {head}
          <h3 className={`${OverlayUi.title} min-w-0 flex-1 !text-left`}>{title}</h3>
          <DibayOverlayButton roleTone="text" className="!min-h-9 !w-auto !flex-none !px-2" onClick={onClose}>
            ✕
          </DibayOverlayButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--overlay-border)] px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </DibayOverlayRoot>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <AdminChipButton key={o.value} selected={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </AdminChipButton>
      ))}
    </div>
  );
}

function StatCards({ stats, ko }: { stats: MemberStats; ko: boolean }) {
  const tx = useTx(ko);
  const cards: Array<[string, number, string]> = [
    [tx("admin_notifications_target"), stats.target, ""],
    [tx("admin_notifications_inbox_2"), stats.inbox, ""],
    [tx("admin_notifications_push_ok"), stats.push_ok, "text-sam-success"],
    [tx("admin_notifications_push_failed"), stats.push_fail, stats.push_fail ? "text-sam-danger" : ""],
    [tx("admin_notifications_push_opt_out"), stats.push_optout ?? 0, ""],
    [tx("admin_notifications_turned_off"), stats.push_setting_off ?? 0, ""],
    [tx("admin_notifications_quiet_hours"), stats.push_quiet ?? 0, ""],
    [tx("admin_notifications_no_push"), stats.push_none, ""],
    [tx("admin_notifications_opened"), stats.opened, ""],
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
      {cards.map(([k, v, cls]) => (
        <div key={k} className="rounded-ui-rect border border-sam-border px-3 py-2">
          <div className="text-[12px] text-sam-muted">{k}</div>
          <div className={`text-[20px] font-semibold tabular-nums ${cls}`}>{formatAdminNumber(v)}</div>
        </div>
      ))}
    </div>
  );
}

type RecipientRow = {
  user_id: string;
  name: string | null;
  inbox: "saved" | "not_saved";
  inbox_at: string | null;
  devices: number;
  push: "ok" | "fail" | "optout" | "off" | "quiet" | "none";
  push_ok_devices: number;
  push_fail_devices: number;
  skip_reasons: string[];
  failures: unknown[];
  opened_at: string | null;
};

/** 같은 사유가 기기마다 반복되면 한 번만 쓰고 개수를 붙인다(예: NotRegistered … ×2). */
function countedLabels(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(" · ");
}

const FILTERS = ["all", "ok", "fail", "optout", "off", "quiet", "none", "opened", "unread"] as const;
type Filter = (typeof FILTERS)[number];

/** 받은 사람 창 */
export function RecipientsModal({
  row,
  ko,
  onClose,
  onResend,
  onRepeat,
  onSound,
  canSend,
  soundReloadKey = 0,
}: {
  row: SentRowLite | null;
  ko: boolean;
  /** 알림음 창에서 저장하면 올려 받은 사람 창의 파일 이름을 다시 읽는다. */
  soundReloadKey?: number;
  /** 실제 발송 권한(manage) — 목록의 다시 보내기와 같은 판정. 없으면 다시 보내기·반복 버튼을 끈다. */
  canSend: boolean;
  onClose: () => void;
  onResend: (row: SentRowLite, mode: "same" | "failed" | "unread") => void;
  onRepeat: (row: SentRowLite) => void;
  onSound: (kind: SentKind) => void;
}) {
  const tx = useTx(ko);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<20 | 50 | 100>(20);
  const [data, setData] = useState<{
    stats: MemberStats;
    rows: RecipientRow[];
    total: number;
    occurrence: { sequence_number: number; completed_at: string | null; started_at: string | null } | null;
    failure_summary: Array<{ response: unknown; count: number }>;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const soundLabel = useCategorySoundLabel(row?.kind ?? null, ko, soundReloadKey);

  // 다른 알림으로 바뀌면 앞 알림의 숫자·회원 표를 비운다(재감사 2026-11-02 A4).
  useEffect(() => {
    setFilter("all");
    setPage(1);
    setData(null);
    setErr(null);
  }, [row?.id]);

  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const sp = new URLSearchParams({ filter, page: String(page), page_size: String(size) });
        const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(row.id)}/recipients?${sp}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !j.ok) {
          setErr(j.error ?? "load_failed");
          return;
        }
        setData(j);
      } catch {
        if (!cancelled) setErr("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row, filter, page, size, reloadTick]);

  if (!row) return null;
  const stats = data?.stats ?? row.stats;
  const filterCount = (f: Filter): number | null => {
    if (!stats) return null;
    if (f === "all") return stats.target;
    if (f === "ok") return stats.push_ok;
    if (f === "fail") return stats.push_fail;
    if (f === "optout") return stats.push_optout ?? 0;
    if (f === "off") return stats.push_setting_off ?? 0;
    if (f === "quiet") return stats.push_quiet ?? 0;
    if (f === "none") return stats.push_none;
    if (f === "opened") return stats.opened;
    return stats.target - stats.opened;
  };
  const filterLabel: Record<Filter, string> = {
    all: tx("admin_notifications_all"),
    ok: tx("admin_notifications_push_ok"),
    fail: tx("admin_notifications_push_failed"),
    optout: tx("admin_notifications_push_opt_out"),
    off: tx("admin_notifications_turned_off"),
    quiet: tx("admin_notifications_quiet_hours"),
    none: tx("admin_notifications_no_push"),
    opened: tx("admin_notifications_opened"),
    unread: tx("admin_notifications_unread"),
  };
  const sentAt = data?.occurrence?.completed_at ?? data?.occurrence?.started_at ?? null;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={row.title}
      head={
        <>
          <span className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[12px] font-semibold text-sam-fg">
            {tx(SENT_KIND_LABEL[row.kind])}
          </span>
          <SentResultBadge status={row.status} sendMode={row.sendMode} stats={stats} channel={row.channel ?? null} ko={ko} />
        </>
      }
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={!canSend} onClick={() => onRepeat(row)}>
            {tx("admin_notifications_repeat")}
          </AdminActionButton>
          {stats && stats.push_fail > 0 ? (
            <AdminActionButton variant="secondary" size="sm" disabled={!canSend} onClick={() => onResend(row, "failed")}>
              {tx("admin_notifications_resend_to_failed_n", { push_fail: stats.push_fail })}
            </AdminActionButton>
          ) : null}
          {stats && stats.target - stats.opened > 0 ? (
            <AdminActionButton variant="secondary" size="sm" disabled={!canSend} onClick={() => onResend(row, "unread")}>
              {tx("admin_notifications_resend_to_unread_n", { v: stats.target - stats.opened })}
            </AdminActionButton>
          ) : null}
          <AdminActionButton variant="primary" size="sm" disabled={!canSend} onClick={() => onResend(row, "same")}>
            {tx("admin_notifications_resend_all")}
          </AdminActionButton>
        </>
      }
    >
      {stats ? <StatCards stats={stats} ko={ko} /> : null}
      <dl className="mb-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-sam-muted">{tx("admin_notifications_sent")}</dt>
        <dd>
          {sentAt ? formatAdminManilaDateTime(sentAt) : row.sentAtLabel}
          {data?.occurrence ? ` · ${tx("admin_notifications_sequence_number", { sequence_number: data.occurrence.sequence_number })}` : ""}
        </dd>
        <dt className="text-sam-muted">{tx("admin_notifications_audience")}</dt>
        <dd>{row.targetLabel}</dd>
        <dt className="text-sam-muted">{tx("admin_notifications_opens")}</dt>
        <dd>{row.destination}</dd>
        <dt className="text-sam-muted">{tx("admin_notifications_sound")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span>{soundLabel ?? "—"}</span>
          <AdminActionButton variant="secondary" size="sm" onClick={() => onSound(row.kind)}>
            {tx("admin_notifications_change_sound")}
          </AdminActionButton>
        </dd>
        <dt className="text-sam-muted">{tx("admin_notifications_preview")}</dt>
        <dd>
          <div className="flex max-w-md gap-2 rounded-lg border border-sam-border bg-sam-app px-3 py-2">
            <div className="h-7 w-7 flex-none rounded-md bg-sam-primary" />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.title}</div>
              {row.body ? <div className="truncate text-[12px] text-sam-muted">{row.body}</div> : null}
            </div>
          </div>
        </dd>
      </dl>
      {data && data.failure_summary.length > 0 ? (
        <div className="mb-3 rounded-ui-rect border border-dashed border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-fg">
          {tx("admin_notifications_push_failures")}:{" "}
          {data.failure_summary.map((f) => tx("admin_notifications_failure_reason_count", { reason: pushFailureLabel(f.response, ko), n: f.count })).join(" · ")}
        </div>
      ) : null}
      <div className="mb-2">
        <Seg
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={FILTERS.map((f) => {
            const n = filterCount(f);
            return { value: f, label: `${filterLabel[f]}${n != null ? ` ${formatAdminNumber(n)}` : ""}` };
          })}
        />
      </div>
      {loading && !data ? (
        <AdminLoadingState ko={ko} />
      ) : err ? (
        <AdminErrorState ko={ko} code={err} onRetry={() => setReloadTick((n) => n + 1)} />
      ) : data && data.rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={tx("admin_notifications_no_members")} />
      ) : data ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_member")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_inbox")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_devices")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_push")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_reason")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_opened")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const reason =
                  r.push === "fail"
                    ? countedLabels(r.failures.map((f) => pushFailureLabel(f, ko))) || tx("admin_notifications_failed_2")
                    : r.skip_reasons.map((s) => campaignSkipReasonLabel(s, ko)).join(" · ") || "—";
                return (
                  <tr key={r.user_id} className="border-b border-sam-border-soft">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/admin/users/${encodeURIComponent(r.user_id)}`} className="text-sam-fg hover:underline">
                        {r.name ?? tx("admin_notifications_no_name")}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.inbox === "saved"
                        ? `${tx("admin_notifications_saved")} ${r.inbox_at ? formatAdminManilaDateTime(r.inbox_at) : ""}`
                        : tx("admin_notifications_not_saved")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.devices}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.push === "ok" ? (
                        <span className="rounded-sm border border-sam-success/40 bg-sam-success-soft px-1.5 py-0.5 text-[12px] text-sam-success">
                          {tx("admin_notifications_ok_devices", { push_ok_devices: r.push_ok_devices })}
                          {r.push_fail_devices ? ` · ${tx("admin_notifications_failed_devices_inline", { n: r.push_fail_devices })}` : ""}
                        </span>
                      ) : r.push === "fail" ? (
                        <span className="rounded-sm border border-sam-danger/40 bg-sam-danger-soft px-1.5 py-0.5 text-[12px] text-sam-danger">
                          {tx("admin_notifications_failed_devices", { push_fail_devices: r.push_fail_devices })}
                        </span>
                      ) : (
                        <span className="rounded-sm border border-sam-border bg-sam-app px-1.5 py-0.5 text-[12px] text-sam-fg">
                          {r.push === "optout"
                            ? tx("admin_notifications_push_opt_out")
                            : r.push === "off"
                              ? tx("admin_notifications_turned_off")
                              : r.push === "quiet"
                                ? tx("admin_notifications_quiet_hours")
                                : tx("admin_notifications_no_push")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{reason}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.opened_at ? formatAdminManilaDateTime(r.opened_at) : tx("admin_notifications_unread")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && data.total > 0 ? (
        <AdminPagination
          ko={ko}
          page={page}
          size={size}
          total={data.total}
          disabled={loading}
          onPageChange={setPage}
          onSizeChange={(n) => {
            setSize(n);
            setPage(1);
          }}
        />
      ) : null}
    </Modal>
  );
}

function newKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 즉시 발송 — 알림 보내기와 같은 `/send` (만들기 → 보내기). */
/** 만든 알림을 바로 보내기 — 목록 「다시 보내기」·상세 「재발송」 공용 (최종 감사 D-1). */
export async function sendNow(
  id: string,
  occurrenceId: string | null,
  idempotencyKey: string,
  reason?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(id)}/send`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      ...(occurrenceId ? { occurrence_id: occurrenceId } : {}),
      ...(reason ? { reason } : {}),
    }),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok && j.ok !== false ? { ok: true } : { ok: false, error: j.error ?? "send_failed" };
}

function toIso(local: string): string | null {
  if (!local) return null;
  // datetime-local 은 PHT(UTC+8) 기준으로 입력받는다.
  const d = new Date(`${local}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 다시 보내기 창 */
export function ResendModal({
  target,
  ko,
  onClose,
  onDone,
}: {
  target: { row: SentRowLite; mode: "same" | "failed" | "unread" } | null;
  ko: boolean;
  onClose: () => void;
  onDone: (done: ModalDone) => void;
}) {
  const tx = useTx(ko);
  const [mode, setMode] = useState<"same" | "failed" | "unread">("same");
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 창을 열 때 1번 만드는 멱등 키 — 다시 눌러도 같은 알림을 만들고 같은 회차를 보낸다(재감사 2026-11-02 A7).
  const [baseKey, setBaseKey] = useState("");
  useEffect(() => {
    if (target) {
      setMode(target.mode);
      setWhen("now");
      setAt("");
      setErr(null);
      setBaseKey(newKey("resend"));
    }
  }, [target]);
  if (!target) return null;
  const { row } = target;
  const requestKey = `${baseKey}:${mode}:${when}:${when === "scheduled" ? at : ""}`;
  const s = row.stats;
  const count = (m: typeof mode) => (!s ? null : m === "same" ? s.target : m === "failed" ? s.push_fail : s.target - s.opened);
  const submit = async () => {
    const n = count(mode);
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: tx("admin_notifications_resend"),
      description: tx(when === "now" ? "admin_notifications_resend_confirm_now" : "admin_notifications_resend_confirm_scheduled", {
        title: row.title,
        audience: mode === "same" ? row.targetLabel : tx("admin_notifications_n_members", { n: n ?? "?" }),
      }),
      confirmLabel: tx("admin_notifications_resend"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(row.id)}/resend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          send_mode: when === "now" ? "immediate" : "scheduled",
          scheduled_at: when === "scheduled" ? toIso(at) : null,
          idempotency_key: requestKey,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr(campaignCreateErrorMessage(j.error ?? null, ko ? "ko" : "en"));
        return;
      }
      if (when === "now") {
        const sent = await sendNow(j.id, j.occurrence_id ?? null, `send:${requestKey}`);
        if (!sent.ok) {
          setErr(
            `${campaignCreateErrorMessage(sent.error ?? null, ko ? "ko" : "en")} ${tx("admin_notifications_copy_in_drafts_press_resend_again")}`
          );
          return;
        }
      }
      onDone({
        message: when === "now" ? tx("admin_notifications_resent_2") : tx("admin_notifications_scheduled"),
        id: typeof j.id === "string" ? j.id : null,
        tab: when === "now" ? "completed" : "in_progress",
      });
    } catch {
      setErr(tx("admin_notifications_network_error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={tx("admin_notifications_resend")}
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {tx("admin_notifications_cancel")}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            size="sm"
            disabled={busy || (when === "scheduled" && !toIso(at)) || (count(mode) === 0)}
            onClick={() => void submit()}
          >
            {busy ? tx("admin_notifications_sending") : tx("admin_notifications_resend")}
          </AdminActionButton>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-sam-muted">
        {tx(SENT_KIND_LABEL[row.kind])} · {row.title}
      </p>
      <div className="mb-3">
        <div className="mb-1 text-[12px] text-sam-muted">{tx("admin_notifications_recipients_2")}</div>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: "same", label: tx("admin_notifications_same_audience", { targetLabel: row.targetLabel }) },
            { value: "failed", label: tx("admin_notifications_resend_push_failed_n", { n: count("failed") ?? 0 }), disabled: !count("failed") },
            { value: "unread", label: tx("admin_notifications_resend_unread_n", { n: count("unread") ?? 0 }), disabled: !count("unread") },
          ]}
        />
      </div>
      <div className="mb-3">
        <div className="mb-1 text-[12px] text-sam-muted">{tx("admin_notifications_when")}</div>
        <Seg
          value={when}
          onChange={setWhen}
          options={[
            { value: "now", label: tx("admin_notifications_now") },
            { value: "scheduled", label: tx("admin_notifications_schedule") },
          ]}
        />
        {when === "scheduled" ? (
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="rounded-ui-rect border border-sam-border px-2 py-1"
            />
            PHT
          </label>
        ) : null}
      </div>
      <p className="text-[12px] text-sam-muted">
        {tx("admin_notifications_same_content_destination_and_sound_appears")}
      </p>
      {err ? <p className="mt-2 text-[13px] text-sam-danger" role="alert">{err}</p> : null}
    </Modal>
  );
}

const WEEKDAYS: Array<[number, MessageKey]> = [
  [1, "admin_notifications_weekday_mon"],
  [2, "admin_notifications_weekday_tue"],
  [3, "admin_notifications_weekday_wed"],
  [4, "admin_notifications_weekday_thu"],
  [5, "admin_notifications_weekday_fri"],
  [6, "admin_notifications_weekday_sat"],
  [0, "admin_notifications_weekday_sun"],
];

/** 다음 발송 시각 미리보기 — 서버(`/recurrence-preview`)가 반복 발송(cron)과 같은 계산으로 답한다(PHT). */
function useNextRecurrencePreview(input: {
  enabled: boolean;
  kind: "daily" | "weekly" | "monthly";
  time: string;
  weekday: number;
  start: string;
  end: string;
}): { next: string | null; loading: boolean } {
  const [state, setState] = useState<{ next: string | null; loading: boolean }>({ next: null, loading: true });
  const { enabled, kind, time, weekday, start, end } = input;
  useEffect(() => {
    if (!enabled) return;
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setState({ next: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const timer = window.setTimeout(() => {
      const sp = new URLSearchParams({ recurrence_kind: kind, recurrence_time: time });
      if (kind === "weekly") sp.set("recurrence_weekday", String(weekday));
      const startIso = start ? toIso(`${start}T00:00`) : null;
      const endIso = end ? toIso(`${end}T23:59`) : null;
      if (startIso) sp.set("recurrence_start_at", startIso);
      if (endIso) sp.set("recurrence_end_at", endIso);
      void fetch(`/api/admin/notification-campaigns/recurrence-preview?${sp}`, { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; next?: string | null }) => {
          if (!cancelled) setState({ next: j.ok ? j.next ?? null : null, loading: false });
        })
        .catch(() => {
          if (!cancelled) setState({ next: null, loading: false });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, kind, time, weekday, start, end]);
  return state;
}

/** 저장된 ISO → date 칸 값(PHT 날짜). */
function manilaDateInput(iso: string | null): string {
  return adminIsoToManilaInput(iso).slice(0, 10);
}

/**
 * 반복 설정 창 (시안 v3).
 * - 보낸 알림: 원본을 복사해 새 반복 알림을 만든다(다시 보내기와 같은 경로 · 발송 중·예약 탭에 생김).
 * - 진행 중·일시정지 반복: 그 반복의 주기·요일·시각·기간을 바꾼다(`/recurrence` — 일시정지 → 수정 → 재개).
 */
export function RepeatModal({
  row,
  ko,
  onClose,
  onDone,
}: {
  row: SentRowLite | null;
  ko: boolean;
  onClose: () => void;
  onDone: (done: ModalDone) => void;
}) {
  const tx = useTx(ko);
  const [kind, setKind] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("10:00");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [baseKey, setBaseKey] = useState("");
  useEffect(() => {
    setErr(null);
    if (!row) return;
    setBaseKey(newKey("repeat"));
    const r = row.recurrence;
    setKind(r?.kind ?? "weekly");
    setWeekday(r?.weekday ?? 1);
    setTime(r?.time?.slice(0, 5) || "10:00");
    setStart(manilaDateInput(r?.startAt ?? null));
    setEnd(manilaDateInput(r?.endAt ?? null));
  }, [row]);
  const preview = useNextRecurrencePreview({ enabled: row != null, kind, time, weekday, start, end });
  if (!row) return null;
  const editing = row.recurrence != null;
  const next = preview.next;
  const submit = async () => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: editing ? tx("admin_notifications_save_repeat") : tx("admin_notifications_start_repeat"),
      description: editing
        ? tx("admin_notifications_change_repeat_title", { title: row.title })
        : tx("admin_notifications_repeat_confirm_start", { title: row.title, audience: row.targetLabel }),
      confirmLabel: editing ? tx("admin_notifications_save") : tx("admin_notifications_start"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setErr(null);
    const schedule = {
      recurrence_kind: kind,
      recurrence_time: time,
      recurrence_weekday: kind === "weekly" ? weekday : null,
      recurrence_start_at: start ? toIso(`${start}T00:00`) : new Date().toISOString(),
      recurrence_end_at: end ? toIso(`${end}T23:59`) : null,
    };
    try {
      const res = await fetch(
        `/api/admin/notification-campaigns/${encodeURIComponent(row.id)}/${editing ? "recurrence" : "resend"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editing ? schedule : { mode: "same", send_mode: "recurring", ...schedule, idempotency_key: `${baseKey}:${kind}:${weekday}:${time}:${start}:${end}` }
          ),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr(campaignCreateErrorMessage(j.error ?? null, ko ? "ko" : "en"));
        return;
      }
      onDone({
        message: editing
          ? tx("admin_notifications_repeat_updated")
          : tx("admin_notifications_repeat_started"),
        id: typeof j.id === "string" ? j.id : row.id,
        tab: "in_progress",
      });
    } catch {
      setErr(tx("admin_notifications_network_error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={tx("admin_notifications_repeat")}
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {tx("admin_notifications_cancel")}
          </AdminActionButton>
          <AdminActionButton variant="primary" size="sm" disabled={busy || !/^\d{2}:\d{2}$/.test(time) || !next} onClick={() => void submit()}>
            {busy ? tx("admin_notifications_saving") : editing ? tx("admin_notifications_save") : tx("admin_notifications_start_repeat")}
          </AdminActionButton>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-sam-muted">
        {tx(SENT_KIND_LABEL[row.kind])} · {row.title} · {row.targetLabel}
      </p>
      <div className="mb-3">
        <div className="mb-1 text-[12px] text-sam-muted">{tx("admin_notifications_every")}</div>
        <Seg
          value={kind}
          onChange={setKind}
          options={[
            { value: "daily", label: tx("admin_notifications_repeat_daily") },
            { value: "weekly", label: tx("admin_notifications_repeat_weekly") },
            { value: "monthly", label: tx("admin_notifications_repeat_monthly") },
          ]}
        />
      </div>
      {kind === "weekly" ? (
        <div className="mb-3">
          <div className="mb-1 text-[12px] text-sam-muted">{tx("admin_notifications_day")}</div>
          <Seg
            value={String(weekday)}
            onChange={(v) => setWeekday(Number(v))}
            options={WEEKDAYS.map(([n, key]) => ({ value: String(n), label: tx(key) }))}
          />
        </div>
      ) : null}
      <label className="mb-3 block text-[13px]">
        <span className="mb-1 block text-[12px] text-sam-muted">{tx("admin_notifications_time_pht")}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-ui-rect border border-sam-border px-2 py-1" />
      </label>
      <div className="mb-1 text-[12px] text-sam-muted">{tx("admin_notifications_period")}</div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-ui-rect border border-sam-border px-2 py-1" />
        ~
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-ui-rect border border-sam-border px-2 py-1" />
        <span className="text-[12px] text-sam-muted">{tx("admin_notifications_blank_from_today_no_end")}</span>
      </div>
      <p className="mt-3 text-[13px] text-sam-fg" data-admin-notif-repeat-next>
        {preview.loading
          ? tx("admin_notifications_calculating_next_send")
          : next
          ? tx("admin_notifications_next_send_pht", { v: formatAdminManilaDateTime(next) })
          : tx("admin_notifications_no_send_date_in_period")}
      </p>
      {err ? <p className="mt-2 text-[13px] text-sam-danger" role="alert">{err}</p> : null}
    </Modal>
  );
}

type SoundAsset = { id: string; label: string; kind: string; file_url: string | null; file_path: string | null };
type SoundMapping = {
  event_key: string;
  asset_id: string;
  use_device_default: boolean;
  volume: number;
  repeat_count: number;
  cooldown_seconds?: number;
  enabled: boolean;
};
type SoundEvent = { event_key: string; default_asset_id: string; domain: string };

/** 알림음 창 — 그 분류의 알림음(알림음 설정 화면과 같은 값 · 같은 저장 경로). */
export function SoundModal({
  kind,
  ko,
  onClose,
  onDone,
}: {
  kind: SentKind | null;
  ko: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const tx = useTx(ko);
  const [assets, setAssets] = useState<SoundAsset[]>([]);
  const [event, setEvent] = useState<SoundEvent | null>(null);
  const [mapping, setMapping] = useState<SoundMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = kind ? soundEventKeyForKind(kind) : "";

  const load = useCallback(async () => {
    if (!key) return;
    setErr(null);
    // 네트워크 오류도 화면 오류로(재감사 2026-11-02 A9 — 처리 안 된 오류 방지).
    const res = await fetch("/api/admin/notification-sound-ssot", { credentials: "include", cache: "no-store" }).catch(
      () => null
    );
    if (!res) {
      setErr("network_error");
      return;
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "load_failed");
      return;
    }
    setAssets(j.assets ?? []);
    const ev = (j.events ?? []).find((e: SoundEvent) => e.event_key === key) ?? null;
    setEvent(ev);
    const m = (j.mappings ?? []).find((x: SoundMapping) => x.event_key === key) ?? null;
    setMapping(
      m ??
        (ev
          ? { event_key: key, asset_id: ev.default_asset_id, use_device_default: false, volume: 0.7, repeat_count: 1, enabled: true }
          : null)
    );
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!kind) return null;
  const asset = mapping ? assets.find((a) => a.id === mapping.asset_id) : undefined;
  const source: "device" | "dibay" | "custom" = mapping?.use_device_default ? "device" : asset?.kind === "dibay_custom" ? "custom" : "dibay";

  const upload = async (file: File) => {
    if (!event) return;
    if (file.size > SOUND_MAX_BYTES) {
      setErr(tx("admin_notifications_file_too_large"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", file.name.slice(0, 255));
      fd.append("domain", event.domain);
      const res = await fetch("/api/admin/notification-sound-ssot/upload", { method: "POST", credentials: "include", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok || !j.asset_id) {
        setErr(j.error ?? "upload_failed");
        return;
      }
      setAssets((prev) => [...prev, { id: j.asset_id, label: file.name, kind: "dibay_custom", file_url: j.file_url ?? null, file_path: null }]);
      setMapping((m) => (m ? { ...m, asset_id: j.asset_id, use_device_default: false } : m));
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!mapping) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-sound-ssot", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: [{ ...mapping, repeat_count: 1 }] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "save_failed");
        return;
      }
      onDone(tx("admin_notifications_sound_saved"));
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={tx("admin_notifications_sound_modal_title", { kind: tx(SENT_KIND_LABEL[kind]) })}
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {tx("admin_notifications_cancel")}
          </AdminActionButton>
          <AdminActionButton variant="primary" size="sm" disabled={busy || !mapping} onClick={() => void save()}>
            {tx("admin_notifications_save")}
          </AdminActionButton>
        </>
      }
    >
      {!mapping ? (
        err ? <AdminErrorState ko={ko} code={err} onRetry={() => void load()} /> : <AdminLoadingState ko={ko} />
      ) : (
        <div className="space-y-3 text-[13px]">
          <div>
            <div className="mb-1 text-[12px] text-sam-muted">{tx("admin_notifications_source")}</div>
            <Seg
              value={source}
              onChange={(v) =>
                setMapping((m) =>
                  !m || !event
                    ? m
                    : v === "device"
                      ? { ...m, use_device_default: true }
                      : v === "dibay"
                        ? { ...m, use_device_default: false, asset_id: event.default_asset_id }
                        : { ...m, use_device_default: false }
                )
              }
              options={[
                { value: "device", label: tx("admin_notifications_device_default") },
                { value: "dibay", label: tx("admin_notifications_dibay_sound") },
                { value: "custom", label: tx("admin_notifications_uploaded_file") },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{displayNotificationSoundAssetLabel(asset, tx("admin_notifications_default"))}</span>
            <AdminNotificationSoundPreview soundUrl={asset?.file_url ?? asset?.file_path ?? null} volume={mapping.volume} />
            <label className="cursor-pointer rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]">
              {tx("admin_notifications_replace_file")}
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[12px] text-sam-muted">{tx("admin_notifications_volume")}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(mapping.volume * 100)}
              onChange={(e) => setMapping((m) => (m ? { ...m, volume: Number(e.target.value) / 100 } : m))}
              className="max-w-[260px] flex-1"
            />
            <span className="w-10 tabular-nums">{Math.round(mapping.volume * 100)}%</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapping.enabled !== false}
              onChange={(e) => setMapping((m) => (m ? { ...m, enabled: e.target.checked } : m))}
            />
            {tx("admin_notifications_sound_on")}
          </label>
          <p className="text-[12px] text-sam-muted">
            {tx("admin_notifications_sound_applies_to_kind", { kind: tx(SENT_KIND_LABEL[kind]) })}
          </p>
          {err ? <p className="text-sam-danger" role="alert">{err}</p> : null}
        </div>
      )}
    </Modal>
  );
}

type ReleaseGroup = {
  platform: string;
  version_name: string;
  version_code: number | null;
  released_at: string | null;
  release_source: string | null;
  notified: number;
  read: number;
  first_at: string | null;
  last_at: string | null;
};

type ReleaseRecipient = {
  user_id: string;
  name: string | null;
  notified_at: string;
  read_at: string | null;
  installed_version: string | null;
  installed_seen_at: string | null;
};

function releaseSourceLabel(src: string | null, ko: boolean): string {
  if (src === "play_api") return translateBy(ko ? "ko" : "en", "admin_notifications_google_play");
  if (src === "itunes_lookup") return translateBy(ko ? "ko" : "en", "admin_notifications_app_store");
  if (src === "device_seen") return translateBy(ko ? "ko" : "en", "admin_notifications_first_seen_on_device");
  return "—";
}

/** 업데이트 내역 탭 — 자동 「업데이트 안내」를 버전별로. 다시 보내기·반복 없음(자동). */
export function AppReleaseNoticesPanel({ ko, onCount }: { ko: boolean; onCount?: (n: number) => void }) {
  const tx = useTx(ko);
  const [groups, setGroups] = useState<ReleaseGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<ReleaseGroup | null>(null);
  const [recipients, setRecipients] = useState<ReleaseRecipient[] | null>(null);
  const [recipientsErr, setRecipientsErr] = useState<string | null>(null);
  const [recipientsTick, setRecipientsTick] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/admin/notification-campaigns/app-release-notices", { credentials: "include", cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "load_failed");
      return;
    }
    setGroups(j.releases ?? []);
    onCount?.((j.releases ?? []).length);
  }, [onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRecipients(null);
    setRecipientsErr(null);
    const sp = new URLSearchParams({ platform: open.platform, ...(open.version_code != null ? { version_code: String(open.version_code) } : {}) });
    // 불러오기 실패를 「받은 회원 없음」으로 보이지 않는다(재감사 2026-11-02 A5).
    void fetch(`/api/admin/notification-campaigns/app-release-notices?${sp}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !j.ok) setRecipientsErr(j.error ?? "load_failed");
        else setRecipients(j.recipients ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecipientsErr("network_error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, recipientsTick]);

  if (err) return <AdminErrorState ko={ko} code={err} onRetry={() => void load()} />;
  if (!groups) return <AdminLoadingState ko={ko} />;
  const name = (g: ReleaseGroup) =>
    `DIBAY ${g.version_name}${g.version_code != null && g.platform === "android" ? ` (${g.version_code})` : g.version_code != null ? ` (${g.version_code})` : ""} · ${g.platform === "ios" ? "iOS" : "Android"}`;
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-sam-muted">
        {tx("admin_notifications_sent_automatically_once_members_whose_app")}
      </p>
      {groups.length === 0 ? (
        <AdminEmptyState ko={ko} message={tx("admin_notifications_no_releases")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_version")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_released")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_first_notice")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_last_notice")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_notified")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_read")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_push_2")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.platform}-${g.version_name}-${g.version_code}`} className="border-b border-sam-border-soft align-top">
                  <td className="whitespace-nowrap px-3 py-3 font-medium">{name(g)}</td>
                  <td className="px-3 py-3 text-[13px]">
                    {g.released_at ? formatAdminManilaDateTime(g.released_at) : "—"}
                    <div className="text-[12px] text-sam-muted">{releaseSourceLabel(g.release_source, ko)}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[13px]">{g.first_at ? formatAdminManilaDateTime(g.first_at) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[13px]">{g.last_at ? formatAdminManilaDateTime(g.last_at) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatAdminNumber(g.notified)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatAdminNumber(g.read)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[13px] text-sam-muted">{tx("admin_notifications_none_auto")}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <AdminActionButton variant="secondary" size="sm" onClick={() => setOpen(g)}>
                      {tx("admin_notifications_recipients")}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? (
        <Modal open wide onClose={() => setOpen(null)} title={name(open)}>
          <dl className="mb-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-sam-muted">{tx("admin_notifications_released")}</dt>
            <dd>
              {open.released_at ? formatAdminManilaDateTime(open.released_at) : "—"} · {releaseSourceLabel(open.release_source, ko)}
            </dd>
            <dt className="text-sam-muted">{tx("admin_notifications_notified")}</dt>
            <dd>{formatAdminNumber(open.notified)} · {tx("admin_notifications_read_2")} {formatAdminNumber(open.read)}</dd>
            <dt className="text-sam-muted">{tx("admin_notifications_opens")}</dt>
            <dd>{tx("admin_notifications_my_update_history")}</dd>
          </dl>
          {open.platform === "ios" && open.notified === 0 ? (
            <p className="mb-3 rounded-ui-rect border border-dashed border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px]">
              {tx("admin_notifications_ios_has_no_in_app_update")}
            </p>
          ) : null}
          {recipientsErr ? (
            <AdminErrorState ko={ko} code={recipientsErr} onRetry={() => setRecipientsTick((n) => n + 1)} />
          ) : !recipients ? (
            <AdminLoadingState ko={ko} />
          ) : recipients.length === 0 ? (
            <AdminEmptyState ko={ko} message={tx("admin_notifications_no_members_2")} />
          ) : (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
                  <tr>
                    <th className="px-3 py-2">{tx("admin_notifications_member")}</th>
                    <th className="px-3 py-2">{tx("admin_notifications_notified_2")}</th>
                    <th className="px-3 py-2">{tx("admin_notifications_read_3")}</th>
                    <th className="px-3 py-2">{tx("admin_notifications_installed_now")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.user_id} className="border-b border-sam-border-soft">
                      <td className="px-3 py-2">
                        <Link href={`/admin/users/${encodeURIComponent(r.user_id)}`} className="hover:underline">
                          {r.name ?? tx("admin_notifications_no_name")}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{formatAdminManilaDateTime(r.notified_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.read_at ? formatAdminManilaDateTime(r.read_at) : tx("admin_notifications_unread")}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.installed_version ?? "—"}
                        {r.installed_seen_at ? (
                          <span className="ml-1 text-[12px] text-sam-muted">({tx("admin_notifications_seen")} {formatAdminManilaDateTime(r.installed_seen_at)})</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

type OwnerNoticeRow = {
  kind: string;
  label_ko: string;
  label_en: string;
  total: number;
  owners: number;
  stores: number;
  read: number;
  unread: number;
  push_sent: number;
  push_failed: number;
  push_skipped: number;
  last_at: string | null;
};

/**
 * 「매장 알림」 탭 (재감사 2026-11-02 S3 · 읽기 전용) — 사장님에게 간 알림(주문·운영·광고·문의 답변)의 종류별 결과.
 * 자동 알림이라 다시 보내기·반복은 없다. 알림음은 「알림음 설정」의 사장님 구역에서 바꾼다.
 */
export function OwnerNoticesPanel({ ko }: { ko: boolean }) {
  const tx = useTx(ko);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [rows, setRows] = useState<OwnerNoticeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setErr(null);
    void fetch(`/api/admin/notification-campaigns/owner-notices?days=${days}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !j.ok) setErr(j.error ?? "load_failed");
        else setRows(j.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setErr("network_error");
      });
    return () => {
      cancelled = true;
    };
  }, [days, tick]);
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-sam-muted">
        {tx("admin_notifications_automatic_owner_notifications_orders_operations_ads")}
      </p>
      <Seg
        value={String(days) as "7" | "30" | "90"}
        onChange={(v) => setDays(Number(v) as 7 | 30 | 90)}
        options={[
          { value: "7", label: tx("admin_notifications_7_days") },
          { value: "30", label: tx("admin_notifications_30_days") },
          { value: "90", label: tx("admin_notifications_90_days") },
        ]}
      />
      {err ? (
        <AdminErrorState ko={ko} code={err} onRetry={() => setTick((n) => n + 1)} />
      ) : !rows ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={tx("admin_notifications_no_owner_notifications_in_period")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_kind")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_sent_2")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_owners")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_stores")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_read")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_unread")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_push_ok_devices")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_push_failed_2")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("admin_notifications_push_skipped")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("admin_notifications_last")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kind} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2">
                    <span className="font-medium text-sam-fg">{ko ? r.label_ko : r.label_en}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.total)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.owners)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.stores)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.read)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.unread)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-sam-success">{formatAdminNumber(r.push_sent)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.push_failed ? "text-sam-danger" : ""}`}>
                    {formatAdminNumber(r.push_failed)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.push_skipped)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-[13px] text-sam-muted">{r.last_at ? formatAdminManilaDateTime(r.last_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
