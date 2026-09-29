"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { IntroMediaPicker } from "@/components/admin/intro/media/IntroMediaPicker";
import type { IntroMediaPickerResult } from "@/components/admin/intro/media/types";
import type {
  FrameV1,
  IntroDocumentV1,
  LayerMotionV1,
  LayerV1,
  PretendardWeightV1,
  SceneBackgroundV1,
  SceneV1,
  TransitionV1,
} from "@/lib/intro/contracts/document";
import {
  PRETENDARD_WEIGHT_TO_ASSET,
  motionSummaryKo,
  resolveLayerMotion,
} from "@/lib/intro/contracts/document";
import {
  fitContentRegion,
  mapFrameToDevice,
} from "@/lib/intro/geometry/responsive-mapping";
import { computeIntroDurationMs } from "@/lib/intro/timeline/compute-duration";
import {
  addLayer,
  addSceneFromCandidate,
  clampNormalizedFrame,
  clearSceneBackgroundImage,
  clearTabletOverride,
  deleteLayer,
  deleteScene,
  moveLayerZ,
  reorderScenes,
  setDocumentTitle,
  setLayerFrame,
  setLayerMediaRef,
  setLayerMotion,
  setLayerVisibility,
  setSceneBackground,
  setSceneBackgroundImage,
  setSceneDuration,
  setSceneTransition,
  updateLayer,
} from "@/lib/intro/document/mutations";
import {
  emptySceneBannerText,
  findBackgroundImageLayer,
  formatSecondsKo,
  formatTotalIntroSeconds,
  isEmptyScene,
  listEmptySceneWarnings,
} from "@/lib/intro/document/scene-truth";
import {
  ElementMotionControls,
  elementTypeLabelKo,
} from "@/components/admin/intro/ElementMotionControls";
import { SystemStartEditor } from "@/components/admin/intro/SystemStartEditor";
import {
  getIntroDocumentApi,
  getIntroDocumentAuthorityApi,
  publishIntroDocumentApi,
  saveIntroDocumentApi,
  setIntroLiveApi,
  type IntroDocumentAuthorityDto,
  type IntroPublishedRevisionSummaryDto,
} from "./introDocumentApi";
import {
  humanDraftVersionLabel,
  humanLiveVersionLabel,
  humanPublishedVersionLabel,
} from "@/lib/intro/document/authority-labels";
import {
  buildDraftConflictInfo,
  draftVersionAfterAuthorityReload,
  isDraftConflictBlockingWrites,
  isDraftVersionConflictStatus,
  type DraftConflictInfo,
} from "@/lib/intro/document/draft-conflict";

type StudioMode = "system" | "intro";

type DevicePreview = "PHONE" | "TABLET";
type SaveUi =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";
type PublishUi =
  | "idle"
  | "confirm"
  | "publishing"
  | "success"
  | "error";
type SetLiveUi =
  | "idle"
  | "confirm"
  | "setting"
  | "success"
  | "error";

type PickerState =
  | null
  | {
      mode: "add";
      type: "IMAGE" | "LOGO";
      sceneId: string;
    }
  | {
      mode: "replace";
      type: "IMAGE" | "LOGO";
      sceneId: string;
      layerId: string;
      previousMediaRefId: string;
    }
  | {
      mode: "background";
      sceneId: string;
      previousMediaRefId: string | null;
    };

function colorCss(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "r" in (c as object)) {
    const o = c as { r: number; g: number; b: number; a: number };
    return `rgba(${Math.round(o.r * 255)},${Math.round(o.g * 255)},${Math.round(o.b * 255)},${o.a})`;
  }
  return "#000";
}

function sceneBgCss(scene: SceneV1): string {
  return colorCss(scene.background.color);
}

