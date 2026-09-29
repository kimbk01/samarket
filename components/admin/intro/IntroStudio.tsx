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
  LayerV1,
  PretendardWeightV1,
  SceneV1,
  TransitionV1,
} from "@/lib/intro/contracts/document";
import { PRETENDARD_WEIGHT_TO_ASSET } from "@/lib/intro/contracts/document";
import {
  fitContentRegion,
  mapFrameToDevice,
} from "@/lib/intro/geometry/responsive-mapping";
import { computeIntroDurationMs } from "@/lib/intro/timeline/compute-duration";
import {
  addLayer,
  addScene,
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
  getIntroDocumentApi,
  getIntroLiveApi,
  publishIntroDocumentApi,
  saveIntroDocumentApi,
  setIntroLiveApi,
} from "./introDocumentApi";

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
  const [publishUi, setPublishUi] = useState<PublishUi>("idle");
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [lastPublishPackId, setLastPublishPackId] = useState<string | null>(
    null,
  );
  const [lastPublishedRevisionId, setLastPublishedRevisionId] = useState<
    string | null
  >(null);
  const [setLiveUi, setSetLiveUi] = useState<SetLiveUi>("idle");
  const [setLiveMessage, setSetLiveMessage] = useState<string | null>(null);
  const [currentLiveKind, setCurrentLiveKind] = useState<string | null>(null);
  const [currentLiveRevisionId, setCurrentLiveRevisionId] = useState<
    string | null
  >(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [confirmDeleteScene, setConfirmDeleteScene] = useState<string | null>(
    null,
  );
  const [publishEmptyAck, setPublishEmptyAck] = useState(false);

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
    setSaveUi("dirty");
    setSaveMessage(null);
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
    setSaveUi("idle");
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

  const onSave = async () => {
    if (!document || saveUi === "saving") return;
    setSaveUi("saving");
    setSaveMessage(ko ? "저장 중…" : "Saving…");
    const res = await saveIntroDocumentApi({
      documentId,
      expectedDraftVersion: draftVersion,
      document,
    });
    if (res.status === 409) {
      setSaveUi("conflict");
      setSaveMessage(
        ko
          ? "다른 편집본과 충돌했습니다. 다시 불러온 뒤 편집하세요."
          : "Version conflict. Reload and re-apply edits.",
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
    setSaveUi("saved");
    setSaveMessage(ko ? "저장됨" : "Saved");
    setPublishMessage(null);
  };

  const onPublishConfirmed = async () => {
    if (!document || publishUi === "publishing" || dirty) return;
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
    setLastPublishPackId(res.result.packId);
    setLastPublishedRevisionId(res.result.publishedRevisionId);
    setPublishMessage(
      ko
        ? `불변 게시 버전 생성됨 (앱 적용 아님). Pack ${res.result.packId.slice(0, 8)}…`
        : `Immutable revision created (NOT Live / NOT app exposure). Pack ${res.result.packId.slice(0, 8)}…`,
    );
  };

  const refreshLive = useCallback(async () => {
    const res = await getIntroLiveApi();
    if (!res.ok || !res.live) return;
    setCurrentLiveKind(res.live.liveKind);
    setCurrentLiveRevisionId(res.live.publishedRevisionId);
  }, []);

  useEffect(() => {
    void refreshLive();
  }, [refreshLive]);

  // Owner V1 production authority may already be published — allow Set Live without re-publish.
  useEffect(() => {
    if (documentId === "3347c673-0667-4605-a8c8-a306ae209896") {
      setLastPublishedRevisionId((prev) =>
        prev ?? "4b5cf115-3ede-45a6-b6dd-a255915a9158",
      );
      setLastPublishPackId((prev) =>
        prev ?? "2f4dbc7d-b6ce-416f-80eb-012ef9bad153",
      );
    }
  }, [documentId]);

  const onSetLiveConfirmed = async () => {
    if (!lastPublishedRevisionId || setLiveUi === "setting") return;
    setSetLiveUi("setting");
    setSetLiveMessage(ko ? "앱에 적용 중…" : "Setting Live…");
    const liveRes = await getIntroLiveApi();
    if (!liveRes.ok || !liveRes.live) {
      setSetLiveUi("error");
      setSetLiveMessage(
        ko
          ? `Live 상태 조회 실패: ${liveRes.error ?? "error"}`
          : `Live status failed: ${liveRes.error ?? "error"}`,
      );
      return;
    }
    const res = await setIntroLiveApi({
      publishedRevisionId: lastPublishedRevisionId,
      expectedLiveKind: liveRes.live.liveKind,
      expectedPublishedRevisionId: liveRes.live.publishedRevisionId,
    });
    if (!res.ok || !res.live) {
      setSetLiveUi("error");
      setSetLiveMessage(
        ko
          ? `앱 적용 실패: ${res.message ?? res.error ?? "error"}`
          : `Set Live failed: ${res.message ?? res.error ?? "error"}`,
      );
      return;
    }
    setSetLiveUi("success");
    setCurrentLiveKind(res.live.liveKind);
    setCurrentLiveRevisionId(res.live.publishedRevisionId);
    setSetLiveMessage(
      ko
        ? "CURRENT LIVE / 앱 적용 버전 — 기기 다운로드는 아직 증명되지 않음"
        : "CURRENT LIVE — device download NOT claimed",
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
    if (activePicker.mode === "background") {
      const { document: next, layerId } = setSceneBackgroundImage(
        doc,
        activePicker.sceneId,
        result.mediaRefId,
      );
      applyLocal(next);
      setSelectedLayerId(layerId);
    } else if (activePicker.mode === "add") {
      const { document: next, layerId } = addLayer(
        doc,
        activePicker.sceneId,
        activePicker.type,
        { mediaRefId: result.mediaRefId },
      );
      applyLocal(next);
      setSelectedLayerId(layerId);
    } else {
      applyLocal(
        setLayerMediaRef(
          doc,
          activePicker.sceneId,
          activePicker.layerId,
          result.mediaRefId,
        ),
      );
    }
    setPicker(null);
    pickerRef.current = null;
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
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-3">
        <Link
          href="/admin/intro"
          className="text-xs text-sam-muted hover:text-sam-fg"
        >
          ← {ko ? "인트로 목록" : "Intro list"}
        </Link>
        <input
          className="min-w-[12rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-bg px-2 py-1.5 text-sm font-semibold text-sam-fg"
          value={document.title}
          onChange={(e) => applyLocal(setDocumentTitle(document, e.target.value))}
          data-intro-studio-title="1"
        />
        <span
          className="rounded-ui-rect bg-sam-bg px-2 py-1 text-sm font-semibold text-sam-fg"
          data-intro-total-duration="1"
          data-intro-total-ms={totalMs}
        >
          {ko ? "총 인트로 시간:" : "Total Intro:"}{" "}
          {formatTotalIntroSeconds(totalMs)}
          <span className="ml-1 text-[10px] font-normal text-sam-muted">
            v{draftVersion}
          </span>
        </span>
        <AdminActionButton
          variant="primary"
          disabled={!dirty || saveUi === "saving"}
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
          title={
            dirty
              ? ko
                ? "게시 전에 저장하세요"
                : "Save before Publish"
              : ko
                ? "불변 게시 버전 생성 (앱 적용 아님)"
                : "Create immutable published revision (NOT app exposure)"
          }
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
            !lastPublishedRevisionId ||
            setLiveUi === "setting" ||
            setLiveUi === "confirm" ||
            dirty
          }
          onClick={() => {
            setSetLiveUi("confirm");
            setSetLiveMessage(null);
          }}
          data-intro-set-live="1"
          title={
            ko
              ? "앱에 적용 — 기기에 제공할 Live 버전 변경"
              : "Set Live — change revision offered to devices"
          }
        >
          {setLiveUi === "setting"
            ? ko
              ? "적용 중…"
              : "Setting…"
            : ko
              ? "앱에 적용"
              : "Set Live"}
        </AdminActionButton>
        <span
          className="text-xs text-sam-muted"
          data-intro-live-kind={currentLiveKind ?? undefined}
          data-intro-live-revision={currentLiveRevisionId ?? undefined}
        >
          {currentLiveKind === "COMMITTED_LIVE"
            ? ko
              ? `CURRENT LIVE ${currentLiveRevisionId?.slice(0, 8) ?? ""}…`
              : `CURRENT LIVE ${currentLiveRevisionId?.slice(0, 8) ?? ""}…`
            : ko
              ? `Live: ${currentLiveKind ?? "…"}`
              : `Live: ${currentLiveKind ?? "…"}`}
        </span>
        {setLiveMessage ? (
          <span
            className="text-xs text-sam-muted"
            data-intro-set-live-state={setLiveUi}
          >
            {setLiveMessage}
          </span>
        ) : null}
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
                ? "저장됨"
                : "Saved")}
        </span>
        {publishMessage ? (
          <span
            className="text-xs text-sam-muted"
            data-intro-publish-state={publishUi}
            data-intro-publish-pack-id={lastPublishPackId ?? undefined}
          >
            {publishMessage}
          </span>
        ) : null}
      </header>

      {publishUi === "confirm" ? (
        <div
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-sam-fg"
          data-intro-publish-confirm="1"
          role="dialog"
          aria-modal="true"
        >
          <p className="font-semibold">
            {ko
              ? "게시 확인 — 앱 적용이 아닙니다"
              : "Confirm Publish — this is NOT app exposure"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sam-muted">
            <li>
              {ko
                ? "저장: Draft 저장 (편집 가능)"
                : "Save: Draft save (still editable)"}
            </li>
            <li>
              {ko
                ? "게시: 불변 게시 버전(Revision) + Pack 생성"
                : "Publish: create immutable Published revision + Pack"}
            </li>
            <li>
              {ko
                ? "앱 적용: 별도 「앱에 적용」으로 Live 설정 (기기 다운로드 완료를 주장하지 않음)"
                : "App exposure: separate Set Live action (does NOT claim devices downloaded)"}
            </li>
          </ul>
          {emptyWarnings.length > 0 ? (
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
              {ko ? "불변 게시 버전 생성" : "Create immutable revision"}
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
              ? "앱에 적용 확인 — 기기에 제공할 버전을 변경합니다"
              : "Confirm Set Live — changes revision offered to devices"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sam-muted">
            <li>
              {ko
                ? "PUBLISHED ≠ CURRENT LIVE — 게시만으로는 앱에 적용되지 않습니다"
                : "PUBLISHED ≠ CURRENT LIVE — Publish alone does not expose to apps"}
            </li>
            <li>
              {ko
                ? "이 동작은 서버 Live 포인터만 변경합니다. 기기 다운로드·적용 완료를 주장하지 않습니다"
                : "This only changes the server Live pointer. Does NOT claim devices downloaded or applied"}
            </li>
            <li>
              {ko
                ? `대상 revision: ${lastPublishedRevisionId ?? "(없음)"}`
                : `Target revision: ${lastPublishedRevisionId ?? "(none)"}`}
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionButton
              variant="primary"
              onClick={() => void onSetLiveConfirmed()}
              data-intro-set-live-confirm-yes="1"
            >
              {ko ? "앱에 적용" : "Set Live"}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              onClick={() => setSetLiveUi("idle")}
              data-intro-set-live-confirm-no="1"
            >
              {ko ? "취소" : "Cancel"}
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
              {ko ? "인트로 장면" : "Intro scenes"}
            </h2>
            <AdminActionButton
              variant="secondary"
              className="!min-h-7 !px-2 !text-xs"
              onClick={() => {
                const { document: next, sceneId } = addScene(document);
                applyLocal(next);
                setSelectedSceneId(sceneId);
                setSelectedLayerId(null);
              }}
              data-intro-add-scene="1"
            >
              +
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
                    {isFirst
                      ? ko
                        ? `1. 첫 화면 / 시작 화면`
                        : `1. Startup / first screen`
                      : `${idx + 1}. ${scene.name}`}
                  </span>
                  {isFirst ? (
                    <span
                      className="mt-0.5 block text-[10px] text-sky-700 dark:text-sky-300"
                      data-intro-startup-cover-hint="1"
                    >
                      {ko
                        ? "앱 실행 시 가장 먼저 표시되는 인트로 화면입니다."
                        : "First authored frame after OS launch."}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-[10px] text-sam-muted">
                    {formatSecondsKo(scene.durationMs)}
                    {scene.transitionAfter
                      ? ` · ${scene.transitionAfter.type}`
                      : ""}
                  </span>
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
                ? "작성용 캔버스 (런타임 Preview 아님)"
                : "Authoring canvas (not runtime Preview)"}
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
              {ko ? "장면을 선택하세요" : "Select a scene"}
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
                + TEXT
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
                + CTA
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
                applyLocal(
                  deleteLayer(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                  ),
                );
                setSelectedLayerId(null);
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
          ) : (
            <p className="text-xs text-sam-muted">
              {ko ? "레이어를 선택하세요." : "Select a layer."}
            </p>
          )}

          <p className="text-[10px] text-sam-muted">
            {ko
              ? "Preview 런타임 제품 경로는 아직 없습니다. Publish ≠ Set Live."
              : "No runtime Preview product path. Publish ≠ Set Live."}
          </p>
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
                  applyLocal(deleteScene(document, confirmDeleteScene));
                  if (selectedSceneId === confirmDeleteScene) {
                    setSelectedSceneId(null);
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
      data-intro-startup-cover={isFirst ? "1" : "0"}
    >
      {isFirst ? (
        <div
          className="rounded-ui-rect border border-sky-500/30 bg-sky-500/10 px-2 py-2"
          data-intro-first-screen-panel="1"
        >
          <h3 className="text-xs font-semibold text-sky-800 dark:text-sky-200">
            {ko ? "첫 화면 / 시작 화면" : "First screen / Startup"}
          </h3>
          <p className="mt-1 text-[10px] text-sam-muted">
            {ko
              ? "앱 실행 시 가장 먼저 표시되는 인트로 화면입니다."
              : "This is the first authored frame after the OS launch primitive."}
          </p>
        </div>
      ) : null}
      <h3 className="text-xs font-semibold uppercase text-sam-muted">
        {ko ? "장면 타이밍" : "Scene timing"}
      </h3>
      <label className="block text-[11px] text-sam-muted">
        {ko ? "장면 표시 시간 (초)" : "Scene duration (sec)"}
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
        <p className="text-[11px] text-sam-muted">
          {ko ? "마지막 장면 — 전환 없음 → HOME" : "Last scene — no transition → HOME"}
        </p>
      )}
      <label className="block text-[11px] text-sam-muted">
        {ko ? "배경색" : "Background color"}
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
          {ko ? "배경 이미지" : "Background image"}
        </p>
        <p className="text-[10px] text-sam-muted">
          {ko
            ? "전체 화면 배경 (로고/이미지와 별개)"
            : "Full-screen background (separate from logo/image layers)"}
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
              {ko ? "배경 이미지 제거" : "Remove background image"}
            </AdminActionButton>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LayerInspector({
  ko,
  layer,
  tabletEdit,
  onUpdate,
  onVisibility,
  onZ,
  onDelete,
  onReplaceMedia,
  onClearTablet,
}: {
  ko: boolean;
  layer: LayerV1;
  tabletEdit: boolean;
  onUpdate: (patch: Omit<Partial<LayerV1>, "layerId" | "type">) => void;
  onVisibility: (v: boolean) => void;
  onZ: (dir: "forward" | "backward") => void;
  onDelete: () => void;
  onReplaceMedia: () => void;
  onClearTablet: () => void;
}) {
  return (
    <section className="space-y-2" data-intro-layer-inspector="1">
      <h3 className="text-xs font-semibold uppercase text-sam-muted">
        {layer.type === "IMAGE"
          ? ko
            ? "이미지"
            : "IMAGE"
          : layer.type === "LOGO"
            ? ko
              ? "로고"
              : "LOGO"
            : layer.type}
      </h3>
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
        </>
      ) : null}

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
        {ko ? "레이어 삭제" : "Delete layer"}
      </AdminActionButton>
      <p className="text-[10px] text-sam-muted">
        {ko
          ? "레이어 삭제는 미디어를 삭제하지 않습니다."
          : "Deleting a layer does not delete Media."}
      </p>
    </section>
  );
}
