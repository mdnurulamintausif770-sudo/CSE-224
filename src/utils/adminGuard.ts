import type { AdminGuardState } from "../types";
import { isCancelledError, safeFetchJson } from "./safeFetch";

export const MAX_ADMIN_LOGIN_ATTEMPTS = 2;
export const ADMIN_BLOCK_COOLDOWN_MS = 15 * 60 * 1000;

const CLIENT_KEY_STORAGE = "health_ai_admin_client_key_v1";
const LOCAL_GUARD_STORAGE = "health_ai_admin_guard_v1";

interface LocalGuardRecord {
  failedAttempts: number;
  maxAttempts: number;
  blockedUntil: number | null;
  lastKnownIp: string;
}

function normalizeThreshold(val: unknown): number {
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return MAX_ADMIN_LOGIN_ATTEMPTS;
  return Math.min(10, Math.max(1, Math.round(num)));
}

export function getOrCreateClientKey(): string {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return "session-fallback";
    }
    const existing = window.localStorage.getItem(CLIENT_KEY_STORAGE);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    let generated = "";
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      generated = `cli_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    } else {
      generated = `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
    window.localStorage.setItem(CLIENT_KEY_STORAGE, generated);
    return generated;
  } catch {
    return "session-fallback";
  }
}

function readLocalGuard(maxAttemptsOverride?: number): LocalGuardRecord {
  const fallbackThreshold = normalizeThreshold(maxAttemptsOverride ?? MAX_ADMIN_LOGIN_ATTEMPTS);
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return {
        failedAttempts: 0,
        maxAttempts: fallbackThreshold,
        blockedUntil: null,
        lastKnownIp: "client-local",
      };
    }
    const raw = window.localStorage.getItem(LOCAL_GUARD_STORAGE);
    if (!raw) {
      return {
        failedAttempts: 0,
        maxAttempts: fallbackThreshold,
        blockedUntil: null,
        lastKnownIp: "client-local",
      };
    }
    const parsed = JSON.parse(raw) as Partial<LocalGuardRecord>;
    const now = Date.now();
    let failedAttempts =
      typeof parsed.failedAttempts === "number" && Number.isFinite(parsed.failedAttempts)
        ? Math.max(0, Math.floor(parsed.failedAttempts))
        : 0;
    let blockedUntil =
      typeof parsed.blockedUntil === "number" && Number.isFinite(parsed.blockedUntil)
        ? parsed.blockedUntil
        : null;

    if (blockedUntil !== null && blockedUntil <= now) {
      blockedUntil = null;
      failedAttempts = 0;
    }

    const maxAttempts =
      maxAttemptsOverride !== undefined
        ? normalizeThreshold(maxAttemptsOverride)
        : normalizeThreshold(parsed.maxAttempts);

    return {
      failedAttempts,
      maxAttempts,
      blockedUntil,
      lastKnownIp:
        typeof parsed.lastKnownIp === "string" && parsed.lastKnownIp.trim()
          ? parsed.lastKnownIp.trim()
          : "client-local",
    };
  } catch {
    return {
      failedAttempts: 0,
      maxAttempts: fallbackThreshold,
      blockedUntil: null,
      lastKnownIp: "client-local",
    };
  }
}

function writeLocalGuard(record: LocalGuardRecord): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(LOCAL_GUARD_STORAGE, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors safely
  }
}

function buildState(params: {
  ip: string;
  clientKey: string;
  failedAttempts: number;
  maxAttempts: number;
  blockedUntil: number | null;
}): AdminGuardState {
  const now = Date.now();
  const isBlocked = params.blockedUntil !== null && params.blockedUntil > now;
  const remainingSeconds = isBlocked
    ? Math.max(1, Math.ceil((params.blockedUntil! - now) / 1000))
    : 0;

  return {
    ip: params.ip,
    clientKey: params.clientKey,
    failedAttempts: isBlocked ? Math.max(params.maxAttempts, params.failedAttempts) : params.failedAttempts,
    maxAttempts: params.maxAttempts,
    isBlocked,
    blockedUntil: isBlocked ? params.blockedUntil : null,
    remainingSeconds,
  };
}

export function getLocalGuardSnapshot(maxAttemptsOverride?: number): AdminGuardState {
  const clientKey = getOrCreateClientKey();
  const local = readLocalGuard(maxAttemptsOverride);
  return buildState({
    ip: local.lastKnownIp,
    clientKey,
    failedAttempts: local.failedAttempts,
    maxAttempts: local.maxAttempts,
    blockedUntil: local.blockedUntil,
  });
}

