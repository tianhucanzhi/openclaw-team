import { LitElement, css, html } from "lit";
import type { PropertyDeclarations } from "lit";

/** Clipboard icon for copy actions (inline SVG). */
const ICON_COPY = html`<svg
  viewBox="0 0 24 24"
  width="18"
  height="18"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v1"></path>
</svg>`;

const ICON_INFO = html`<svg
  viewBox="0 0 24 24"
  width="16"
  height="16"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="10"></circle>
  <path d="M12 16v-4"></path>
  <path d="M12 8h.01"></path>
</svg>`;

type Employee = {
  id: string;
  username: string;
  port: number;
  createdAt: number;
  gatewayRunning?: boolean;
  gatewayPid?: number | null;
  /** Control UI / WebSocket `connect` token (`gateway.auth.token`). */
  gatewayToken?: string | null;
};

type MainModelsProviderRow = {
  id: string;
  label: string;
  baseUrl: string;
  api: string;
  exampleModel: string;
  hasApiKey: boolean;
};

type UsageCostTotals = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  totalCost?: number;
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  missingCostEntries?: number;
};

type UsageDimRow = {
  provider?: string;
  model?: string;
  channel?: string;
  agentId?: string;
  count?: number;
  totals?: UsageCostTotals;
};

type UsageSnapshot = {
  updatedAt?: number;
  startDate?: string;
  endDate?: string;
  totals?: UsageCostTotals;
  aggregates?: {
    messages?: { total: number; errors: number };
    tools?: { totalCalls: number };
    byProvider?: UsageDimRow[];
    byModel?: UsageDimRow[];
    byChannel?: UsageDimRow[];
    byAgent?: UsageDimRow[];
  };
};

type UsageEmployeeRow = {
  id: string;
  username: string;
  port: number;
  gatewayRunning?: boolean;
  gatewayPid?: number | null;
  ok: boolean;
  error: string | null;
  usage: UsageSnapshot | null;
  skipped?: boolean;
  note?: string | null;
};

type UsagePayload = {
  days: number;
  range: { startDate: string; endDate: string };
  employees: UsageEmployeeRow[];
};

type SkillsRow = {
  name: string;
  source: string;
  bundled: boolean;
  skillKey: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  missingCount: number;
  installCount: number;
};

type SkillsSnapshot = {
  workspaceDir?: string;
  managedSkillsDir?: string;
  summary?: {
    total: number;
    eligible: number;
    disabled: number;
    blockedByAllowlist: number;
    withMissing: number;
    withInstallOption: number;
  };
  skills?: SkillsRow[];
};

type SkillsEmployeeRow = {
  id: string;
  username: string;
  port: number;
  gatewayRunning?: boolean;
  gatewayPid?: number | null;
  ok: boolean;
  error: string | null;
  skills: SkillsSnapshot | null;
  skipped?: boolean;
  note?: string | null;
};

type SkillsPayload = {
  agentId: string;
  employees: SkillsEmployeeRow[];
};

async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  let body: string | undefined;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body: body ?? init?.body,
    credentials: "include",
  });
  const text = await res.text();
  let parsed: { error?: string } & Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return { ok: false, error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof parsed.error === "string" ? parsed.error : res.statusText,
    };
  }
  return { ok: true, data: parsed as T };
}

export class OpenClawAdminApp extends LitElement {
  static properties: PropertyDeclarations = {
    session: { state: true },
    loginUser: { state: true },
    loginPass: { state: true },
    loginError: { state: true },
    busy: { state: true },
    employees: { state: true },
    listError: { state: true },
    newUsername: { state: true },
    newPort: { state: true },
    inheritMainModels: { state: true },
    formError: { state: true },
    formOk: { state: true },
    highlightGatewayToken: { state: true },
    adminNav: { state: true },
    modelsLoading: { state: true },
    modelsError: { state: true },
    modelsOk: { state: true },
    mainModelsConfigPath: { state: true },
    editPrimary: { state: true },
    editFallbacksText: { state: true },
    modelsProviders: { state: true },
    providerSecretsDraft: { state: true },
    usageDays: { state: true },
    usageLoading: { state: true },
    usageError: { state: true },
    usagePayload: { state: true },
    skillsLoading: { state: true },
    skillsError: { state: true },
    skillsPayload: { state: true },
    skillsAgentId: { state: true },
  };

