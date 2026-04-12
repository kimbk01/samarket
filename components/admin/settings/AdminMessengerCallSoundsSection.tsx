"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { invalidateMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";

type Row = Record<string, unknown> | null;

function SoundFieldRow({
  label,
  enabledKey,
  urlKey,
  row,
  onPatch,
  onTest,
  onUploadFile,
}: {
  label: string;
  enabledKey: string;
  urlKey: string;
  row: Row;
  onPatch: (p: Record<string, unknown>) => void;
  onTest: (url: string) => void;
  onUploadFile?: (file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const enabled = row?.[enabledKey] !== false;
  const url = typeof row?.[urlKey] === "string" ? (row[urlKey] as string) : "";

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !onUploadFile) return;
    setUploading(true);
    void onUploadFile(f).finally(() => setUploading(false));
  };

  return (
    <div className="space-y-2 border-b border-ui-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-ui-fg">{label}</span>
        <label className="flex items-center gap-2 text-[13px] text-ui-muted">
          사용
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onPatch({ [enabledKey]: e.target.checked })}
          />
        </label>
      </div>
      <input
        type="url"
        value={url}
        placeholder="https://… (스토리지 공개 URL)"
        className="w-full rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5 text-[13px] text-ui-fg"
        onChange={(e) => onPatch({ [urlKey]: e.target.value || null })}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-ui-rect border border-ui-border px-3 py-1 text-[12px] text-ui-fg hover:bg-ui-hover active:bg-ui-hover"
          disabled={!url.trim()}
          onClick={() => onTest(url.trim())}
        >
          미리듣기
        </button>
        <button
          type="button"
          className="rounded-ui-rect border border-ui-border px-3 py-1 text-[12px] text-ui-muted hover:bg-ui-hover active:bg-ui-hover"
          onClick={() => onPatch({ [urlKey]: null, [enabledKey]: true })}
          title="URL을 비우고 이 사운드 사용을 기본(켜짐)으로 되돌립니다."
        >
          기본음으로 초기화
        </button>
        {onUploadFile ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
              className="hidden"
              onChange={onFileChange}
            />
            <button
              type="button"
              className="rounded-ui-rect border border-ui-border px-3 py-1 text-[12px] text-ui-fg hover:bg-ui-hover active:bg-ui-hover disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "업로드 중…" : "파일 업로드"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DefaultFallbackSoundField({
  row,
  onPatch,
  onUploadFile,
  onTest,
}: {
  row: Row;
  onPatch: (p: Record<string, unknown>) => void;
  onUploadFile: (file: File) => Promise<void>;
  onTest: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = typeof row?.default_fallback_sound_url === "string" ? (row.default_fallback_sound_url as string) : "";

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    void onUploadFile(f).finally(() => setUploading(false));
  };

  return (
    <div className="space-y-2 py-3">
      <label className="flex items-center justify-between gap-3 text-[14px]">
        <span>관리자 커스텀 사운드 사용</span>
        <input
          type="checkbox"
          checked={row?.use_custom_sounds !== false}
          onChange={(e) => onPatch({ use_custom_sounds: e.target.checked })}
        />
      </label>
      <p className="text-[12px] text-ui-muted">끄면 아래 기본 폴백 URL만 사용합니다(없으면 앱 기본음).</p>
      <p className="text-[13px] font-medium text-ui-fg">기본 폴백 URL</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          type="url"
          value={url}
          placeholder="선택"
          className="min-w-0 flex-1 rounded-ui-rect border border-ui-border bg-ui-surface px-2 py-1.5 text-[13px]"
          onChange={(e) => onPatch({ default_fallback_sound_url: e.target.value || null })}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-ui-rect border border-ui-border px-3 py-1.5 text-[12px] text-ui-fg hover:bg-ui-hover active:bg-ui-hover disabled:opacity-50"
            disabled={!url.trim()}
            onClick={() => onTest(url.trim())}
          >
            미리듣기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            className="rounded-ui-rect border border-ui-border px-3 py-1.5 text-[12px] text-ui-fg hover:bg-ui-hover active:bg-ui-hover disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "업로드 중…" : "파일 업로드"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminMessengerCallSoundsSection() {
  const [row, setRow] = useState<Row>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/messenger-call-sounds", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; row?: Record<string, unknown>; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "불러오지 못했습니다.");
        return;
      }
      setRow(j.row ?? null);
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchLocal = useCallback((partial: Record<string, unknown>) => {
    setRow((prev) => ({ ...(prev ?? {}), ...partial }));
  }, []);

  const uploadSoundFile = useCallback(
    async (urlKey: string, file: File) => {
      setErr(null);
      const form = new FormData();
      form.append("urlKey", urlKey);
      form.append("file", file);
      const res = await fetch("/api/admin/messenger-call-sounds/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sound_url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok || !j.sound_url) {
        setErr(j.message ?? j.error ?? "업로드에 실패했습니다.");
        return;
      }
      patchLocal({ [urlKey]: j.sound_url });
      invalidateMessengerCallSoundConfigCache();
    },
    [patchLocal]
  );

  const save = useCallback(async () => {
    if (!row) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/messenger-call-sounds", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "저장 실패");
        return;
      }
      invalidateMessengerCallSoundConfigCache();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }, [row]);

  const testPlay = useCallback((url: string) => {
    try {
      const a = new Audio(url);
      a.crossOrigin = "anonymous";
      void a.play();
    } catch {
      setErr("재생에 실패했습니다. URL을 확인해 주세요.");
    }
  }, []);

  if (loading) {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-4 text-[13px] text-ui-muted">통화 사운드 설정 불러오는 중…</div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-[16px] font-semibold text-ui-fg">Messenger Call Sounds</h2>
      <p className="text-[13px] text-ui-muted">
        음성/영상 수신 벨·발신 링백과 부재·종료 사운드입니다. URL 직접 입력, 파일 업로드(store-order-sounds 버킷), 또는 경로를 비워 두면 클라이언트
        기본 톤으로 폴백합니다.
      </p>
      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>
      ) : null}

      <AdminCard title="Voice Call Sounds">
        <SoundFieldRow
          label="수신 벨"
          enabledKey="voice_incoming_enabled"
          urlKey="voice_incoming_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("voice_incoming_sound_url", file)}
        />
        <SoundFieldRow
          label="발신 링백"
          enabledKey="voice_outgoing_ringback_enabled"
          urlKey="voice_outgoing_ringback_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("voice_outgoing_ringback_url", file)}
        />
      </AdminCard>

      <AdminCard title="Video Call Sounds">
        <SoundFieldRow
          label="수신 벨"
          enabledKey="video_incoming_enabled"
          urlKey="video_incoming_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("video_incoming_sound_url", file)}
        />
        <SoundFieldRow
          label="발신 링백"
          enabledKey="video_outgoing_ringback_enabled"
          urlKey="video_outgoing_ringback_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("video_outgoing_ringback_url", file)}
        />
      </AdminCard>

      <AdminCard title="Common Call Sounds">
        <SoundFieldRow
          label="부재 알림"
          enabledKey="missed_notification_enabled"
          urlKey="missed_notification_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("missed_notification_sound_url", file)}
        />
        <SoundFieldRow
          label="통화 종료"
          enabledKey="call_end_enabled"
          urlKey="call_end_sound_url"
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("call_end_sound_url", file)}
        />
        <DefaultFallbackSoundField
          row={row}
          onPatch={patchLocal}
          onTest={testPlay}
          onUploadFile={(file) => uploadSoundFile("default_fallback_sound_url", file)}
        />
      </AdminCard>

      <button
        type="button"
        disabled={saving || !row}
        className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        onClick={() => void save()}
      >
        {saving ? "저장 중…" : "통화 사운드 저장"}
      </button>
    </div>
  );
}
