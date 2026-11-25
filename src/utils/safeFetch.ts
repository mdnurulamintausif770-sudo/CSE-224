export class CancelledRequestError extends Error {
  constructor(message = "Request was cancelled.") {
    super(message);
    this.name = "CancelledRequestError";
  }
}

export function isCancelledError(err: unknown): boolean {
  return err instanceof CancelledRequestError;
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  cancelSignal?: AbortSignal;
}

async function performSafeFetch(
  input: RequestInfo | URL,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, cancelSignal, ...fetchInit } = options;

  if (cancelSignal?.aborted) {
    throw new CancelledRequestError();
  }

  const controller = new AbortController();
  let didTimeout = false;
  let didCancel = false;

  const onExternalCancel = () => {
    didCancel = true;
    controller.abort("cancelled_by_user");
  };

  if (cancelSignal) {
    cancelSignal.addEventListener("abort", onExternalCancel, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort("request_timeout");
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (didCancel || cancelSignal?.aborted) {
      throw new CancelledRequestError();
    }
    if (didTimeout) {
      throw new Error("The request timed out. Continuing with local mode.");
    }
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : "";
    if (name === "AbortError" || msg.toLowerCase().includes("aborted")) {
      throw new Error("The connection was interrupted. Continuing with local mode.");
    }
    throw err instanceof Error ? err : new Error("Network request failed.");
  } finally {
    window.clearTimeout(timeoutId);
    if (cancelSignal) {
      cancelSignal.removeEventListener("abort", onExternalCancel);
    }
  }
}

export async function safeFetchJson<T>(
  input: RequestInfo | URL,
  options: SafeFetchOptions = {}
): Promise<T> {
  const response = await performSafeFetch(input, options);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (
    contentType.includes("text/html") ||
    trimmed.startsWith("<") ||
    trimmed.toLowerCase().startsWith("<!doctype")
  ) {
    throw new Error("Live AI backend route returned HTML instead of JSON.");
  }

  let parsed: unknown = null;
  if (trimmed.length > 0) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Server returned an unexpected non-JSON response.");
    }
  }

  if (!response.ok) {
    const errObj =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { error?: unknown })
        : null;
    const message =
      errObj && typeof errObj.error === "string" && errObj.error.trim().length > 0
        ? errObj.error.trim()
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return parsed as T;
}