function mergeGuardStates(
  serverState: Partial<AdminGuardState> | null,
  maxAttemptsOverride?: number
): AdminGuardState {
  const clientKey = getOrCreateClientKey();
  const local = readLocalGuard(maxAttemptsOverride);
  const now = Date.now();

  const ip =
    typeof serverState?.ip === "string" && serverState.ip.trim()
      ? serverState.ip.trim()
      : local.lastKnownIp;

  const maxAttempts =
    maxAttemptsOverride !== undefined
      ? normalizeThreshold(maxAttemptsOverride)
      : normalizeThreshold(serverState?.maxAttempts ?? local.maxAttempts);

  const serverFailed =
    typeof serverState?.failedAttempts === "number" && Number.isFinite(serverState.failedAttempts)
      ? Math.max(0, Math.floor(serverState.failedAttempts))
      : 0;

  const serverBlockedUntil =
    typeof serverState?.blockedUntil === "number" &&
    Number.isFinite(serverState.blockedUntil) &&
    serverState.blockedUntil > now
      ? serverState.blockedUntil
      : null;

  const localBlockedUntil =
    local.blockedUntil !== null && local.blockedUntil > now ? local.blockedUntil : null;

  const mergedBlockedUntil =
    serverBlockedUntil && localBlockedUntil
      ? Math.max(serverBlockedUntil, localBlockedUntil)
      : serverBlockedUntil ?? localBlockedUntil;

  const mergedFailed = Math.max(serverFailed, local.failedAttempts);

  writeLocalGuard({
    failedAttempts: mergedFailed,
    maxAttempts,
    blockedUntil: mergedBlockedUntil,
    lastKnownIp: ip,
  });

  return buildState({
    ip,
    clientKey,
    failedAttempts: mergedFailed,
    maxAttempts,
    blockedUntil: mergedBlockedUntil,
  });
}

export async function fetchAdminGuardStatus(
  cancelSignal?: AbortSignal,
  maxAttemptsOverride?: number
): Promise<AdminGuardState> {
  const clientKey = getOrCreateClientKey();
  const query = new URLSearchParams({ clientKey });
  if (maxAttemptsOverride !== undefined) {
    query.set("maxAttempts", String(normalizeThreshold(maxAttemptsOverride)));
  }

  try {
    const serverState = await safeFetchJson<AdminGuardState>(
      `/api/admin/guard-status?${query.toString()}`,
      {
        method: "GET",
        timeoutMs: 6000,
        cancelSignal,
      }
    );
    return mergeGuardStates(serverState, maxAttemptsOverride);
  } catch (err: unknown) {
    if (isCancelledError(err)) {
      throw err;
    }
    return getLocalGuardSnapshot(maxAttemptsOverride);
  }
}

export async function recordAdminGuardEvent(
  eventType: "failed_login" | "login_success" | "check",
  maxAttemptsOverride?: number
): Promise<AdminGuardState> {
  const clientKey = getOrCreateClientKey();
  const local = readLocalGuard(maxAttemptsOverride);
  const now = Date.now();
  const currentlyBlocked = local.blockedUntil !== null && local.blockedUntil > now;

  let nextLocal: LocalGuardRecord = { ...local };
  if (eventType === "failed_login") {
    const nextFailed = local.failedAttempts + 1;
    const nextBlockedUntil =
      nextFailed >= local.maxAttempts
        ? now + ADMIN_BLOCK_COOLDOWN_MS
        : local.blockedUntil;
    nextLocal = {
      ...local,
      failedAttempts: nextFailed,
      blockedUntil: nextBlockedUntil,
    };
    writeLocalGuard(nextLocal);
  } else if (eventType === "login_success" && !currentlyBlocked) {
    nextLocal = {
      ...local,
      failedAttempts: 0,
      blockedUntil: null,
    };
    writeLocalGuard(nextLocal);
  }

  try {
    const serverState = await safeFetchJson<AdminGuardState>("/api/admin/guard-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 6000,
      body: JSON.stringify({
        eventType,
        clientKey,
        maxAttempts: local.maxAttempts,
      }),
    });
    return mergeGuardStates(serverState, maxAttemptsOverride);
  } catch {
    return buildState({
      ip: nextLocal.lastKnownIp,
      clientKey,
      failedAttempts: nextLocal.failedAttempts,
      maxAttempts: nextLocal.maxAttempts,
      blockedUntil: nextLocal.blockedUntil,
    });
  }
}

export async function resetAllAdminLocks(
  maxAttemptsOverride?: number
): Promise<AdminGuardState> {
  const clientKey = getOrCreateClientKey();
  const local = readLocalGuard(maxAttemptsOverride);
  const clearedLocal: LocalGuardRecord = {
    failedAttempts: 0,
    maxAttempts: local.maxAttempts,
    blockedUntil: null,
    lastKnownIp: local.lastKnownIp,
  };
  writeLocalGuard(clearedLocal);

  try {
    const serverState = await safeFetchJson<AdminGuardState>("/api/admin/guard-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 6000,
      body: JSON.stringify({
        eventType: "reset_locks",
        clientKey,
        maxAttempts: local.maxAttempts,
      }),
    });
    return mergeGuardStates(serverState, maxAttemptsOverride);
  } catch {
    return buildState({
      ip: clearedLocal.lastKnownIp,
      clientKey,
      failedAttempts: 0,
      maxAttempts: clearedLocal.maxAttempts,
      blockedUntil: null,
    });
  }
}

export async function syncAdminAttemptThreshold(maxAttempts: number): Promise<AdminGuardState> {
  const normalized = normalizeThreshold(maxAttempts);
  const clientKey = getOrCreateClientKey();
  const local = readLocalGuard(normalized);
  writeLocalGuard({ ...local, maxAttempts: normalized });

  try {
    const serverState = await safeFetchJson<AdminGuardState>("/api/admin/guard-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 6000,
      body: JSON.stringify({
        eventType: "update_threshold",
        clientKey,
        maxAttempts: normalized,
      }),
    });
    return mergeGuardStates(serverState, normalized);
  } catch {
    return getLocalGuardSnapshot(normalized);
  }
}

export function formatRemainingCooldown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}
