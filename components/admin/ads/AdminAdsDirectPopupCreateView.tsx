"use client";

/**
 * CUT R2 — Popup create from Ads Direct.
 * Reuses POST /api/admin/advertising/direct-popup + AdminPlatformPopupPreview.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import {
  AdminPlatformPopupPreview,
  type AdminPlatformPopupPreviewSource,
} from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { adsCreateConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";

const SURFACES = ["GLOBAL", "DELIVERY", "TRADE", "COMMUNITY", "MYPAGE"] as const;

export function AdminAdsDirectPopupCreateView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const createCopy = adsCreateConfirmCopy(ko);

  const [name, setName] = useState("");
  const [surface, setSurface] = useState<(typeof SURFACES)[number]>("GLOBAL");
  const [cta, setCta] = useState("/market");
  const [altText, setAltText] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [publishMode, setPublishMode] = useState<"live" | "scheduled">("scheduled");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const scheduleOk = useMemo(() => {
    if (publishMode === "live") {
      return Boolean(endAt) && Number.isFinite(new Date(endAt).getTime());
    }
    return (
      Boolean(startAt && endAt) &&
      new Date(endAt).getTime() > new Date(startAt).getTime()
    );
  }, [endAt, publishMode, startAt]);

  const previewSource: AdminPlatformPopupPreviewSource | null = previewUrl
    ? {
        campaignId: "preview",
        creativeId: "preview-creative",
        imageUrl: previewUrl,
        altText: altText || name || "Popup",
        ctaHref: cta,
        ctaType: "internal_page",
        surface,
        suppressionMode: "none",
        suppressionDurationSeconds: null,
        timezone: "Asia/Seoul",
        unsaved: true,
      }
    : null;

  const canSubmit = Boolean(name.trim() && file && scheduleOk && cta.trim() && !busy);

  const pickFile = (next: File) => {
    setError("");
    if (previewUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        /* ignore */
      }
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    if (!altText) setAltText(next.name);
  };

  const submit = async () => {
    if (!canSubmit || !file || busy) return;
    setBusy(true);
    setError("");
    try {
      const startIso =
        publishMode === "live" ? new Date().toISOString() : new Date(startAt).toISOString();
      const endIso = new Date(endAt).toISOString();
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("surfaces", JSON.stringify([surface]));
      fd.set("startAt", startIso);
      fd.set("endAt", endIso);
      fd.set("ctaTarget", cta);
      fd.set("file", file);
      fd.set("publishMode", publishMode);
      fd.set("altText", altText || name);
      const createRes = await fetch("/api/admin/advertising/direct-popup", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const created = (await createRes.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        incomplete?: boolean;
        detailHref?: string;
        error?: string;
      };
      if (!createRes.ok || !created.ok || !created.id) {
        setError(
          created.incomplete && created.id
            ? ko
              ? "팝업이 임시 상태로 저장되었습니다. 상세에서 설정을 완료해 주세요."
              : "Popup saved as incomplete. Finish settings in detail."
            : adminOperatorErrorMessage(created.error, ko)
        );
        if (created.id) {
          router.push(created.detailHref || `/admin/platform-popup/${created.id}`);
        }
        return;
      }
      setSuccessMsg(ko ? "광고가 등록되었습니다." : "Ad registered.");
      router.push(created.detailHref || `/admin/platform-popup/${created.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5" data-admin-ads-direct-popup="1">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising/direct" className="underline">
            {ko ? "광고 등록" : "Register ad"}
          </Link>
          {" › "}
          Popup
        </p>
        <h1 className="text-[20px] font-semibold text-sam-fg">Popup</h1>
        <p className="text-[13px] text-sam-muted">
          {ko
            ? "결제·승인 없음 · Admin Direct 전용"
            : "No payment · no approval · Admin Direct only"}
        </p>
      </header>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-[14px] font-bold">{ko ? "노출 Surface" : "Surface"}</h2>
        <select
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
          value={surface}
          onChange={(e) => setSurface(e.target.value as (typeof SURFACES)[number])}
          data-admin-popup-surface="1"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-popup-creative="1">
        <h2 className="text-[14px] font-bold">{ko ? "이미지" : "Image"}</h2>
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]"
          data-admin-popup-creative-spec="1"
        >
          <dt className="text-sam-muted">{ko ? "비율" : "Aspect"}</dt>
          <dd className="font-semibold">36:25</dd>
          <dt className="text-sam-muted">{ko ? "권장 크기" : "Recommended"}</dt>
          <dd className="font-semibold">1440 × 1000px</dd>
        </dl>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
        <AdminActionButton
          variant="secondary"
          data-admin-popup-image-picker="1"
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
          {file
            ? ko
              ? "이미지 교체"
              : "Replace image"
            : ko
              ? "내 PC에서 이미지 선택"
              : "Choose image from PC"}
        </AdminActionButton>
        {file ? <p className="text-[12px] text-sam-muted">{file.name}</p> : null}
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-app p-4" data-admin-popup-runtime-preview="1">
        <h2 className="mb-2 text-[14px] font-bold">
          {ko ? "Popup 실제 노출 형태 미리보기" : "Popup live-style preview"}
        </h2>
        {previewSource ? (
          <AdminPlatformPopupPreview source={previewSource} />
        ) : (
          <p className="text-[13px] text-sam-muted">{ko ? "이미지 없음" : "No image"}</p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          {ko ? "광고 이름" : "Name"}
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          CTA / destination
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={cta} onChange={(e) => setCta(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          Alt
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={altText} onChange={(e) => setAltText(e.target.value)} />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <AdminChipButton selected={publishMode === "live"} onClick={() => setPublishMode("live")}>
            {ko ? "즉시 노출" : "Go live"}
          </AdminChipButton>
          <AdminChipButton selected={publishMode === "scheduled"} onClick={() => setPublishMode("scheduled")}>
            {ko ? "예약" : "Schedule"}
          </AdminChipButton>
        </div>
        <label className="block text-[12px] text-sam-muted">
          {ko ? "시작" : "Start"}
          <input type="datetime-local" disabled={publishMode === "live"} className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted">
          {ko ? "종료" : "End"}
          <input type="datetime-local" className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </label>
      </section>

      {error ? <p className="text-sm text-sam-danger" role="alert">{error}</p> : null}
      {successMsg ? <p className="text-sm text-sam-success" role="status">{successMsg}</p> : null}

      <AdminActionButton
        variant="primary"
        disabled={!canSubmit}
        className="min-h-12 w-full text-[16px]"
        data-admin-popup-register-cta="1"
        onClick={async () => {
          if (!canSubmit || busy) return;
          // 등록 확인 — 단계는 동작 표(createCopy.level = save)
          const confirmed = await confirmAdminAction({
            level: createCopy.level,
            ko,
            title: createCopy.title,
            description: createCopy.body,
            confirmLabel: createCopy.confirmLabel,
            destructive: createCopy.tone === "danger",
          });
          if (confirmed.ok) void submit();
        }}
      >
        {ko ? "광고 등록" : "Register ad"}
      </AdminActionButton>

    </div>
  );
}
