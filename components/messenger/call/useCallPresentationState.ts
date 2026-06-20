import { resolveCallPresentationState } from "@/lib/community-messenger/call-presentation-state";
import type { CallPresentationState } from "@/lib/community-messenger/call-presentation-state";
import type { CallScreenViewModel } from "./call-ui.types";

/** CallScreenViewModel → presentation. `vm.presentation` 이 있으면 CallClient SSOT 를 그대로 쓴다. */
export function useCallPresentationState(vm: CallScreenViewModel): CallPresentationState {
  if (vm.presentation) return vm.presentation;
  return resolveCallPresentationState({
    mode: vm.mode,
    direction: vm.direction,
    phase: vm.phase,
    showRemoteVideo: vm.showRemoteVideo,
    pipShellMounted: vm.pipShellMounted,
    showLocalVideo: vm.showLocalVideo,
    hasMainVideoSlot: Boolean(vm.mainVideoSlot),
    visualTheme: vm.visualTheme,
  });
}
