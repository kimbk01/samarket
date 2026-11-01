"use client";

import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Music } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { NotificationSoundDomain } from "@/lib/notifications/notification-sound-types";
import { displayNotificationSoundAssetLabel } from "@/lib/notifications/notification-sound-display-filename";
import { AdminNotificationSoundPreview } from "@/components/admin/settings/AdminNotificationSoundPreview";
import { SOUND_MAX_BYTES } from "@/lib/notifications/notification-sound-ssot-admin-validation";
import {
  getRepeatPolicy,
  isRepeatRingEvent,
} from "@/lib/notifications/notification-sound-ssot-repeat-policy";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { NOTIFICATION_ITEM_GROUPS } from "@/lib/notifications/notification-item-registry";
import type { NotificationItemAdminRow } from "@/lib/admin/notification-items/notification-items-admin.types";

type AssetRow = {
  id: string;
  label: string;
  kind: string;
  file_url: string | null;
  file_path: string | null;
  legacy_source: unknown;
  enabled: boolean;
};

type EventRow = {
  event_key: string;
  label_ko: string;
  label_en: string;
  domain: NotificationSoundDomain;
  audience: string;
  direction: string;
  default_asset_id: string;
  enabled: boolean;
  legacy_source: unknown;
};

type MappingRow = {
  event_key: string;
  asset_id: string;
  use_device_default: boolean;
  volume: number;
  repeat_count: number;
  cooldown_seconds?: number;
  enabled: boolean;
};

const ALLOWED_SOUND_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);


function defaultMappingFromEvent(ev: EventRow): MappingRow {
  return {
    event_key: ev.event_key,
    asset_id: ev.default_asset_id,
    use_device_default: false,
    volume: 0.7,
    repeat_count: 1,
    cooldown_seconds: 0,
    enabled: ev.enabled,
  };
}

function mappingSnapshot(row: MappingRow): string {
  return JSON.stringify({
    asset_id: row.asset_id,
    use_device_default: row.use_device_default,
    volume: row.volume,
    repeat_count: row.repeat_count,
    enabled: row.enabled,
  });
}

function isRowDirty(row: MappingRow | undefined, baseline: MappingRow | undefined): boolean {
  if (!row || !baseline) return false;
  return mappingSnapshot(row) !== mappingSnapshot(baseline);
}

function rowForSave(row: MappingRow): MappingRow {
  if (isRepeatRingEvent(row.event_key)) return row;
  return { ...row, repeat_count: 1 };
}

const DEFAULT_VOLUME = 0.7;

type SoundSourceKind = "device" | "dibay" | "custom";

function resolveSoundSource(mapping: MappingRow, asset: AssetRow | undefined): SoundSourceKind {
  if (mapping.use_device_default === true) return "device";
  if (asset?.kind === "dibay_custom") return "custom";
  return "dibay";
}

