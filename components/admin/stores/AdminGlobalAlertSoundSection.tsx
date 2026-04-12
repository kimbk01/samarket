"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { previewStoreDeliveryBuiltinSound } from "@/lib/business/store-order-alert-sound";
import {
  STORE_DELIVERY_ALERT_SOUND_OPTIONS,
  STORE_DELIVERY_NOTIFICATION_MP3_PATH,
  storeDeliverySoundSelectIdFromUrl,
  type StoreDeliveryAlertSoundSelectId,
} from "@/lib/stores/store-delivery-alert-sound-presets";

export type AdminGlobalAlertSoundSectionProps = {
  title: string;
  description: ReactNode;
  codeKey: string;
  apiPath: string;
  /** 저장·삭제·업로드 직후 (클라이언트 캐시 무효화 등) */
  onAfterMutation?: () => void;
};

export function AdminGlobalAlertSoundSection({
  title,
  description,
  codeKey,
  apiPath,
  onAfterMutation,
}: AdminGlobalAlertSoundSectionProps) {
  const [soundSelect, setSoundSelect] = useState<StoreDeliveryAlertSoundSelectId | "">("builtin");
  const [soundLegacyUrl, setSoundLegacyUrl] = useState<string | null>(null);
  const [soundFromDb, setSoundFromDb] = useState(false);
  const [soundLoading, setSoundLoading] = useState(true);
  const [soundSaving, setSoundSaving] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [soundMsg, setSoundMsg] = useState<string | null>(null);
  const adminSoundFileRef = useRef<HTMLInputElement>(null);

  const uploadAdminSoundFromPc = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      setSoundSaving(true);
      setSoundError(null);
      setSoundMsg(null);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(apiPath, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          url?: string;
          from_db?: boolean;
        };
        if (!json?.ok) {
          setSoundError(
            typeof json?.message === "string"
              ? json.message
              : typeof json?.error === "string"
                ? json.error
                : "업로드에 실패했습니다."
          );
          return;
        }
        const u = typeof json.url === "string" ? json.url.trim() : "";
        setSoundSelect("");
        setSoundLegacyUrl(u || null);
        setSoundFromDb(json.from_db === true);
        setSoundMsg("PC 파일을 올려 알림음으로 저장했습니다.");
        onAfterMutation?.();
        window.setTimeout(() => setSoundMsg(null), 3200);
      } catch {
        setSoundError("network_error");
      } finally {
        setSoundSaving(false);
      }
    },
    [apiPath, onAfterMutation]
  );

  const deleteGlobalSound = useCallback(async () => {
    if (
      !window.confirm(
        "알림음을 DB에서 지웁니다. 관리자가 업로드한 파일이면 Storage에서도 함께 삭제합니다. 이후 기본 비프가 사용됩니다. 계속할까요?"
      )
    ) {
      return;
    }
    setSoundSaving(true);
    setSoundError(null);
    setSoundMsg(null);
    try {
      const res = await fetch(apiPath, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json?.ok) {
        setSoundError(typeof json?.error === "string" ? json.error : "delete_failed");
        return;
      }
      setSoundSelect("builtin");
      setSoundLegacyUrl(null);
      setSoundFromDb(false);
      setSoundMsg("알림음을 제거했습니다.");
      onAfterMutation?.();
      window.setTimeout(() => setSoundMsg(null), 3200);
    } catch {
      setSoundError("network_error");
    } finally {
      setSoundSaving(false);
    }
  }, [apiPath, onAfterMutation]);

  const persistSoundChoice = useCallback(
    async (id: StoreDeliveryAlertSoundSelectId) => {
      const url =
        id === "builtin"
          ? null
          : STORE_DELIVERY_ALERT_SOUND_OPTIONS.find((o) => o.id === id)?.url ?? null;
      setSoundSaving(true);
      setSoundError(null);
      setSoundMsg(null);
      try {
        const res = await fetch(apiPath, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const json = await res.json();
        if (!json?.ok) {
          setSoundError(
            json?.error === "invalid_url"
              ? "저장에 실패했습니다. 다시 선택해 주세요."
              : String(json?.error ?? "save_failed")
          );
          return;
        }
        setSoundSelect(id);
        setSoundLegacyUrl(null);
        setSoundFromDb(json.from_db === true);
        setSoundMsg("저장했습니다.");
        onAfterMutation?.();
        window.setTimeout(() => setSoundMsg(null), 2800);
      } catch {
        setSoundError("network_error");
      } finally {
        setSoundSaving(false);
      }
    },
    [apiPath, onAfterMutation]
  );

  const loadSound = useCallback(async () => {
    setSoundLoading(true);
    setSoundError(null);
    try {
      const res = await fetch(apiPath, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setSoundError("관리자 권한이 없습니다.");
        return;
      }
      if (!json?.ok) {
        setSoundError(typeof json?.error === "string" ? json.error : "load_failed");
        return;
      }
      const url = typeof json.url === "string" ? json.url : "";
      const fromDb = json.from_db === true;
      setSoundFromDb(fromDb);
      const sel = storeDeliverySoundSelectIdFromUrl(url, fromDb);
      if (sel === "") {
        setSoundSelect("");
        setSoundLegacyUrl(url.trim() || null);
      } else {
        setSoundSelect(sel);
        setSoundLegacyUrl(null);
      }
    } catch {
      setSoundError("network_error");
    } finally {
      setSoundLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    void loadSound();
  }, [loadSound]);

  return (
    <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
      <h2 className="text-[15px] font-semibold text-sam-fg">{title}</h2>
      <div className="mt-1 text-[12px] text-sam-muted">{description}</div>
      <p className="mt-1 text-[11px] text-sam-meta">
        <code className="rounded bg-sam-surface-muted px-1">{codeKey}</code>
      </p>
      {soundLegacyUrl ? (
        <p className="mt-2 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
          DB에 프리셋에 없는 URL이 있습니다. 아래에서 항목을 고르면 그 값으로 덮어씁니다.
        </p>
      ) : null}
      {soundError ? <p className="mt-2 text-[13px] text-red-700">{soundError}</p> : null}
      {soundMsg ? <p className="mt-2 text-[13px] text-green-800">{soundMsg}</p> : null}
      {soundLoading ? (
        <p className="mt-3 text-[13px] text-sam-muted">알림음 설정 불러오는 중…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-[12px] font-medium text-sam-fg">
            알림 종류
            <select
              className="mt-1.5 block w-full max-w-md cursor-pointer rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-[16px] text-sam-fg shadow-sm focus:border-signature focus:outline-none focus:ring-1 focus:ring-signature disabled:cursor-not-allowed disabled:opacity-60"
              value={soundSelect}
              disabled={soundSaving}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "builtin" && v !== "notif") return;
                void persistSoundChoice(v);
              }}
            >
              {soundSelect === "" && (
                <option value="" disabled>
                  {soundLegacyUrl ? "▼ 프리셋에 없는 저장값 — 아래에서 선택" : "▼ 선택하세요"}
                </option>
              )}
              {STORE_DELIVERY_ALERT_SOUND_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="min-w-0 flex-1 break-all text-[11px] text-sam-muted">
              <span className={soundFromDb ? "font-medium text-signature" : "text-sam-meta"}>
                {soundFromDb ? "DB에 저장됨" : "기본 비프 (DB 없음)"}
              </span>
              {soundLegacyUrl ? (
                <>
                  {" "}
                  · 업로드·직접 URL{" "}
                  <code className="rounded bg-sam-app px-0.5">{soundLegacyUrl}</code>
                </>
              ) : soundFromDb && soundSelect === "notif" ? (
                <>
                  {" "}
                  · 프리셋 MP3{" "}
                  <code className="rounded bg-sam-app px-0.5">{STORE_DELIVERY_NOTIFICATION_MP3_PATH}</code>
                </>
              ) : !soundFromDb ? (
                <>
                  {" "}
                  · 안내용 프리셋 경로{" "}
                  <code className="rounded bg-sam-app px-0.5">{STORE_DELIVERY_NOTIFICATION_MP3_PATH}</code>
                </>
              ) : null}
            </p>
            {soundFromDb ? (
              <button
                type="button"
                disabled={soundSaving}
                onClick={() => void deleteGlobalSound()}
                className="shrink-0 rounded-ui-rect border border-red-200 bg-sam-surface px-2.5 py-1.5 text-[12px] font-medium text-red-800 disabled:opacity-50"
              >
                DB·Storage 제거
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={adminSoundFileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm"
              className="sr-only"
              onChange={uploadAdminSoundFromPc}
            />
            <button
              type="button"
              disabled={soundSaving}
              onClick={() => adminSoundFileRef.current?.click()}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-medium text-sam-fg disabled:opacity-50"
            >
              {soundSaving ? "처리 중…" : "내 PC에서 찾기 (업로드)"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={soundSaving || (soundSelect === "" && !soundLegacyUrl)}
              onClick={() => {
                if (soundSelect === "builtin") {
                  previewStoreDeliveryBuiltinSound();
                  return;
                }
                if (soundSelect === "notif") {
                  try {
                    const a = new Audio(STORE_DELIVERY_NOTIFICATION_MP3_PATH);
                    a.volume = 0.55;
                    void a.play().catch(() => {
                      window.alert("미리듣기에 실패했습니다. 파일이 있는지 확인해 주세요.");
                    });
                  } catch {
                    window.alert("미리듣기를 시작할 수 없습니다.");
                  }
                  return;
                }
                if (soundLegacyUrl) {
                  try {
                    const a = new Audio(soundLegacyUrl);
                    a.volume = 0.55;
                    void a.play().catch(() => window.alert("현재 저장된 URL 재생에 실패했습니다."));
                  } catch {
                    window.alert("미리듣기를 시작할 수 없습니다.");
                  }
                }
              }}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-medium text-sam-fg disabled:opacity-50"
            >
              미리듣기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
