import type { CallAudioRouteApplyResult } from "@/lib/community-messenger/call-audio-route-controller";

export type CallControlApplyState = "idle" | "applying" | "active" | "failed";

export type CallControlToggleKey = "speaker" | "micMuted" | "cameraOff" | "cameraSwitching" | "ending";

export type CallControlsState = Record<CallControlToggleKey, CallControlApplyState>;

export const CALL_CONTROL_SINGLE_FLIGHT_MS = 400;
export const CALL_CONTROL_FAIL_REVERT_MS = 1_000;

export function logCallControl(event: string, payload?: Record<string, unknown>): void {
  console.info(`[call-control] ${event}`, payload ?? {});
}

type ToggleCell = {
  confirmed: boolean;
  pending: boolean | null;
  phase: CallControlApplyState;
};

export function displayBoolean(cell: ToggleCell): boolean {
  if (cell.pending !== null) return cell.pending;
  return cell.confirmed;
}

function idleCell(confirmed: boolean): ToggleCell {
  return { confirmed, pending: null, phase: "idle" };
}

export function speakerOnFromRoute(result: CallAudioRouteApplyResult): boolean {
  if (result.actualRoute === "speaker") return true;
  if (result.actualRoute === "earpiece") return false;
  if (result.externalDeviceConnected) {
    return result.requestedSpeaker && result.applied;
  }
  return result.requestedSpeaker && result.applied;
}

export function isSpeakerApplySuccess(
  desired: boolean,
  result: CallAudioRouteApplyResult
): boolean {
  if (result.applied) return true;
  if (desired) return result.actualRoute === "speaker";
  return (
    result.actualRoute === "earpiece" ||
    result.actualRoute === "bluetooth" ||
    result.actualRoute === "wired"
  );
}

export type CallControlToast = {
  key: string;
  fallbackKo: string;
  fallbackEn: string;
};

export type CallControlStoreInitial = {
  speakerOn?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
};

type Listener = () => void;

export class CallControlStateStore {
  private speakerCell: ToggleCell;
  private micCell: ToggleCell;
  private cameraCell: ToggleCell;
  private cameraSwitchPhase: CallControlApplyState = "idle";
  private endingPhase: CallControlApplyState = "idle";
  private locks: Record<CallControlToggleKey, number> = {
    speaker: 0,
    micMuted: 0,
    cameraOff: 0,
    cameraSwitching: 0,
    ending: 0,
  };
  private applying: Partial<Record<CallControlToggleKey, boolean>> = {};
  private listeners = new Set<Listener>();
  private onToast?: (toast: CallControlToast) => void;
  private failTimers: ReturnType<typeof globalThis.setTimeout>[] = [];

