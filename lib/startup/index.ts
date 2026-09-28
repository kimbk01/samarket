export {
  STARTUP_SESSION_KEY,
  DIBAY_STARTUP_INTRO_DOM_ID,
  STARTUP_BOOT_PATH,
  STARTUP_HANDOFF_SESSION_KEY,
  LOCAL_RUNTIME_ENTRY_PATH,
  DIBAY_RUNTIME_MODE_ASSET,
  STARTUP_CACHE_KEYS,
} from "@/lib/startup/startup-constants";
export {
  STARTUP_CONFIG_SETTINGS_KEY,
  STARTUP_CONFIG_LOCAL_STORAGE_KEY,
  BUNDLED_STARTUP_CONFIG,
  DEFAULT_STARTUP_CONFIG,
  normalizeStartupConfig,
  startupConfigEquals,
  isStartupIntroActive,
  type StartupConfig,
} from "@/lib/startup/startup-config";
export {
  BUNDLED_STARTUP_NAV,
  BUNDLED_STARTUP_ROUTE,
  readStartupConfigCache,
  writeStartupConfigCache,
  readStartupThemeCache,
  writeStartupThemeCache,
  readStartupLangCache,
  writeStartupLangCache,
  readStartupUserCache,
  writeStartupUserCache,
  readStartupNavCache,
  writeStartupNavCache,
  readStartupRouteCache,
  writeStartupRouteCache,
  scheduleStartupShellCachePersist,
  type StartupThemeCache,
  type StartupUserCache,
  type StartupNavTabCache,
  type StartupRouteCache,
} from "@/lib/startup/startup-cache";
export {
  resolveStartupRuntimeMode,
  assertExclusiveStartupRuntimeMode,
  readStartupRuntimeModeFromWindow,
  type StartupRuntimeMode,
} from "@/lib/startup/local-runtime-flag";
export {
  LOCAL_RUNTIME_STATES,
  LOCAL_RUNTIME_FORBIDDEN_STATES,
  transitionLocalRuntimeState,
  resolveLocalRuntimeAppReady,
  LocalRuntimeStateMachine,
  type LocalRuntimeState,
} from "@/lib/startup/local-runtime-state";
export { buildLocalRuntimeDocumentHtml } from "@/lib/startup/local-runtime-markup";
