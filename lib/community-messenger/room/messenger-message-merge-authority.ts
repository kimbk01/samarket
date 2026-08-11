/** Once tombstoned, a stale seed without deletedForEveryoneAt must not resurrect the body. */
export function retainDeletedForEveryoneAt(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null | undefined {
  const incomingTomb = typeof incoming === "string" && incoming.trim() ? incoming : null;
  const existingTomb = typeof existing === "string" && existing.trim() ? existing : null;
  return incomingTomb ?? existingTomb ?? incoming ?? existing;
}
