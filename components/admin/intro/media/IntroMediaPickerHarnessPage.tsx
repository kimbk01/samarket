"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { IntroMediaPicker } from "@/components/admin/intro/media/IntroMediaPicker";
import type { IntroMediaPickerResult } from "@/components/admin/intro/media/types";

/**
 * Contained Phase 4 picker harness — NOT Studio product authority.
 * Used for Owner / E2E verification of SELECT EXISTING + UPLOAD NEW flows.
 */
export function IntroMediaPickerHarnessPage() {
  const { language } = useI18n();
  const ko = language === "ko";
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<"IMAGE" | "LOGO">("IMAGE");
  const [last, setLast] = useState<IntroMediaPickerResult | null>(null);
  const [cancelled, setCancelled] = useState(false);

  return (
    <div className="mx-auto max-w-3xl p-4 text-sam-fg sm:p-6" data-admin="1">
      <AdminPageHeader
        backHref="/admin/intro"
        title={ko ? "미디어 선택 (검증)" : "Media Picker (harness)"}
        description={
          ko
            ? "스튜디오가 아닙니다. Phase 4 선택 흐름만 검증하는 임시 화면입니다."
            : "Not Studio. Contained harness for Phase 4 picker flow only."
        }
      />

      <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap gap-2">
          <AdminActionButton
            variant={context === "IMAGE" ? "primary" : "secondary"}
            onClick={() => setContext("IMAGE")}
          >
            IMAGE
          </AdminActionButton>
          <AdminActionButton
            variant={context === "LOGO" ? "primary" : "secondary"}
            onClick={() => setContext("LOGO")}
          >
            LOGO
          </AdminActionButton>
        </div>
        <p className="text-xs text-sam-muted">
          {ko
            ? "컨텍스트는 선택 안내만 바꿉니다. Media Library 자체는 하나뿐입니다."
            : "Context only changes guidance — there is still one Media Library."}
        </p>
        <AdminActionButton
          variant="primary"
          onClick={() => {
            setCancelled(false);
            setOpen(true);
          }}
          data-testid="intro-picker-harness-open"
        >
          {ko ? "미디어 선택 열기" : "Open media picker"}
        </AdminActionButton>

        {last ? (
          <div
            className="rounded-ui-rect border border-emerald-300 bg-emerald-50 p-3 text-sm"
            data-picker-result="confirmed"
          >
            <p className="font-medium text-emerald-950">
              {ko ? "선택됨" : "Selected"}
            </p>
            <p className="mt-1 font-mono text-xs text-emerald-900">
              mediaRefId={last.mediaRefId}
            </p>
          </div>
        ) : null}
        {cancelled ? (
          <p className="text-sm text-sam-muted" data-picker-result="cancelled">
            {ko
              ? "취소됨 — 선택 변경 없음"
              : "Cancelled — no selection mutation"}
          </p>
        ) : null}
      </div>

      <IntroMediaPicker
        ko={ko}
        open={open}
        context={context}
        initialMediaRefId={last?.mediaRefId ?? null}
        onConfirm={(result) => {
          setLast(result);
          setOpen(false);
          setCancelled(false);
        }}
        onCancel={() => {
          setOpen(false);
          setCancelled(true);
        }}
      />
    </div>
  );
}
