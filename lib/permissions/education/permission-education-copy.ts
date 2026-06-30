import type { MessageKey } from "@/lib/i18n/messages";
import type { PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";
import {
  isMobileNativePlatform,
  supportsBatteryOptimizationGuide,
  supportsFullScreenIntent,
  supportsLockScreenIncomingEducation,
} from "@/lib/permissions/education/permission-education-platform";

export type PermissionEducationSettingsOpens =
  | "call_media"
  | "fsi"
  | "battery"
  | "notification"
  | "browser_media"
  | "none";

export type PermissionEducationCopy = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  benefitKey: MessageKey;
  deniedKey?: MessageKey;
  browserHelpKey?: MessageKey;
  showOemGuide: boolean;
  settingsOpens: PermissionEducationSettingsOpens;
};

function callMediaSettingsOpens(): PermissionEducationSettingsOpens {
  return isMobileNativePlatform() ? "call_media" : "browser_media";
}

export function resolvePermissionEducationCopy(context: PermissionEducationContext): PermissionEducationCopy {
  if (context.tier === "lock_screen_fsi") {
    return {
      titleKey: "perm_edu_lock_screen_title",
      bodyKey: "perm_edu_lock_screen_body",
      benefitKey: "perm_edu_lock_screen_benefit",
      deniedKey: "perm_edu_lock_screen_denied",
      showOemGuide: supportsFullScreenIntent() && supportsLockScreenIncomingEducation(),
      settingsOpens: supportsFullScreenIntent() ? "fsi" : "none",
    };
  }
  if (context.tier === "battery_restricted") {
    return {
      titleKey: "perm_edu_battery_title",
      bodyKey: "perm_edu_battery_body",
      benefitKey: "perm_edu_battery_benefit",
      deniedKey: "perm_edu_battery_denied",
      showOemGuide: supportsBatteryOptimizationGuide(),
      settingsOpens: supportsBatteryOptimizationGuide() ? "battery" : "none",
    };
  }
  const outgoing = context.flow === "outgoing";
  if (context.tier === "call_video") {
    return {
      titleKey: outgoing ? "perm_edu_call_video_out_title" : "perm_edu_call_video_in_title",
      bodyKey: outgoing ? "perm_edu_call_video_out_body" : "perm_edu_call_video_in_body",
      benefitKey: outgoing ? "perm_edu_call_video_out_benefit" : "perm_edu_call_video_in_benefit",
      browserHelpKey: "perm_edu_web_browser_media_help",
      showOemGuide: false,
      settingsOpens: callMediaSettingsOpens(),
    };
  }
  return {
    titleKey: outgoing ? "perm_edu_call_voice_out_title" : "perm_edu_call_voice_in_title",
    bodyKey: outgoing ? "perm_edu_call_voice_out_body" : "perm_edu_call_voice_in_body",
    benefitKey: outgoing ? "perm_edu_call_voice_out_benefit" : "perm_edu_call_voice_in_benefit",
    browserHelpKey: "perm_edu_web_browser_media_help",
    showOemGuide: false,
    settingsOpens: callMediaSettingsOpens(),
  };
}
