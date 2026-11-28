"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import { moimCls } from "@/components/moim/moim-ui";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";
import { MoimManageFrame, moimCountKey, moimManageCardClass, moimManageInputClass, useMoimManageToast } from "./moim-manage-shared";

const POINTS: MessageKey[] = [
  "moim_manage_close_point_rooms",
  "moim_manage_close_point_notify",
  "moim_manage_close_point_schedules",
  "moim_manage_close_point_records",
  "moim_manage_close_point_undo",
];

/** 「기록은 멤버만 N일」 — N 은 운영 정책값(어드민에서 바꾸면 그대로 따라감), 정책이 비어 있으면 기간 없는 문구 */
function pointText(t: ReturnType<typeof useI18n>["t"], k: MessageKey, days: number | null): string {
  if (k !== "moim_manage_close_point_records") return t(k);
  return days ? t(moimCountKey(days, k, "moim_manage_close_point_records_one"), { days }) : t("moim_manage_close_point_records_nolimit");
}

/** R5 C21: 종료 완료 안내 — 열람 기간(일)이 있으면 본문에 */
export function moimCloseDoneAlert(t: ReturnType<typeof useI18n>["t"], days: number | null): { title: string; description?: string } {
  if (!days) return { title: t("moim_manage_close_done_title") };
  return { title: t("moim_manage_close_done_title"), description: t(moimCountKey(days, "moim_manage_close_done_body", "moim_manage_close_done_body_one"), { days }) };
}

function CloseBody({ detail }: { detail: MoimDetailDto }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useMoimManageToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === detail.name.trim();

  const close = async () => {
    if (!matches) return;
    setBusy(true);
    const r = await moimApi.close(detail.id, typed.trim());
    if (!r.ok) {
      setBusy(false);
      return toast.showError(r.error);
    }
    /** R5 C21: 종료 성공을 알린 뒤 이동 — 열람 기간이 있으면 그 기간도 */
    await dibayAlert(moimCloseDoneAlert(t, detail.closedRetentionDays));
    router.replace(moimRoutes.tab);
  };

  return (
    <div className="px-4 pt-4">
      <div className={`${moimManageCardClass} border-sam-danger p-4`}>
        <p className="text-[15px] font-semibold text-sam-fg">{t("moim_manage_close_heading")}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[14px] text-sam-fg">
          {POINTS.map((k) => (
            <li key={k}>{pointText(t, k, detail.closedRetentionDays)}</li>
          ))}
        </ul>
      </div>
      <label className="mt-5 block text-[13px] font-medium text-sam-fg" htmlFor="moim-close-name">
        {t("moim_manage_close_input_label", { name: detail.name })}
      </label>
      <input
        id="moim-close-name"
        className={`${moimManageInputClass} mt-2`}
        value={typed}
        autoComplete="off"
        placeholder={detail.name}
        onChange={(e) => setTyped(e.target.value)}
      />
      <MoimStickyFooter className="-mx-4 mt-4">
        <div className={moimCls.column}>
          <button
            type="button"
            disabled={!matches || busy}
            className={`${moimCls.btnDanger} w-full`}
            onClick={() => void close()}
          >
            {t("moim_manage_close_btn")}
          </button>
        </div>
      </MoimStickyFooter>
      {toast.node}
    </div>
  );
}

export function MoimManageClose({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_close_title" stickyFooter allow={(d) => d.can.close}>
      {({ detail }) => <CloseBody detail={detail} />}
    </MoimManageFrame>
  );
}
