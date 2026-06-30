import type { PermissionEducationCopy } from "@/lib/permissions/education/permission-education-copy";
import {
  supportsBrowserMediaPermission,
  supportsNativeSettingsShortcut,
  supportsOemGuide,
} from "@/lib/permissions/education/permission-education-platform";

export function shouldShowNativeSettingsCta(copy: PermissionEducationCopy): boolean {
  if (!supportsNativeSettingsShortcut()) return false;
  if (copy.settingsOpens === "browser_media" || copy.settingsOpens === "none") return false;
  return true;
}

export function shouldShowOemGuide(copy: PermissionEducationCopy): boolean {
  return copy.showOemGuide && supportsOemGuide();
}

export function shouldShowBrowserMediaHelp(copy: PermissionEducationCopy): boolean {
  return supportsBrowserMediaPermission() && copy.settingsOpens === "browser_media";
}