  constructor(initial?: CallControlStoreInitial, onToast?: (toast: CallControlToast) => void) {
    this.speakerCell = idleCell(initial?.speakerOn ?? false);
    this.micCell = idleCell(initial?.micMuted ?? false);
    this.cameraCell = idleCell(initial?.cameraOff ?? false);
    this.onToast = onToast;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private isLocked(key: CallControlToggleKey): boolean {
    return Date.now() < this.locks[key];
  }

  private lock(key: CallControlToggleKey): void {
    this.locks[key] = Date.now() + CALL_CONTROL_SINGLE_FLIGHT_MS;
  }

  private tryBegin(key: CallControlToggleKey): boolean {
    if (key === "ending" && this.endingPhase === "applying") {
      logCallControl("duplicate_ignored", { control: key });
      return false;
    }
    if (key === "cameraSwitching" && this.cameraSwitchPhase === "applying") {
      logCallControl("duplicate_ignored", { control: key });
      return false;
    }
    if (this.isLocked(key) || this.applying[key]) {
      logCallControl("duplicate_ignored", { control: key });
      return false;
    }
    this.lock(key);
    this.applying[key] = true;
    return true;
  }

  private finishToggle(
    key: "speaker" | "micMuted" | "cameraOff",
    success: boolean,
    nextConfirmed: boolean,
    failToast?: CallControlToast
  ): void {
    this.applying[key] = false;
    const setter = (cell: ToggleCell): ToggleCell => {
      if (success) return idleCell(nextConfirmed);
      this.onToast?.(
        failToast ?? {
          key: "common_content_unavailable",
          fallbackKo: "설정을 변경하지 못했습니다",
          fallbackEn: "Could not apply the change",
        }
      );
      const timer = globalThis.setTimeout(() => {
        if (key === "speaker") {
          this.speakerCell =
            this.speakerCell.phase === "failed"
              ? { ...this.speakerCell, phase: "idle" }
              : this.speakerCell;
        } else if (key === "micMuted") {
          this.micCell =
            this.micCell.phase === "failed" ? { ...this.micCell, phase: "idle" } : this.micCell;
        } else {
          this.cameraCell =
            this.cameraCell.phase === "failed" ? { ...this.cameraCell, phase: "idle" } : this.cameraCell;
        }
        this.emit();
      }, CALL_CONTROL_FAIL_REVERT_MS);
      this.failTimers.push(timer);
      return { confirmed: cell.confirmed, pending: null, phase: "failed" };
    };

    if (key === "speaker") this.speakerCell = setter(this.speakerCell);
    else if (key === "micMuted") this.micCell = setter(this.micCell);
    else this.cameraCell = setter(this.cameraCell);
    this.emit();
  }

  getSnapshot() {
    return {
      speakerOn: displayBoolean(this.speakerCell),
      micMuted: displayBoolean(this.micCell),
      cameraOff: displayBoolean(this.cameraCell),
      speakerApplying: this.speakerCell.phase === "applying",
      micApplying: this.micCell.phase === "applying",
      cameraApplying: this.cameraCell.phase === "applying",
      cameraSwitching: this.cameraSwitchPhase === "applying",
      ending: this.endingPhase === "applying" || this.endingPhase === "active",
      phases: {
        speaker: this.speakerCell.phase,
        micMuted: this.micCell.phase,
        cameraOff: this.cameraCell.phase,
        cameraSwitching: this.cameraSwitchPhase,
        ending: this.endingPhase,
      } satisfies CallControlsState,
    };
  }

  reset(next?: CallControlStoreInitial): void {
    this.applying = {};
    this.locks = {
      speaker: 0,
      micMuted: 0,
      cameraOff: 0,
      cameraSwitching: 0,
      ending: 0,
    };
    this.speakerCell = idleCell(next?.speakerOn ?? false);
    this.micCell = idleCell(next?.micMuted ?? false);
    this.cameraCell = idleCell(next?.cameraOff ?? false);
    this.cameraSwitchPhase = "idle";
    this.endingPhase = "idle";
    this.emit();
  }

  reconcileSpeakerFromRoute(result: CallAudioRouteApplyResult): void {
    if (this.applying.speaker) return;
    this.speakerCell = idleCell(speakerOnFromRoute(result));
    this.emit();
  }

  setSpeakerConfirmed(on: boolean): void {
    if (this.applying.speaker) return;
    this.speakerCell = idleCell(on);
    this.emit();
  }

  getSpeakerOnRef(): boolean {
    return displayBoolean(this.speakerCell);
  }

  getMicMutedRef(): boolean {
    return displayBoolean(this.micCell);
  }

  getCameraOffRef(): boolean {
    return displayBoolean(this.cameraCell);
  }

  async toggleSpeaker(
    apply: (desiredSpeaker: boolean) => Promise<CallAudioRouteApplyResult>
  ): Promise<void> {
    if (!this.tryBegin("speaker")) return;
    const desired = !this.getSpeakerOnRef();
    logCallControl("speaker_toggle_start", { desiredSpeaker: desired });
    this.speakerCell = {
      confirmed: this.speakerCell.confirmed,
      pending: desired,
      phase: "applying",
    };
    this.emit();
    try {
      const result = await apply(desired);
      const success = isSpeakerApplySuccess(desired, result);
      const confirmed = speakerOnFromRoute({ ...result, requestedSpeaker: desired });
      if (success) {
        logCallControl("speaker_toggle_success", {
          desiredSpeaker: desired,
          actualRoute: result.actualRoute,
          externalDeviceConnected: result.externalDeviceConnected,
        });
        if (result.externalDeviceConnected) {
          logCallControl("speaker_toggle_external_route", {
            desiredSpeaker: desired,
            actualRoute: result.actualRoute,
          });
        }
        this.finishToggle("speaker", true, confirmed);
        return;
      }
      logCallControl("speaker_toggle_failed", {
        desiredSpeaker: desired,
        actualRoute: result.actualRoute,
      });
      this.finishToggle("speaker", false, this.getSpeakerOnRef(), {
        key: "cm_ui_speaker_toggle_failed",
        fallbackKo: "스피커 전환에 실패했습니다",
        fallbackEn: "Could not switch speaker",
      });
    } catch (error) {
      logCallControl("speaker_toggle_failed", { desiredSpeaker: desired, error });
      this.finishToggle("speaker", false, this.getSpeakerOnRef(), {
        key: "cm_ui_speaker_toggle_failed",
        fallbackKo: "스피커 전환에 실패했습니다",
        fallbackEn: "Could not switch speaker",
      });
    }
  }

  async toggleMic(apply: (nextMuted: boolean) => Promise<boolean>): Promise<void> {
    if (!this.tryBegin("micMuted")) return;
    const nextMuted = !this.getMicMutedRef();
    logCallControl("mic_toggle_start", { muted: nextMuted });
    this.micCell = {
      confirmed: this.micCell.confirmed,
      pending: nextMuted,
      phase: "applying",
    };
    this.emit();
    try {
      const ok = await apply(nextMuted);
      if (ok) {
        logCallControl("mic_toggle_success", { muted: nextMuted });
        this.finishToggle("micMuted", true, nextMuted);
        return;
      }
      logCallControl("mic_toggle_failed", { muted: nextMuted });
      this.finishToggle("micMuted", false, this.getMicMutedRef(), {
        key: "cm_ui_mic_toggle_failed",
        fallbackKo: "마이크 설정 변경에 실패했습니다",
        fallbackEn: "Could not change microphone",
      });
    } catch (error) {
      logCallControl("mic_toggle_failed", { muted: nextMuted, error });
      this.finishToggle("micMuted", false, this.getMicMutedRef(), {
        key: "cm_ui_mic_toggle_failed",
        fallbackKo: "마이크 설정 변경에 실패했습니다",
        fallbackEn: "Could not change microphone",
      });
    }
  }

  async toggleCamera(apply: (nextOff: boolean) => Promise<boolean>): Promise<void> {
    if (!this.tryBegin("cameraOff")) return;
    const nextOff = !this.getCameraOffRef();
    logCallControl("camera_toggle_start", { cameraOff: nextOff });
    this.cameraCell = {
      confirmed: this.cameraCell.confirmed,
      pending: nextOff,
      phase: "applying",
    };
    this.emit();
    try {
      const ok = await apply(nextOff);
      if (ok) {
        logCallControl("camera_toggle_success", { cameraOff: nextOff });
        this.finishToggle("cameraOff", true, nextOff);
        return;
      }
      logCallControl("camera_toggle_failed", { cameraOff: nextOff });
      this.finishToggle("cameraOff", false, this.getCameraOffRef(), {
        key: "cm_ui_camera_toggle_failed",
        fallbackKo: "카메라 설정 변경에 실패했습니다",
        fallbackEn: "Could not change camera",
      });
    } catch (error) {
      logCallControl("camera_toggle_failed", { cameraOff: nextOff, error });
      this.finishToggle("cameraOff", false, this.getCameraOffRef(), {
        key: "cm_ui_camera_toggle_failed",
        fallbackKo: "카메라 설정 변경에 실패했습니다",
        fallbackEn: "Could not change camera",
      });
    }
  }

  async switchCamera(apply: () => Promise<boolean>): Promise<void> {
    if (!this.tryBegin("cameraSwitching")) return;
    logCallControl("camera_switch_start");
    this.cameraSwitchPhase = "applying";
    this.emit();
    try {
      const ok = await apply();
      this.applying.cameraSwitching = false;
      if (ok) {
        logCallControl("camera_switch_success");
        this.cameraSwitchPhase = "idle";
        this.emit();
        return;
      }
      logCallControl("camera_switch_failed");
      this.cameraSwitchPhase = "failed";
      this.onToast?.({
        key: "cm_ui_camera_switch_failed",
        fallbackKo: "카메라 전환에 실패했습니다",
        fallbackEn: "Could not switch camera",
      });
      const timer = globalThis.setTimeout(() => {
        this.cameraSwitchPhase = "idle";
        this.emit();
      }, CALL_CONTROL_FAIL_REVERT_MS);
      this.failTimers.push(timer);
      this.emit();
    } catch (error) {
      this.applying.cameraSwitching = false;
      logCallControl("camera_switch_failed", { error });
      this.cameraSwitchPhase = "failed";
      this.onToast?.({
        key: "cm_ui_camera_switch_failed",
        fallbackKo: "카메라 전환에 실패했습니다",
        fallbackEn: "Could not switch camera",
      });
      const timer = globalThis.setTimeout(() => {
        this.cameraSwitchPhase = "idle";
        this.emit();
      }, CALL_CONTROL_FAIL_REVERT_MS);
      this.failTimers.push(timer);
      this.emit();
    }
  }

  beginEnd(): boolean {
    if (!this.tryBegin("ending")) return false;
    this.endingPhase = "applying";
    logCallControl("end_start");
    this.emit();
    return true;
  }

  completeEnd(): void {
    this.applying.ending = false;
    this.endingPhase = "active";
    logCallControl("end_done");
    this.emit();
  }

  dispose(): void {
    for (const timer of this.failTimers) globalThis.clearTimeout(timer);
    this.failTimers = [];
    this.listeners.clear();
  }
}
