import type { MessageKey } from "@/lib/i18n/messages";
import type { PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";
import { isMobileNativePlatform } from "@/lib/permissions/education/permission-education-platform";

export type PermissionEducationSettingsOpens = "call_media" | "browser_media" | "none";

export type PermissionEducationCopy = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  browserHelpKey?: MessageKey;
  settingsOpens: PermissionEducationSettingsOpens;
};

function callMediaSettingsOpens(): PermissionEducationSettingsOpens {
  return isMobileNativePlatform() ? "call_media" : "browser_media";
}

export function resolvePermissionEducationCopy(context: PermissionEducationContext): PermissionEducationCopy {
  const outgoing = context.flow === "outgoing";
  if (context.tier === "call_video") {
    return {
      titleKey: outgoing ? "perm_edu_call_video_out_title" : "perm_edu_call_video_in_title",
      bodyKey: outgoing ? "perm_edu_call_video_out_body" : "perm_edu_call_video_in_body",
      browserHelpKey: "perm_edu_web_browser_media_help",
      settingsOpens: callMediaSettingsOpens(),
    };
  }
  return {
    titleKey: outgoing ? "perm_edu_call_voice_out_title" : "perm_edu_call_voice_in_title",
    bodyKey: outgoing ? "perm_edu_call_voice_out_body" : "perm_edu_call_voice_in_body",
    browserHelpKey: "perm_edu_web_browser_media_help",
    settingsOpens: callMediaSettingsOpens(),
  };
}
