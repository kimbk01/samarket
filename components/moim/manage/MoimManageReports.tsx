"use client";

/**
 * 모임 안 신고 확인 (설계 moim §6 P13 「모임 안 처리」 · M6) — 운영진 이상(hide_post).
 * 자기 모임 글·댓글·사진의 열린 신고를 대상별로 보여 주고 [숨김] 할 수 있다. 신고자는 보여 주지 않는다.
 * 숨김은 기존 사용자 API(글·댓글·사진 삭제 → 운영진은 숨김)를 쓰며, 신고 처리 상태는 바꾸지 않는다(운영팀이 최종 판단).
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayActions } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimStaffReportDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  moimManageCardClass,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

const TYPE_KEY: Record<MoimStaffReportDto["targetType"], MessageKey> = {
  post: "moim_manage_reports_type_post",
  comment: "moim_manage_reports_type_comment",
  album: "moim_manage_reports_type_album",
};

const STATUS_KEY: Record<Exclude<MoimStaffReportDto["status"], "active">, MessageKey> = {
  hidden: "moim_manage_reports_status_hidden",
  deleted: "moim_manage_reports_status_deleted",
  missing: "moim_manage_reports_status_missing",
};

function reasonLabel(t: (k: MessageKey) => string, code: string): string {
  const key = `moim_report_reason_${code}` as MessageKey;
  const label = t(key);
  return label === key ? code : label;
}

function ReportsBody({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const fmt = useMoimDateFormat();
  const toast = useMoimManageToast();
  const load = useCallback(() => moimApi.staffReports(moimId), [moimId]);
  const { state, reload } = useMoimResource(load);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<MoimStaffReportDto | null>(null);
  const [busy, setBusy] = useState(false);

  const hide = useCallback(
    async (item: MoimStaffReportDto) => {
      setBusy(true);
      const r =
        item.targetType === "post"
          ? await moimApi.removePost(item.targetId, null)
          : item.targetType === "comment"
            ? await moimApi.removeComment(item.targetId)
            : await moimApi.removeAlbum(item.targetId);
      setBusy(false);
      if (!r.ok) {
        toast.showError(r.error);
        reload();
        return;
      }
      setHidden((prev) => new Set(prev).add(`${item.targetType}:${item.targetId}`));
      setConfirm(null);
      toast.show(t("moim_manage_reports_hidden_toast"), "success");
    },
    [reload, t, toast]
  );

  if (state.status === "loading") return <MoimManageLoading />;
  if (state.status === "error") return <MoimManageError errorKey={state.errorKey} onRetry={reload} />;
  const list = state.data.reports;

  return (
    <>
      <p className="px-4 pt-4 text-[13px] text-sam-muted">{t("moim_manage_reports_note")}</p>
      {state.data.capped ? <p className="px-4 pt-1 text-[12px] text-sam-meta">{t("moim_manage_reports_capped")}</p> : null}
      {list.length === 0 ? <MoimManageEmpty textKey="moim_manage_reports_empty" /> : null}
      <ul className="flex flex-col gap-3 px-4 pt-3">
        {list.map((item) => {
          const key = `${item.targetType}:${item.targetId}`;
          const status = hidden.has(key) ? "hidden" : item.status;
          const href =
            item.targetType === "album" ? moimRoutes.album(moimId) : item.postId ? moimRoutes.post(moimId, item.postId) : null;
          return (
            <li key={key} className={`${moimManageCardClass} p-4`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${Sam.badge.neutral} whitespace-nowrap`}>{t(TYPE_KEY[item.targetType])}</span>
                <span className={`${Sam.badge.danger} whitespace-nowrap`}>{t("moim_manage_reports_count", { count: item.reportCount })}</span>
                {status !== "active" ? <span className={`${Sam.badge.neutral} whitespace-nowrap`}>{t(STATUS_KEY[status])}</span> : null}
                <span className="ml-auto text-[12px] text-sam-meta">{fmt(item.latestAt)}</span>
              </div>
              <div className="mt-2 flex gap-3">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 신고 대상 사진 미리보기(외부 저장소 URL)
                  <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-ui-rect border border-sam-border-soft object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  {item.title ? <p className="break-words text-[15px] font-semibold text-sam-fg">{item.title}</p> : null}
                  {item.excerpt ? <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{item.excerpt}</p> : null}
                  {item.authorNickname ? <p className="mt-1 text-[12px] text-sam-muted">{item.authorNickname}</p> : null}
                </div>
              </div>
              <p className="mt-2 text-[13px] text-sam-muted">
                {item.reasons.map((r) => `${reasonLabel(t, r.code)} ${r.count}`).join(" · ")}
              </p>
              <div className="mt-3 flex gap-2">
                {href ? (
                  <Link href={href} className={`${Sam.btn.secondaryCombo} flex-1 rounded-ui-rect text-center`}>
                    {t("moim_manage_reports_view_btn")}
                  </Link>
                ) : null}
                {status === "active" ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={`${Sam.btn.primaryCombo} ${Sam.btn.disabledToken} flex-1 rounded-ui-rect`}
                    onClick={() => setConfirm(item)}
                  >
                    {t("moim_manage_reports_hide_btn")}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <DibayBottomSheet
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={t("moim_manage_reports_hide_sheet_title")}
        footer={
          <DibayOverlayActions
            actions={[
              { key: "cancel", label: t("moim_manage_cancel_btn"), roleTone: "secondary", onClick: () => setConfirm(null) },
              {
                key: "hide",
                label: t("moim_manage_reports_hide_btn"),
                roleTone: "destructive",
                loading: busy,
                onClick: () => {
                  if (confirm) void hide(confirm);
                },
              },
            ]}
          />
        }
      >
        <p className="text-[14px] text-sam-fg">{t("moim_manage_reports_hide_sheet_body")}</p>
      </DibayBottomSheet>
      {toast.node}
    </>
  );
}

export function MoimManageReports({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_reports_title" allow={(d) => d.can.hide_post}>
      {() => <ReportsBody moimId={moimId} />}
    </MoimManageFrame>
  );
}