function NotificationSoundSsotRow({
  ev,
  mapping,
  baseline,
  assetById,
  language,
  isUploading,
  isSaving,
  onPatch,
  onUpload,
  onRestore,
  onSave,
  showSave = true,
}: {
  ev: EventRow;
  mapping: MappingRow;
  baseline: MappingRow | undefined;
  assetById: Map<string, AssetRow>;
  language: string;
  isUploading: boolean;
  isSaving: boolean;
  onPatch: (partial: Partial<MappingRow>) => void;
  onUpload: () => void;
  onRestore: () => void;
  onSave: () => void;
  /** 알림 항목 관리 화면은 하단 저장 1개로 모아 저장한다(행 저장 숨김). */
  showSave?: boolean;
}) {
  const { t } = useI18n();
  const assetId = mapping.asset_id;
  const asset = assetById.get(assetId);
  const previewUrl = asset?.file_url ?? asset?.file_path ?? null;
  const label = language === "en" ? ev.label_en : ev.label_ko;
  const dirty = isRowDirty(mapping, baseline);
  const repeatPolicy = getRepeatPolicy(ev.event_key);
  const selectedSource = resolveSoundSource(mapping, asset);
  const hasCustomAsset = asset?.kind === "dibay_custom";
  const currentVolume = mapping.volume ?? DEFAULT_VOLUME;
  const volumePct = Math.round(currentVolume * 100);
  const defaultVolumePct = Math.round(DEFAULT_VOLUME * 100);
  const soundFileName = displayNotificationSoundAssetLabel(
    asset,
    t("admin_settings_notif_preview_default")
  );
  const savedBaselineAsset = baseline ? assetById.get(baseline.asset_id) : undefined;
  const savedFileName = displayNotificationSoundAssetLabel(
    savedBaselineAsset,
    t("admin_settings_notif_preview_default")
  );

  const handleSourceChange = (src: SoundSourceKind) => {
    if (src === "device") {
      onPatch({ use_device_default: true });
      return;
    }
    if (src === "dibay") {
      onPatch({ use_device_default: false, asset_id: ev.default_asset_id });
      return;
    }
    onPatch({ use_device_default: false });
  };

  return (
    <div className="space-y-3 border-b border-sam-border-soft px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="sam-text-body font-medium text-sam-fg">{label}</span>
          <span
            className={`rounded-full px-2 py-0.5 sam-text-helper ${
              repeatPolicy === "repeat"
                ? "bg-sam-warning-soft text-sam-warning"
                : "bg-sam-app text-sam-muted"
            }`}
          >
            {repeatPolicy === "repeat"
              ? t("admin_notif_sound_policy_repeat")
              : t("admin_notif_sound_policy_once")}
          </span>
          {baseline ? (
            dirty ? (
              <span className="rounded-full bg-sam-warning-soft px-2 py-0.5 sam-text-helper text-sam-warning">
                {t("admin_notif_sound_unsaved_badge")}
              </span>
            ) : (
              <span className="rounded-full bg-sam-success-soft px-2 py-0.5 sam-text-helper text-sam-success">
                {t("admin_notif_sound_applied_badge")}
              </span>
            )
          ) : null}
        </div>
        <label className="flex items-center gap-2 sam-text-body-secondary text-sam-muted">
          {t("admin_notif_sound_col_active")}
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={mapping.enabled !== false}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="sam-text-helper font-medium text-sam-muted">{t("admin_notif_sound_col_sound")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(
            [
              ["device", "admin_notif_sound_source_device"],
              ["dibay", "admin_notif_sound_source_dibay"],
              ["custom", "admin_notif_sound_source_custom"],
            ] as const
          ).map(([src, labelKey]) => (
            <label key={src} className="flex cursor-pointer items-center gap-2 sam-text-body-secondary text-sam-fg">
              <input
                type="radio"
                name={`notif-sound-source-${ev.event_key}`}
                className="h-4 w-4"
                checked={selectedSource === src}
                onChange={() => handleSourceChange(src)}
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
        {!mapping.use_device_default ? (
          <div className="flex flex-wrap items-center gap-2">
            <AdminActionButton
              variant="secondary"
              size="sm"
              className="w-8 shrink-0 px-0"
              disabled={isUploading || isSaving}
              onClick={onUpload}
              aria-label={t("admin_settings_notif_pick_file")}
              title={t("admin_settings_notif_pick_file")}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Music className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
            </AdminActionButton>
            {!hasCustomAsset ? (
              <span className="sam-text-helper text-sam-muted">{t("admin_notif_sound_custom_upload_hint")}</span>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sam-text-body-secondary text-sam-muted">
        <span>
          {t("admin_notif_sound_volume_default")}: {defaultVolumePct}%
        </span>
        <label className="flex min-w-[12rem] flex-1 items-center gap-2">
          <span className="shrink-0">{t("admin_notif_sound_volume_current")}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePct}
            className="min-w-[6rem] flex-1"
            onChange={(e) => onPatch({ volume: Number(e.target.value) / 100 })}
          />
          <span className="w-10 shrink-0 tabular-nums">{volumePct}%</span>
        </label>
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={volumePct === defaultVolumePct}
          onClick={() => onPatch({ volume: DEFAULT_VOLUME })}
        >
          {t("admin_notif_sound_volume_reset")}
        </AdminActionButton>
      </div>

      {repeatPolicy === "repeat" ? (
        <label className="flex flex-wrap items-center gap-2 sam-text-body-secondary text-sam-muted">
          {t("admin_settings_notif_repeat")}
          <select
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-body text-sam-fg"
            value={mapping.repeat_count}
            onChange={(e) => onPatch({ repeat_count: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
        <p className="sam-text-helper text-sam-muted">{t("admin_notif_sound_current_file")}</p>
        <p className="truncate sam-text-body-secondary font-medium text-sam-fg" title={soundFileName}>
          {soundFileName}
        </p>
        {!dirty && baseline ? (
          <p className="mt-1 truncate sam-text-helper text-sam-success" title={savedFileName}>
            {t("admin_notif_sound_saved_file")}: {savedFileName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AdminNotificationSoundPreview soundUrl={previewUrl} volume={currentVolume} />

        <AdminActionButton variant="secondary" size="sm" disabled={isSaving} onClick={onRestore}>
          {t("admin_notif_sound_restore_default")}
        </AdminActionButton>

        {/* 이벤트 행마다 저장 — 한 화면에 여러 행이라 primary 가 아닌 보조 (R7 버튼 배치: 화면당 primary 1개). */}
        {showSave ? (
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={!dirty || isSaving || isUploading}
            onClick={onSave}
          >
            {t("admin_notif_sound_row_save")}
          </AdminActionButton>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────── 알림 항목 관리 (notification-admin-item-ssot-audit-2026-11-02 · Owner 승인 2026-11-02) ─────────────────────────
 * 이 화면 = 알림 항목표(lib/notifications/notification-item-registry.ts)와 같은 목록·같은 순서.
 * 항목마다: 푸시 켜기/끄기 · 종 표시 켜기/끄기 · 알림음(그 항목의 소리 키) · 회원 설정 연결 · 종 탭 · 운영 30일 수치.
 * 저장은 하단 1쌍(저장/취소) — 항목 설정은 `/api/admin/notification-items`, 알림음은 기존 단일 쓰기 경로
 * `/api/admin/notification-sound-ssot`(Phase 1 LOCK §3). 컴포넌트 이름은 LOCK 계약(verify 스크립트) 때문에 유지한다.
 */

type ItemGroup = NotificationItemAdminRow["group"];

type ItemsPayload = {
  ok?: boolean;
  error?: string;
  item_key?: string;
  items?: NotificationItemAdminRow[];
  statsDays?: number;
  statsTruncated?: boolean;
  unmatched?: { eventType: string; kind: string | null; count: number }[];
};

type ItemDraft = { push: boolean; inbox: boolean };

const GROUP_LABEL: Record<ItemGroup, [string, string]> = {
  ops: ["운영 소식 (공지·시스템·업데이트)", "Announcements"],
  delivery: ["주문·배달", "Orders & delivery"],
  trade: ["거래", "Trade"],
  community: ["커뮤니티", "Community"],
  support: ["고객센터", "Support"],
  messenger: ["메신저 (종 밖 · 채팅 탭)", "Messenger (chat tab)"],
  call: ["통화", "Calls"],
  owner: ["사장님", "Store owner"],
  admin: ["관리자 알림함", "Admin inbox"],
};

const BELL_LABEL: Record<string, [string, string]> = {
  notice: ["운영 소식", "Announcements"],
  system: ["운영 소식", "Announcements"],
  delivery: ["주문·배달", "Orders"],
  trade: ["거래", "Trade"],
  community: ["커뮤니티", "Community"],
  marketing: ["마케팅", "Marketing"],
  support: ["고객센터", "Support"],
};

const PREFERENCE_LABEL: Record<string, [string, string]> = {
  community_chat: ["메신저 채팅", "Messenger chat"],
  trade_chat: ["거래 채팅", "Trade chat"],
  order_chat: ["주문 채팅", "Order chat"],
  trade_events: ["거래 알림", "Trade events"],
  order: ["주문·배달 알림", "Order alerts"],
  community_social: ["커뮤니티 알림", "Community alerts"],
  notice: ["공지·운영 알림", "Notices"],
  marketing: ["마케팅 알림", "Marketing"],
  member_financial: ["금융 (필수)", "Financial (required)"],
  owner_financial: ["매장 금융 (필수)", "Store financial (required)"],
  owner_order_ops: ["매장 주문·운영 알림", "Store order alerts"],
  call: ["통화", "Calls"],
  system_test: ["테스트", "Test"],
};

const LOCK_LABEL: Record<NonNullable<NotificationItemAdminRow["pushLock"]>, [string, string]> = {
  call: ["통화 알림은 통화 변경 규정으로 끌 수 없습니다", "Call alerts cannot be turned off"],
  chat_row: ["대화 숫자의 근거라 끌 수 없습니다", "Required for chat counts"],
  campaign: ["관리자 알림 발송 화면에서 채널을 정합니다", "Set per campaign"],
  no_push: ["푸시를 보내지 않는 알림입니다 (설계)", "No push by design"],
  admin_queue: ["관리자 업무 알림함은 항상 남습니다", "Admin work queue"],
  test: ["테스트 발송 화면에서 정합니다", "Set on the test screen"],
};

const SUPPRESS_LABEL: Record<string, [string, string]> = {
  admin_item_disabled: ["어드민 끔", "Admin off"],
  muted: ["방 알림 끔", "Muted"],
  user_settings: ["회원 설정", "User settings"],
};

function pick(pair: [string, string] | undefined, ko: boolean, fallback: string): string {
  return pair ? (ko ? pair[0] : pair[1]) : fallback;
}


function NotificationItemCard({
  item,
  draft,
  ko,
  statsDays,
  onPatch,
  soundRow,
}: {
  item: NotificationItemAdminRow;
  draft: ItemDraft;
  ko: boolean;
  statsDays: number;
  onPatch: (next: Partial<ItemDraft>) => void;
  soundRow: ReactNode;
}) {
  const label = ko ? item.labelKo : item.labelEn;
  const audience =
    item.audience === "owner" ? (ko ? "사장님" : "Owner") : item.audience === "admin" ? (ko ? "관리자" : "Admin") : ko ? "회원" : "Member";
  const bell =
    item.audience === "admin"
      ? ko
        ? "관리자 알림함"
        : "Admin inbox"
      : item.group === "messenger" || item.group === "call"
        ? ko
          ? "종에 안 나옴 (채팅 탭)"
          : "Not in bell"
        : item.bellDomain
          ? pick(BELL_LABEL[item.bellDomain], ko, item.bellDomain)
          : ko
            ? "최근 발생 없음"
            : "No recent rows";
  const pref = item.preference
    ? `${pick(PREFERENCE_LABEL[item.preference.domain], ko, item.preference.domain)}${
        item.preference.mandatory && !item.preference.domain.endsWith("financial") ? (ko ? " (필수)" : " (required)") : ""
      }`
    : "—";
  const suppressed = Object.entries(item.stats.suppressed)
    .map(([k, n]) => `${pick(SUPPRESS_LABEL[k], ko, k)} ${n}`)
    .join(" · ");
  const pushDisabled = item.pushLock != null || !draft.inbox;
  return (
    <div className="space-y-3 border-b border-sam-border-soft px-4 py-4 last:border-b-0 sm:px-5" data-notification-item={item.key}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body font-semibold text-sam-fg">{label}</span>
        <AdminToneBadge tone={item.audience === "member" ? "neutral" : "progress"}>{audience}</AdminToneBadge>
        {item.legacyOnly ? <AdminToneBadge tone="waiting">{ko ? "옛 알림 · 새 발송 없음" : "Legacy"}</AdminToneBadge> : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sam-text-body-secondary text-sam-muted sm:grid-cols-3">
        <div className="flex gap-1">
          <dt>{ko ? "종 탭" : "Bell tab"}:</dt>
          <dd className="text-sam-fg">{bell}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{ko ? "회원 설정" : "Member setting"}:</dt>
          <dd className="text-sam-fg">{pref}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{ko ? `최근 ${statsDays}일` : `Last ${statsDays}d`}:</dt>
          <dd className="text-sam-fg">
            {ko
              ? `발생 ${item.stats.created} · 푸시 발송 ${item.stats.pushSent}`
              : `${item.stats.created} created · ${item.stats.pushSent} pushed`}
            {suppressed ? ` · ${ko ? "생략" : "skipped"} ${suppressed}` : ""}
            {item.stats.lastAt ? ` · ${ko ? "마지막" : "last"} ${formatAdminManilaDateTime(item.stats.lastAt)}` : ""}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <AdminSwitch
            checked={draft.inbox}
            disabled={item.inboxLock != null}
            onChange={(next) => onPatch(next ? { inbox: true } : { inbox: false, push: false })}
            label={ko ? `${label} 알림 보내기` : `${label} send`}
          />
          <span className="sam-text-body-secondary text-sam-fg">
            {item.audience === "admin" || item.group === "messenger" || item.group === "call"
              ? ko
                ? "알림 남기기"
                : "Keep record"
              : ko
                ? "종에 표시"
                : "Show in bell"}
          </span>
          {item.inboxLock ? (
            <span className="sam-text-helper text-sam-muted">{pick(LOCK_LABEL[item.inboxLock], ko, "")}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <AdminSwitch
            checked={draft.push && draft.inbox}
            disabled={pushDisabled}
            onChange={(next) => onPatch({ push: next })}
            label={ko ? `${label} 푸시` : `${label} push`}
          />
          <span className="sam-text-body-secondary text-sam-fg">{ko ? "푸시 보내기" : "Send push"}</span>
          {item.pushLock ? (
            <span className="sam-text-helper text-sam-muted">{pick(LOCK_LABEL[item.pushLock], ko, "")}</span>
          ) : !draft.inbox ? (
            <span className="sam-text-helper text-sam-muted">
              {ko ? "알림을 남기지 않으면 푸시도 보내지 않습니다" : "No push without the notification"}
            </span>
          ) : null}
        </div>
        {item.pushLock === "campaign" ? (
          <Link href="/admin/notifications" className="sam-text-body-secondary text-sam-primary underline">
            {ko ? "알림 발송 화면" : "Campaigns"}
          </Link>
        ) : null}
      </div>
      {soundRow}
    </div>
  );
}

export function AdminNotificationSoundSsotTable() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const [loadErr, setLoadErr] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [draft, setDraft] = useState<MappingRow[]>([]);
  const [baseline, setBaseline] = useState<MappingRow[]>([]);
  const [items, setItems] = useState<NotificationItemAdminRow[]>([]);
  const [itemDraft, setItemDraft] = useState<Record<string, ItemDraft>>({});
  const [meta, setMeta] = useState<{ statsDays: number; statsTruncated: boolean; unmatched: ItemsPayload["unmatched"] }>({
    statsDays: 30,
    statsTruncated: false,
    unmatched: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ eventKey: string; domain: NotificationSoundDomain } | null>(null);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const eventsByKey = useMemo(() => new Map(events.map((e) => [e.event_key, e])), [events]);
  const baselineByKey = useMemo(() => new Map(baseline.map((r) => [r.event_key, r])), [baseline]);

  const formatSaveError = useCallback(
    (payload: { error?: string; field?: string; max?: number }) => {
      const code = payload.error ?? "";
      const known: Record<string, string> = {
        file_url_too_long: t("admin_notif_sound_url_too_long"),
        legacy_mirror_url_too_long: t("admin_notif_sound_legacy_url_too_long"),
        label_too_long: t("admin_notif_sound_label_too_long"),
        "invalid cooldown_seconds": t("admin_notif_sound_cooldown_invalid"),
        repeat_not_allowed_for_once_event: t("admin_notif_sound_repeat_once_warning"),
        revision_conflict: ko
          ? "다른 관리자가 먼저 저장했습니다. 저장하지 않았습니다 — 새로 불러온 뒤 다시 바꿔 주세요."
          : "Someone else saved first. Nothing was saved — reload and try again.",
        item_locked: ko ? "끌 수 없는 항목입니다." : "This item cannot be turned off.",
      };
      if (known[code]) return known[code];
      if (payload.field) {
        return safeT("admin_notif_sound_save_failed_field", {
          fallbackKo: `저장 실패 (${payload.field})`,
          fallbackEn: `Save failed (${payload.field})`,
          vars: { field: payload.field },
        });
      }
      return code ? adminOperatorErrorMessage(code, ko) : t("admin_settings_notif_save_failed");
    },
    [ko, safeT, t]
  );

  const applySound = useCallback((payload: { assets?: AssetRow[]; events?: EventRow[]; mappings?: MappingRow[] }) => {
    setAssets(payload.assets ?? []);
    setEvents(payload.events ?? []);
    const m = (payload.mappings ?? []).map((x) => ({ ...x }));
    setDraft(m.map((x) => ({ ...x })));
    setBaseline(m);
  }, []);

  const applyItems = useCallback((payload: ItemsPayload) => {
    const list = payload.items ?? [];
    setItems(list);
    setItemDraft(Object.fromEntries(list.map((i) => [i.key, { push: i.pushEnabled, inbox: i.inboxEnabled }])));
    setMeta({
      statsDays: payload.statsDays ?? 30,
      statsTruncated: payload.statsTruncated === true,
      unmatched: payload.unmatched ?? [],
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setLoadErr(null);
    try {
      const [soundRes, itemsRes] = await Promise.all([
        fetch("/api/admin/notification-sound-ssot", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/notification-items", { credentials: "include", cache: "no-store" }),
      ]);
      const sj = (await soundRes.json().catch(() => ({}))) as {
        ok?: boolean;
        assets?: AssetRow[];
        events?: EventRow[];
        mappings?: MappingRow[];
        error?: string;
      };
      const ij = (await itemsRes.json().catch(() => ({}))) as ItemsPayload;
      if (!soundRes.ok || !sj.ok) {
        setLoadErr({ code: sj.error ?? "load_failed", httpStatus: soundRes.status });
        return;
      }
      if (!itemsRes.ok || !ij.ok) {
        setLoadErr({ code: ij.error ?? "load_failed", httpStatus: itemsRes.status });
        return;
      }
      applySound(sj);
      applyItems(ij);
    } catch {
      setLoadErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [applyItems, applySound]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = useCallback(
    (eventKey: string, partial: Partial<MappingRow>) => {
      if (!isRepeatRingEvent(eventKey) && partial.repeat_count != null && partial.repeat_count > 1) {
        setErr(t("admin_notif_sound_repeat_once_warning"));
        return;
      }
      setDraft((prev) => {
        const idx = prev.findIndex((r) => r.event_key === eventKey);
        if (idx >= 0) {
          return prev.map((r) => (r.event_key === eventKey ? { ...r, ...partial } : r));
        }
        const ev = eventsByKey.get(eventKey);
        if (!ev) return prev;
        return [...prev, { ...defaultMappingFromEvent(ev), ...partial }];
      });
    },
    [eventsByKey, t]
  );

  const uploadSoundFile = useCallback(
    async (eventKey: string, domain: NotificationSoundDomain, file: File) => {
      if (file.size > SOUND_MAX_BYTES) {
        setErr(t("admin_notif_sound_file_too_large"));
        return;
      }
      const mime = file.type || "application/octet-stream";
      if (!ALLOWED_SOUND_MIME.has(mime)) {
        setErr(t("admin_settings_notif_upload_failed"));
        return;
      }
      setUploadingKey(eventKey);
      setErr(null);
      setMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("label", file.name.slice(0, 255));
        fd.append("domain", domain);
        const res = await fetch("/api/admin/notification-sound-ssot/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const j = (await res.json()) as { ok?: boolean; asset_id?: string; file_url?: string | null; error?: string };
        if (!res.ok || !j.ok || !j.asset_id) {
          setErr(j.error ? adminOperatorErrorMessage(j.error, ko) : t("admin_settings_notif_upload_failed"));
          return;
        }
        const newAsset: AssetRow = {
          id: j.asset_id,
          label: file.name,
          kind: "dibay_custom",
          file_url: j.file_url ?? null,
          file_path: null,
          legacy_source: { table: "upload", original_filename: file.name },
          enabled: true,
        };
        setAssets((prev) => (prev.some((a) => a.id === newAsset.id) ? prev : [...prev, newAsset]));
        patchDraft(eventKey, { asset_id: j.asset_id, use_device_default: false });
        setMsg(t("admin_notif_sound_upload_ok_apply"));
      } catch {
        setErr(t("common_network_error_generic"));
      } finally {
        setUploadingKey(null);
      }
    },
    [ko, patchDraft, t]
  );

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      const target = uploadTargetRef.current;
      if (!f || !target) return;
      void uploadSoundFile(target.eventKey, target.domain, f);
    },
    [uploadSoundFile]
  );

  const openFilePicker = useCallback((eventKey: string, domain: NotificationSoundDomain) => {
    uploadTargetRef.current = { eventKey, domain };
    fileInputRef.current?.click();
  }, []);

  const restoreDefault = useCallback(
    (eventKey: string, defaultAssetId: string) => {
      patchDraft(eventKey, { asset_id: defaultAssetId, use_device_default: false, enabled: true, repeat_count: 1 });
    },
    [patchDraft]
  );

  const dirtySound = useMemo(
    () => draft.filter((r) => isRowDirty(r, baselineByKey.get(r.event_key)) || (!baselineByKey.has(r.event_key) && eventsByKey.has(r.event_key))),
    [baselineByKey, draft, eventsByKey]
  );
  const dirtyItems = useMemo(
    () =>
      items.filter((i) => {
        const d = itemDraft[i.key];
        return d && (d.push !== i.pushEnabled || d.inbox !== i.inboxEnabled);
      }),
    [itemDraft, items]
  );
  const dirtyCount = dirtySound.length + dirtyItems.length;

  const cancelAll = useCallback(() => {
    setDraft(baseline.map((x) => ({ ...x })));
    setItemDraft(Object.fromEntries(items.map((i) => [i.key, { push: i.pushEnabled, inbox: i.inboxEnabled }])));
    setErr(null);
    setMsg(null);
  }, [baseline, items]);

  const saveAll = useCallback(async () => {
    if (dirtyCount === 0) return;
    const turnedOff = dirtyItems.filter((i) => {
      const d = itemDraft[i.key]!;
      return (!d.push && i.pushEnabled) || (!d.inbox && i.inboxEnabled);
    });
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? `알림 설정 ${dirtyCount}건 저장` : `Save ${dirtyCount} change(s)`,
      description:
        turnedOff.length > 0
          ? ko
            ? `끄는 항목: ${turnedOff.map((i) => i.labelKo).join(", ")} — 저장 즉시(최대 30초 안에) 모든 회원에게 적용됩니다.`
            : `Turning off: ${turnedOff.map((i) => i.labelEn).join(", ")} — applies to everyone within 30s.`
          : ko
            ? "저장 즉시 모든 회원에게 적용됩니다."
            : "Applies to everyone immediately.",
      confirmLabel: ko ? "저장" : "Save",
    });
    if (!confirmed.ok) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      if (dirtyItems.length > 0) {
        const res = await fetch("/api/admin/notification-items", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: dirtyItems.map((i) => ({
              item_key: i.key,
              push_enabled: itemDraft[i.key]!.push && itemDraft[i.key]!.inbox,
              inbox_enabled: itemDraft[i.key]!.inbox,
              base_revision: i.revision,
            })),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as ItemsPayload;
        if (!res.ok || !j.ok) {
          setErr(formatSaveError(j));
          return;
        }
        applyItems(j);
      }
      if (dirtySound.length > 0) {
        const res = await fetch("/api/admin/notification-sound-ssot", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings: dirtySound.map(rowForSave) }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          assets?: AssetRow[];
          events?: EventRow[];
          mappings?: MappingRow[];
          error?: string;
          field?: string;
          max?: number;
        };
        if (!res.ok || !j.ok) {
          setErr(formatSaveError(j));
          return;
        }
        applySound(j);
      }
      setMsg(ko ? "저장했습니다." : "Saved.");
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setSaving(false);
    }
  }, [applyItems, applySound, dirtyCount, dirtyItems, dirtySound, formatSaveError, itemDraft, ko, t]);

  const renderSoundRow = (eventKey: string) => {
    const ev = eventsByKey.get(eventKey);
    if (!ev) return null;
    const m = draft.find((x) => x.event_key === ev.event_key) ?? defaultMappingFromEvent(ev);
    return (
      <NotificationSoundSsotRow
        key={ev.event_key}
        ev={ev}
        mapping={m}
        baseline={baselineByKey.get(ev.event_key)}
        assetById={assetById}
        language={language}
        isUploading={uploadingKey === ev.event_key}
        isSaving={saving}
        onPatch={(partial) => patchDraft(ev.event_key, partial)}
        onUpload={() => openFilePicker(ev.event_key, ev.domain)}
        onRestore={() => restoreDefault(ev.event_key, ev.default_asset_id)}
        onSave={() => undefined}
        showSave={false}
      />
    );
  };

  if (loading) return <AdminLoadingState ko={ko} label={t("common_loading")} />;
  if (loadErr) {
    return <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} />;
  }

  const itemSoundKeys = new Set(items.map((i) => i.soundEventKey).filter((k): k is string => !!k));
  const soundOnlyEvents = events.filter((e) => !itemSoundKeys.has(e.event_key));

  return (
    <div className="space-y-4 pb-24">
      <p className="sam-text-body-secondary text-sam-muted">
        {ko
          ? "알림 종류마다 한 줄입니다. 회원 화면의 알림과 같은 목록이며, 여기서 끄면 그 알림은 모든 회원에게 보내지 않습니다. 회원 개인 알림 설정은 그대로 따로 적용됩니다."
          : "One row per notification type. Turning one off here stops it for everyone; member preferences still apply on top."}
      </p>
      <p className="sam-text-helper text-sam-muted">{t("admin_notif_sound_ssot_limits_hint")}</p>
      {meta.statsTruncated ? (
        <p className="sam-text-helper text-sam-warning">
          {ko ? "최근 기간 알림이 많아 수치는 최신 2만 건 기준입니다." : "Stats use the latest 20,000 rows."}
        </p>
      ) : null}
      {meta.unmatched && meta.unmatched.length > 0 ? (
        <div role="alert" className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-2 sam-text-body-secondary text-sam-warning">
          {ko ? "항목표에 없는 알림 종류가 있습니다: " : "Notification types missing from the item list: "}
          {meta.unmatched.map((u) => `${u.eventType}${u.kind ? `/${u.kind}` : ""} ${u.count}`).join(", ")}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
        className="sr-only"
        onChange={onFileChange}
      />

      {err ? (
        <div role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-2 sam-text-body-secondary text-sam-danger">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div role="status" className="rounded-ui-rect border border-sam-success bg-sam-success-soft px-4 py-2 sam-text-body-secondary text-sam-success">
          {msg}
        </div>
      ) : null}

      {items.length === 0 ? (
        <AdminEmptyState ko={ko} message={ko ? "알림 항목이 없습니다." : "No notification items."} />
      ) : null}

      {NOTIFICATION_ITEM_GROUPS.map((group) => {
        const list = items.filter((i) => i.group === group);
        if (list.length === 0) return null;
        return (
          <section key={group} className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <div className="border-b border-sam-border-soft bg-sam-app px-4 py-3 sm:px-5">
              <h2 className="sam-text-body font-semibold text-sam-fg">{pick(GROUP_LABEL[group], ko, group)}</h2>
            </div>
            <div>
              {list.map((item) => (
                <NotificationItemCard
                  key={item.key}
                  item={item}
                  draft={itemDraft[item.key] ?? { push: item.pushEnabled, inbox: item.inboxEnabled }}
                  ko={ko}
                  statsDays={meta.statsDays}
                  onPatch={(next) =>
                    setItemDraft((prev) => ({
                      ...prev,
                      [item.key]: { ...(prev[item.key] ?? { push: item.pushEnabled, inbox: item.inboxEnabled }), ...next },
                    }))
                  }
                  soundRow={
                    item.soundEventKey ? (
                      renderSoundRow(item.soundEventKey)
                    ) : (
                      <p className="sam-text-helper text-sam-muted">
                        {item.audience === "admin"
                          ? ko
                            ? "알림음: 관리자 화면의 「운영 알림음」 설정을 따릅니다."
                            : "Sound: admin ops sound setting."
                          : ko
                            ? "알림음: 테스트 발송 화면에서 정합니다."
                            : "Sound: set on the test screen."}
                      </p>
                    )
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      {soundOnlyEvents.length > 0 ? (
        <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <div className="border-b border-sam-border-soft bg-sam-app px-4 py-3 sm:px-5">
            <h2 className="sam-text-body font-semibold text-sam-fg">
              {ko ? "소리 전용 (통화 벨·발신음·관리자 운영음 등 알림이 아닌 소리)" : "Sounds only (ringtones, ops sounds)"}
            </h2>
          </div>
          <div>{soundOnlyEvents.map((ev) => renderSoundRow(ev.event_key))}</div>
        </section>
      ) : null}

      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm">
        <span className="mr-auto sam-text-body-secondary text-sam-muted">
          {dirtyCount > 0 ? (ko ? `바뀐 설정 ${dirtyCount}건` : `${dirtyCount} unsaved`) : ko ? "바뀐 설정 없음" : "No changes"}
        </span>
        <AdminActionButton variant="secondary" size="sm" disabled={dirtyCount === 0 || saving} onClick={cancelAll}>
          {ko ? "취소" : "Cancel"}
        </AdminActionButton>
        <AdminActionButton variant="primary" size="sm" disabled={dirtyCount === 0 || saving || uploadingKey != null} onClick={() => void saveAll()}>
          {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
        </AdminActionButton>
      </div>
    </div>
  );
}
