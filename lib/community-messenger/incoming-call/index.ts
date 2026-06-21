/**
 * Community Messenger 수신 통화 모듈 — public API.
 *
 * Controller/state: `GlobalCommunityMessengerIncomingCall`
 * In-app UI: `CommunityMessengerIncomingCallUi` + `IncomingCallBanner`
 * Call route guards: `call-client-incoming-boundary` + `use-call-client-incoming-callee-guards`
 * Route exit: `call-route-exit`
 */

export {
  INCOMING_UI_DEPRECATED_FOREGROUND_NATIVE_PILL,
  INCOMING_UI_FOREGROUND_SURFACE,
  INCOMING_UI_LOCK_SURFACE,
  resolveIncomingCallLane,
  type IncomingCallLaneSurface,
} from "./incoming-ui-ssot";

export {
  resolveForegroundIncomingPresentation,
  type ForegroundIncomingPresenterDecision,
  type ForegroundIncomingPresenterSurface,
} from "./foreground-incoming-presenter";

export { dismissIncomingPresenterAfterAccept } from "./accept-presenter-dismiss";
