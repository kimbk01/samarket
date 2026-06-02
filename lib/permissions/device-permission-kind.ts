export type DevicePermissionKind = "location" | "camera" | "microphone" | "notification";

export type DevicePermissionGuideKind = DevicePermissionKind | "speaker";

export type DevicePermissionFeatureKey =
  | "messenger_voice_call"
  | "messenger_video_call"
  | "messenger_current_location"
  | "delivery_current_location"
  | "delivery_address_location";

export const DEVICE_PERMISSION_FEATURE_REQUIREMENTS: Record<
  DevicePermissionFeatureKey,
  readonly DevicePermissionKind[]
> = {
  messenger_voice_call: ["microphone"],
  messenger_video_call: ["microphone", "camera"],
  messenger_current_location: ["location"],
  delivery_current_location: ["location"],
  delivery_address_location: ["location"],
} as const;
