export function createTimeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || !("timeout" in AbortSignal)) {
    return undefined;
  }

  return (AbortSignal as typeof AbortSignal & { timeout(ms: number): AbortSignal }).timeout(ms);
}
