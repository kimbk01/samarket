"use client";

import { useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import type { DibayIntroMediaRecord } from "@/lib/dibay-intro/media-store";

type Props = {
  introId: string;
  media: DibayIntroMediaRecord[];
  onClose: () => void;
  onPicked: (media: DibayIntroMediaRecord) => void;
  onUploaded: (media: DibayIntroMediaRecord) => void;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function DibayIntroMediaLibrary({ introId, media, onClose, onPicked, onUploaded }: Props) {
  const { safeT } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadFile(file: File) {
    setBusy(true);
    try {
      const signRes = await fetch(`/api/admin/dibay-intros/${introId}/media`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          mime: file.type,
          byteSize: file.size,
        }),
      });
      const signed = (await signRes.json().catch(() => ({}))) as {
        ok?: boolean;
        signedUrl?: string;
        mediaId?: string;
      };
      if (!signRes.ok || !signed.ok || !signed.signedUrl || !signed.mediaId) {
        throw new Error("sign");
      }
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("put");
      const processRes = await fetch(`/api/admin/dibay-intros/${introId}/media/${signed.mediaId}/process`, {
        method: "POST",
        credentials: "same-origin",
      });
      const processed = (await processRes.json().catch(() => ({}))) as {
        ok?: boolean;
        media?: DibayIntroMediaRecord;
      };
      if (!processRes.ok || !processed.ok || !processed.media || processed.media.status !== "ready") {
        throw new Error("process");
      }
      onUploaded(processed.media);
      onPicked(processed.media);
    } catch {
      await dibayAlert({
        title: safeT("admin_dibay_intro_upload_fail", {
          fallbackKo: "파일을 올리지 못했습니다.",
          fallbackEn: "Could not upload the file.",
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-dibay-intro-media="1">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-ui-rect bg-sam-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">
            {safeT("admin_dibay_intro_media_library", { fallbackKo: "미디어", fallbackEn: "Media" })}
          </h2>
          <AdminActionButton variant="ghost" onClick={onClose}>
            {safeT("admin_dibay_intro_preview_close", { fallbackKo: "닫기", fallbackEn: "Close" })}
          </AdminActionButton>
        </div>
        <p className="mb-3 text-xs text-sam-muted">
          {safeT("admin_dibay_intro_gif_keep", {
            fallbackKo: "움직이는 GIF는 움직임이 유지됩니다.",
            fallbackEn: "Animated GIFs stay animated.",
          })}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadFile(file);
          }}
        />
        <AdminActionButton
          variant="primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mb-4"
        >
          {safeT("admin_dibay_intro_upload", { fallbackKo: "파일 올리기", fallbackEn: "Upload file" })}
        </AdminActionButton>
        <div className="grid grid-cols-3 gap-3">
          {media
            .filter((item) => item.status === "ready")
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app text-left"
                onClick={() => {
                  if (item.status !== "ready") return;
                  onPicked(item);
                }}
              >
                {item.signedUrl ? (
                  <SamarketThumbnail
                    src={item.signedUrl}
                    alt=""
                    fill
                    className="h-28 w-full bg-black"
                    imageClassName="object-contain"
                    roundedClassName="rounded-none"
                  />
                ) : (
                  <div className="h-28 bg-sam-surface-muted" />
                )}
                <span className="block truncate px-2 py-1 text-xs">{item.originalName}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
