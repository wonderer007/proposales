/**
 * Serialises read-modify-write cycles on one inquiry's working draft.
 *
 * The model can emit several tool calls in a single step, and the SDK runs
 * them concurrently. Each tool loads the draft, applies an operation and saves
 * it, so without this two concurrent calls both read the same snapshot and the
 * second save silently discards the first — an added item simply vanishes.
 *
 * Within a process this makes every mutation for an inquiry run in turn. Across
 * instances it would need optimistic locking on a version column; a single
 * chat request is handled by one instance, which is what matters here.
 */

const chains = new Map<string, Promise<unknown>>();

export function withDraftLock<T>(inquiryId: string, operation: () => Promise<T>): Promise<T> {
  const previous = chains.get(inquiryId) ?? Promise.resolve();

  // Chain off the previous operation, ignoring whether it succeeded.
  const next = previous.then(operation, operation);

  // The queue tracks a settled-only copy: a caller's rejection is theirs to
  // handle, and must not surface again here as an unhandled rejection.
  const settled = next.then(
    () => undefined,
    () => undefined,
  );

  chains.set(inquiryId, settled);

  void settled.then(() => {
    // Drop the entry once nothing else has queued behind this operation.
    if (chains.get(inquiryId) === settled) chains.delete(inquiryId);
  });

  return next;
}

export function clearDraftLocks(): void {
  chains.clear();
}
