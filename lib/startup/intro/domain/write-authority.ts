/** Rebuild B: one campaign document. Never dual-write intro_scenes. */

export const INTRO_DOCUMENT_WRITE_TABLE = "intro_campaigns" as const;
export const INTRO_DOCUMENT_WRITE_COLUMN = "source" as const;

export const INTRO_FORBIDDEN_SCENE_WRITE_TABLES = ["intro_scenes", "intro_device_overrides"] as const;

export function isIntroSceneDualWriteTable(table: string): boolean {
  return (INTRO_FORBIDDEN_SCENE_WRITE_TABLES as readonly string[]).includes(table);
}
