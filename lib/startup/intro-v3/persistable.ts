import { isPersistableStorageMediaRef } from "@/lib/media/persistable-storage-media-ref";

/** V3 wrapper: blob / localhost / opaque refs never become READY authority. */
export function isIntroV3PersistableRef(raw: string | null | undefined): boolean {
  return isPersistableStorageMediaRef(raw);
}
