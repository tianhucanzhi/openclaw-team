import { normalizeOptionalString } from "./string-coerce.ts";

const DISPLAY_MAX = 64;
const JWT_PARTS = 3;

/** Normalize a display name from URL params or JWT claims (length + strip controls). */
export function sanitizeGatewayUserDisplayLabel(raw: string | null | undefined): string | null {
  const t = normalizeOptionalString(raw);
  if (!t) {
    return null;
  }
  const cleaned = t.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.length > DISPLAY_MAX ? cleaned.slice(0, DISPLAY_MAX) : cleaned;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeJwtPayloadRecord(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== JWT_PARTS) {
    return null;
  }
  const payload = parts[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(pad);
    const json = atob(padded);
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickStringClaim(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? sanitizeGatewayUserDisplayLabel(v) : null;
}

function pickFromSub(sub: string): string | null {
  const s = sanitizeGatewayUserDisplayLabel(sub);
  if (!s) {
    return null;
  }
  if (UUID_RE.test(s)) {
    return null;
  }
  if (s.includes("|")) {
    const parts = s.split("|").map((x) => x.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    return sanitizeGatewayUserDisplayLabel(last ?? s);
  }
  return s;
}

function pickFromEmail(email: string): string | null {
  const s = sanitizeGatewayUserDisplayLabel(email);
  if (!s || !s.includes("@")) {
    return s;
  }
  return sanitizeGatewayUserDisplayLabel(s.split("@")[0] ?? s);
}

/**
 * Best-effort human label from a gateway auth token.
 * Supports JWT-shaped tokens (common claims). Opaque shared tokens return null unless
 * paired with URL `user` / `username` / `employee` params (see `applySettingsFromUrl`).
 */
export function resolveGatewayUserLabelFromToken(token: string): string | null {
  const trimmed = normalizeOptionalString(token);
  if (!trimmed) {
    return null;
  }
  const payload = decodeJwtPayloadRecord(trimmed);
  if (!payload) {
    return null;
  }
  return (
    pickStringClaim(payload, "preferred_username") ??
    pickStringClaim(payload, "username") ??
    pickStringClaim(payload, "name") ??
    (typeof payload.email === "string" ? pickFromEmail(payload.email) : null) ??
    (typeof payload.sub === "string" ? pickFromSub(payload.sub) : null)
  );
}