export function IntroStudio({
  documentId,
  ko,
}: {
  documentId: string;
  ko: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [document, setDocument] = useState<IntroDocumentV1 | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [devicePreview, setDevicePreview] = useState<DevicePreview>("PHONE");
  const [tabletEdit, setTabletEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveUi, setSaveUi] = useState<SaveUi>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  /** Open only on 409 — local edits kept until operator reloads server Draft. */
  const [draftConflict, setDraftConflict] = useState<DraftConflictInfo | null>(
    null,
  );
  const [conflictReloading, setConflictReloading] = useState(false);
  const [publishUi, setPublishUi] = useState<PublishUi>("idle");
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  /** Authoritative from server — never session-hardcoded revision. */
  const [revisionAuthority, setRevisionAuthority] =
    useState<IntroDocumentAuthorityDto | null>(null);
  const [authorityLoading, setAuthorityLoading] = useState(false);
  const [showAuthorityDetail, setShowAuthorityDetail] = useState(false);
  const [setLiveUi, setSetLiveUi] = useState<SetLiveUi>("idle");
  const [setLiveMessage, setSetLiveMessage] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [confirmDeleteScene, setConfirmDeleteScene] = useState<string | null>(
    null,
  );
  const [confirmDeleteLayer, setConfirmDeleteLayer] = useState<{
    sceneId: string;
    layerId: string;
  } | null>(null);
  const [newSceneOpen, setNewSceneOpen] = useState(false);
  const [newSceneDraft, setNewSceneDraft] = useState<{
    name: string;
    durationSec: string;
    bgMode: "color" | "image";
    color: string;
    transitionType: "CUT" | "FADE" | "SLIDE";
  }>({
    name: "",
    durationSec: "2.5",
    bgMode: "color",
    color: "#111111",
    transitionType: "CUT",
  });
  const [pendingMediaConfirm, setPendingMediaConfirm] = useState<{
    picker: NonNullable<PickerState>;
    result: IntroMediaPickerResult;
  } | null>(null);
  const [publishEmptyAck, setPublishEmptyAck] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"scene" | "element">(
    "scene",
  );
  const [studioMode, setStudioMode] = useState<StudioMode>("intro");

  // Always-latest refs: picker confirm / pointer frame writes must NOT close over a
  // stale document (or a prior picker mode). Stale add/LOGO confirm was observed to
  // wipe later TEXT/CTA layers and leave LOGO selected after IMAGE replace.
  const documentRef = useRef<IntroDocumentV1 | null>(null);
  const pickerRef = useRef<PickerState>(null);
  documentRef.current = document;
  pickerRef.current = picker;

  const applyLocal = useCallback((next: IntroDocumentV1) => {
    documentRef.current = next;
    setDocument(next);
    setDirty(true);
    setSaveUi((prev) => (prev === "conflict" ? "conflict" : "dirty"));
    setSaveMessage((prev) => {
      if (!prev) return null;
      if (prev.includes("저장되지 않았습니다") || prev.includes("Not saved")) {
        return prev;
      }
      return null;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await getIntroDocumentApi(documentId);
    if (!res.ok || !res.record) {
      setLoadError(res.error ?? "load_failed");
      setDocument(null);
      setLoading(false);
      return;
    }
    setDocument(res.record.document);
    setDraftVersion(res.record.draftVersion);
    setSelectedSceneId(res.record.document.scenes[0]?.sceneId ?? null);
    setSelectedLayerId(null);
    setDirty(false);
    setDraftConflict(null);
    setSaveUi("idle");
    setSaveMessage(null);
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const refreshAuthority = useCallback(async () => {
    setAuthorityLoading(true);
    const res = await getIntroDocumentAuthorityApi(documentId);
    setAuthorityLoading(false);
    if (!res.ok || !res.authority) return null;
    setRevisionAuthority(res.authority);
    return res.authority;
  }, [documentId]);

  useEffect(() => {
    void refreshAuthority();
  }, [refreshAuthority]);

  const selectedScene = useMemo(() => {
    if (!document || !selectedSceneId) return null;
    return document.scenes.find((s) => s.sceneId === selectedSceneId) ?? null;
  }, [document, selectedSceneId]);

  const selectedLayer = useMemo(() => {
    if (!selectedScene || !selectedLayerId) return null;
    return (
      selectedScene.layers.find((l) => l.layerId === selectedLayerId) ?? null
    );
  }, [selectedScene, selectedLayerId]);

  const totalMs = useMemo(
    () => (document ? computeIntroDurationMs(document) : 0),
    [document],
  );

  const emptyWarnings = useMemo(
    () => (document ? listEmptySceneWarnings(document, ko) : []),
    [document, ko],
  );

  const firstSceneId = document?.scenes[0]?.sceneId ?? null;
  const conflictBlocksWrites = isDraftConflictBlockingWrites(
    saveUi,
    draftConflict,
  );

  const onSave = async () => {
    if (!document || saveUi === "saving") return;
    // Never retry blindly with stale version while conflict is open.
    if (conflictBlocksWrites) {
      setSaveMessage(
        ko
          ? "버전 충돌 상태입니다. 서버 최신 초안을 불러온 뒤 다시 저장하세요."
          : "Version conflict open. Reload the server draft before saving.",
      );
      return;
    }
    const expected = draftVersion;
    setSaveUi("saving");
    setSaveMessage(ko ? "저장 중…" : "Saving…");
    const res = await saveIntroDocumentApi({
      documentId,
      expectedDraftVersion: expected,
      document,
    });
    if (isDraftVersionConflictStatus(res.status)) {
      // Keep local edits. Do not mark saved. Do not overwrite server.
      let serverVersion = res.currentDraftVersion;
      const authority = await getIntroDocumentApi(documentId);
      if (authority.ok && authority.record) {
        serverVersion = authority.record.draftVersion;
      }
      const info = buildDraftConflictInfo({
        localExpectedDraftVersion: expected,
        serverDraftVersionFrom409: serverVersion,
      });
      setDraftConflict(info);
      setDirty(true);
      setSaveUi("conflict");
      setSaveMessage(
        ko
          ? `저장되지 않았습니다. 서버 초안이 더 최신입니다(서버 v${serverVersion ?? "?"} · 로컬 기대 v${expected}). 로컬 편집은 유지됩니다.`
          : `Not saved. Server draft is newer (server v${serverVersion ?? "?"} · local expected v${expected}). Local edits kept.`,
      );
      return;
    }
    if (!res.ok || !res.record) {
      setSaveUi("error");
      setSaveMessage(
        ko
          ? `저장 실패: ${res.error ?? "error"}`
          : `Save failed: ${res.error ?? "error"}`,
      );
      return;
    }
    setDocument(res.record.document);
    setDraftVersion(res.record.draftVersion);
    setDirty(false);
    setDraftConflict(null);
    setSaveUi("saved");
    setSaveMessage(ko ? "초안 저장 완료" : "Draft saved");
    setPublishMessage(null);
  };

  /** Operator recovery: discard local conflict edits and adopt server Draft. */
  const onReloadAuthoritativeDraft = async () => {
    if (conflictReloading) return;
    setConflictReloading(true);
    setSaveMessage(
      ko ? "서버 최신 초안 불러오는 중…" : "Loading authoritative draft…",
    );
    const res = await getIntroDocumentApi(documentId);
    if (!res.ok || !res.record) {
      setConflictReloading(false);
      setSaveMessage(
        ko
          ? `서버 초안 불러오기 실패: ${res.error ?? "error"}`
          : `Failed to reload server draft: ${res.error ?? "error"}`,
      );
      return;
    }
    const nextVersion = draftVersionAfterAuthorityReload(
      res.record.draftVersion,
    );
    setDocument(res.record.document);
    setDraftVersion(nextVersion);
    setSelectedSceneId(res.record.document.scenes[0]?.sceneId ?? null);
    setSelectedLayerId(null);
    setDirty(false);
    setDraftConflict(null);
    setSaveUi("idle");
    setSaveMessage(
      ko
        ? `서버 초안 v${nextVersion} 불러옴. 이전 로컬 미저장 편집은 버려졌습니다.`
        : `Loaded server draft v${nextVersion}. Prior unsaved local edits discarded.`,
    );
    setConflictReloading(false);
    await refreshAuthority();
  };

  const serviceApplyCandidate: IntroPublishedRevisionSummaryDto | null =
    revisionAuthority?.latestPublished ?? null;
  const liveRevisionSummary = revisionAuthority?.liveRevision ?? null;
  const currentLiveKind = revisionAuthority?.live.liveKind ?? null;
  const currentLiveRevisionId =
    revisionAuthority?.live.publishedRevisionId ?? null;

  const onPublishConfirmed = async () => {
    if (!document || publishUi === "publishing" || dirty || conflictBlocksWrites)
      return;
    setPublishUi("publishing");
    setPublishMessage(ko ? "게시 중…" : "Publishing…");
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `publish-${documentId}-${draftVersion}-${Date.now()}`;
    const res = await publishIntroDocumentApi({
      documentId,
      sourceDraftVersion: draftVersion,
      idempotencyKey,
    });
    if (!res.ok || !res.result) {
      setPublishUi("error");
      setPublishMessage(
        ko
          ? `게시 실패: ${res.message ?? res.error ?? "error"}`
          : `Publish failed: ${res.message ?? res.error ?? "error"}`,
      );
      return;
    }
    setPublishUi("success");
    setPublishMessage(
      ko
        ? `불변 게시 버전 생성됨 — 아직 서비스에는 적용되지 않습니다. Pack ${res.result.packId.slice(0, 8)}…`
        : `Immutable revision created — not yet applied to service. Pack ${res.result.packId.slice(0, 8)}…`,
    );
    // Refresh authoritative revision state from server — do not rely solely on local assignment.
    await refreshAuthority();
  };

  const onSetLiveConfirmed = async () => {
    if (
      !serviceApplyCandidate ||
      setLiveUi === "setting" ||
      conflictBlocksWrites ||
      dirty
    )
      return;
    const targetRevisionId = serviceApplyCandidate.publishedRevisionId;
    setSetLiveUi("setting");
    setSetLiveMessage(ko ? "서비스에 적용 중…" : "Applying to service…");

    // Re-fetch authority immediately before apply — stale session cannot override server.
    const fresh = await refreshAuthority();
    if (!fresh?.latestPublished) {
      setSetLiveUi("error");
      setSetLiveMessage(
        ko
          ? "적용할 게시 버전을 서버에서 확인할 수 없습니다."
          : "Could not confirm published candidate from server.",
      );
      return;
    }
    if (fresh.latestPublished.publishedRevisionId !== targetRevisionId) {
      setSetLiveUi("error");
      setSetLiveMessage(
        ko
          ? "게시 버전이 변경되었습니다. 확인 후 다시 적용하세요."
          : "Published candidate changed. Re-confirm and apply again.",
      );
      return;
    }

    const res = await setIntroLiveApi({
      publishedRevisionId: targetRevisionId,
      documentId,
      expectedLiveKind: fresh.live.liveKind,
      expectedPublishedRevisionId: fresh.live.publishedRevisionId,
    });
    if (!res.ok || !res.live) {
      setSetLiveUi("error");
      setSetLiveMessage(
        ko
          ? `앱 적용 실패: ${res.message ?? res.error ?? "error"}`
          : `Apply to service failed: ${res.message ?? res.error ?? "error"}`,
      );
      return;
    }

    // HTTP 200 alone is insufficient — refetch Live authority.
    const after = await refreshAuthority();
    if (
      !after ||
      after.live.publishedRevisionId !== targetRevisionId
    ) {
      setSetLiveUi("error");
      setSetLiveMessage(
        ko
          ? "적용 응답은 받았으나 Live 재조회가 요청 revision과 일치하지 않습니다."
          : "Apply returned OK but Live refetch does not match requested revision.",
      );
      return;
    }

    setSetLiveUi("success");
    setSetLiveMessage(
      ko
        ? "서비스 버전 변경 완료 — 기기 반영: 동기화 확인 필요."
        : "Service version updated — device sync still required.",
    );
  };

  const openAddMediaLayer = (type: "IMAGE" | "LOGO") => {
    if (!selectedSceneId) return;
    setPicker({ mode: "add", type, sceneId: selectedSceneId });
  };

  const openReplaceMedia = () => {
    if (!selectedScene || !selectedLayer) return;
    if (selectedLayer.type !== "IMAGE" && selectedLayer.type !== "LOGO") return;
    setPicker({
      mode: "replace",
      type: selectedLayer.type,
      sceneId: selectedScene.sceneId,
      layerId: selectedLayer.layerId,
      previousMediaRefId: selectedLayer.mediaRefId,
    });
  };

  const onPickerConfirm = (result: IntroMediaPickerResult) => {
    const doc = documentRef.current;
    const activePicker = pickerRef.current;
    if (!doc || !activePicker) return;
    // Replace / background: candidate → confirmation before mutation.
    if (activePicker.mode === "replace" || activePicker.mode === "background") {
      setPendingMediaConfirm({ picker: activePicker, result });
      setPicker(null);
      pickerRef.current = null;
      return;
    }
    // Add IMAGE/LOGO: confirm in picker already selected READY media — mutate once.
    const { document: next, layerId } = addLayer(
      doc,
      activePicker.sceneId,
      activePicker.type,
      { mediaRefId: result.mediaRefId },
    );
    applyLocal(next);
    setSelectedLayerId(layerId);
    setPicker(null);
    pickerRef.current = null;
  };

  const applyPendingMediaConfirm = () => {
    const doc = documentRef.current;
    const pending = pendingMediaConfirm;
    if (!doc || !pending) return;
    const { picker: activePicker, result } = pending;
    if (activePicker.mode === "background") {
      const { document: next, layerId } = setSceneBackgroundImage(
        doc,
        activePicker.sceneId,
        result.mediaRefId,
      );
      applyLocal(next);
      setSelectedLayerId(layerId);
    } else if (activePicker.mode === "replace") {
      applyLocal(
        setLayerMediaRef(
          doc,
          activePicker.sceneId,
          activePicker.layerId,
          result.mediaRefId,
        ),
      );
    }
    setPendingMediaConfirm(null);
  };

  const cancelPendingMediaConfirm = () => {
    // Cancel: old mediaRef remains authoritative (never mutated).
    setPendingMediaConfirm(null);
  };

  const onPickerCancel = () => {
    // Cancel: no ghost layer; replace keeps previous mediaRefId (never touched).
    setPicker(null);
    pickerRef.current = null;
  };

  if (loading) {
    return (
      <p className="p-6 text-sm text-sam-muted" data-intro-studio-loading="1">
        {ko ? "스튜디오 불러오는 중…" : "Loading Studio…"}
      </p>
    );
  }

  if (loadError || !document) {
    return (
      <div className="space-y-3 p-6" data-intro-studio-error="1">
        <p className="text-sm text-red-600">{loadError ?? "not_found"}</p>
        <Link href="/admin/intro" className="text-sm underline">
          {ko ? "목록으로" : "Back to list"}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col"
      data-intro-studio="1"
      data-document-id={documentId}
      data-draft-version={draftVersion}
      data-dirty={dirty ? "1" : "0"}
      data-draft-conflict={draftConflict ? "1" : "0"}
      data-studio-mode={studioMode}
    >
      <div
        className="flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-4 py-2"
        data-intro-mode-switch="1"
      >
        <span className="mr-2 text-sm font-semibold text-sam-fg">
          {ko ? "인트로 관리" : "Intro management"}
        </span>
        <button
          type="button"
          className={`rounded-ui-rect px-3 py-1.5 text-sm font-medium ${
            studioMode === "system"
              ? "bg-sam-fg text-sam-bg"
              : "border border-sam-border text-sam-fg hover:bg-sam-bg"
          }`}
          onClick={() => setStudioMode("system")}
          data-intro-mode-system="1"
          aria-pressed={studioMode === "system"}
        >
          {ko ? "시스템 시작 화면" : "System start"}
        </button>
        <button
          type="button"
          className={`rounded-ui-rect px-3 py-1.5 text-sm font-medium ${
            studioMode === "intro"
              ? "bg-sam-fg text-sam-bg"
              : "border border-sam-border text-sam-fg hover:bg-sam-bg"
          }`}
          onClick={() => setStudioMode("intro")}
          data-intro-mode-intro="1"
          aria-pressed={studioMode === "intro"}
        >
          {ko ? "디바이 인트로" : "Dibay Intro"}
        </button>
        <span
          className="ml-auto text-[11px] text-sam-muted"
          data-intro-compact-sequence="1"
        >
          {ko
            ? "시스템 시작 화면 → 디바이 인트로 → 홈"
            : "System start → Dibay Intro → Home"}
        </span>
      </div>

      {studioMode === "system" ? <SystemStartEditor ko={ko} /> : null}

      {studioMode === "intro" ? (
      <>
      <header className="flex flex-wrap items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-3">
        <Link
          href="/admin/intro"
          className="text-xs text-sam-muted hover:text-sam-fg"
        >
          ← {ko ? "인트로 목록" : "Intro list"}
        </Link>
        <span className="text-sm font-semibold text-sam-fg">
          {ko ? "디바이 인트로" : "Dibay Intro"}
        </span>
        <input
          className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-bg px-2 py-1.5 text-sm text-sam-fg"
          value={document.title}
          onChange={(e) => applyLocal(setDocumentTitle(document, e.target.value))}
          data-intro-studio-title="1"
        />
        <span
          className="rounded-ui-rect bg-sam-bg px-2 py-1 text-sm font-semibold text-sam-fg"
          data-intro-total-duration="1"
          data-intro-total-ms={totalMs}
        >
          {ko ? "총 시간:" : "Total:"}{" "}
          {formatTotalIntroSeconds(totalMs)}
        </span>
        <AdminActionButton
          variant="primary"
          disabled={
            !dirty ||
            saveUi === "saving" ||
            conflictBlocksWrites ||
            conflictReloading
          }
          onClick={() => void onSave()}
          data-intro-save="1"
        >
          {saveUi === "saving"
            ? ko
              ? "저장 중…"
              : "Saving…"
            : ko
              ? "저장"
              : "Save"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={
            dirty ||
            conflictBlocksWrites ||
            publishUi === "publishing" ||
            publishUi === "confirm" ||
            !document
          }
          onClick={() => {
            setPublishEmptyAck(false);
            setPublishUi("confirm");
            setPublishMessage(null);
          }}
          data-intro-publish="1"
        >
          {publishUi === "publishing"
            ? ko
              ? "게시 중…"
              : "Publishing…"
            : ko
              ? "게시"
              : "Publish"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={
            !serviceApplyCandidate ||
            setLiveUi === "setting" ||
            setLiveUi === "confirm" ||
            dirty ||
            conflictBlocksWrites ||
            authorityLoading
          }
          onClick={() => {
            setSetLiveUi("confirm");
            setSetLiveMessage(null);
          }}
          data-intro-set-live="1"
          data-intro-set-live-candidate={
            serviceApplyCandidate?.publishedRevisionId ?? undefined
          }
        >
          {setLiveUi === "setting"
            ? ko
              ? "적용 중…"
              : "Setting…"
            : ko
              ? "서비스에 적용"
              : "Apply to service"}
        </AdminActionButton>
        <span
          className="text-xs text-sam-muted"
          data-intro-save-state={saveUi}
        >
          {saveMessage ??
            (dirty
              ? ko
                ? "저장되지 않음"
                : "Unsaved"
              : ko
                ? "초안 저장됨"
                : "Draft saved")}
        </span>
        {publishMessage ? (
          <span
            className="text-xs text-sam-muted"
            data-intro-publish-state={publishUi}
            data-intro-publish-pack-id={
              serviceApplyCandidate?.packId ?? undefined
            }
          >
            {publishMessage}
          </span>
        ) : null}
        {setLiveMessage ? (
          <span
            className="text-xs text-sam-muted"
            data-intro-set-live-state={setLiveUi}
          >
            {setLiveMessage}
          </span>
        ) : null}
      </header>

      {saveUi === "conflict" && draftConflict ? (
        <div
          className="border-b border-amber-600/50 bg-amber-500/15 px-4 py-3 text-sm text-sam-fg"
          data-intro-draft-conflict="1"
          role="alert"
        >
          <p className="font-semibold" data-intro-draft-conflict-title="1">
            {ko ? "초안 버전 충돌" : "Draft version conflict"}
          </p>
          <ul className="mt-2 list-none space-y-1 text-xs text-sam-muted">
            <li data-intro-draft-conflict-local="1">
              {ko ? "로컬 기대 버전" : "Local expected"}: v
              {draftConflict.localExpectedDraftVersion}
            </li>
            <li data-intro-draft-conflict-server="1">
              {ko ? "서버 최신 버전" : "Server draft"}: v
              {draftConflict.serverDraftVersion}
            </li>
            <li>
              {ko
                ? "실패한 저장은 DB를 바꾸지 않았습니다. 로컬 미저장 편집은 아직 화면에 있습니다."
                : "The failed Save did not mutate the database. Unsaved local edits are still on screen."}
            </li>
            <li>
              {ko
                ? "게시·서비스 적용은 충돌이 해소될 때까지 차단됩니다."
                : "Publish and Service Apply stay blocked until conflict is resolved."}
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionButton
              variant="primary"
              disabled={conflictReloading}
              onClick={() => void onReloadAuthoritativeDraft()}
              data-intro-draft-conflict-reload="1"
            >
              {conflictReloading
                ? ko
                  ? "불러오는 중…"
                  : "Loading…"
                : ko
                  ? "서버 최신 초안 불러오기"
                  : "Reload server draft"}
            </AdminActionButton>
          </div>
          <p className="mt-2 text-[11px] text-sam-muted">
            {ko
              ? "불러오면 현재 로컬 미저장 편집은 버려지고, 다음 저장은 서버 버전을 기준으로 합니다."
              : "Reload discards unsaved local edits and adopts the server draftVersion for the next Save."}
          </p>
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-4 border-b border-sam-border bg-sam-bg px-4 py-1.5 text-[11px]"
        data-intro-status-panel="1"
      >
        <span data-intro-status-draft="1">
          <strong className="text-sam-fg">{ko ? "초안" : "Draft"}</strong>
          {": "}
          <span className="text-sam-muted">
            {humanDraftVersionLabel(draftVersion, dirty, ko ? "ko" : "en")}
          </span>
        </span>
        <span
          data-intro-status-publish="1"
          data-intro-published-revision={
            serviceApplyCandidate?.publishedRevisionId ?? undefined
          }
        >
          <strong className="text-sam-fg">
            {ko ? "게시 버전" : "Published"}
          </strong>
          {": "}
          <span className="text-sam-muted">
            {serviceApplyCandidate
              ? humanPublishedVersionLabel(
                  serviceApplyCandidate,
                  ko ? "ko" : "en",
                )
              : ko
                ? "없음"
                : "None"}
          </span>
        </span>
        <span
          data-intro-status-service="1"
          data-intro-live-kind={currentLiveKind ?? undefined}
          data-intro-live-revision={currentLiveRevisionId ?? undefined}
        >
          <strong className="text-sam-fg">
            {ko ? "서비스 버전" : "Service"}
          </strong>
          {": "}
          <span className="text-sam-muted">
            {humanLiveVersionLabel(
              liveRevisionSummary,
              currentLiveKind ?? "NEVER_CONFIGURED",
              ko ? "ko" : "en",
            )}
            {revisionAuthority &&
            currentLiveKind === "COMMITTED_LIVE" &&
            !revisionAuthority.liveBelongsToDocument
              ? ko
                ? " (다른 문서)"
                : " (other document)"
              : ""}
          </span>
        </span>
        <button
          type="button"
          className="text-[11px] text-sam-muted underline"
          data-intro-authority-detail-toggle="1"
          onClick={() => setShowAuthorityDetail((v) => !v)}
        >
          {ko ? "상세 정보" : "Details"}
        </button>
        <span data-intro-status-device="1">
          <strong className="text-sam-fg">{ko ? "기기" : "Device"}</strong>
          {": "}
          <span className="text-sam-muted">
            {ko ? "동기화 후 · 다음 실행" : "After sync · next launch"}
          </span>
        </span>
      </div>
      {showAuthorityDetail ? (
        <div
          className="border-b border-sam-border bg-sam-bg px-4 py-2 font-mono text-[10px] text-sam-muted"
          data-intro-authority-detail="1"
        >
          <div>
            draftVersion={draftVersion}
            {dirty ? " (dirty)" : ""}
          </div>
          <div>
            publishedRevisionId=
            {serviceApplyCandidate?.publishedRevisionId ?? "null"}
          </div>
          <div>
            liveRevisionId={currentLiveRevisionId ?? "null"} packId=
            {revisionAuthority?.live.packId ?? "null"}
          </div>
        </div>
      ) : null}

      {publishUi === "confirm" ? (
        <div
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-sam-fg"
          data-intro-publish-confirm="1"
          role="dialog"
          aria-modal="true"
        >
          <p className="font-semibold">
            {ko ? "인트로를 게시하시겠습니까?" : "Publish this intro?"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sam-muted">
            <li>
              {ko
                ? `장면: ${document.scenes.length}개`
                : `Scenes: ${document.scenes.length}`}
            </li>
            <li>
              {ko
                ? `총 인트로 시간: ${formatTotalIntroSeconds(totalMs)}`
                : `Total intro: ${formatTotalIntroSeconds(totalMs)}`}
            </li>
            <li>
              {ko
                ? "이 작업은 새 게시 버전을 만듭니다."
                : "Creates a new published revision."}
            </li>
            <li>
              {ko
                ? "현재 서비스에는 아직 적용되지 않습니다."
                : "Not yet applied to the current service."}
            </li>
          </ul>          {emptyWarnings.length > 0 ? (
            <div
              className="mt-3 rounded-ui-rect border border-amber-600/50 bg-amber-600/10 p-3"
              data-intro-publish-empty-warning="1"
            >
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {ko
                  ? "빈 장면이 포함되어 있습니다."
                  : "Empty scenes are included."}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {emptyWarnings.map((w) => (
                  <li key={w.sceneId} data-intro-empty-warn-scene={w.sceneId}>
                    {ko
                      ? `Scene ${w.sceneIndex}는 약 ${formatSecondsKo(w.durationMs)} 동안 배경만 표시됩니다. (${w.backgroundLabel})`
                      : `Scene ${w.sceneIndex} shows background only for about ${formatSecondsKo(w.durationMs)}. (${w.backgroundLabel})`}
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={publishEmptyAck}
                  onChange={(e) => setPublishEmptyAck(e.target.checked)}
                  data-intro-publish-empty-ack="1"
                  className="mt-0.5"
                />
                <span>
                  {ko
                    ? "빈 장면이 실제 재생 시간에 포함되는 것을 확인했습니다."
                    : "I understand empty scenes play for their authored duration."}
                </span>
              </label>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionButton
              variant="primary"
              disabled={emptyWarnings.length > 0 && !publishEmptyAck}
              onClick={() => void onPublishConfirmed()}
              data-intro-publish-confirm-yes="1"
            >
              {ko ? "게시" : "Publish"}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              onClick={() => {
                setPublishUi("idle");
                setPublishEmptyAck(false);
              }}
              data-intro-publish-confirm-no="1"
            >
              {ko ? "취소" : "Cancel"}
            </AdminActionButton>
          </div>
        </div>
      ) : null}

      {setLiveUi === "confirm" ? (
        <div
          className="border-b border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sam-fg"
          data-intro-set-live-confirm="1"
          role="dialog"
          aria-modal="true"
        >
          <p className="font-semibold">
            {ko
              ? "이 게시 버전을 서비스에 적용하시겠습니까?"
              : "Apply this published version to service?"}
          </p>
          <ul className="mt-2 list-none space-y-1 text-xs text-sam-muted">
            <li data-intro-set-live-current="1">
              <strong className="text-sam-fg">
                {ko ? "현재 서비스 버전" : "Current service"}
              </strong>
              {": "}
              {humanLiveVersionLabel(
                liveRevisionSummary,
                currentLiveKind ?? "NEVER_CONFIGURED",
                ko ? "ko" : "en",
              )}
            </li>
            <li data-intro-set-live-target="1">
              <strong className="text-sam-fg">
                {ko ? "적용할 게시 버전" : "Apply published"}
              </strong>
              {": "}
              {serviceApplyCandidate
                ? humanPublishedVersionLabel(
                    serviceApplyCandidate,
                    ko ? "ko" : "en",
                  )
                : ko
                  ? "없음"
                  : "None"}
            </li>
            <li>
              {ko
                ? "반영: 기기 동기화 후 다음 적용 가능한 앱 실행부터"
                : "Applies after device sync, on the next eligible app launch."}
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionButton
              variant="secondary"
              onClick={() => setSetLiveUi("idle")}
              data-intro-set-live-confirm-no="1"
            >
              {ko ? "취소" : "Cancel"}
            </AdminActionButton>
            <AdminActionButton
              variant="primary"
              onClick={() => void onSetLiveConfirmed()}
              data-intro-set-live-confirm-yes="1"
            >
              {ko ? "서비스에 적용" : "Apply to service"}
            </AdminActionButton>
          </div>
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_280px]">
        {/* Scene rail */}
        <aside
          className="border-b border-sam-border p-3 lg:border-b-0 lg:border-r"
          data-intro-scene-rail="1"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
              {ko ? "장면" : "Scenes"}
            </h2>
            <AdminActionButton
              variant="secondary"
              className="!min-h-7 !px-2 !text-xs"
              onClick={() => {
                setNewSceneDraft({
                  name: ko
                    ? `장면 ${document.scenes.length + 1}`
                    : `Scene ${document.scenes.length + 1}`,
                  durationSec: "2.5",
                  bgMode: "color",
                  color: "#111111",
                  transitionType: "CUT",
                });
                setNewSceneOpen(true);
              }}
              data-intro-add-scene="1"
            >
              {ko ? "+ 장면 추가" : "+ Scene"}
            </AdminActionButton>
          </div>
          <ul className="space-y-1">
            {document.scenes.map((scene, idx) => {
              const empty = isEmptyScene(scene);
              const isFirst = idx === 0;
              return (
              <li key={scene.sceneId}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border px-2 py-2 text-left text-xs ${
                    scene.sceneId === selectedSceneId
                      ? "border-sam-fg bg-sam-bg"
                      : "border-transparent hover:bg-sam-bg"
                  }`}
                  onClick={() => {
                    setSelectedSceneId(scene.sceneId);
                    setSelectedLayerId(null);
                  }}
                  data-intro-scene={scene.sceneId}
                  data-intro-scene-index={idx}
                  data-intro-scene-empty={empty ? "1" : "0"}
                  data-intro-scene-first={isFirst ? "1" : "0"}
                >
                  <span className="font-medium text-sam-fg">
                    {ko ? `장면 ${idx + 1}` : `Scene ${idx + 1}`}
                    {scene.name ? ` · ${scene.name}` : ""}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-sam-muted">
                    {formatSecondsKo(scene.durationMs)}
                    {" · "}
                    {ko ? "이미지" : "img"}{" "}
                    {
                      scene.layers.filter(
                        (l) =>
                          l.type === "IMAGE" &&
                          !(
                            l.surface === "VIEWPORT" &&
                            l.frame.w >= 0.96 &&
                            l.frame.h >= 0.96
                          ),
                      ).length
                    }
                    {" · "}
                    {ko ? "로고" : "logo"}{" "}
                    {scene.layers.filter((l) => l.type === "LOGO").length}
                    {" · "}
                    {ko ? "텍스트" : "text"}{" "}
                    {scene.layers.filter((l) => l.type === "TEXT").length}
                    {" · "}
                    {ko ? "버튼" : "btn"}{" "}
                    {scene.layers.filter((l) => l.type === "CTA").length}
                  </span>
                  {document.scenes.length === 1 ? (
                    <span
                      className="mt-0.5 block text-[10px] text-sky-700 dark:text-sky-300"
                      data-intro-scene-dest-home="1"
                    >
                      → {ko ? "홈 화면" : "Home"}
                    </span>
                  ) : scene.transitionAfter ? (
                    <span className="mt-0.5 block text-[10px] text-sam-muted">
                      → {scene.transitionAfter.type}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[10px] text-sam-muted">
                      → {ko ? "홈 화면" : "Home"}
                    </span>
                  )}
                  {empty ? (
                    <span
                      className="mt-1 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200"
                      data-intro-empty-badge="1"
                    >
                      EMPTY SCENE
                    </span>
                  ) : null}
                </button>
                <div className="mt-0.5 flex gap-1 px-1">
                  <button
                    type="button"
                    className="text-[10px] text-sam-muted hover:text-sam-fg"
                    disabled={idx === 0}
                    onClick={() => {
                      const ids = document.scenes.map((s) => s.sceneId);
                      const t = ids[idx]!;
                      ids[idx] = ids[idx - 1]!;
                      ids[idx - 1] = t;
                      applyLocal(reorderScenes(document, ids));
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-sam-muted hover:text-sam-fg"
                    disabled={idx >= document.scenes.length - 1}
                    onClick={() => {
                      const ids = document.scenes.map((s) => s.sceneId);
                      const t = ids[idx]!;
                      ids[idx] = ids[idx + 1]!;
                      ids[idx + 1] = t;
                      applyLocal(reorderScenes(document, ids));
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-red-600"
                    onClick={() => setConfirmDeleteScene(scene.sceneId)}
                    data-intro-delete-scene={scene.sceneId}
                  >
                    {ko ? "삭제" : "Del"}
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
          {document.scenes.length === 0 ? (
            <p className="mt-3 text-xs text-sam-muted">
              {ko ? "장면을 추가하세요." : "Add a scene to begin."}
            </p>
          ) : null}
        </aside>

        {/* Canvas */}
        <main className="flex flex-col gap-3 p-4" data-intro-canvas-panel="1">
          <div className="flex flex-wrap items-center gap-2">
            <AdminActionButton
              variant={devicePreview === "PHONE" ? "primary" : "secondary"}
              className="!min-h-8 !text-xs"
              onClick={() => {
                setDevicePreview("PHONE");
                setTabletEdit(false);
              }}
              data-intro-preview-phone="1"
            >
              Phone 9:16
            </AdminActionButton>
            <AdminActionButton
              variant={devicePreview === "TABLET" ? "primary" : "secondary"}
              className="!min-h-8 !text-xs"
              onClick={() => setDevicePreview("TABLET")}
              data-intro-preview-tablet="1"
            >
              Tablet 16:10
            </AdminActionButton>
            {devicePreview === "TABLET" ? (
              <AdminActionButton
                variant={tabletEdit ? "primary" : "secondary"}
                className="!min-h-8 !text-xs"
                onClick={() => setTabletEdit((v) => !v)}
                data-intro-tablet-adjust="1"
              >
                {ko ? "태블릿 위치 조정" : "Tablet position adjust"}
              </AdminActionButton>
            ) : null}
            <span className="text-[10px] text-sam-muted">
              {ko
                ? "장면 캔버스"
                : "Scene canvas"}
            </span>
          </div>

          {selectedScene ? (
            <StudioCanvas
              scene={selectedScene}
              devicePreview={devicePreview}
              tabletEdit={tabletEdit}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              onFrameChange={(layerId, frame) => {
                const doc = documentRef.current;
                if (!doc) return;
                applyLocal(
                  setLayerFrame(doc, selectedScene.sceneId, layerId, frame, {
                    tabletLandscape: tabletEdit && devicePreview === "TABLET",
                  }),
                );
              }}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-sm text-sam-muted">
              {ko ? "장면이 없습니다" : "No scene"}
            </div>
          )}

          {selectedScene ? (
            <div className="flex flex-wrap gap-2" data-intro-layer-add="1">
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => openAddMediaLayer("IMAGE")}
                data-intro-add-image="1"
              >
                {ko ? "+ 이미지" : "+ IMAGE"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => openAddMediaLayer("LOGO")}
                data-intro-add-logo="1"
              >
                {ko ? "+ 로고" : "+ LOGO"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => {
                  const { document: next, layerId } = addLayer(
                    document,
                    selectedScene.sceneId,
                    "TEXT",
                  );
                  applyLocal(next);
                  setSelectedLayerId(layerId);
                }}
                data-intro-add-text="1"
              >
                {ko ? "+ 텍스트" : "+ TEXT"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => {
                  const { document: next, layerId } = addLayer(
                    document,
                    selectedScene.sceneId,
                    "CTA",
                  );
                  applyLocal(next);
                  setSelectedLayerId(layerId);
                }}
                data-intro-add-cta="1"
              >
                {ko ? "+ 버튼" : "+ BUTTON"}
              </AdminActionButton>
            </div>
          ) : null}
        </main>

        {/* Inspector */}
        <aside
          className="space-y-4 border-t border-sam-border p-3 lg:border-l lg:border-t-0"
          data-intro-inspector="1"
        >
          {selectedScene ? (
            <>
              {isEmptyScene(selectedScene) ? (
                <div
                  className="rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-900 dark:text-amber-100"
                  data-intro-empty-scene-banner="1"
                >
                  {emptySceneBannerText(selectedScene, ko)}
                </div>
              ) : null}
              <div
                className="mb-2 flex flex-wrap items-center gap-1 rounded-ui-rect border border-sam-border bg-sam-bg px-2 py-1.5 text-[11px] text-sam-fg"
                data-intro-single-scene-timeline="1"
                data-intro-compact-timeline="1"
              >
                {document.scenes.map((s, idx) => (
                  <span key={s.sceneId} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      className={`rounded px-1.5 py-0.5 ${
                        s.sceneId === selectedScene.sceneId
                          ? "bg-sam-fg text-sam-bg"
                          : "hover:bg-sam-surface"
                      }`}
                      onClick={() => {
                        setSelectedSceneId(s.sceneId);
                        setSelectedLayerId(null);
                      }}
                    >
                      {ko ? `장면${idx + 1}` : `S${idx + 1}`}{" "}
                      {formatSecondsKo(s.durationMs)}
                    </button>
                    {idx < document.scenes.length - 1 ? (
                      <span className="text-sam-muted">
                        {s.transitionAfter
                          ? `--${s.transitionAfter.type}${
                              s.transitionAfter.type !== "CUT"
                                ? ` ${(s.transitionAfter.durationMs / 1000).toFixed(1)}s`
                                : ""
                            }-->`
                          : "→"}
                      </span>
                    ) : (
                      <span className="text-sam-muted">
                        → {ko ? "홈" : "HOME"}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <section
                className="space-y-1"
                data-intro-element-list="1"
              >
                <h3 className="text-xs font-semibold uppercase text-sam-muted">
                  {ko ? "장면 요소" : "Scene elements"}
                </h3>
                <ul className="space-y-1">
                  {selectedScene.layers
                    .filter((l) => {
                      if (l.type !== "IMAGE") return true;
                      // Hide internal VIEWPORT background image from primary element list
                      return !(
                        l.surface === "VIEWPORT" &&
                        l.frame.w >= 0.96 &&
                        l.frame.h >= 0.96
                      );
                    })
                    .map((l) => {
                      const motion = resolveLayerMotion(l.motion);
                      let label = elementTypeLabelKo(l.type);
                      if (l.type === "TEXT") {
                        label = l.content.slice(0, 24) || label;
                      } else if (l.type === "CTA") {
                        label = l.label || label;
                      }
                      return (
                        <li key={l.layerId}>
                          <button
                            type="button"
                            className={`w-full rounded border px-2 py-1.5 text-left text-[11px] ${
                              selectedLayerId === l.layerId
                                ? "border-sam-fg bg-sam-surface"
                                : "border-sam-border hover:bg-sam-surface"
                            }`}
                            onClick={() => {
                              setSelectedLayerId(l.layerId);
                              setInspectorTab("element");
                            }}
                            data-intro-element-list-item={l.layerId}
                          >
                            <span className="font-medium text-sam-fg">
                              {elementTypeLabelKo(l.type)} · {label}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-sam-muted">
                              {motionSummaryKo(motion)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
              <SceneInspector
                ko={ko}
                scene={selectedScene}
                isFirst={selectedScene.sceneId === firstSceneId}
                isLast={
                  document.scenes[document.scenes.length - 1]?.sceneId ===
                  selectedScene.sceneId
                }
                onDuration={(ms) =>
                  applyLocal(
                    setSceneDuration(document, selectedScene.sceneId, ms),
                  )
                }
                onTransition={(t) =>
                  applyLocal(
                    setSceneTransition(document, selectedScene.sceneId, t),
                  )
                }
                onBackground={(color) =>
                  applyLocal(
                    setSceneBackground(document, selectedScene.sceneId, {
                      type: "SOLID",
                      color,
                    }),
                  )
                }
                onPickBackgroundImage={() => {
                  const existing = findBackgroundImageLayer(selectedScene);
                  setPicker({
                    mode: "background",
                    sceneId: selectedScene.sceneId,
                    previousMediaRefId:
                      existing &&
                      (existing.type === "IMAGE" || existing.type === "LOGO")
                        ? existing.mediaRefId || null
                        : null,
                  });
                }}
                onClearBackgroundImage={() =>
                  applyLocal(
                    clearSceneBackgroundImage(
                      document,
                      selectedScene.sceneId,
                    ),
                  )
                }
                hasBackgroundImage={Boolean(
                  findBackgroundImageLayer(selectedScene) &&
                    findBackgroundImageLayer(selectedScene)?.type ===
                      "IMAGE" &&
                    (
                      findBackgroundImageLayer(selectedScene) as {
                        mediaRefId?: string;
                      }
                    )?.mediaRefId,
                )}
              />
            </>
          ) : null}

          {selectedScene && selectedLayer ? (
            <LayerInspector
              ko={ko}
              layer={selectedLayer}
              sceneDurationMs={selectedScene.durationMs}
              applyLocation={
                ko
                  ? `디바이 인트로 > 장면 ${
                      document.scenes.findIndex(
                        (s) => s.sceneId === selectedScene.sceneId,
                      ) + 1
                    } > ${elementTypeLabelKo(selectedLayer.type)}`
                  : `Dibay Intro > Scene ${
                      document.scenes.findIndex(
                        (s) => s.sceneId === selectedScene.sceneId,
                      ) + 1
                    } > ${selectedLayer.type}`
              }
              tabletEdit={tabletEdit && devicePreview === "TABLET"}
              onUpdate={(patch) =>
                applyLocal(
                  updateLayer(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    patch,
                  ),
                )
              }
              onMotion={(motion) =>
                applyLocal(
                  setLayerMotion(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    motion,
                  ),
                )
              }
              onVisibility={(v) =>
                applyLocal(
                  setLayerVisibility(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    v,
                  ),
                )
              }
              onZ={(dir) =>
                applyLocal(
                  moveLayerZ(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    dir,
                  ),
                )
              }
              onDelete={() => {
                setConfirmDeleteLayer({
                  sceneId: selectedScene.sceneId,
                  layerId: selectedLayer.layerId,
                });
              }}
              onReplaceMedia={openReplaceMedia}
              onClearTablet={() =>
                applyLocal(
                  clearTabletOverride(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                  ),
                )
              }
            />
          ) : selectedScene ? null : (
            <p className="text-xs text-sam-muted">
              {ko ? "장면이 없습니다." : "No scene."}
            </p>
          )}

          <AdminActionButton
            variant="secondary"
            className="!min-h-8 !text-xs"
            disabled
            data-intro-preview-disabled="1"
          >
            {ko ? "인트로 미리보기 · 준비 중" : "Intro preview · preparing"}
          </AdminActionButton>
        </aside>
      </div>

      <IntroMediaPicker
        ko={ko}
        open={picker != null}
        context={
          picker?.mode === "background"
            ? "IMAGE"
            : picker?.type ?? "ANY"
        }
        title={
          picker?.mode === "background"
            ? ko
              ? `장면 ${
                  document.scenes.findIndex(
                    (s) => s.sceneId === picker.sceneId,
                  ) + 1
                } 배경 이미지 선택`
              : `Select scene ${
                  document.scenes.findIndex(
                    (s) => s.sceneId === picker.sceneId,
                  ) + 1
                } background image`
            : undefined
        }
        applyLocation={
          picker?.mode === "background"
            ? ko
              ? `디바이 인트로 > 장면 ${
                  document.scenes.findIndex(
                    (s) => s.sceneId === picker.sceneId,
                  ) + 1
                } > 배경`
              : `Dibay Intro > Scene ${
                  document.scenes.findIndex(
                    (s) => s.sceneId === picker.sceneId,
                  ) + 1
                } > Background`
            : picker?.mode === "replace"
              ? ko
                ? `디바이 인트로 > 장면 ${
                    document.scenes.findIndex(
                      (s) => s.sceneId === picker.sceneId,
                    ) + 1
                  } > ${elementTypeLabelKo(picker.type)}`
                : `Dibay Intro > Scene ${
                    document.scenes.findIndex(
                      (s) => s.sceneId === picker.sceneId,
                    ) + 1
                  } > ${picker.type}`
              : undefined
        }
        confirmLabel={
          picker?.mode === "background" || picker?.mode === "replace"
            ? ko
              ? "다음 (변경 확인)"
              : "Next (confirm change)"
            : undefined
        }
        initialMediaRefId={
          picker?.mode === "replace"
            ? picker.previousMediaRefId
            : picker?.mode === "background"
              ? picker.previousMediaRefId
              : null
        }
        onConfirm={onPickerConfirm}
        onCancel={onPickerCancel}
      />

      {pendingMediaConfirm ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          data-intro-media-replace-confirm="1"
        >
          <div className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-sm font-semibold text-sam-fg">
              {pendingMediaConfirm.picker.mode === "background"
                ? ko
                  ? `장면 ${
                      document.scenes.findIndex(
                        (s) =>
                          s.sceneId === pendingMediaConfirm.picker.sceneId,
                      ) + 1
                    }의 배경 이미지를 변경하시겠습니까?`
                  : "Change this scene background image?"
                : ko
                  ? "이미지를 변경하시겠습니까?"
                  : "Change this media?"}
            </p>
            <div className="mt-3 space-y-2 text-[11px] text-sam-muted">
              <p>
                {ko ? "현재:" : "Current:"}{" "}
                <code className="text-sam-fg">
                  {pendingMediaConfirm.picker.mode === "background"
                    ? pendingMediaConfirm.picker.previousMediaRefId?.slice(
                        0,
                        12,
                      ) ?? "(없음)"
                    : pendingMediaConfirm.picker.mode === "replace"
                      ? pendingMediaConfirm.picker.previousMediaRefId.slice(
                          0,
                          12,
                        )
                      : "—"}
                  …
                </code>
              </p>
              <p>
                {ko ? "변경:" : "New:"}{" "}
                <code className="text-sam-fg">
                  {pendingMediaConfirm.result.mediaRefId.slice(0, 12)}…
                </code>
              </p>
              <p>
                {ko ? "적용 위치:" : "Apply location:"}{" "}
                {pendingMediaConfirm.picker.mode === "background"
                  ? ko
                    ? `디바이 인트로 > 장면 ${
                        document.scenes.findIndex(
                          (s) =>
                            s.sceneId === pendingMediaConfirm.picker.sceneId,
                        ) + 1
                      } > 배경`
                    : `Dibay Intro > Scene > Background`
                  : ko
                    ? `디바이 인트로 > 장면 요소`
                    : `Dibay Intro > Element`}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <AdminActionButton
                variant="secondary"
                data-intro-media-replace-cancel="1"
                onClick={cancelPendingMediaConfirm}
              >
                {ko ? "취소" : "Cancel"}
              </AdminActionButton>
              <AdminActionButton
                variant="primary"
                data-intro-media-replace-apply="1"
                onClick={applyPendingMediaConfirm}
              >
                {ko ? "이미지 변경" : "Change image"}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteScene ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-sm text-sam-fg">
              {ko ? "이 장면을 삭제할까요?" : "Delete this scene?"}
            </p>
            <div className="mt-3 flex gap-2">
              <AdminActionButton
                variant="danger"
                onClick={() => {
                  const nextDoc = deleteScene(document, confirmDeleteScene);
                  applyLocal(nextDoc);
                  if (selectedSceneId === confirmDeleteScene) {
                    setSelectedSceneId(nextDoc.scenes[0]?.sceneId ?? null);
                    setSelectedLayerId(null);
                  }
                  setConfirmDeleteScene(null);
                }}
              >
                {ko ? "삭제" : "Delete"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                onClick={() => setConfirmDeleteScene(null)}
              >
                {ko ? "취소" : "Cancel"}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteLayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-sm text-sam-fg">
              {ko ? "이 장면 요소를 삭제할까요?" : "Delete this element?"}
            </p>
            <div className="mt-3 flex gap-2">
              <AdminActionButton
                variant="danger"
                data-intro-delete-layer-confirm="1"
                onClick={() => {
                  applyLocal(
                    deleteLayer(
                      document,
                      confirmDeleteLayer.sceneId,
                      confirmDeleteLayer.layerId,
                    ),
                  );
                  if (selectedLayerId === confirmDeleteLayer.layerId) {
                    setSelectedLayerId(null);
                  }
                  setConfirmDeleteLayer(null);
                }}
              >
                {ko ? "삭제" : "Delete"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                data-intro-delete-layer-cancel="1"
                onClick={() => setConfirmDeleteLayer(null)}
              >
                {ko ? "취소" : "Cancel"}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {newSceneOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-4"
            data-intro-new-scene-modal="1"
          >
            <h3 className="text-sm font-semibold text-sam-fg">
              {ko ? "새 장면 만들기" : "Create scene"}
            </h3>
            <div className="mt-3 space-y-2">
              <label className="block text-[11px] text-sam-muted">
                {ko ? "장면 이름" : "Scene name"}
                <input
                  className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                  value={newSceneDraft.name}
                  data-intro-new-scene-name="1"
                  onChange={(e) =>
                    setNewSceneDraft((d) => ({ ...d, name: e.target.value }))
                  }
                />
              </label>
              <div className="text-[11px] text-sam-muted">
                {ko ? "배경" : "Background"}
                <div className="mt-1 flex gap-2">
                  <AdminActionButton
                    variant={
                      newSceneDraft.bgMode === "color" ? "primary" : "secondary"
                    }
                    className="!min-h-7 !text-xs"
                    onClick={() =>
                      setNewSceneDraft((d) => ({ ...d, bgMode: "color" }))
                    }
                  >
                    {ko ? "색상" : "Color"}
                  </AdminActionButton>
                  <AdminActionButton
                    variant="secondary"
                    className="!min-h-7 !text-xs"
                    disabled
                    title={
                      ko
                        ? "이미지는 장면 생성 후 배경에서 선택"
                        : "Pick image after create in scene background"
                    }
                  >
                    {ko ? "이미지 (생성 후)" : "Image (after create)"}
                  </AdminActionButton>
                </div>
                {newSceneDraft.bgMode === "color" ? (
                  <input
                    type="color"
                    className="mt-2 h-9 w-full"
                    value={newSceneDraft.color}
                    data-intro-new-scene-color="1"
                    onChange={(e) =>
                      setNewSceneDraft((d) => ({
                        ...d,
                        color: e.target.value,
                      }))
                    }
                  />
                ) : null}
              </div>
              <label className="block text-[11px] text-sam-muted">
                {ko ? "표시 시간 (초)" : "Duration (sec)"}
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                  value={newSceneDraft.durationSec}
                  data-intro-new-scene-duration="1"
                  onChange={(e) =>
                    setNewSceneDraft((d) => ({
                      ...d,
                      durationSec: e.target.value,
                    }))
                  }
                />
              </label>
              {document.scenes.length > 0 ? (
                <label className="block text-[11px] text-sam-muted">
                  {ko ? "이전 장면에서의 전환" : "Incoming from previous"}
                  <select
                    className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                    value={newSceneDraft.transitionType}
                    onChange={(e) =>
                      setNewSceneDraft((d) => ({
                        ...d,
                        transitionType: e.target.value as
                          | "CUT"
                          | "FADE"
                          | "SLIDE",
                      }))
                    }
                  >
                    <option value="CUT">CUT</option>
                    <option value="FADE">FADE</option>
                    <option value="SLIDE">SLIDE</option>
                  </select>
                </label>
              ) : null}
              <p className="rounded bg-sam-bg p-2 text-[11px] text-sam-muted">
                {ko
                  ? `요약: ${newSceneDraft.name || "(이름 없음)"} · ${newSceneDraft.durationSec}초 · 배경 ${newSceneDraft.color}`
                  : `Summary: ${newSceneDraft.name || "(unnamed)"} · ${newSceneDraft.durationSec}s · bg ${newSceneDraft.color}`}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <AdminActionButton
                variant="secondary"
                data-intro-new-scene-cancel="1"
                onClick={() => setNewSceneOpen(false)}
              >
                {ko ? "취소" : "Cancel"}
              </AdminActionButton>
              <AdminActionButton
                variant="primary"
                data-intro-new-scene-confirm="1"
                onClick={() => {
                  const hex = newSceneDraft.color.replace("#", "");
                  const r = parseInt(hex.slice(0, 2), 16) / 255;
                  const g = parseInt(hex.slice(2, 4), 16) / 255;
                  const b = parseInt(hex.slice(4, 6), 16) / 255;
                  const durationMs = Math.max(
                    100,
                    Math.round(Number(newSceneDraft.durationSec) * 1000) || 2500,
                  );
                  const background: SceneBackgroundV1 = {
                    type: "SOLID",
                    color: {
                      r: Number.isFinite(r) ? r : 0,
                      g: Number.isFinite(g) ? g : 0,
                      b: Number.isFinite(b) ? b : 0,
                      a: 1,
                    },
                  };
                  // New scene is always last → transitionAfter null.
                  // If document already has scenes, set previous last scene's transition.
                  let nextDoc = document;
                  if (document.scenes.length > 0) {
                    const prev = document.scenes[document.scenes.length - 1]!;
                    const t: TransitionV1 =
                      newSceneDraft.transitionType === "CUT"
                        ? { type: "CUT", durationMs: 0 }
                        : newSceneDraft.transitionType === "SLIDE"
                          ? {
                              type: "SLIDE",
                              durationMs: 300,
                              direction: "LEFT",
                            }
                          : { type: "FADE", durationMs: 300 };
                    nextDoc = setSceneTransition(
                      nextDoc,
                      prev.sceneId,
                      t,
                    );
                  }
                  const { document: created, sceneId } = addSceneFromCandidate(
                    nextDoc,
                    {
                      name: newSceneDraft.name,
                      durationMs,
                      background,
                      transitionAfter: null,
                    },
                  );
                  applyLocal(created);
                  setSelectedSceneId(sceneId);
                  setSelectedLayerId(null);
                  setNewSceneOpen(false);
                }}
              >
                {ko ? "장면 만들기" : "Create scene"}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}
      </>
      ) : null}
    </div>
  );
}

function StudioCanvas({
  scene,
  devicePreview,
  tabletEdit,
  selectedLayerId,
  onSelectLayer,
  onFrameChange,
}: {
  scene: SceneV1;
  devicePreview: DevicePreview;
  tabletEdit: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onFrameChange: (layerId: string, frame: FrameV1) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewport =
    devicePreview === "TABLET"
      ? { width: 640, height: 400 }
      : { width: 360, height: 640 };
  const aspect =
    devicePreview === "TABLET"
      ? { w: 16, h: 10 }
      : { w: 9, h: 16 };
  const region = fitContentRegion(viewport, aspect);

  const dragRef = useRef<{
    layerId: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: FrameV1;
  } | null>(null);

  const layersSorted = useMemo(
    () => [...scene.layers].sort((a, b) => a.zIndex - b.zIndex),
    [scene.layers],
  );

  const onPointerDown = (
    e: ReactPointerEvent,
    layer: LayerV1,
    mode: "move" | "resize",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectLayer(layer.layerId);
    const frame =
      tabletEdit && layer.layoutOverrides?.TABLET_LANDSCAPE
        ? layer.layoutOverrides.TABLET_LANDSCAPE.frame
        : layer.frame;
    dragRef.current = {
      layerId: layer.layerId,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...frame },
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    // LOCAL ONLY — no fetch / save / media / navigation.
    const dx = (e.clientX - drag.startX) / region.RW;
    const dy = (e.clientY - drag.startY) / region.RH;
    let next: FrameV1;
    if (drag.mode === "move") {
      next = clampNormalizedFrame({
        x: drag.origin.x + dx,
        y: drag.origin.y + dy,
        w: drag.origin.w,
        h: drag.origin.h,
      });
    } else {
      next = clampNormalizedFrame({
        x: drag.origin.x,
        y: drag.origin.y,
        w: drag.origin.w + dx,
        h: drag.origin.h + dy,
      });
    }
    onFrameChange(drag.layerId, next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-neutral-900 shadow-inner"
      style={{ width: viewport.width, height: viewport.height }}
      data-intro-canvas="1"
      data-device={devicePreview}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={() => onSelectLayer(null)}
    >
      {/* FIT composition region */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: region.OX,
          top: region.OY,
          width: region.RW,
          height: region.RH,
          background: sceneBgCss(scene),
        }}
        data-intro-composition="1"
      >
        {/* Safe-area guide only — not SSOT */}
        <div
          className="pointer-events-none absolute inset-[6%] border border-dashed border-white/20"
          data-intro-safe-area-guide="1"
        />
        {layersSorted.map((layer) => {
          if (!layer.visible) return null;
          const frame =
            tabletEdit && layer.layoutOverrides?.TABLET_LANDSCAPE
              ? layer.layoutOverrides.TABLET_LANDSCAPE.frame
              : layer.frame;
          const rect = mapFrameToDevice(frame, {
            ...region,
            OX: 0,
            OY: 0,
          });
          const selected = layer.layerId === selectedLayerId;
          return (
            <div
              key={layer.layerId}
              className={`absolute box-border cursor-move ${
                selected ? "ring-2 ring-sky-400" : "ring-1 ring-white/20"
              }`}
              style={{
                left: rect.vx,
                top: rect.vy,
                width: rect.vw,
                height: rect.vh,
                opacity: layer.opacity,
                zIndex: layer.zIndex,
              }}
              data-intro-layer={layer.layerId}
              data-layer-type={layer.type}
              onPointerDown={(e) => onPointerDown(e, layer, "move")}
              onClick={(e) => {
                // Keep selection after pointerup. Canvas onClick clears selection;
                // without this stop, every layer click/drag ends deselected and
                // resize handles become unreachable (CUT A Production browser QA).
                e.stopPropagation();
              }}
            >
              <LayerPreview layer={layer} />
              {selected ? (
                <div
                  className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-sky-400"
                  data-intro-resize-handle={layer.layerId}
                  onPointerDown={(e) => onPointerDown(e, layer, "resize")}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LayerPreview({ layer }: { layer: LayerV1 }) {
  if (layer.type === "TEXT") {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden px-1 text-center"
        style={{
          color: colorCss(layer.color),
          fontSize: Math.max(10, layer.fontSize * 400),
          fontWeight:
            layer.font.weight === "BOLD"
              ? 700
              : layer.font.weight === "SEMIBOLD"
                ? 600
                : layer.font.weight === "MEDIUM"
                  ? 500
                  : 400,
        }}
      >
        {layer.content}
      </div>
    );
  }
  if (layer.type === "CTA") {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs font-semibold"
        style={{
          background: colorCss(layer.background.color),
          color: colorCss(layer.text.color),
          borderRadius: layer.background.cornerRadius * 200,
        }}
      >
        {layer.label}
      </div>
    );
  }
  // IMAGE / LOGO — mediaRefId only; signed preview is optional later.
  return (
    <div className="flex h-full w-full items-center justify-center bg-white/10 text-[10px] text-white/80">
      {layer.type}
      {layer.mediaRefId ? "" : " (no media)"}
    </div>
  );
}

function SceneInspector({
  ko,
  scene,
  isFirst,
  isLast,
  onDuration,
  onTransition,
  onBackground,
  onPickBackgroundImage,
  onClearBackgroundImage,
  hasBackgroundImage,
}: {
  ko: boolean;
  scene: SceneV1;
  isFirst: boolean;
  isLast: boolean;
  onDuration: (ms: number) => void;
  onTransition: (t: TransitionV1 | null) => void;
  onBackground: (c: { r: number; g: number; b: number; a: number }) => void;
  onPickBackgroundImage: () => void;
  onClearBackgroundImage: () => void;
  hasBackgroundImage: boolean;
}) {
  const t = scene.transitionAfter;
  const bg =
    typeof scene.background.color === "string"
      ? "#000000"
      : `#${[scene.background.color.r, scene.background.color.g, scene.background.color.b]
          .map((n) =>
            Math.round(n * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`;
  const durationSec = scene.durationMs / 1000;
  const transitionSec =
    t && t.type !== "CUT" ? t.durationMs / 1000 : 0;

  return (
    <section
      className="space-y-2"
      data-intro-scene-inspector="1"
    >
      {isFirst ? (
        <h3
          className="text-xs font-semibold text-sam-fg"
          data-intro-first-screen-panel="1"
          data-intro-startup-cover="1"
        >
          {ko ? "장면 설정" : "Scene settings"}
        </h3>
      ) : (
        <h3 className="text-xs font-semibold uppercase text-sam-muted">
          {ko ? "장면 설정" : "Scene settings"}
        </h3>
      )}
      <label className="block text-[11px] text-sam-muted">
        {ko ? "표시 시간 (초)" : "Duration (sec)"}
        <input
          type="number"
          step="0.1"
          className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
          value={Number.isFinite(durationSec) ? durationSec : 0}
          min={0.1}
          max={60}
          onChange={(e) => {
            const sec = Math.max(0.1, Number(e.target.value) || 0.1);
            onDuration(Math.round(sec * 1000));
          }}
          data-intro-scene-duration="1"
          data-intro-scene-duration-sec="1"
        />
        <span className="mt-0.5 block text-[10px] text-sam-muted">
          {formatSecondsKo(scene.durationMs)}
        </span>
      </label>
      {!isLast ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "다음 장면 전환" : "Transition to next"}
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={t?.type ?? "FADE"}
              onChange={(e) => {
                const type = e.target.value as "CUT" | "FADE" | "SLIDE";
                if (type === "CUT") onTransition({ type: "CUT", durationMs: 0 });
                else if (type === "FADE")
                  onTransition({
                    type: "FADE",
                    durationMs: t && t.type !== "CUT" ? t.durationMs : 300,
                  });
                else
                  onTransition({
                    type: "SLIDE",
                    durationMs: t && t.type !== "CUT" ? t.durationMs : 300,
                    direction:
                      t && t.type === "SLIDE" ? t.direction : "LEFT",
                  });
              }}
              data-intro-transition-type="1"
            >
              <option value="CUT">CUT</option>
              <option value="FADE">FADE</option>
              <option value="SLIDE">SLIDE</option>
            </select>
          </label>
          {t && t.type !== "CUT" ? (
            <label className="block text-[11px] text-sam-muted">
              {ko ? "전환 시간 (초)" : "Transition (sec)"}
              <input
                type="number"
                step="0.1"
                className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                value={transitionSec}
                min={0.1}
                onChange={(e) => {
                  const sec = Math.max(0.1, Number(e.target.value) || 0.1);
                  const durationMs = Math.round(sec * 1000);
                  if (t.type === "FADE")
                    onTransition({ type: "FADE", durationMs });
                  else if (t.type === "SLIDE")
                    onTransition({
                      type: "SLIDE",
                      durationMs,
                      direction: t.direction,
                    });
                }}
                data-intro-transition-duration="1"
                data-intro-transition-duration-sec="1"
              />
            </label>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] text-sam-muted" data-intro-scene-next-home="1">
          {ko ? "다음: 홈 화면" : "Next: Home"}
        </p>
      )}
      <div className="space-y-2" data-intro-bg-mode="1">
        <p className="text-[11px] font-medium text-sam-fg">
          {ko ? "배경" : "Background"}
        </p>
        <label className="block text-[11px] text-sam-muted">
          {ko ? "색상" : "Color"}
          <input
            type="color"
            className="mt-1 block h-8 w-full"
            value={bg}
            onChange={(e) => {
              const hex = e.target.value;
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              onBackground({ r, g, b, a: 1 });
            }}
            data-intro-scene-bg="1"
          />
        </label>
        <div
          className="space-y-1 rounded-ui-rect border border-sam-border p-2"
          data-intro-bg-image-controls="1"
        >
          <p className="text-[11px] font-medium text-sam-fg">
            {ko ? "이미지" : "Image"}
          </p>
          <div className="flex flex-wrap gap-1">
            <AdminActionButton
              variant="secondary"
              className="!min-h-7 !px-2 !text-xs"
              onClick={onPickBackgroundImage}
              data-intro-bg-image-pick="1"
            >
              {hasBackgroundImage
                ? ko
                  ? "배경 이미지 변경"
                  : "Change background image"
                : ko
                  ? "배경 이미지 선택"
                  : "Select background image"}
            </AdminActionButton>
            {hasBackgroundImage ? (
              <AdminActionButton
                variant="secondary"
                className="!min-h-7 !px-2 !text-xs"
                onClick={onClearBackgroundImage}
                data-intro-bg-image-clear="1"
              >
                {ko ? "이미지 제거" : "Remove image"}
              </AdminActionButton>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function LayerInspector({
  ko,
  layer,
  sceneDurationMs,
  applyLocation,
  tabletEdit,
  onUpdate,
  onMotion,
  onVisibility,
  onZ,
  onDelete,
  onReplaceMedia,
  onClearTablet,
}: {
  ko: boolean;
  layer: LayerV1;
  sceneDurationMs: number;
  applyLocation: string;
  tabletEdit: boolean;
  onUpdate: (patch: Omit<Partial<LayerV1>, "layerId" | "type">) => void;
  onMotion: (motion: LayerMotionV1) => void;
  onVisibility: (v: boolean) => void;
  onZ: (dir: "forward" | "backward") => void;
  onDelete: () => void;
  onReplaceMedia: () => void;
  onClearTablet: () => void;
}) {
  return (
    <section className="space-y-2" data-intro-layer-inspector="1">
      <h3 className="text-xs font-semibold uppercase text-sam-muted">
        {ko ? elementTypeLabelKo(layer.type) : layer.type}
      </h3>
      <p className="text-[10px] text-sam-muted" data-intro-apply-location="1">
        {ko ? "적용 위치" : "Apply location"}: {applyLocation}
      </p>
      <div className="flex flex-wrap gap-1">
        <AdminActionButton
          variant="secondary"
          className="!min-h-7 !px-2 !text-xs"
          onClick={() => onZ("backward")}
          data-intro-z-back="1"
        >
          {ko ? "뒤로" : "Back"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          className="!min-h-7 !px-2 !text-xs"
          onClick={() => onZ("forward")}
          data-intro-z-forward="1"
        >
          {ko ? "앞으로" : "Forward"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          className="!min-h-7 !px-2 !text-xs"
          onClick={() => onVisibility(!layer.visible)}
          data-intro-visibility="1"
        >
          {layer.visible
            ? ko
              ? "숨기기"
              : "Hide"
            : ko
              ? "보이기"
              : "Show"}
        </AdminActionButton>
      </div>

      {(layer.type === "IMAGE" || layer.type === "LOGO") && (
        <div className="space-y-1">
          <p className="text-[10px] text-sam-muted">
            {layer.mediaRefId
              ? ko
                ? "미디어 선택됨"
                : "Media selected"
              : ko
                ? "미디어 없음"
                : "No media"}
          </p>
          <AdminActionButton
            variant="secondary"
            className="!text-xs"
            onClick={onReplaceMedia}
            data-intro-replace-media="1"
          >
            {ko ? "미디어 변경" : "Change media"}
          </AdminActionButton>
          {layer.type === "IMAGE" ? (
            <label className="block text-[11px] text-sam-muted">
              {ko ? "표면 (고급)" : "Surface (advanced)"}
              <select
                className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                value={layer.surface}
                onChange={(e) =>
                  onUpdate({
                    surface: e.target.value as "CONTENT" | "VIEWPORT",
                  } as Partial<LayerV1>)
                }
              >
                <option value="CONTENT">CONTENT</option>
                <option value="VIEWPORT">VIEWPORT</option>
              </select>
            </label>
          ) : null}
        </div>
      )}

      {layer.type === "TEXT" ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "텍스트" : "Text"}
            <textarea
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              rows={3}
              value={layer.content}
              onChange={(e) => onUpdate({ content: e.target.value } as Partial<LayerV1>)}
              data-intro-text-content="1"
            />
          </label>
          <label className="block text-[11px] text-sam-muted">
            Weight
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={layer.font.weight}
              onChange={(e) => {
                const weight = e.target.value as PretendardWeightV1;
                onUpdate({
                  font: {
                    family: "Pretendard",
                    weight,
                    assetId: PRETENDARD_WEIGHT_TO_ASSET[weight],
                  },
                } as Partial<LayerV1>);
              }}
            >
              <option value="REGULAR">Regular</option>
              <option value="MEDIUM">Medium</option>
              <option value="SEMIBOLD">SemiBold</option>
              <option value="BOLD">Bold</option>
            </select>
          </label>
        </>
      ) : null}

      {layer.type === "CTA" ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            Label
            <input
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={layer.label}
              onChange={(e) =>
                onUpdate({ label: e.target.value } as Partial<LayerV1>)
              }
              data-intro-cta-label="1"
            />
          </label>
          <label className="block text-[11px] text-sam-muted">
            Action
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={layer.action.type}
              onChange={(e) => {
                const type = e.target.value as
                  | "CONTINUE"
                  | "FINISH_INTRO"
                  | "APPROVED_INTERNAL_ROUTE";
                if (type === "APPROVED_INTERNAL_ROUTE") {
                  // Only expose when a validated routeId exists — block fake routes.
                  // CUT A: no approved route catalog wired → keep FINISH/CONTINUE only in UI choices that validate.
                  onUpdate({
                    action: { type: "FINISH_INTRO" },
                  } as Partial<LayerV1>);
                  return;
                }
                onUpdate({ action: { type } } as Partial<LayerV1>);
              }}
              data-intro-cta-action="1"
            >
              <option value="CONTINUE">CONTINUE</option>
              <option value="FINISH_INTRO">FINISH_INTRO</option>
            </select>
          </label>
          <p
            className="text-[10px] font-medium text-amber-800 dark:text-amber-200"
            data-intro-cta-runtime-status="1"
          >
            {ko
              ? "버튼 동작 런타임: 후속 검증 필요"
              : "Button action runtime: follow-up verification required"}
          </p>
        </>
      ) : null}

      <ElementMotionControls
        ko={ko}
        motion={layer.motion}
        sceneDurationMs={sceneDurationMs}
        onChange={onMotion}
      />

      {tabletEdit && layer.layoutOverrides?.TABLET_LANDSCAPE ? (
        <AdminActionButton
          variant="secondary"
          className="!text-xs"
          onClick={onClearTablet}
          data-intro-clear-tablet="1"
        >
          {ko ? "태블릿 오버라이드 제거" : "Remove tablet override"}
        </AdminActionButton>
      ) : null}

      <AdminActionButton
        variant="danger"
        className="!text-xs"
        onClick={onDelete}
        data-intro-delete-layer="1"
      >
        {ko ? "요소 삭제" : "Delete element"}
      </AdminActionButton>
      <p className="text-[10px] text-sam-muted">
        {ko
          ? "요소 삭제는 미디어를 삭제하지 않습니다."
          : "Deleting a layer does not delete Media."}
      </p>
    </section>
  );
}
