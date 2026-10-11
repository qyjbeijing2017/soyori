/** Never include SDK messages: they can echo keys, headers or user prompts. */
export function remoteFailure(provider: string, error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599)
    return `AI_REQUEST_FAILED: ${provider} HTTP ${status}. Check credentials, model and service API support.`;
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    if (
      current.constructor.name === "APIConnectionError" ||
      [
        "Failed to fetch",
        "Load failed",
        "fetch failed",
        "NetworkError when attempting to fetch resource.",
      ].includes(current.message)
    )
      return `AI_REQUEST_FAILED: ${provider} network request failed. Possible causes include browser CORS, DNS, TLS or connectivity; CORS is not confirmed.`;
    current = current.cause;
  }
  return `AI_REQUEST_FAILED: ${provider} SDK request or response processing error. Check service API compatibility, model and tool support.`;
}