  session: "unknown" | "admin" | "none" = "unknown";
  loginUser = "";
  loginPass = "";
  loginError: string | null = null;
  busy = false;
  employees: Employee[] = [];
  listError: string | null = null;
  newUsername = "";
  newPort = "";
  /** When true (default), new employee `openclaw.json` copies model slice from main config file. */
  inheritMainModels = true;
  formError: string | null = null;
  formOk: string | null = null;
  /** Shown once after create/regenerate so admin can copy before navigating away. */
  highlightGatewayToken: string | null = null;
  /** Post-login sidebar section (extensible). */
  adminNav: "employees" | "models" | "usage" | "skills" = "employees";
  modelsLoading = false;
  modelsError: string | null = null;
  modelsOk: string | null = null;
  mainModelsConfigPath = "";
  editPrimary = "";
  editFallbacksText = "";
  modelsProviders: MainModelsProviderRow[] = [];
  providerSecretsDraft: Record<string, string> = {};
  usageDays = 30;
  usageLoading = false;
  usageError: string | null = null;
  usagePayload: UsagePayload | null = null;
  skillsLoading = false;
  skillsError: string | null = null;
  skillsPayload: SkillsPayload | null = null;
  skillsAgentId = "main";

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      --login-accent: #e85d4c;
      --login-accent-dim: #c94a4a;
      --sidebar-w: 232px;
    }

    /* ----- Session check ----- */
    .boot-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse 120% 80% at 50% -20%, #2a1a24 0%, #0c0e12 45%, #08090c 100%);
      color: var(--muted, #9aa0a6);
      font-size: 0.95rem;
    }
    .boot-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--login-accent);
      margin-right: 10px;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 0.35;
        transform: scale(0.9);
      }
      50% {
        opacity: 1;
        transform: scale(1);
      }
    }

    /* ----- Login ----- */
    .login-shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      box-sizing: border-box;
      background: radial-gradient(ellipse 100% 70% at 70% 0%, #3d1f28 0%, transparent 55%),
        radial-gradient(ellipse 80% 50% at 0% 100%, #1a2838 0%, transparent 50%),
        linear-gradient(165deg, #0e1016 0%, #0a0b0f 40%, #060708 100%);
    }
    .login-card {
      width: 100%;
      max-width: 420px;
      padding: 36px 36px 32px;
      border-radius: 16px;
      background: rgba(22, 25, 34, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      backdrop-filter: blur(12px);
    }
    .login-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }
    .login-brand__mark {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--login-accent) 0%, #9a3038 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(232, 93, 76, 0.25);
    }
    .login-brand__mark svg {
      width: 26px;
      height: 26px;
      color: #fff;
    }
    .login-brand__text h1 {
      margin: 0;
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f1f3f5;
    }
    .login-brand__text p {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: var(--muted, #9aa0a6);
    }
    .login-form label {
      font-size: 0.8rem;
      font-weight: 500;
      color: #b8bcc4;
      margin-bottom: 8px;
    }
    .login-form input {
      width: 100%;
      max-width: none;
      padding: 12px 14px;
      margin-bottom: 18px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(10, 12, 18, 0.9);
      color: #e8eaed;
      font-size: 0.95rem;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      box-sizing: border-box;
    }
    .login-form input:focus {
      outline: none;
      border-color: rgba(232, 93, 76, 0.55);
      box-shadow: 0 0 0 3px rgba(232, 93, 76, 0.15);
    }
    .login-form button[type="submit"] {
      width: 100%;
      margin-top: 8px;
      padding: 13px 18px;
      font-size: 0.95rem;
      border-radius: 10px;
      background: linear-gradient(180deg, var(--login-accent) 0%, var(--login-accent-dim) 100%);
      box-shadow: 0 4px 16px rgba(232, 93, 76, 0.22);
    }
    .login-form button[type="submit"]:hover:not(:disabled) {
      filter: brightness(1.06);
    }
    .login-foot {
      margin-top: 22px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 0.75rem;
      color: #6b7280;
      line-height: 1.5;
    }

    /* ----- App shell (post-login) ----- */
    .admin-shell {
      display: flex;
      min-height: 100vh;
      background: #0a0b0f;
    }
    .sidebar {
      width: var(--sidebar-w);
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      background: linear-gradient(180deg, #12141c 0%, #0e1016 100%);
    }
    .sidebar__brand {
      padding: 22px 20px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .sidebar__brand-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sidebar__mark {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--login-accent) 0%, #9a3038 100%);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sidebar__mark svg {
      width: 20px;
      height: 20px;
      color: #fff;
    }
    .sidebar__title {
      font-weight: 700;
      font-size: 0.95rem;
      color: #e8eaed;
    }
    .sidebar__sub {
      font-size: 0.7rem;
      color: #6b7280;
      margin-top: 2px;
    }
    .sidebar__nav {
      padding: 12px 10px;
      flex: 1;
    }
    .sidebar__item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 11px 14px;
      margin-bottom: 4px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: #b8bcc4;
      font-size: 0.9rem;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .sidebar__item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #e8eaed;
    }
    .sidebar__item--active {
      background: rgba(232, 93, 76, 0.12);
      color: #feb4a8;
      font-weight: 600;
    }
    .sidebar__item svg {
      width: 18px;
      height: 18px;
      opacity: 0.85;
    }
    .main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .main-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(14, 16, 22, 0.6);
      backdrop-filter: blur(8px);
    }
    .main-header h1 {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 600;
      color: #f1f3f5;
    }
    .main-header__actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .main-body {
      flex: 1;
      padding: 24px 28px 40px;
      overflow: auto;
    }

    .card {
      max-width: 1100px;
      margin: 0 auto;
      background: var(--panel, #171a21);
      border: 1px solid var(--border, #2a3040);
      border-radius: var(--radius, 10px);
      padding: 24px;
    }
    .card .topbar h1 {
      margin: 0 0 8px;
      font-size: 1.2rem;
      font-weight: 600;
    }
    .sub {
      color: var(--muted, #9aa0a6);
      font-size: 0.9rem;
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 0.85rem;
      margin-bottom: 6px;
      color: var(--muted, #9aa0a6);
    }
    input {
      width: 100%;
      max-width: 360px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border, #2a3040);
      background: #0b0d11;
      color: var(--text, #e8eaed);
      margin-bottom: 14px;
      box-sizing: border-box;
    }
    button {
      padding: 10px 18px;
      border-radius: 8px;
      border: none;
      background: var(--accent, #c94a4a);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--accent-hover, #e05555);
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    button.secondary {
      background: #3a4154;
    }
    button.secondary:hover:not(:disabled) {
      background: #4a5368;
    }
    button.danger {
      background: #8b3a3a;
    }
    .row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: flex-end;
      margin-bottom: 16px;
    }
    .row__cell {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .row__cell input {
      margin-bottom: 0;
    }
    /** Port + submit share one visual row so the button lines up with the port field, not the taller username block. */
    .row__port-action {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .row__port-primary {
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      gap: 12px;
    }
    .row__port-primary > div {
      display: flex;
      flex-direction: column;
    }
    .row__port-primary input {
      margin-bottom: 0;
    }
    .row__port-primary button {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .err {
      color: #f5a8a8;
      font-size: 0.9rem;
      margin: 8px 0;
    }
    .ok {
      color: var(--ok, #3d9970);
      font-size: 0.9rem;
      margin: 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 0.9rem;
    }
    th,
    td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--border, #2a3040);
    }
    th {
      color: var(--muted, #9aa0a6);
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .actions button {
      padding: 6px 12px;
      font-size: 0.8rem;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .token-banner {
      margin: 16px 0;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #2a3040);
      background: #12151c;
    }
    .token-banner code {
      display: block;
      margin: 8px 0;
      padding: 10px;
      border-radius: 6px;
      background: #0b0d11;
      font-size: 0.8rem;
      word-break: break-all;
      user-select: all;
    }
    .row__port-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .row__port-label-row > label {
      margin-bottom: 0;
    }
    .port-hint-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .port-hint-wrap summary.info-icon-btn {
      list-style: none;
      width: 28px;
      height: 28px;
      margin: 0;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #2a3048;
      color: #9aa0a6;
      cursor: pointer;
    }
    .port-hint-wrap summary.info-icon-btn::-webkit-details-marker {
      display: none;
    }
    .port-hint-wrap summary.info-icon-btn:hover {
      color: #e8eaed;
      background: #3a4154;
    }
    .port-hint-pop {
      position: absolute;
      z-index: 30;
      top: calc(100% + 6px);
      right: 0;
      width: min(300px, 85vw);
      padding: 10px 12px;
      font-size: 0.75rem;
      line-height: 1.45;
      color: #d0d4dc;
      background: #1a1f2e;
      border: 1px solid var(--border, #2a3040);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.86rem;
      font-weight: 500;
    }
    .status-pill__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3d4858;
      flex-shrink: 0;
    }
    .status-pill--run {
      color: #6ee7a8;
    }
    .status-pill--run .status-pill__dot {
      background: #34d399;
      box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.2);
    }
    .status-pill--stop {
      color: var(--muted, #9aa0a6);
      font-weight: 400;
    }

    table th:nth-child(3),
    table td:nth-child(3) {
      min-width: 12rem;
      max-width: min(56vw, 36rem);
      vertical-align: top;
    }
    .token-cell {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
    }
    .token-cell__text {
      flex: 1;
      min-width: 0;
      font-family: ui-monospace, monospace;
      font-size: 0.72rem;
      line-height: 1.45;
      word-break: break-all;
      color: #d0d4dc;
    }
    .token-cell__copy {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      margin: 0;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 8px;
      background: #3a4154;
      color: #e8eaed;
      cursor: pointer;
    }
    .token-cell__copy:hover:not(:disabled) {
      background: #4a5368;
    }
    .token-cell__copy:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .models-meta {
      font-size: 0.78rem;
      color: #7d8496;
      margin: 0 0 16px;
      word-break: break-all;
    }
    .models-section-title {
      font-size: 0.95rem;
      margin: 0 0 10px;
      color: #e8eaed;
    }
    .models-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }
    .prov-card {
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(20, 22, 30, 0.65);
    }
    .prov-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .prov-card__head strong {
      font-size: 0.88rem;
    }
    .badge-key {
      font-size: 0.65rem;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(80, 200, 120, 0.15);
      color: #8fd9a8;
    }
    .badge-key--no {
      background: rgba(120, 130, 150, 0.2);
      color: #8a919e;
    }
    .prov-card .mono {
      font-family: ui-monospace, monospace;
      font-size: 0.68rem;
      color: #9aa0a6;
      line-height: 1.4;
      margin: 0 0 6px;
      word-break: break-all;
    }
    .prov-card label {
      font-size: 0.72rem;
      margin-bottom: 4px;
    }
    .models-actions {
      margin-top: 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    textarea.fallbacks {
      min-height: 88px;
      resize: vertical;
      font-family: ui-monospace, monospace;
      font-size: 0.82rem;
    }
    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 12px 0 0;
      max-width: 52rem;
      font-size: 0.84rem;
      line-height: 1.45;
      color: #c4c8d0;
    }
    .checkbox-row input[type="checkbox"] {
      margin-top: 3px;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .checkbox-row label {
      margin: 0;
      cursor: pointer;
      font-weight: 400;
    }

    .usage-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .usage-toolbar label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .usage-toolbar select {
      max-width: 140px;
      margin: 0;
    }
    .usage-note {
      font-size: 0.82rem;
      color: var(--muted, #9aa0a6);
      margin: 0 0 16px;
      max-width: 56rem;
      line-height: 1.45;
    }
    .usage-mini {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(12, 14, 20, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .usage-mini h4 {
      margin: 0 0 8px;
      font-size: 0.82rem;
      color: #c4c8d0;
      font-weight: 600;
    }
    .usage-mini table {
      width: 100%;
      font-size: 0.78rem;
    }
    .usage-mini th,
    .usage-mini td {
      padding: 4px 8px;
      text-align: left;
    }
    .usage-mini .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    void this.refreshSession();
  }

  private async refreshSession() {
    const r = await api<{ role: string }>("/api/session");
    if (r.ok && r.data?.role === "admin") {
      this.session = "admin";
      void this.loadEmployees();
    } else {
      this.session = "none";
    }
  }

  private async loadEmployees() {
    this.listError = null;
    const r = await api<{ employees: Employee[] }>("/api/employees");
    if (!r.ok) {
      this.listError = r.error ?? "加载失败";
      return;
    }
    this.employees = r.data?.employees ?? [];
  }

  private async onLogin(e: Event) {
    e.preventDefault();
    this.loginError = null;
    this.busy = true;
    const r = await api("/api/login", {
      method: "POST",
      json: { username: this.loginUser.trim(), password: this.loginPass },
    });
    this.busy = false;
    if (!r.ok) {
      this.loginError = r.error ?? "登录失败";
      return;
    }
    this.loginPass = "";
    this.session = "admin";
    void this.loadEmployees();
  }

  private async onLogout() {
    await api("/api/logout", { method: "POST" });
    this.session = "none";
    this.employees = [];
    this.highlightGatewayToken = null;
    this.formOk = null;
    this.formError = null;
    this.listError = null;
    this.modelsError = null;
    this.modelsOk = null;
    this.modelsLoading = false;
    this.mainModelsConfigPath = "";
    this.editPrimary = "";
    this.editFallbacksText = "";
    this.modelsProviders = [];
    this.providerSecretsDraft = {};
    this.usageDays = 30;
    this.usageLoading = false;
    this.usageError = null;
    this.usagePayload = null;
    this.skillsLoading = false;
    this.skillsError = null;
    this.skillsPayload = null;
    this.skillsAgentId = "main";
    this.adminNav = "employees";
  }

  private async onCreate(e: Event) {
    e.preventDefault();
    this.formError = null;
    this.formOk = null;
    const port = Number(this.newPort);
    if (!this.newUsername.trim()) {
      this.formError = "请填写员工用户名与端口。";
      return;
    }
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      this.formError = "端口必须是 1024–65535 的整数。";
      return;
    }
    this.busy = true;
    const r = await api<{ employee: Employee; gatewayStarted?: boolean }>("/api/employees", {
      method: "POST",
      json: {
        username: this.newUsername.trim(),
        port,
        startGateway: true,
        inheritMainModels: this.inheritMainModels,
      },
    });
    this.busy = false;
    if (!r.ok) {
      this.formError = r.error ?? "创建失败";
      return;
    }
    const created = r.data as {
      gatewayToken?: string;
      gatewayStarted?: boolean;
    };
    if (typeof created?.gatewayToken === "string" && created.gatewayToken) {
      this.highlightGatewayToken = created.gatewayToken;
    }
    this.formOk = created?.gatewayStarted
      ? `已创建员工并启动网关进程。${this.inheritMainModels ? "已写入 main 模型相关配置。" : "仅写入网关 Token。"}请保存下方网关 Token。`
      : `已创建员工。${this.inheritMainModels ? "已写入 main 模型相关配置。" : "仅写入网关 Token。"}请保存下方网关 Token。`;
    this.newUsername = "";
    this.newPort = "";
    this.inheritMainModels = true;
    void this.loadEmployees();
  }

  private async startGateway(id: string) {
    this.busy = true;
    const r = await api(`/api/employees/${id}/gateway/start`, { method: "POST" });
    this.busy = false;
    if (!r.ok) {
      this.listError = r.error ?? "启动失败";
      return;
    }
    void this.loadEmployees();
  }

  private async stopGateway(id: string) {
    this.busy = true;
    const r = await api(`/api/employees/${id}/gateway/stop`, { method: "POST" });
    this.busy = false;
    if (!r.ok) {
      this.listError = r.error ?? "停止失败";
      return;
    }
    void this.loadEmployees();
  }

  private dismissTokenBanner() {
    this.highlightGatewayToken = null;
  }

  private async copyGatewayToken(token: string) {
    this.listError = null;
    this.formOk = null;
    try {
      await navigator.clipboard.writeText(token);
      this.formOk = "已复制网关 Token。";
    } catch {
      this.listError = "复制失败，请手动选择 Token 文本。";
    }
  }

  private async regenerateGatewayToken(id: string) {
    if (
      !confirm(
        "将生成新的网关 Token 并写入该员工的 openclaw.json；旧 Token 立即失效。若网关正在运行将自动重启。确定？",
      )
    ) {
      return;
    }
    this.busy = true;
    this.listError = null;
    const r = await api<{ gatewayToken: string; restarted?: boolean }>(
      `/api/employees/${id}/gateway-token`,
      { method: "POST" },
    );
    this.busy = false;
    if (!r.ok) {
      this.listError = r.error ?? "重新生成失败";
      return;
    }
    const t = r.data?.gatewayToken;
    if (typeof t === "string" && t) {
      this.highlightGatewayToken = t;
    }
    this.formOk = r.data?.restarted ? "已更新 Token 并已重启网关。" : "已更新 Token。";
    void this.loadEmployees();
  }

  private async removeEmployee(id: string) {
    if (!confirm("确定删除该员工并停止其网关？")) {
      return;
    }
    this.busy = true;
    const r = await api(`/api/employees/${id}`, { method: "DELETE" });
    this.busy = false;
    if (!r.ok) {
      this.listError = r.error ?? "删除失败";
      return;
    }
    void this.loadEmployees();
  }

  private onSelectNav(nav: "employees" | "models" | "usage" | "skills") {
    this.adminNav = nav;
    if (nav === "models") {
      void this.loadMainModels();
    }
    if (nav === "usage") {
      void this.loadUsageMonitor();
    }
    if (nav === "skills") {
      void this.loadSkillsMonitor();
    }
  }

  private fmtUsageTok(n: unknown): string {
    const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("zh-CN").format(Math.round(v));
  }

  private fmtUsageUsd(n: unknown): string {
    const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return `$${v.toFixed(3)}`;
  }

  private usageDimLabel(row: UsageDimRow): string {
    const parts = [row.provider, row.model, row.channel, row.agentId].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    return parts.length > 0 ? parts.join(" · ") : "—";
  }

  private async loadUsageMonitor() {
    this.usageLoading = true;
    this.usageError = null;
    const r = await api<UsagePayload>(`/api/employees/usage?days=${encodeURIComponent(String(this.usageDays))}`);
    this.usageLoading = false;
    if (!r.ok) {
      this.usageError = r.error ?? "加载失败";
      this.usagePayload = null;
      return;
    }
    this.usagePayload = r.data ?? null;
  }

  private async loadSkillsMonitor() {
    this.skillsLoading = true;
    this.skillsError = null;
    const r = await api<SkillsPayload>(
      `/api/employees/skills?agentId=${encodeURIComponent(this.skillsAgentId)}`,
    );
    this.skillsLoading = false;
    if (!r.ok) {
      this.skillsError = r.error ?? "加载失败";
      this.skillsPayload = null;
      return;
    }
    this.skillsPayload = r.data ?? null;
  }

  private async loadMainModels() {
    this.modelsLoading = true;
    this.modelsError = null;
    this.modelsOk = null;
    const r = await api<{
      configPath: string;
      main: { primary: string; fallbacks: string[] };
      providers: MainModelsProviderRow[];
    }>("/api/main-models");
    this.modelsLoading = false;
    if (!r.ok) {
      this.modelsError = r.error ?? "加载失败";
      return;
    }
    const d = r.data;
    if (!d) {
      return;
    }
    this.mainModelsConfigPath = d.configPath;
    this.editPrimary = d.main.primary;
    this.editFallbacksText = d.main.fallbacks.join("\n");
    this.modelsProviders = d.providers;
    this.providerSecretsDraft = {};
  }

  private async onSaveMainModels(e: Event) {
    e.preventDefault();
    this.modelsError = null;
    this.modelsOk = null;
    const primary = this.editPrimary.trim();
    const fallbacks = this.editFallbacksText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const providers: Record<string, { apiKey: string }> = {};
    for (const p of this.modelsProviders) {
      const k = (this.providerSecretsDraft[p.id] ?? "").trim();
      if (k) {
        providers[p.id] = { apiKey: k };
      }
    }
    const json: {
      main?: { primary: string; fallbacks: string[] };
      providers?: Record<string, { apiKey: string }>;
    } = {};
    if (primary) {
      json.main = { primary, fallbacks };
    }
    if (Object.keys(providers).length > 0) {
      json.providers = providers;
    }
    if (!json.main && !json.providers) {
      this.modelsError = "请填写主模型（provider/model），或至少填写一个供应商的 API Key。";
      return;
    }
    this.busy = true;
    const r = await api("/api/main-models", { method: "PUT", json });
    this.busy = false;
    if (!r.ok) {
      this.modelsError = r.error ?? "保存失败";
      return;
    }
    this.modelsOk = "已保存。可将该配置文件路径对接到本机 OpenClaw 使用，或设置 OPENCLAW_MAIN_CONFIG_PATH。";
    void this.loadMainModels();
  }

  render() {
    const brandIcon = html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L4 5v11c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-8-3z" />
    </svg>`;
    const usersIcon = html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>`;
    const modelsIcon = html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2"></rect>
      <path d="M9 9h6v6H9z"></path>
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"></path>
    </svg>`;
    const usageIcon = html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M18 20V10"></path>
      <path d="M12 20V4"></path>
      <path d="M6 20v-6"></path>
    </svg>`;
    const skillsIcon = html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l2.1 4.3L19 7l-3.5 3.4.8 4.8L12 13l-4.3 2.2.8-4.8L5 7l4.9-.7z"></path>
    </svg>`;

    if (this.session === "unknown") {
      return html`
        <div class="boot-screen">
          <span class="boot-dot"></span>
          正在检查会话…
        </div>
      `;
    }
    if (this.session === "none") {
      return html`
        <div class="login-shell">
          <div class="login-card">
            <div class="login-brand">
              <div class="login-brand__mark">${brandIcon}</div>
              <div class="login-brand__text">
                <h1>OpenClaw 管理后台</h1>
                <p>网关与员工分实例管理</p>
              </div>
            </div>
            <form class="login-form" @submit=${this.onLogin}>
              <label>用户名</label>
              <input
                type="text"
                autocomplete="username"
                placeholder="管理员账号"
                .value=${this.loginUser}
                @input=${(e: Event) => (this.loginUser = (e.target as HTMLInputElement).value)}
              />
              <label>密码</label>
              <input
                type="password"
                autocomplete="current-password"
                placeholder="请输入密码"
                .value=${this.loginPass}
                @input=${(e: Event) => (this.loginPass = (e.target as HTMLInputElement).value)}
              />
              ${this.loginError ? html`<div class="err">${this.loginError}</div>` : ""}
              <button type="submit" ?disabled=${this.busy}>${this.busy ? "登录中…" : "登录"}</button>
            </form>
            <div class="login-foot">
              仅限可信环境使用；生产环境请通过环境变量修改默认管理员密码。
            </div>
          </div>
        </div>
      `;
    }
    return html`
      <div class="admin-shell">
        <aside class="sidebar">
          <div class="sidebar__brand">
            <div class="sidebar__brand-row">
              <div class="sidebar__mark">${brandIcon}</div>
              <div>
                <div class="sidebar__title">OpenClaw</div>
                <div class="sidebar__sub">Admin</div>
              </div>
            </div>
          </div>
          <nav class="sidebar__nav" aria-label="主导航">
            <button
              type="button"
              class="sidebar__item ${this.adminNav === "employees" ? "sidebar__item--active" : ""}"
              @click=${() => this.onSelectNav("employees")}
            >
              ${usersIcon}
              员工管理
            </button>
            <button
              type="button"
              class="sidebar__item ${this.adminNav === "models" ? "sidebar__item--active" : ""}"
              @click=${() => this.onSelectNav("models")}
            >
              ${modelsIcon}
              模型管理
            </button>
            <button
              type="button"
              class="sidebar__item ${this.adminNav === "usage" ? "sidebar__item--active" : ""}"
              @click=${() => this.onSelectNav("usage")}
            >
              ${usageIcon}
              使用监控
            </button>
            <button
              type="button"
              class="sidebar__item ${this.adminNav === "skills" ? "sidebar__item--active" : ""}"
              @click=${() => this.onSelectNav("skills")}
            >
              ${skillsIcon}
              技能监控
            </button>
          </nav>
        </aside>
        <div class="main">
          <header class="main-header">
            <h1>
              ${this.adminNav === "employees"
                ? "员工管理"
                : this.adminNav === "models"
                  ? "模型管理"
                  : this.adminNav === "usage"
                    ? "使用监控"
                    : "技能监控"}
            </h1>
            <div class="main-header__actions">
              <button type="button" class="secondary" @click=${this.onLogout}>退出登录</button>
            </div>
          </header>
          <div class="main-body">
            ${this.adminNav === "employees"
              ? this.renderEmployeesPanel()
              : this.adminNav === "models"
                ? this.renderModelsPanel()
                : this.adminNav === "usage"
                  ? this.renderUsagePanel()
                  : this.renderSkillsPanel()}
          </div>
        </div>
      </div>
    `;
  }

  private renderEmployeesPanel() {
    return html`
      <div class="card">
        <div class="topbar">
          <div>
            <h1>员工与网关</h1>
            <p class="sub">每位员工独立 OPENCLAW_STATE_DIR / 配置目录与端口；保存后自动执行 openclaw gateway。</p>
          </div>
        </div>

        <h2 style="font-size:1rem;margin:0 0 12px;">新建员工</h2>
        <form @submit=${this.onCreate}>
          <div class="row">
            <div class="row__cell">
              <label>用户名（小写字母、数字、_ -）</label>
              <input
                type="text"
                .value=${this.newUsername}
                @input=${(e: Event) => (this.newUsername = (e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="row__port-action">
              <div class="row__port-primary">
                <div>
                  <div class="row__port-label-row">
                    <label>网关端口</label>
                    <details class="port-hint-wrap">
                      <summary class="info-icon-btn" aria-label="端口范围说明">${ICON_INFO}</summary>
                      <div class="port-hint-pop">
                        建议端口在 <strong>18800–28800</strong> 之间，便于与常见默认端口错开（仍须为
                        <strong>1024–65535</strong> 内未占用端口）。
                      </div>
                    </details>
                  </div>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    placeholder="例如 18800"
                    .value=${this.newPort}
                    @input=${(e: Event) => (this.newPort = (e.target as HTMLInputElement).value)}
                  />
                </div>
                <button type="submit" ?disabled=${this.busy}>创建并启动网关</button>
              </div>
            </div>
          </div>
          <div class="checkbox-row">
            <input
              id="inherit-main-models"
              type="checkbox"
              .checked=${this.inheritMainModels}
              @change=${(e: Event) => (this.inheritMainModels = (e.target as HTMLInputElement).checked)}
            />
            <label for="inherit-main-models">
              默认沿用 main 的模型配置（将主配置中的
              <code>models</code>、<code>agents.defaults.model</code> / <code>models</code> 别名、<code>auth</code>、
              <code>plugins.entries</code> 写入该员工的 <code>openclaw.json</code>，并把主环境里的
              <code>agents/main/agent/auth-profiles.json</code> 复制到该员工独立 state，否则仅有
              <code>auth.profiles</code> 元数据无法解析 API Key）。不包含 <code>workspace</code> 等路径字段。取消勾选则仅创建带网关 Token 的最小配置。
            </label>
          </div>
          ${this.formError ? html`<div class="err">${this.formError}</div>` : ""}
          ${this.formOk ? html`<div class="ok">${this.formOk}</div>` : ""}
        </form>

        ${this.highlightGatewayToken
          ? html`
              <div class="token-banner">
                <strong>网关 Token（请立即复制保存）</strong>
                <div class="sub" style="margin:6px 0 0;">
                  在 Control UI 连接该员工网关时：Gateway URL 填
                  <code style="display:inline;padding:2px 6px;">ws://127.0.0.1:&lt;端口&gt;</code>
                  ，Token 填下方同一串。
                </div>
                <code>${this.highlightGatewayToken}</code>
                <div class="actions">
                  <button type="button" @click=${() => this.copyGatewayToken(this.highlightGatewayToken!)}>
                    复制 Token
                  </button>
                  <button type="button" class="secondary" @click=${this.dismissTokenBanner}>关闭</button>
                </div>
              </div>
            `
          : ""}

        ${this.listError ? html`<div class="err">${this.listError}</div>` : ""}

        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>端口</th>
              <th>网关 Token</th>
              <th>网关</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${this.employees.length === 0
              ? html`<tr>
                  <td colspan="5">暂无员工，请在上方创建。</td>
                </tr>`
              : this.employees.map(
                  (emp) => html`
                    <tr>
                      <td>${emp.username}</td>
                      <td>${emp.port}</td>
                      <td>
                        ${emp.gatewayToken
                          ? html`
                              <div class="token-cell">
                                <span class="token-cell__text">${emp.gatewayToken}</span>
                                <button
                                  type="button"
                                  class="token-cell__copy"
                                  title="复制 Token"
                                  aria-label="复制网关 Token"
                                  ?disabled=${this.busy}
                                  @click=${() => this.copyGatewayToken(emp.gatewayToken!)}
                                >
                                  ${ICON_COPY}
                                </button>
                              </div>
                            `
                          : html`<span class="sub">未设置</span>`}
                      </td>
                      <td>
                        ${emp.gatewayRunning
                          ? html`<span class="status-pill status-pill--run"
                              ><span class="status-pill__dot" aria-hidden="true"></span>运行中${emp.gatewayPid
                                ? ` (pid ${emp.gatewayPid})`
                                : ""}</span
                            >`
                          : html`<span class="status-pill status-pill--stop"
                              ><span class="status-pill__dot" aria-hidden="true"></span>未运行</span
                            >`}
                      </td>
                      <td>
                        <div class="actions">
                          ${emp.gatewayRunning
                            ? html`<button
                                type="button"
                                class="secondary"
                                ?disabled=${this.busy}
                                @click=${() => this.stopGateway(emp.id)}
                              >
                                停止网关
                              </button>`
                            : html`<button
                                type="button"
                                ?disabled=${this.busy}
                                @click=${() => this.startGateway(emp.id)}
                              >
                                启动网关
                              </button>`}
                          <button
                            type="button"
                            class="secondary"
                            ?disabled=${this.busy}
                            @click=${() => this.regenerateGatewayToken(emp.id)}
                          >
                            新 Token
                          </button>
                          <button
                            type="button"
                            class="danger"
                            ?disabled=${this.busy}
                            @click=${() => this.removeEmployee(emp.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  `,
                )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderModelsPanel() {
    return html`
      <div class="card">
        <div class="topbar">
          <div>
            <h1>主智能体（main）与模型供应商</h1>
            <p class="sub">
              展示与保存默认使用本机 <code>~/.openclaw/openclaw.json</code>（若该文件已存在）。主模型读取顺序：
              <code>agents.list</code> 中 <strong>id 为 main</strong> 的条目 → 否则带
              <strong>default: true</strong> 的 agent → 否则 <code>agents.defaults.model</code>。供应商密钥在
              <code>models.providers</code>。可用 <code>OPENCLAW_MAIN_CONFIG_PATH</code> 强制指定其它路径。
            </p>
            ${this.mainModelsConfigPath
              ? html`<p class="models-meta">配置文件：<code>${this.mainModelsConfigPath}</code></p>`
              : ""}
          </div>
        </div>

        ${this.modelsLoading ? html`<p class="sub">加载中…</p>` : ""}
        ${this.modelsError ? html`<div class="err">${this.modelsError}</div>` : ""}
        ${this.modelsOk ? html`<div class="ok">${this.modelsOk}</div>` : ""}

        <form @submit=${this.onSaveMainModels}>
          <h2 class="models-section-title">Main 主模型与降级</h2>
          <div class="row">
            <div class="row__cell">
              <label>主模型（provider/model）</label>
              <input
                type="text"
                placeholder="例如 anthropic/claude-sonnet-4-6"
                .value=${this.editPrimary}
                @input=${(e: Event) => (this.editPrimary = (e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="row__cell">
              <label>降级模型（每行一个，可选）</label>
              <textarea
                class="fallbacks"
                placeholder="openai/gpt-5.4"
                .value=${this.editFallbacksText}
                @input=${(e: Event) => (this.editFallbacksText = (e.target as HTMLTextAreaElement).value)}
              ></textarea>
            </div>
          </div>

          <h2 class="models-section-title" style="margin-top:22px;">主流供应商 API Key</h2>
          <p class="sub" style="margin-top:0;">
            仅填写需要写入配置的密钥；留空表示不修改已有密钥。已保存的密钥不会回显。「已配置」包含
            <code>models.providers.*.apiKey</code> 以及 <code>auth.profiles</code> 里已绑定的 provider（onboard
            常见：密钥在系统凭据库，JSON 里只有 <code>mode: api_key</code>）。
          </p>
          <div class="models-grid">
            ${this.modelsProviders.map(
              (p) => html`
                <div class="prov-card">
                  <div class="prov-card__head">
                    <strong>${p.label}</strong>
                    <span class="badge-key ${p.hasApiKey ? "" : "badge-key--no"}">
                      ${p.hasApiKey ? "已配置" : "未配置"}
                    </span>
                  </div>
                  <p class="mono">${p.exampleModel}</p>
                  <p class="mono">${p.api} · ${p.baseUrl}</p>
                  <label for="key-${p.id}">API Key</label>
                  <input
                    id="key-${p.id}"
                    type="password"
                    autocomplete="off"
                    placeholder="${p.hasApiKey ? "输入新密钥以覆盖" : "粘贴 API Key"}"
                    .value=${this.providerSecretsDraft[p.id] ?? ""}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      this.providerSecretsDraft = { ...this.providerSecretsDraft, [p.id]: v };
                    }}
                  />
                </div>
              `,
            )}
          </div>

          <div class="models-actions">
            <button type="submit" ?disabled=${this.busy}>保存配置</button>
            <button type="button" class="secondary" ?disabled=${this.busy || this.modelsLoading} @click=${() => void this.loadMainModels()}>
              重新加载
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private renderUsageDimTable(title: string, rows: UsageDimRow[]) {
    if (!rows.length) {
      return html``;
    }
    return html`
      <div class="usage-mini">
        <h4>${title}</h4>
        <table>
          <thead>
            <tr>
              <th>维度</th>
              <th class="num">次数</th>
              <th class="num">Tokens</th>
              <th class="num">成本</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              (row) => html`
                <tr>
                  <td>${this.usageDimLabel(row)}</td>
                  <td class="num">
                    ${typeof row.count === "number" && Number.isFinite(row.count)
                      ? new Intl.NumberFormat("zh-CN").format(row.count)
                      : "—"}
                  </td>
                  <td class="num">${this.fmtUsageTok(row.totals?.totalTokens)}</td>
                  <td class="num">${this.fmtUsageUsd(row.totals?.totalCost)}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderUsagePanel() {
    const payload = this.usagePayload;
    const rangeLabel =
      payload?.range?.startDate && payload?.range?.endDate
        ? `${payload.range.startDate} — ${payload.range.endDate}（UTC 日历日）`
        : "";
    return html`
      <div class="card">
        <div class="topbar">
          <div>
            <h1>按员工用量</h1>
            <p class="sub">
              与 Control UI「用量」页同源：按日期区间汇总 tokens、成本、消息/工具次数，以及按供应商、模型、通道、智能体拆分。每位员工通过其网关端口调用
              <code>sessions.usage</code>。
            </p>
          </div>
        </div>

        <div class="usage-toolbar">
          <label>
            统计区间
            <select
              .value=${String(this.usageDays)}
              ?disabled=${this.usageLoading}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLSelectElement).value);
                this.usageDays = Number.isFinite(v) ? v : 30;
                void this.loadUsageMonitor();
              }}
            >
              ${[7, 14, 30, 60, 90].map((d) => html`<option value=${String(d)}>${d} 天</option>`)}
            </select>
          </label>
          <button type="button" class="secondary" ?disabled=${this.usageLoading} @click=${() => void this.loadUsageMonitor()}>
            ${this.usageLoading ? "加载中…" : "刷新"}
          </button>
          ${rangeLabel ? html`<span class="sub" style="margin:0;">${rangeLabel}</span>` : ""}
        </div>

        <p class="usage-note">
          需已为员工配置网关 Token，且该员工网关进程处于运行状态；否则 RPC 会失败。数据为各员工独立 state 下的会话用量，与主配置（main）无关。
        </p>

        ${this.usageError ? html`<div class="err">${this.usageError}</div>` : ""}
        ${this.usageLoading && !payload ? html`<p class="sub">加载中…</p>` : ""}

        ${payload
          ? html`
              <table>
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>端口</th>
                    <th>网关</th>
                    <th class="num">消息</th>
                    <th class="num">错误</th>
                    <th class="num">工具</th>
                    <th class="num">Tokens</th>
                    <th class="num">成本</th>
                    <th>备注 / 维度</th>
                  </tr>
                </thead>
                <tbody>
                  ${payload.employees.length === 0
                    ? html`<tr>
                        <td colspan="9">暂无员工。</td>
                      </tr>`
                    : payload.employees.map((emp) => {
                        const u = emp.usage;
                        const agg = u?.aggregates;
                        const gw = emp.gatewayRunning
                          ? html`运行中${typeof emp.gatewayPid === "number" ? ` · PID ${emp.gatewayPid}` : ""}`
                          : "已停止";
                        if (!emp.ok) {
                          return html`
                            <tr>
                              <td>${emp.username}</td>
                              <td>${emp.port}</td>
                              <td>${gw}</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td><span class="err" style="margin:0;font-size:0.88rem;">${emp.error ?? "失败"}</span></td>
                            </tr>
                          `;
                        }
                        if (!u) {
                          return html`
                            <tr>
                              <td>${emp.username}</td>
                              <td>${emp.port}</td>
                              <td>${gw}</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td><span class="sub" style="margin:0;">${emp.note ?? "暂无用量数据"}</span></td>
                            </tr>
                          `;
                        }
                        const msgT = agg?.messages?.total ?? 0;
                        const msgE = agg?.messages?.errors ?? 0;
                        const tools = agg?.tools?.totalCalls ?? 0;
                        const byP = agg?.byProvider ?? [];
                        const byM = agg?.byModel ?? [];
                        const byC = agg?.byChannel ?? [];
                        const byA = agg?.byAgent ?? [];
                        const hasDims = byP.length + byM.length + byC.length + byA.length > 0;
                        return html`
                          <tr>
                            <td>${emp.username}</td>
                            <td>${emp.port}</td>
                            <td>${gw}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(msgT)}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(msgE)}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(tools)}</td>
                            <td class="num">${this.fmtUsageTok(u?.totals?.totalTokens)}</td>
                            <td class="num">${this.fmtUsageUsd(u?.totals?.totalCost)}</td>
                            <td>
                              ${hasDims
                                ? html`
                                      <details>
                                        <summary style="cursor:pointer;color:#b8c0cc;">按维度展开</summary>
                                        <div style="margin-top:10px;">
                                          ${this.renderUsageDimTable("按供应商", byP)}
                                          ${this.renderUsageDimTable("按模型", byM)}
                                          ${this.renderUsageDimTable("按通道", byC)}
                                          ${this.renderUsageDimTable("按智能体", byA)}
                                        </div>
                                      </details>
                                    `
                                : html`<span class="sub" style="margin:0;">无拆分维度</span>`}
                            </td>
                          </tr>
                        `;
                      })}
                </tbody>
              </table>
            `
          : !this.usageLoading
            ? html`<p class="sub">请点击「使用监控」或「刷新」加载数据。</p>`
            : ""}
      </div>
    `;
  }

  private renderSkillsPanel() {
    const payload = this.skillsPayload;
    return html`
      <div class="card">
        <div class="topbar">
          <div>
            <h1>按员工技能状态</h1>
            <p class="sub">
              通过每个员工网关调用 <code>skills.status</code>，展示技能总数、可用/禁用/缺依赖状态，并可展开查看技能明细。
            </p>
          </div>
        </div>

        <div class="usage-toolbar">
          <label>
            Agent ID
            <input
              style="max-width:140px;margin:0;"
              .value=${this.skillsAgentId}
              ?disabled=${this.skillsLoading}
              @input=${(e: Event) => {
                this.skillsAgentId = (e.target as HTMLInputElement).value.trim() || "main";
              }}
            />
          </label>
          <button type="button" class="secondary" ?disabled=${this.skillsLoading} @click=${() => void this.loadSkillsMonitor()}>
            ${this.skillsLoading ? "加载中…" : "刷新"}
          </button>
        </div>

        ${this.skillsError ? html`<div class="err">${this.skillsError}</div>` : ""}
        ${this.skillsLoading && !payload ? html`<p class="sub">加载中…</p>` : ""}

        ${payload
          ? html`
              <table>
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>端口</th>
                    <th>网关</th>
                    <th class="num">技能总数</th>
                    <th class="num">可用</th>
                    <th class="num">禁用</th>
                    <th class="num">缺依赖</th>
                    <th class="num">可安装</th>
                    <th>备注 / 明细</th>
                  </tr>
                </thead>
                <tbody>
                  ${payload.employees.length === 0
                    ? html`<tr>
                        <td colspan="9">暂无员工。</td>
                      </tr>`
                    : payload.employees.map((emp) => {
                        const s = emp.skills;
                        const sum = s?.summary;
                        const gw = emp.gatewayRunning
                          ? html`运行中${typeof emp.gatewayPid === "number" ? ` · PID ${emp.gatewayPid}` : ""}`
                          : "已停止";
                        if (!emp.ok) {
                          return html`
                            <tr>
                              <td>${emp.username}</td>
                              <td>${emp.port}</td>
                              <td>${gw}</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td><span class="err" style="margin:0;font-size:0.88rem;">${emp.error ?? "失败"}</span></td>
                            </tr>
                          `;
                        }
                        if (!s || !sum) {
                          return html`
                            <tr>
                              <td>${emp.username}</td>
                              <td>${emp.port}</td>
                              <td>${gw}</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td class="num">—</td>
                              <td><span class="sub" style="margin:0;">${emp.note ?? "暂无技能数据"}</span></td>
                            </tr>
                          `;
                        }
                        const rows = s.skills ?? [];
                        return html`
                          <tr>
                            <td>${emp.username}</td>
                            <td>${emp.port}</td>
                            <td>${gw}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(sum.total)}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(sum.eligible)}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(sum.disabled)}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(sum.withMissing)}</td>
                            <td class="num">${new Intl.NumberFormat("zh-CN").format(sum.withInstallOption)}</td>
                            <td>
                              ${rows.length > 0
                                ? html`
                                    <details>
                                      <summary style="cursor:pointer;color:#b8c0cc;">按技能展开（${rows.length}）</summary>
                                      <div class="usage-mini" style="margin-top:10px;">
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>技能</th>
                                              <th>来源</th>
                                              <th class="num">状态</th>
                                              <th class="num">缺依赖</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            ${rows.map(
                                              (row) => html`
                                                <tr>
                                                  <td>${row.name}</td>
                                                  <td>${row.source || "—"}${row.bundled ? " · bundled" : ""}</td>
                                                  <td class="num">
                                                    ${row.disabled
                                                      ? "已禁用"
                                                      : row.blockedByAllowlist
                                                        ? "allowlist阻止"
                                                        : row.eligible
                                                          ? "可用"
                                                          : "不可用"}
                                                  </td>
                                                  <td class="num">${new Intl.NumberFormat("zh-CN").format(row.missingCount)}</td>
                                                </tr>
                                              `,
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </details>
                                  `
                                : html`<span class="sub" style="margin:0;">无技能明细</span>`}
                            </td>
                          </tr>
                        `;
                      })}
                </tbody>
              </table>
            `
          : !this.skillsLoading
            ? html`<p class="sub">请点击「技能监控」或「刷新」加载数据。</p>`
            : ""}
      </div>
    `;
  }
}

customElements.define("openclaw-admin-app", OpenClawAdminApp);
