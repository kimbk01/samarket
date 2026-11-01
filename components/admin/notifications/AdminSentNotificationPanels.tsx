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

export type SentKind = "notice" | "system" | "event" | "marketing";

export const SENT_KIND_LABEL: Record<SentKind | "update", [string, string]> = {
  notice: ["공지사항", "Notice"],
  system: ["시스템 안내", "System"],
  event: ["이벤트", "Event"],
  marketing: ["마케팅", "Marketing"],
  update: ["업데이트 내역", "Updates"],
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
  /** 진행 중·일시정지 반복이면 지금 주기 — 「반복 설정」이 이 반복을 바꾼다(새 반복을 만들지 않음). */
  recurrence: SentRecurrence | null;
};

export type ModalDone = { message: string; id?: string | null; tab?: "completed" | "in_progress" };

/** 「결과」 열·받은 사람 머리 (시안 v3) — 같은 판정(campaignResultBadge). */
export function SentResultBadge({
  status,
  sendMode,
  stats,
  ko,
}: {
  status: string;
  sendMode: string | null;
  stats: MemberStats | null;
  ko: boolean;
}) {
  const b = campaignResultBadge({ status, sendMode, stats });
  const tone: Record<Exclude<typeof b, "status">, [string, string, string]> = {
    pending: ["발송 중 — 결과 집계 중", "Sending — collecting results", "border-sam-info text-sam-info bg-sam-info-soft"],
    repeating: ["반복 진행 중", "Repeating", "border-sam-info text-sam-info bg-sam-info-soft"],
    fail: ["실패 있음", "Has failures", "border-sam-danger text-sam-danger bg-sam-danger-soft"],
    none: ["푸시 없음 있음", "Some without push", "border-sam-border text-sam-fg bg-sam-app"],
    ok: ["전부 성공", "All delivered", "border-sam-success text-sam-success bg-sam-success-soft"],
  };
  if (b === "status") {
    return (
      <span className="inline-block rounded-sm border border-sam-border bg-sam-app px-1.5 py-0.5 text-[12px] text-sam-muted">
        {campaignStatusLabel(status, ko ? "ko" : "en")}
      </span>
    );
  }
  const [k, e, cls] = tone[b];
  return <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[12px] ${cls}`}>{ko ? k : e}</span>;
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
          setLabel(ko ? "기기 기본음" : "Device default");
          return;
        }
        const assetId = m?.asset_id ?? ev?.default_asset_id ?? null;
        const asset = (j.assets ?? []).find((a) => a.id === assetId);
        setLabel(displayNotificationSoundAssetLabel(asset, ko ? "기본 알림음" : "Default"));
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
  return (k: string, e: string) => (ko ? k : e);
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
    [tx("대상", "Target"), stats.target, ""],
    [tx("알림함 저장", "Inbox"), stats.inbox, ""],
    [tx("푸시 성공", "Push OK"), stats.push_ok, "text-sam-success"],
    [tx("푸시 실패", "Push failed"), stats.push_fail, stats.push_fail ? "text-sam-danger" : ""],
    [tx("푸시 없음", "No push"), stats.push_none, ""],
    [tx("열람", "Opened"), stats.opened, ""],
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
  push: "ok" | "fail" | "none";
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

const FILTERS = ["all", "ok", "fail", "none", "opened", "unread"] as const;
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
    if (f === "none") return stats.push_none;
    if (f === "opened") return stats.opened;
    return stats.target - stats.opened;
  };
  const filterLabel: Record<Filter, string> = {
    all: tx("전체", "All"),
    ok: tx("푸시 성공", "Push OK"),
    fail: tx("푸시 실패", "Push failed"),
    none: tx("푸시 없음", "No push"),
    opened: tx("열람", "Opened"),
    unread: tx("안 읽음", "Unread"),
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
            {ko ? SENT_KIND_LABEL[row.kind][0] : SENT_KIND_LABEL[row.kind][1]}
          </span>
          <SentResultBadge status={row.status} sendMode={row.sendMode} stats={stats} ko={ko} />
        </>
      }
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={!canSend} onClick={() => onRepeat(row)}>
            {tx("반복 설정", "Repeat")}
          </AdminActionButton>
          {stats && stats.push_fail > 0 ? (
            <AdminActionButton variant="secondary" size="sm" disabled={!canSend} onClick={() => onResend(row, "failed")}>
              {tx(`실패한 ${stats.push_fail}명에게 다시`, `Resend to ${stats.push_fail} failed`)}
            </AdminActionButton>
          ) : null}
          {stats && stats.target - stats.opened > 0 ? (
            <AdminActionButton variant="secondary" size="sm" disabled={!canSend} onClick={() => onResend(row, "unread")}>
              {tx(`안 읽은 ${stats.target - stats.opened}명에게 다시`, `Resend to ${stats.target - stats.opened} unread`)}
            </AdminActionButton>
          ) : null}
          <AdminActionButton variant="primary" size="sm" disabled={!canSend} onClick={() => onResend(row, "same")}>
            {tx("전체 다시 보내기", "Resend to all")}
          </AdminActionButton>
        </>
      }
    >
      {stats ? <StatCards stats={stats} ko={ko} /> : null}
      <dl className="mb-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-sam-muted">{tx("보낸 시각", "Sent")}</dt>
        <dd>
          {sentAt ? formatAdminManilaDateTime(sentAt) : row.sentAtLabel}
          {data?.occurrence ? ` · ${tx(`${data.occurrence.sequence_number}회차`, `#${data.occurrence.sequence_number}`)}` : ""}
        </dd>
        <dt className="text-sam-muted">{tx("받는 사람", "Audience")}</dt>
        <dd>{row.targetLabel}</dd>
        <dt className="text-sam-muted">{tx("누르면 열리는 화면", "Opens")}</dt>
        <dd>{row.destination}</dd>
        <dt className="text-sam-muted">{tx("알림음", "Sound")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span>{soundLabel ?? "—"}</span>
          <AdminActionButton variant="secondary" size="sm" onClick={() => onSound(row.kind)}>
            {tx("알림음 변경", "Change sound")}
          </AdminActionButton>
        </dd>
        <dt className="text-sam-muted">{tx("회원에게 보이는 모습", "Preview")}</dt>
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
          {tx("푸시 실패 사유", "Push failures")}:{" "}
          {data.failure_summary.map((f) => `${pushFailureLabel(f.response, ko)} ${f.count}${tx("건", "")}`).join(" · ")}
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
        <AdminEmptyState ko={ko} message={tx("해당 회원이 없습니다.", "No members.")} />
      ) : data ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tx("회원", "Member")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("알림함", "Inbox")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("기기", "Devices")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("푸시 결과", "Push")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("사유", "Reason")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("열람", "Opened")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const reason =
                  r.push === "fail"
                    ? countedLabels(r.failures.map((f) => pushFailureLabel(f, ko))) || tx("발송 실패", "Failed")
                    : r.skip_reasons.map((s) => campaignSkipReasonLabel(s, ko)).join(" · ") || "—";
                return (
                  <tr key={r.user_id} className="border-b border-sam-border-soft">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/admin/users/${encodeURIComponent(r.user_id)}`} className="text-sam-fg hover:underline">
                        {r.name ?? tx("(이름 없음)", "(no name)")}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.inbox === "saved"
                        ? `${tx("저장", "Saved")} ${r.inbox_at ? formatAdminManilaDateTime(r.inbox_at) : ""}`
                        : tx("저장 안 됨", "Not saved")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.devices}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.push === "ok" ? (
                        <span className="rounded-sm border border-sam-success/40 bg-sam-success-soft px-1.5 py-0.5 text-[12px] text-sam-success">
                          {tx(`성공 ${r.push_ok_devices}`, `OK ${r.push_ok_devices}`)}
                          {r.push_fail_devices ? tx(` · 실패 ${r.push_fail_devices}`, ` · failed ${r.push_fail_devices}`) : ""}
                        </span>
                      ) : r.push === "fail" ? (
                        <span className="rounded-sm border border-sam-danger/40 bg-sam-danger-soft px-1.5 py-0.5 text-[12px] text-sam-danger">
                          {tx(`실패 ${r.push_fail_devices}`, `Failed ${r.push_fail_devices}`)}
                        </span>
                      ) : (
                        <span className="rounded-sm border border-sam-border bg-sam-app px-1.5 py-0.5 text-[12px] text-sam-fg">
                          {tx("푸시 없음", "No push")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{reason}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.opened_at ? formatAdminManilaDateTime(r.opened_at) : tx("안 읽음", "Unread")}
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
async function sendNow(
  id: string,
  occurrenceId: string | null,
  idempotencyKey: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(id)}/send`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idempotency_key: idempotencyKey, ...(occurrenceId ? { occurrence_id: occurrenceId } : {}) }),
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
      title: tx("다시 보내기", "Resend"),
      description: tx(
        `「${row.title}」을 ${mode === "same" ? row.targetLabel : `${n ?? "?"}명`}에게 ${when === "now" ? "지금" : "예약해"} 보냅니다.`,
        `Send "${row.title}" to ${mode === "same" ? row.targetLabel : `${n ?? "?"} members`}.`
      ),
      confirmLabel: tx("다시 보내기", "Resend"),
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
            `${campaignCreateErrorMessage(sent.error ?? null, ko ? "ko" : "en")} ${tx(
              "만든 알림은 「초안」에 있습니다. 「다시 보내기」를 다시 누르면 같은 알림을 보냅니다.",
              "The copy is in Drafts. Press Resend again to send the same copy."
            )}`
          );
          return;
        }
      }
      onDone({
        message: when === "now" ? tx("다시 보냈습니다 — 결과는 받은 사람에서 확인", "Resent") : tx("예약했습니다", "Scheduled"),
        id: typeof j.id === "string" ? j.id : null,
        tab: when === "now" ? "completed" : "in_progress",
      });
    } catch {
      setErr(tx("네트워크 오류", "Network error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={tx("다시 보내기", "Resend")}
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {tx("취소", "Cancel")}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            size="sm"
            disabled={busy || (when === "scheduled" && !toIso(at)) || (count(mode) === 0)}
            onClick={() => void submit()}
          >
            {busy ? tx("보내는 중…", "Sending…") : tx("다시 보내기", "Resend")}
          </AdminActionButton>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-sam-muted">
        {ko ? SENT_KIND_LABEL[row.kind][0] : SENT_KIND_LABEL[row.kind][1]} · {row.title}
      </p>
      <div className="mb-3">
        <div className="mb-1 text-[12px] text-sam-muted">{tx("받는 사람", "Recipients")}</div>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: "same", label: tx(`처음과 같은 대상 (${row.targetLabel})`, `Same audience (${row.targetLabel})`) },
            { value: "failed", label: tx(`푸시 실패한 사람 (${count("failed") ?? 0}명)`, `Push failed (${count("failed") ?? 0})`), disabled: !count("failed") },
            { value: "unread", label: tx(`안 읽은 사람 (${count("unread") ?? 0}명)`, `Unread (${count("unread") ?? 0})`), disabled: !count("unread") },
          ]}
        />
      </div>
      <div className="mb-3">
        <div className="mb-1 text-[12px] text-sam-muted">{tx("시점", "When")}</div>
        <Seg
          value={when}
          onChange={setWhen}
          options={[
            { value: "now", label: tx("지금", "Now") },
            { value: "scheduled", label: tx("예약", "Schedule") },
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
        {tx(
          "내용·누르면 열리는 화면·알림음은 처음과 같습니다. 목록에 새 줄로 남고, 결과는 그 줄의 받은 사람에서 봅니다.",
          "Same content, destination and sound. Appears as a new row."
        )}
      </p>
      {err ? <p className="mt-2 text-[13px] text-sam-danger" role="alert">{err}</p> : null}
    </Modal>
  );
}

const WEEKDAYS: Array<[number, string, string]> = [
  [1, "월", "Mon"],
  [2, "화", "Tue"],
  [3, "수", "Wed"],
  [4, "목", "Thu"],
  [5, "금", "Fri"],
  [6, "토", "Sat"],
  [0, "일", "Sun"],
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
      title: editing ? tx("반복 설정 저장", "Save repeat") : tx("반복 시작", "Start repeat"),
      description: editing
        ? tx(`「${row.title}」 반복을 새 주기로 바꿉니다.`, `Change the repeat of "${row.title}".`)
        : tx(`「${row.title}」을 ${row.targetLabel}에게 반복해서 보냅니다.`, `Repeat "${row.title}".`),
      confirmLabel: editing ? tx("저장", "Save") : tx("반복 시작", "Start"),
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
          ? tx("반복 설정을 바꿨습니다", "Repeat updated")
          : tx("반복을 시작했습니다 — 발송 중·예약에 있습니다", "Repeat started"),
        id: typeof j.id === "string" ? j.id : row.id,
        tab: "in_progress",
      });
    } catch {
      setErr(tx("네트워크 오류", "Network error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={tx("반복 설정", "Repeat")}
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {tx("취소", "Cancel")}
          </AdminActionButton>
          <AdminActionButton variant="primary" size="sm" disabled={busy || !/^\d{2}:\d{2}$/.test(time) || !next} onClick={() => void submit()}>
            {busy ? tx("저장 중…", "Saving…") : editing ? tx("저장", "Save") : tx("반복 시작", "Start repeat")}
          </AdminActionButton>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-sam-muted">
        {ko ? SENT_KIND_LABEL[row.kind][0] : SENT_KIND_LABEL[row.kind][1]} · {row.title} · {row.targetLabel}
      </p>
      <div className="mb-3">
        <div className="mb-1 text-[12px] text-sam-muted">{tx("주기", "Every")}</div>
        <Seg
          value={kind}
          onChange={setKind}
          options={[
            { value: "daily", label: tx("매일", "Daily") },
            { value: "weekly", label: tx("매주", "Weekly") },
            { value: "monthly", label: tx("매월", "Monthly") },
          ]}
        />
      </div>
      {kind === "weekly" ? (
        <div className="mb-3">
          <div className="mb-1 text-[12px] text-sam-muted">{tx("요일", "Day")}</div>
          <Seg
            value={String(weekday)}
            onChange={(v) => setWeekday(Number(v))}
            options={WEEKDAYS.map(([n, k, e]) => ({ value: String(n), label: ko ? k : e }))}
          />
        </div>
      ) : null}
      <label className="mb-3 block text-[13px]">
        <span className="mb-1 block text-[12px] text-sam-muted">{tx("시각 (PHT)", "Time (PHT)")}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-ui-rect border border-sam-border px-2 py-1" />
      </label>
      <div className="mb-1 text-[12px] text-sam-muted">{tx("기간", "Period")}</div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-ui-rect border border-sam-border px-2 py-1" />
        ~
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-ui-rect border border-sam-border px-2 py-1" />
        <span className="text-[12px] text-sam-muted">{tx("(비우면 오늘부터 · 끝 없음)", "(blank = from today · no end)")}</span>
      </div>
      <p className="mt-3 text-[13px] text-sam-fg" data-admin-notif-repeat-next>
        {preview.loading
          ? tx("다음 발송 시각 계산 중…", "Calculating next send…")
          : next
          ? tx(
              `다음 발송 ${formatAdminManilaDateTime(next)} PHT. 「발송 중·예약」에서 멈춤·끝내기.`,
              `Next send ${formatAdminManilaDateTime(next)} PHT. Pause or end it in Sending · Scheduled.`
            )
          : tx("이 기간에는 보낼 날이 없습니다. 기간·요일을 확인하세요.", "No send date in this period.")}
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
      setErr(tx("파일이 너무 큽니다.", "File too large."));
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
      onDone(tx("알림음을 저장했습니다", "Sound saved"));
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
      title={tx(`알림음 — ${SENT_KIND_LABEL[kind][0]}`, `Sound — ${SENT_KIND_LABEL[kind][1]}`)}
      footer={
        <>
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {tx("취소", "Cancel")}
          </AdminActionButton>
          <AdminActionButton variant="primary" size="sm" disabled={busy || !mapping} onClick={() => void save()}>
            {tx("저장", "Save")}
          </AdminActionButton>
        </>
      }
    >
      {!mapping ? (
        err ? <AdminErrorState ko={ko} code={err} onRetry={() => void load()} /> : <AdminLoadingState ko={ko} />
      ) : (
        <div className="space-y-3 text-[13px]">
          <div>
            <div className="mb-1 text-[12px] text-sam-muted">{tx("소리", "Source")}</div>
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
                { value: "device", label: tx("기기 기본음", "Device default") },
                { value: "dibay", label: tx("DIBAY 알림음", "DIBAY sound") },
                { value: "custom", label: tx("업로드한 파일", "Uploaded file") },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{displayNotificationSoundAssetLabel(asset, tx("기본 알림음", "Default"))}</span>
            <AdminNotificationSoundPreview soundUrl={asset?.file_url ?? asset?.file_path ?? null} volume={mapping.volume} />
            <label className="cursor-pointer rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]">
              {tx("파일 바꾸기", "Replace file")}
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
            <span className="text-[12px] text-sam-muted">{tx("볼륨", "Volume")}</span>
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
            {tx("소리 켜기", "Sound on")}
          </label>
          <p className="text-[12px] text-sam-muted">
            {tx(
              `${SENT_KIND_LABEL[kind][0]} 분류의 이후 모든 알림에 적용 · 「알림음 설정」 화면과 같은 값입니다.`,
              "Applies to later notifications of this kind; same value as Notification sounds."
            )}
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
  if (src === "play_api") return ko ? "Google Play 출시 기록" : "Google Play";
  if (src === "itunes_lookup") return ko ? "App Store 출시일" : "App Store";
  if (src === "device_seen") return ko ? "처음 확인(기기 보고) — 스토어 출시일 아님" : "First seen on device";
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
        {tx(
          "자동 발송 — 앱이 새 버전을 알려 준 회원에게 1번 보냅니다(푸시·소리 없음). 다시 보내기·반복은 없습니다.",
          "Sent automatically once to members whose app reported a new version (no push or sound)."
        )}
      </p>
      {groups.length === 0 ? (
        <AdminEmptyState ko={ko} message={tx("업데이트 기록이 없습니다.", "No releases.")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tx("버전", "Version")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("출시 기록 시각", "Released")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("첫 안내", "First notice")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("마지막 안내", "Last notice")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("안내 받은 회원", "Notified")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("읽음", "Read")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("푸시", "Push")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("작업", "Actions")}</th>
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
                  <td className="whitespace-nowrap px-3 py-3 text-[13px] text-sam-muted">{tx("없음(자동 안내)", "None (auto)")}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <AdminActionButton variant="secondary" size="sm" onClick={() => setOpen(g)}>
                      {tx("받은 사람", "Recipients")}
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
            <dt className="text-sam-muted">{tx("출시 기록 시각", "Released")}</dt>
            <dd>
              {open.released_at ? formatAdminManilaDateTime(open.released_at) : "—"} · {releaseSourceLabel(open.release_source, ko)}
            </dd>
            <dt className="text-sam-muted">{tx("안내 받은 회원", "Notified")}</dt>
            <dd>{formatAdminNumber(open.notified)} · {tx("읽음", "read")} {formatAdminNumber(open.read)}</dd>
            <dt className="text-sam-muted">{tx("누르면 열리는 화면", "Opens")}</dt>
            <dd>{tx("내 정보 › 업데이트 내역 (그 버전 강조)", "My › Update history")}</dd>
          </dl>
          {open.platform === "ios" && open.notified === 0 ? (
            <p className="mb-3 rounded-ui-rect border border-dashed border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px]">
              {tx("iOS 는 앱 안 업데이트 확인이 없어 안내를 만들지 않습니다(설계).", "iOS has no in-app update check (by design).")}
            </p>
          ) : null}
          {recipientsErr ? (
            <AdminErrorState ko={ko} code={recipientsErr} onRetry={() => setRecipientsTick((n) => n + 1)} />
          ) : !recipients ? (
            <AdminLoadingState ko={ko} />
          ) : recipients.length === 0 ? (
            <AdminEmptyState ko={ko} message={tx("안내 받은 회원이 없습니다.", "No members.")} />
          ) : (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
                  <tr>
                    <th className="px-3 py-2">{tx("회원", "Member")}</th>
                    <th className="px-3 py-2">{tx("안내 시각", "Notified")}</th>
                    <th className="px-3 py-2">{tx("읽은 시각", "Read")}</th>
                    <th className="px-3 py-2">{tx("지금 설치 버전", "Installed now")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.user_id} className="border-b border-sam-border-soft">
                      <td className="px-3 py-2">
                        <Link href={`/admin/users/${encodeURIComponent(r.user_id)}`} className="hover:underline">
                          {r.name ?? tx("(이름 없음)", "(no name)")}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{formatAdminManilaDateTime(r.notified_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.read_at ? formatAdminManilaDateTime(r.read_at) : tx("안 읽음", "Unread")}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.installed_version ?? "—"}
                        {r.installed_seen_at ? (
                          <span className="ml-1 text-[12px] text-sam-muted">({tx("마지막 접속", "seen")} {formatAdminManilaDateTime(r.installed_seen_at)})</span>
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
        {tx(
          "자동 발송 — 주문·운영·광고·문의 답변 알림이 사장님에게 간 결과입니다(다시 보내기·반복 없음). 알림음은 「알림음 설정」의 사장님 구역에서 바꿉니다.",
          "Automatic owner notifications (orders, operations, ads, inquiry replies). Change sounds in Notification sounds."
        )}
      </p>
      <Seg
        value={String(days) as "7" | "30" | "90"}
        onChange={(v) => setDays(Number(v) as 7 | 30 | 90)}
        options={[
          { value: "7", label: tx("최근 7일", "7 days") },
          { value: "30", label: tx("최근 30일", "30 days") },
          { value: "90", label: tx("최근 90일", "90 days") },
        ]}
      />
      {err ? (
        <AdminErrorState ko={ko} code={err} onRetry={() => setTick((n) => n + 1)} />
      ) : !rows ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={tx("이 기간에 사장님에게 간 알림이 없습니다.", "No owner notifications in this period.")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">{tx("알림 종류", "Kind")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("알림", "Sent")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("사장님", "Owners")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("매장", "Stores")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("읽음", "Read")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("안 읽음", "Unread")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("푸시 성공(기기)", "Push OK (devices)")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("푸시 실패(기기)", "Push failed")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tx("푸시 생략(기기)", "Push skipped")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("마지막", "Last")}</th>
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
