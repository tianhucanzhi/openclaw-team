/**
 * OpenClaw admin API + optional static hosting for `dist/ui-admin`.
 * Default admin: admin / admin1234 (override with OPENCLAW_ADMIN_USER / OPENCLAW_ADMIN_PASSWORD).
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OPENCLAW_ENTRY = path.join(REPO_ROOT, "openclaw.mjs");
/** Matches `openclaw.mjs` bootstrap (dist/entry.js or dist/entry.mjs). */
function isOpenclawDistEntryPresent() {
  const entryJs = path.join(REPO_ROOT, "dist", "entry.js");
  const entryMjs = path.join(REPO_ROOT, "dist", "entry.mjs");
  try {
    return existsSync(entryJs) || existsSync(entryMjs);
  } catch {
    return false;
  }
}
const STATIC_ROOT = path.join(REPO_ROOT, "dist", "ui-admin");
const PUBLIC_SKILLS_ROOT = path.join(REPO_ROOT, "skills");

const DATA_ROOT = process.env.OPENCLAW_ADMIN_DATA_DIR
  ? path.resolve(process.env.OPENCLAW_ADMIN_DATA_DIR)
  : path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_ROOT, "store.json");

/**
 * Where the 模型管理 page reads/writes OpenClaw JSON.
 * 1) OPENCLAW_MAIN_CONFIG_PATH — explicit
 * 2) ~/.openclaw/openclaw.json when it exists (normal install on this machine)
 * 3) OPENCLAW_CONFIG_PATH when set
 * 4) ui_admin data/main/openclaw.json as sandbox default
 */
function resolveMainOpenclawJsonPath() {
  if (process.env.OPENCLAW_MAIN_CONFIG_PATH) {
    return path.resolve(process.env.OPENCLAW_MAIN_CONFIG_PATH);
  }
  const userProfileConfig = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    if (existsSync(userProfileConfig)) {
      return userProfileConfig;
    }
  } catch {
    /* ignore */
  }
  if (process.env.OPENCLAW_CONFIG_PATH) {
    return path.resolve(process.env.OPENCLAW_CONFIG_PATH);
  }
  return path.join(DATA_ROOT, "main", "openclaw.json");
}

const MAIN_OPENCLAW_JSON_PATH = resolveMainOpenclawJsonPath();

/**
 * Presets for `models.providers.<id>` (alphabetical by id). Short model ids match OpenClaw refs `id/modelId`.
 * @type {ReadonlyArray<{ id: string; label: string; baseUrl: string; api: string; modelId: string; modelName: string }>}
 */
const MAIN_MODEL_PROVIDER_PRESETS = Object.freeze(
  [
    {
      id: "anthropic",
      label: "Anthropic（Claude）",
      baseUrl: "https://api.anthropic.com",
      api: "anthropic-messages",
      modelId: "claude-sonnet-4-6",
      modelName: "Claude Sonnet 4.6",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      api: "openai-completions",
      modelId: "deepseek-chat",
      modelName: "DeepSeek Chat",
    },
    {
      id: "google",
      label: "Google（Gemini）",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      api: "google-generative-ai",
      modelId: "gemini-2.5-flash",
      modelName: "Gemini 2.5 Flash",
    },
    {
      id: "groq",
      label: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      api: "openai-completions",
      modelId: "llama-3.3-70b-versatile",
      modelName: "Llama 3.3 70B Versatile",
    },
    {
      id: "mistral",
      label: "Mistral AI",
      baseUrl: "https://api.mistral.ai/v1",
      api: "openai-completions",
      modelId: "mistral-large-latest",
      modelName: "Mistral Large Latest",
    },
    {
      id: "moonshot",
      label: "Moonshot（Kimi）",
      baseUrl: "https://api.moonshot.ai/v1",
      api: "openai-completions",
      modelId: "kimi-k2.5",
      modelName: "Kimi K2.5",
    },
    {
      id: "ollama",
      label: "Ollama（本地）",
      baseUrl: "http://127.0.0.1:11434/v1",
      api: "openai-completions",
      modelId: "llama3.2",
      modelName: "Llama 3.2",
    },
    {
      id: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      api: "openai-completions",
      modelId: "gpt-5.4",
      modelName: "GPT-5.4",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      api: "openai-completions",
      modelId: "auto",
      modelName: "OpenRouter Auto",
    },
    {
      id: "together",
      label: "Together AI",
      baseUrl: "https://api.together.xyz/v1",
      api: "openai-completions",
      modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      modelName: "Llama 3.3 70B Instruct Turbo",
    },
    {
      id: "zai",
      label: "Z.AI（智谱 GLM）",
      baseUrl: "https://api.z.ai/api/paas/v4",
      api: "openai-completions",
      modelId: "glm-5.1",
      modelName: "GLM-5.1",
    },
    {
      id: "xai",
      label: "xAI（Grok）",
      baseUrl: "https://api.x.ai/v1",
      api: "openai-responses",
      modelId: "grok-4",
      modelName: "Grok 4",
    },
  ].sort((a, b) => a.id.localeCompare(b.id)),
);

/** Same logical provider may use legacy keys in `models.providers` (e.g. `z-ai` vs `zai`). */
function providerConfigEntry(cfg, presetId) {
  const providers = cfg.models?.providers;
  if (!providers || typeof providers !== "object") {
    return undefined;
  }
  if (providers[presetId]) {
    return providers[presetId];
  }
  if (presetId === "zai") {
    return providers["z-ai"] ?? providers["z.ai"];
  }
  return undefined;
}

/**
 * True when auth is declared in config (plain string, `${VAR}`, or SecretRef object).
 * OpenClaw `apiKey` is often an object `{ source: "env", provider, id }`, which the old string-only check missed.
 */
function secretInputDeclaresValue(apiKey) {
  if (apiKey == null) {
    return false;
  }
  if (typeof apiKey === "object" && apiKey !== null && !Array.isArray(apiKey)) {
    if (apiKey.source === "env" && typeof apiKey.id === "string" && apiKey.id.trim()) {
      return true;
    }
    if (apiKey.source === "file" || apiKey.source === "exec") {
      return true;
    }
    return false;
  }
  if (typeof apiKey === "string") {
    return apiKey.trim().length > 0;
  }
  return false;
}

function providerAuthLooksConfigured(prov) {
  if (!prov || typeof prov !== "object") {
    return false;
  }
  if (secretInputDeclaresValue(prov.apiKey)) {
    return true;
  }
  const auth = prov.request?.auth;
  if (auth && typeof auth === "object" && auth.mode === "authorization-bearer") {
    return secretInputDeclaresValue(auth.token);
  }
  return false;
}

function authProfileProviderMatchesPreset(profProvider, presetId) {
  const p = String(profProvider ?? "").trim();
  if (presetId === "zai") {
    return p === "zai" || p === "z-ai" || p === "z.ai";
  }
  return p === presetId;
}

/**
 * `openclaw onboard` often stores keys in the host auth store; `openclaw.json` only has
 * `auth.profiles.<id>.{ provider, mode }` (e.g. `zai:default` + `api_key`) with no `models.providers.*.apiKey`.
 */
function authProfilesDeclareProviderCredentials(cfg, presetId) {
  const profiles = cfg.auth?.profiles;
  if (!profiles || typeof profiles !== "object") {
    return false;
  }
  for (const prof of Object.values(profiles)) {
    if (!prof || typeof prof !== "object") {
      continue;
    }
    if (!authProfileProviderMatchesPreset(prof.provider, presetId)) {
      continue;
    }
    const mode = prof.mode;
    if (mode === "api_key" || mode === "token" || mode === "oauth") {
      return true;
    }
  }
  return false;
}

function providerCredentialConfiguredForPreset(cfg, presetId) {
  return (
    providerAuthLooksConfigured(providerConfigEntry(cfg, presetId)) ||
    authProfilesDeclareProviderCredentials(cfg, presetId)
  );
}

async function loadMainOpenclawJson() {
  try {
    const raw = await fs.readFile(MAIN_OPENCLAW_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMainOpenclawJson(cfg) {
  await fs.mkdir(path.dirname(MAIN_OPENCLAW_JSON_PATH), { recursive: true });
  await fs.writeFile(MAIN_OPENCLAW_JSON_PATH, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

function resolveMainModel(cfg) {
  const list = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const mainEntry =
    list.find((a) => a && typeof a === "object" && a.id === "main") ??
    list.find((a) => a && typeof a === "object" && a.default === true);
  const raw = mainEntry?.model ?? cfg.agents?.defaults?.model;
  if (raw == null) {
    return { primary: "", fallbacks: [] };
  }
  if (typeof raw === "string") {
    return { primary: raw.trim(), fallbacks: [] };
  }
  const primary = typeof raw.primary === "string" ? raw.primary.trim() : "";
  const fallbacks = Array.isArray(raw.fallbacks)
    ? raw.fallbacks.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return { primary, fallbacks };
}

function mergeMainAgentModel(cfg, main) {
  const primary = typeof main?.primary === "string" ? main.primary.trim() : "";
  if (!primary || !primary.includes("/")) {
    throw new Error("主模型需为 provider/model 形式（例如 anthropic/claude-sonnet-4-6）。");
  }
  const fallbacks = Array.isArray(main?.fallbacks)
    ? main.fallbacks.map((x) => String(x).trim()).filter(Boolean)
    : [];
  for (const ref of [primary, ...fallbacks]) {
    if (!/^[^\s/]+\/[^\s/]+$/.test(ref)) {
      throw new Error(`无效的模型引用: ${ref}`);
    }
  }
  const modelObj =
    fallbacks.length > 0 ? { primary, fallbacks } : { primary };
  const list = Array.isArray(cfg.agents?.list) ? [...cfg.agents.list] : [];
  const idx = list.findIndex((a) => a && typeof a === "object" && a.id === "main");
  if (idx === -1) {
    list.push({ id: "main", default: true, model: modelObj });
  } else {
    const prev = list[idx] && typeof list[idx] === "object" ? list[idx] : {};
    list[idx] = { ...prev, id: "main", model: modelObj };
  }
  cfg.agents = { ...(cfg.agents && typeof cfg.agents === "object" ? cfg.agents : {}), list };
}

function resolveMainWorkspaceDir(cfg) {
  if (!cfg || typeof cfg !== "object") {
    return "";
  }
  const list = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const mainEntry =
    list.find((a) => a && typeof a === "object" && a.id === "main") ??
    list.find((a) => a && typeof a === "object" && a.default === true);
  const fromMainEntry = typeof mainEntry?.workspace === "string" ? mainEntry.workspace.trim() : "";
  if (fromMainEntry) {
    return fromMainEntry;
  }
  const fromDefaults =
    typeof cfg.agents?.defaults?.workspace === "string" ? cfg.agents.defaults.workspace.trim() : "";
  if (fromDefaults) {
    return fromDefaults;
  }
  return "";
}

function resolveSharedMainSkillsDir(mainCfg) {
  const mainWorkspace = resolveMainWorkspaceDir(mainCfg);
  const candidates = [];
  if (mainWorkspace) {
    candidates.push(path.join(mainWorkspace, "skills"));
  }
  candidates.push(path.join(resolveMainOpenclawStateRoot(), "workspace", "skills"));
  candidates.push(path.join(REPO_ROOT, "skills"));
  for (const dir of candidates) {
    try {
      if (existsSync(dir)) {
        return dir;
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return candidates[0];
}

function isSafeSimpleName(name) {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name);
}

function resolvePublicSkillDir(skillId) {
  const id = String(skillId ?? "").trim();
  if (!isSafeSimpleName(id)) {
    throw new Error("无效技能名称");
  }
  const abs = path.resolve(PUBLIC_SKILLS_ROOT, id);
  const normalizedRoot = path.normalize(PUBLIC_SKILLS_ROOT + path.sep);
  const normalizedAbs = path.normalize(abs + path.sep);
  if (!normalizedAbs.startsWith(normalizedRoot)) {
    throw new Error("技能路径越界");
  }
  return abs;
}

function resolvePublicSkillFile(skillId, relPath) {
  const baseDir = resolvePublicSkillDir(skillId);
  const nextRel = String(relPath ?? "").replace(/\\/g, "/").trim();
  if (!nextRel || nextRel.startsWith("/") || nextRel.includes("..")) {
    throw new Error("无效文件路径");
  }
  const abs = path.resolve(baseDir, nextRel);
  const normalizedBase = path.normalize(baseDir + path.sep);
  const normalizedAbs = path.normalize(abs);
  if (!normalizedAbs.startsWith(normalizedBase)) {
    throw new Error("文件路径越界");
  }
  return abs;
}

async function listPublicSkills() {
  await fs.mkdir(PUBLIC_SKILLS_ROOT, { recursive: true });
  const entries = await fs.readdir(PUBLIC_SKILLS_ROOT, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!isSafeSimpleName(entry.name)) {
      continue;
    }
    const skillDir = path.join(PUBLIC_SKILLS_ROOT, entry.name);
    let children = [];
    try {
      children = await fs.readdir(skillDir, { withFileTypes: true });
    } catch {
      children = [];
    }
    const files = [];
    const collectFilesRecursively = async (baseDir, relPrefix = "") => {
      let rows = [];
      try {
        rows = await fs.readdir(baseDir, { withFileTypes: true });
      } catch {
        rows = [];
      }
      for (const row of rows) {
        const relPath = relPrefix ? `${relPrefix}/${row.name}` : row.name;
        if (row.isDirectory()) {
          if (row.name.startsWith(".")) {
            continue;
          }
          await collectFilesRecursively(path.join(baseDir, row.name), relPath);
          continue;
        }
        if (!row.isFile()) {
          continue;
        }
        files.push(relPath);
      }
    };
    await collectFilesRecursively(skillDir);
    files.sort((a, b) => a.localeCompare(b, "en"));
    const hasSkillDoc = files.includes("SKILL.md");
    skills.push({
      id: entry.name,
      hasSkillDoc,
      files,
      hasScriptsDir: children.some((c) => c.isDirectory() && c.name === "scripts"),
    });
  }
  skills.sort((a, b) => a.id.localeCompare(b.id, "en"));
  return skills;
}

async function seedSharedSkillsIntoWorkspace(params) {
  const sharedSkillsDir = String(params.sharedSkillsDir ?? "").trim();
  const workspaceDir = String(params.workspaceDir ?? "").trim();
  if (!sharedSkillsDir || !workspaceDir) {
    return;
  }
  if (!existsSync(sharedSkillsDir)) {
    return;
  }
  const targetSkillsDir = path.join(workspaceDir, "skills");
  await fs.mkdir(targetSkillsDir, { recursive: true });
  let entries;
  try {
    entries = await fs.readdir(sharedSkillsDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith(".")) {
      continue;
    }
    const srcDir = path.join(sharedSkillsDir, entry.name);
    const destDir = path.join(targetSkillsDir, entry.name);
    if (existsSync(destDir)) {
      // Keep employee-local edits; only seed skills that are missing locally.
      continue;
    }
    try {
      await fs.cp(srcDir, destDir, { recursive: true });
    } catch {
      // Best effort; skip individual skill copy failures.
    }
  }
}

/** When updating Z.AI, keep writing to the same `models.providers` key the user already uses (`z-ai` vs `zai`). */
function providerStorageKeyForWrite(cfg, presetId) {
  if (presetId !== "zai") {
    return presetId;
  }
  const providers = cfg.models?.providers;
  if (!providers || typeof providers !== "object") {
    return "zai";
  }
  if (providers.zai) {
    return "zai";
  }
  if (providers["z-ai"]) {
    return "z-ai";
  }
  if (providers["z.ai"]) {
    return "z.ai";
  }
  return "zai";
}

function mergeProviderApiKeys(cfg, providersBody) {
  if (!providersBody || typeof providersBody !== "object") {
    return;
  }
  cfg.models = cfg.models && typeof cfg.models === "object" ? cfg.models : {};
  if (!cfg.models.mode) {
    cfg.models.mode = "merge";
  }
  cfg.models.providers =
    cfg.models.providers && typeof cfg.models.providers === "object" ? cfg.models.providers : {};
  for (const [pid, row] of Object.entries(providersBody)) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const apiKey = typeof row.apiKey === "string" ? row.apiKey.trim() : "";
    if (!apiKey) {
      continue;
    }
    const preset = MAIN_MODEL_PROVIDER_PRESETS.find((p) => p.id === pid);
    if (!preset) {
      continue;
    }
    const storeKey = providerStorageKeyForWrite(cfg, pid);
    const prev =
      cfg.models.providers[storeKey] && typeof cfg.models.providers[storeKey] === "object"
        ? cfg.models.providers[storeKey]
        : {};
    const prevBase = typeof prev.baseUrl === "string" && prev.baseUrl.trim() ? prev.baseUrl.trim() : "";
    const prevApi = typeof prev.api === "string" && prev.api.trim() ? prev.api.trim() : "";
    cfg.models.providers[storeKey] = {
      ...prev,
      baseUrl: prevBase || preset.baseUrl,
      api: prevApi || preset.api,
      apiKey,
      models:
        Array.isArray(prev.models) && prev.models.length > 0
          ? prev.models
          : [{ id: preset.modelId, name: preset.modelName }],
    };
  }
}

const ADMIN_USER = process.env.OPENCLAW_ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.OPENCLAW_ADMIN_PASSWORD ?? "admin1234";

const SERVER_PORT = Number(process.env.OPENCLAW_ADMIN_SERVER_PORT ?? "38765");
const SERVER_HOST = process.env.OPENCLAW_ADMIN_BIND ?? "127.0.0.1";

const SESSION_COOKIE = "openclaw_admin_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24;
const BODY_LIMIT = 512_000;

/** @type {Map<string, { role: string, expires: number }>} */
const sessions = new Map();

/** @type {Map<string, { child: import('node:child_process').ChildProcess }>} */
const gatewayByEmployeeId = new Map();

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

function timingSafeStringEq(a, b) {
  try {
    const ba = Buffer.from(String(a), "utf8");
    const bb = Buffer.from(String(b), "utf8");
    if (ba.length !== bb.length) {
      return false;
    }
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Shared secret for Control UI / WebSocket `connect` when `gateway.auth.mode` is `token`. */
function generateGatewayToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Copy model-related slices from the resolved main `openclaw.json` into an employee gateway config.
 * Omits host paths like `agents.defaults.workspace` so each employee keeps an isolated state dir.
 */
function extractEmployeeModelSliceFromMainConfig(mainCfg) {
  if (!mainCfg || typeof mainCfg !== "object") {
    return {};
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  if (mainCfg.models && typeof mainCfg.models === "object") {
    out.models = deepCloneJson(mainCfg.models);
  }
  const defs = mainCfg.agents?.defaults;
  if (defs && typeof defs === "object") {
    /** @type {Record<string, unknown>} */
    const pick = {};
    if (defs.model !== undefined) {
      pick.model = deepCloneJson(defs.model);
    }
    if (defs.models !== undefined) {
      pick.models = deepCloneJson(defs.models);
    }
    if (Object.keys(pick).length > 0) {
      out.agents = { defaults: pick };
    }
  }
  if (mainCfg.auth && typeof mainCfg.auth === "object") {
    out.auth = deepCloneJson(mainCfg.auth);
  }
  if (mainCfg.plugins?.entries && typeof mainCfg.plugins.entries === "object") {
    out.plugins = { entries: deepCloneJson(mainCfg.plugins.entries) };
  }
  return out;
}

/**
 * State root where `agents/<id>/agent/auth-profiles.json` lives for the **main** install.
 * Defaults to the directory containing the resolved main `openclaw.json` (e.g. `~/.openclaw`).
 */
function resolveMainOpenclawStateRoot() {
  if (process.env.OPENCLAW_MAIN_STATE_DIR) {
    return path.resolve(process.env.OPENCLAW_MAIN_STATE_DIR);
  }
  return path.dirname(MAIN_OPENCLAW_JSON_PATH);
}

/**
 * `auth.profiles` in openclaw.json does not contain secrets; keys live in `auth-profiles.json`
 * under the agent dir. Employee gateways use an isolated `OPENCLAW_STATE_DIR`, so copy main's store.
 */
async function copyMainAgentAuthProfilesToEmployee(employee) {
  const mainRoot = resolveMainOpenclawStateRoot();
  const src = path.join(mainRoot, "agents", "main", "agent", "auth-profiles.json");
  if (!existsSync(src)) {
    return;
  }
  const destDir = path.join(employeeDir(employee), "state", "agents", "main", "agent");
  await fs.mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, "auth-profiles.json");
  await fs.copyFile(src, dest);
}

/**
 * Whether employee config should restrict fs tools to workspace and deny exec/process.
 * True when admin checks "tighten to workspace", or legacy store rows used path fields.
 * @param {unknown} emp
 */
function employeeTightensWorkspaceScope(emp) {
  if (emp?.tightenWorkspaceScope === true) {
    return true;
  }
  if (typeof emp?.workspaceWritePath === "string" && emp.workspaceWritePath.trim()) {
    return true;
  }
  if (typeof emp?.workspaceReadPath === "string" && emp.workspaceReadPath.trim()) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} emp
 * @param {{ inheritMainModels?: boolean; mergeIntoExisting?: boolean; syncMainModels?: boolean }} [options]
 */
async function writeEmployeeGatewayConfig(emp, options = {}) {
  const dir = employeeDir(emp);
  const defaultWorkspaceDir = employeeWorkspaceDir(emp);
  const resolvedWriteWorkspace = resolveEmployeeWorkspaceWriteAbs(emp);
  const configPath = path.join(dir, "openclaw.json");
  const token = typeof emp.gatewayToken === "string" ? emp.gatewayToken.trim() : "";
  const bindEnvRaw =
    typeof process.env.OPENCLAW_ADMIN_EMPLOYEE_GATEWAY_BIND === "string"
      ? process.env.OPENCLAW_ADMIN_EMPLOYEE_GATEWAY_BIND.trim().toLowerCase()
      : "";
  const bindAllowed = new Set(["loopback", "lan", "auto"]);
  let gatewayBind = bindAllowed.has(bindEnvRaw) ? bindEnvRaw : token ? "lan" : "loopback";
  // Non-loopback binds require gateway auth; keep loopback when no token.
  if (!token && gatewayBind !== "loopback") {
    gatewayBind = "loopback";
  }

  /** @type {Record<string, unknown>} */
  let cfg = {};

  if (options.mergeIntoExisting) {
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw);
      cfg = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      cfg = {};
    }
  } else {
    const inheritMainModels = options.inheritMainModels !== false;
    if (inheritMainModels) {
      const mainCfg = await loadMainOpenclawJson();
      cfg = extractEmployeeModelSliceFromMainConfig(mainCfg);
    }
  }
  const mainCfg = await loadMainOpenclawJson();

  if (options.syncMainModels === true) {
    const slice = extractEmployeeModelSliceFromMainConfig(mainCfg);
    if (slice.models !== undefined) {
      cfg.models = slice.models;
    }
    if (slice.auth !== undefined) {
      cfg.auth = slice.auth;
    }
    if (slice.plugins?.entries !== undefined) {
      cfg.plugins = cfg.plugins && typeof cfg.plugins === "object" ? { ...cfg.plugins } : {};
      cfg.plugins.entries = slice.plugins.entries;
    }
    if (slice.agents?.defaults && typeof slice.agents.defaults === "object") {
      cfg.agents = cfg.agents && typeof cfg.agents === "object" ? { ...cfg.agents } : {};
      cfg.agents.defaults =
        cfg.agents.defaults && typeof cfg.agents.defaults === "object"
          ? { ...cfg.agents.defaults }
          : {};
      const sd = slice.agents.defaults;
      if (sd.model !== undefined) {
        cfg.agents.defaults.model = sd.model;
      }
      if (sd.models !== undefined) {
        cfg.agents.defaults.models = sd.models;
      }
    }
  }

  const prevGw = cfg.gateway && typeof cfg.gateway === "object" ? cfg.gateway : {};
  const prevControlUi =
    prevGw.controlUi && typeof prevGw.controlUi === "object" ? { ...prevGw.controlUi } : {};
  // LAN/auto bind:
  // - Origin allowlist defaults to localhost/127.0.0.1 only; Host-header fallback allows http://<lan-ip>:<port>.
  // - Plain HTTP on a LAN IP is not a secure context: browsers cannot use device identity (SubtleCrypto).
  //   dangerouslyDisableDeviceAuth lets token-authenticated Control UI operators connect without device keys.
  const enableLanControlUiRelaxations = gatewayBind === "lan" || gatewayBind === "auto";
  const enableControlUiOriginFallback =
    enableLanControlUiRelaxations &&
    prevControlUi.dangerouslyAllowHostHeaderOriginFallback !== false;
  const enableControlUiDisableDeviceAuth =
    enableLanControlUiRelaxations && prevControlUi.dangerouslyDisableDeviceAuth !== false;

  cfg.gateway = {
    ...prevGw,
    mode: "local",
    bind: gatewayBind,
    ...(token
      ? {
          auth: {
            mode: "token",
            token,
          },
        }
      : {}),
    controlUi: {
      ...prevControlUi,
      ...(enableControlUiOriginFallback
        ? { dangerouslyAllowHostHeaderOriginFallback: true }
        : {}),
      ...(enableControlUiDisableDeviceAuth ? { dangerouslyDisableDeviceAuth: true } : {}),
    },
  };

  // Keep employee gateways on isolated workspaces (override via store `workspaceWritePath`).
  cfg.agents = cfg.agents && typeof cfg.agents === "object" ? cfg.agents : {};
  cfg.agents.defaults =
    cfg.agents.defaults && typeof cfg.agents.defaults === "object" ? cfg.agents.defaults : {};
  cfg.agents.defaults.workspace = resolvedWriteWorkspace;

  // Seed main shared skills into each employee workspace so subsequent edits stay local.
  const sharedMainSkillsDir = resolveSharedMainSkillsDir(mainCfg);
  await seedSharedSkillsIntoWorkspace({
    sharedSkillsDir: sharedMainSkillsDir,
    workspaceDir: resolvedWriteWorkspace,
  });

  // Do not expose shared main skills path directly; otherwise tool invocations will
  // keep operating on global paths instead of employee-local workspace copies.
  cfg.skills = cfg.skills && typeof cfg.skills === "object" ? cfg.skills : {};
  cfg.skills.load = cfg.skills.load && typeof cfg.skills.load === "object" ? cfg.skills.load : {};
  const extraDirsCurrent = Array.isArray(cfg.skills.load.extraDirs) ? cfg.skills.load.extraDirs : [];
  const normalizedShared = sharedMainSkillsDir.trim().toLowerCase();
  const extraDirsNext = extraDirsCurrent
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v && v.trim().toLowerCase() !== normalizedShared);
  cfg.skills.load.extraDirs = extraDirsNext;

  // Admin "tighten to workspace": fs tools stay under `agents.defaults.workspace` and
  // host shell tools are deny-listed so agents cannot bypass via `dir D:\\` etc.
  const tightenWs = employeeTightensWorkspaceScope(emp);
  if (tightenWs) {
    cfg.tools = cfg.tools && typeof cfg.tools === "object" ? { ...cfg.tools } : {};
    cfg.tools.fs =
      cfg.tools.fs && typeof cfg.tools.fs === "object" ? { ...cfg.tools.fs } : {};
    cfg.tools.fs.workspaceOnly = true;
    const runtimeDeny = ["exec", "process"];
    const prevDeny = Array.isArray(cfg.tools.deny)
      ? cfg.tools.deny.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
      : [];
    const seen = new Set(prevDeny.map((v) => v.toLowerCase()));
    for (const id of runtimeDeny) {
      if (!seen.has(id)) {
        seen.add(id);
        prevDeny.push(id);
      }
    }
    cfg.tools.deny = prevDeny;
  } else if (cfg.tools && typeof cfg.tools === "object") {
    cfg.tools = { ...cfg.tools };
    if (cfg.tools.fs && typeof cfg.tools.fs === "object") {
      const fsNext = { ...cfg.tools.fs };
      delete fsNext.workspaceOnly;
      if (Object.keys(fsNext).length === 0) {
        delete cfg.tools.fs;
      } else {
        cfg.tools.fs = fsNext;
      }
    }
    if (Array.isArray(cfg.tools.deny)) {
      const drop = new Set(["exec", "process"]);
      const pruned = cfg.tools.deny.filter(
        (v) => typeof v !== "string" || !drop.has(v.trim().toLowerCase()),
      );
      if (pruned.length === 0) {
        delete cfg.tools.deny;
      } else {
        cfg.tools.deny = pruned;
      }
    }
    if (Object.keys(cfg.tools).length === 0) {
      delete cfg.tools;
    }
  }

  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(defaultWorkspaceDir, { recursive: true });
  await fs.mkdir(resolvedWriteWorkspace, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");

  if (!options.mergeIntoExisting && options.inheritMainModels !== false) {
    try {
      await copyMainAgentAuthProfilesToEmployee(emp);
    } catch (err) {
      process.stderr.write(
        `[openclaw-ui-admin] warn: could not copy main auth-profiles.json for employee ${emp.id}: ${String(err?.message ?? err)}\n`,
      );
    }
  }
  if (options.syncMainModels === true) {
    try {
      await copyMainAgentAuthProfilesToEmployee(emp);
    } catch (err) {
      process.stderr.write(
        `[openclaw-ui-admin] warn: could not copy main auth-profiles.json after model sync for employee ${emp.id}: ${String(err?.message ?? err)}\n`,
      );
    }
  }
}

async function ensureDataDir() {
  await fs.mkdir(path.join(DATA_ROOT, "employees"), { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, "main"), { recursive: true });
}

function loadStore() {
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.employees)) {
      return { version: 1, employees: [] };
    }
    return parsed;
  } catch {
    return { version: 1, employees: [] };
  }
}

function saveStore(store) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function parseCookies(header) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie ?? "");
  return cookies[SESSION_COOKIE] ?? "";
}

function getSession(req) {
  const token = getSessionToken(req);
  if (!token) {
    return null;
  }
  const row = sessions.get(token);
  if (!row || row.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return row;
}

function setSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > BODY_LIMIT) {
      throw new Error("body too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isAdmin(req) {
  const s = getSession(req);
  return Boolean(s && s.role === "admin");
}

function resolveEmployeeDirKey(employee) {
  if (!employee || typeof employee !== "object") {
    return "";
  }
  const byDirName = typeof employee.dirName === "string" ? employee.dirName.trim() : "";
  if (byDirName) {
    return byDirName;
  }
  const username = typeof employee.username === "string" ? employee.username.trim() : "";
  const id = typeof employee.id === "string" ? employee.id.trim() : "";
  if (!username) {
    return id;
  }
  const usernameDir = path.join(DATA_ROOT, "employees", username);
  const idDir = id ? path.join(DATA_ROOT, "employees", id) : "";
  if (existsSync(idDir)) {
    return id;
  }
  return username;
}

function employeeDir(employeeRef) {
  if (employeeRef && typeof employeeRef === "object") {
    const key = resolveEmployeeDirKey(employeeRef);
    return path.join(DATA_ROOT, "employees", key);
  }
  const id = String(employeeRef ?? "").trim();
  const store = loadStore();
  const employee = store.employees.find((row) => row && row.id === id);
  const key = employee ? resolveEmployeeDirKey(employee) : id;
  return path.join(DATA_ROOT, "employees", key);
}

function employeeWorkspaceDir(id) {
  return path.join(employeeDir(id), "workspace");
}

/** Absolute workspace for agent tools; optional per-employee override in store. */
function resolveEmployeeWorkspaceWriteAbs(emp) {
  const def = employeeWorkspaceDir(emp);
  const w = typeof emp?.workspaceWritePath === "string" ? emp.workspaceWritePath.trim() : "";
  return w ? path.resolve(w) : def;
}

function normalizeOptionalPathString(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  const t = raw.trim();
  return t ? path.resolve(t) : "";
}

function employeeHomeDir(id) {
  return path.join(employeeDir(id), "home");
}

function employeeBundledSkillsDir(id) {
  return path.join(employeeDir(id), "bundled-skills");
}

function stopGatewayFor(id) {
  const row = gatewayByEmployeeId.get(id);
  if (!row?.child) {
    return;
  }
  try {
    row.child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  gatewayByEmployeeId.delete(id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDirWithRetry(dirPath, options = {}) {
  const retries = Number.isInteger(options.retries) ? options.retries : 8;
  const baseDelayMs = Number.isInteger(options.baseDelayMs) ? options.baseDelayMs : 150;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = typeof err?.code === "string" ? err.code : "";
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(code) || attempt === retries) {
        throw err;
      }
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
}

async function startGatewayProcess(emp) {
  const id = emp.id;
  stopGatewayFor(id);
  if (!existsSync(OPENCLAW_ENTRY)) {
    throw new Error(`未找到 OpenClaw 入口: ${OPENCLAW_ENTRY}`);
  }
  if (!isOpenclawDistEntryPresent()) {
    throw new Error(
      "OpenClaw 构建产物缺失：仓库根目录下没有 dist/entry.mjs（或 dist/entry.js）。请在仓库根目录执行 pnpm install && pnpm build 后再启动员工网关。",
    );
  }
  const dir = employeeDir(id);
  const stateDir = path.join(dir, "state");
  const workspaceDir = resolveEmployeeWorkspaceWriteAbs(emp);
  const defaultWorkspaceDir = employeeWorkspaceDir(id);
  const homeDir = employeeHomeDir(id);
  const bundledSkillsDir = employeeBundledSkillsDir(id);
  const configPath = path.join(dir, "openclaw.json");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(defaultWorkspaceDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(bundledSkillsDir, { recursive: true });

  await writeEmployeeGatewayConfig(emp, { mergeIntoExisting: true, inheritMainModels: false });

  const logPath = path.join(dir, "gateway.log");
  const logStream = createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n--- gateway start ${new Date().toISOString()} port=${emp.port} ---\n`);

  const child = spawn(
    process.execPath,
    [
      OPENCLAW_ENTRY,
      "gateway",
      "--port",
      String(emp.port),
      "--allow-unconfigured",
    ],
    {
      cwd: workspaceDir,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_CONFIG_PATH: configPath,
        // Keep skill discovery private per employee gateway:
        // - do not auto-read repo-root bundled `skills/`
        // - isolate personal `~/.agents/skills` under employee home
        OPENCLAW_BUNDLED_SKILLS_DIR: bundledSkillsDir,
        HOME: homeDir,
        USERPROFILE: homeDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.stdout?.on("data", (d) => logStream.write(d));
  child.stderr?.on("data", (d) => logStream.write(d));
  child.on("exit", () => {
    logStream.write(`--- gateway exit ${new Date().toISOString()} ---\n`);
    try {
      logStream.end();
    } catch {
      /* ignore */
    }
    gatewayByEmployeeId.delete(id);
  });

  gatewayByEmployeeId.set(id, { child });
}

function attachGatewayStatus(employees) {
  return employees.map((e) => {
    const row = gatewayByEmployeeId.get(e.id);
    const child = row?.child;
    const running = Boolean(child && child.exitCode === null);
    const gatewayToken = typeof e.gatewayToken === "string" && e.gatewayToken.trim() ? e.gatewayToken : null;
    const workspaceWritePath =
      typeof e.workspaceWritePath === "string" && e.workspaceWritePath.trim()
        ? e.workspaceWritePath.trim()
        : null;
    const workspaceReadPath =
      typeof e.workspaceReadPath === "string" && e.workspaceReadPath.trim()
        ? e.workspaceReadPath.trim()
        : null;
    const tightenWorkspaceScope = employeeTightensWorkspaceScope(e);
    return {
      id: e.id,
      username: e.username,
      port: e.port,
      createdAt: e.createdAt,
      gatewayRunning: running,
      gatewayPid: running && child?.pid ? child.pid : null,
      gatewayToken,
      tightenWorkspaceScope,
      workspaceWritePath,
      workspaceReadPath,
    };
  });
}

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    return "text/html; charset=utf-8";
  }
  if (ext === ".js") {
    return "text/javascript; charset=utf-8";
  }
  if (ext === ".css") {
    return "text/css; charset=utf-8";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".json") {
    return "application/json; charset=utf-8";
  }
  return "application/octet-stream";
}

function serveStatic(req, res) {
  if (!existsSync(STATIC_ROOT)) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Admin UI not built. Run: pnpm ui-admin:build");
    return;
  }
  let urlPath = new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;
  if (urlPath === "/" || urlPath === "") {
    urlPath = "/index.html";
  }
  const resolved = path.normalize(path.join(STATIC_ROOT, urlPath));
  if (!resolved.startsWith(path.normalize(STATIC_ROOT + path.sep))) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    const indexHtml = path.join(STATIC_ROOT, "index.html");
    if (existsSync(indexHtml)) {
      const html = readFileSync(indexHtml);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404).end();
    return;
  }
  const body = readFileSync(resolved);
  res.writeHead(200, { "Content-Type": guessMime(resolved) });
  res.end(body);
}

function isoDateUtc(d) {
  return d.toISOString().slice(0, 10);
}

function usageDateRangeDays(days) {
  const n = Math.min(366, Math.max(1, Math.floor(Number(days) || 30)));
  const end = new Date();
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const startUtc = new Date(endUtc);
  startUtc.setUTCDate(startUtc.getUTCDate() - (n - 1));
  return { startDate: isoDateUtc(startUtc), endDate: isoDateUtc(endUtc) };
}

function spawnOpenclawGatewayCall(method, params, { port, token, timeoutMs = 14000 }) {
  return new Promise((resolve, reject) => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      reject(new Error("invalid port"));
      return;
    }
    const tok = String(token ?? "").trim();
    if (!tok) {
      reject(new Error("missing gateway token"));
      return;
    }
    if (!existsSync(OPENCLAW_ENTRY)) {
      reject(new Error(`missing openclaw entry: ${OPENCLAW_ENTRY}`));
      return;
    }
    const child = spawn(
      process.execPath,
      [
        OPENCLAW_ENTRY,
        "gateway",
        "call",
        method,
        "--json",
        "--url",
        `ws://127.0.0.1:${port}`,
        "--token",
        tok,
        "--params",
        JSON.stringify(params ?? {}),
        "--timeout",
        String(timeoutMs),
      ],
      { cwd: REPO_ROOT, windowsHide: true, env: process.env },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c) => {
      stdout += c;
    });
    child.stderr?.on("data", (c) => {
      stderr += c;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        const msg = (stderr || stdout || `exit ${code}`).trim();
        reject(new Error(msg.slice(0, 1200)));
        return;
      }
      try {
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve(null);
          return;
        }
        resolve(JSON.parse(trimmed));
      } catch {
        reject(new Error(`invalid gateway JSON: ${stdout.slice(0, 240)}`));
      }
    });
  });
}

function sanitizeCostTotals(t) {
  if (!t || typeof t !== "object") {
    return null;
  }
  /** @type {Record<string, number>} */
  const o = {};
  for (const k of [
    "input",
    "output",
    "cacheRead",
    "cacheWrite",
    "totalTokens",
    "totalCost",
    "inputCost",
    "outputCost",
    "cacheReadCost",
    "cacheWriteCost",
    "missingCostEntries",
  ]) {
    const v = t[k];
    o[k] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  return o;
}

function sanitizeAggDimRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const k of ["provider", "model", "channel", "agentId"]) {
    if (typeof row[k] === "string" && row[k]) {
      o[k] = row[k];
    }
  }
  if (typeof row.count === "number" && Number.isFinite(row.count)) {
    o.count = row.count;
  }
  const totals = sanitizeCostTotals(row.totals);
  if (totals) {
    o.totals = totals;
  }
  return Object.keys(o).length > 0 ? o : null;
}

function emptyUsageTotalsRow() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

function mergeUsageTotalsInto(target, u) {
  if (!u || typeof u !== "object") {
    return;
  }
  for (const k of Object.keys(emptyUsageTotalsRow())) {
    const v = u[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      target[k] += v;
    }
  }
}

/**
 * When gateway `aggregates.byModel` / `byProvider` are empty (common when per-session `modelUsage`
 * is absent but flat `usage.totalTokens` still rolls up), derive dimensions from `sessions[]`.
 */
function rollupUsageAggregatesFromSessions(raw) {
  const sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];
  /** @type {Map<string, { provider: string; model: string; count: number; totals: ReturnType<typeof emptyUsageTotalsRow> }>} */
  const byModel = new Map();
  /** @type {Map<string, { provider: string; model: undefined; count: number; totals: ReturnType<typeof emptyUsageTotalsRow> }>} */
  const byProvider = new Map();
  for (const s of sessions) {
    if (!s || typeof s !== "object") {
      continue;
    }
    const u = s.usage;
    if (!u || typeof u !== "object") {
      continue;
    }
    const tt = typeof u.totalTokens === "number" && Number.isFinite(u.totalTokens) ? u.totalTokens : 0;
    const tc = typeof u.totalCost === "number" && Number.isFinite(u.totalCost) ? u.totalCost : 0;
    if (tt <= 0 && tc <= 0) {
      continue;
    }
    const origin = s.origin && typeof s.origin === "object" ? s.origin : null;
    const prov =
      String(s.modelProvider ?? s.providerOverride ?? origin?.provider ?? "").trim() || "unknown";
    const mod = String(s.model ?? s.modelOverride ?? "").trim() || "—";
    const mKey = `${prov}|||${mod}`;
    if (!byModel.has(mKey)) {
      byModel.set(mKey, { provider: prov, model: mod, count: 0, totals: emptyUsageTotalsRow() });
    }
    const mRow = byModel.get(mKey);
    mRow.count += 1;
    mergeUsageTotalsInto(mRow.totals, u);

    if (!byProvider.has(prov)) {
      byProvider.set(prov, { provider: prov, model: undefined, count: 0, totals: emptyUsageTotalsRow() });
    }
    const pRow = byProvider.get(prov);
    pRow.count += 1;
    mergeUsageTotalsInto(pRow.totals, u);
  }
  return {
    byModel: Array.from(byModel.values()).sort((a, b) => (b.totals.totalTokens ?? 0) - (a.totals.totalTokens ?? 0)),
    byProvider: Array.from(byProvider.values()).sort(
      (a, b) => (b.totals.totalTokens ?? 0) - (a.totals.totalTokens ?? 0),
    ),
  };
}

function mergeUsageAggregatesFromSessionsIfNeeded(raw, sanitized) {
  if (!sanitized || typeof sanitized !== "object") {
    return sanitized;
  }
  const agg = sanitized.aggregates;
  if (!agg || typeof agg !== "object") {
    return sanitized;
  }
  const hasM = Array.isArray(agg.byModel) && agg.byModel.length > 0;
  const hasP = Array.isArray(agg.byProvider) && agg.byProvider.length > 0;
  if (hasM && hasP) {
    return sanitized;
  }
  const rolled = rollupUsageAggregatesFromSessions(raw);
  const byModelNext = hasM
    ? agg.byModel
    : rolled.byModel.length > 0
      ? rolled.byModel.map((row) => sanitizeAggDimRow(row)).filter(Boolean).slice(0, 60)
      : agg.byModel;
  const byProvNext = hasP
    ? agg.byProvider
    : rolled.byProvider.length > 0
      ? rolled.byProvider.map((row) => sanitizeAggDimRow(row)).filter(Boolean).slice(0, 40)
      : agg.byProvider;
  return {
    ...sanitized,
    aggregates: {
      ...agg,
      byModel: byModelNext,
      byProvider: byProvNext,
    },
  };
}

function sanitizeSessionsUsageForAdmin(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const agg = raw.aggregates;
  /** @type {Record<string, unknown>} */
  const out = {
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : undefined,
    startDate: typeof raw.startDate === "string" ? raw.startDate : undefined,
    endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
    totals: sanitizeCostTotals(raw.totals) ?? undefined,
  };
  if (agg && typeof agg === "object") {
    const messages = agg.messages;
    const tools = agg.tools;
    out.aggregates = {
      messages:
        messages && typeof messages === "object"
          ? {
              total: typeof messages.total === "number" ? messages.total : 0,
              errors: typeof messages.errors === "number" ? messages.errors : 0,
            }
          : undefined,
      tools:
        tools && typeof tools === "object"
          ? {
              totalCalls: typeof tools.totalCalls === "number" ? tools.totalCalls : 0,
            }
          : undefined,
      byProvider: Array.isArray(agg.byProvider)
        ? agg.byProvider.map(sanitizeAggDimRow).filter(Boolean).slice(0, 40)
        : [],
      byModel: Array.isArray(agg.byModel)
        ? agg.byModel.map(sanitizeAggDimRow).filter(Boolean).slice(0, 60)
        : [],
      byChannel: Array.isArray(agg.byChannel)
        ? agg.byChannel.map(sanitizeAggDimRow).filter(Boolean).slice(0, 24)
        : [],
      byAgent: Array.isArray(agg.byAgent)
        ? agg.byAgent.map(sanitizeAggDimRow).filter(Boolean).slice(0, 16)
        : [],
    };
  } else if (!out.aggregates) {
    out.aggregates = {
      byProvider: [],
      byModel: [],
      byChannel: [],
      byAgent: [],
    };
  }
  return mergeUsageAggregatesFromSessionsIfNeeded(raw, out);
}

function sanitizeSkillsStatusForAdmin(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const rows = Array.isArray(raw.skills) ? raw.skills : [];
  const skills = rows
    .filter((x) => x && typeof x === "object")
    .map((row) => ({
      name: typeof row.name === "string" ? row.name : "",
      source: typeof row.source === "string" ? row.source : "",
      bundled: row.bundled === true,
      skillKey: typeof row.skillKey === "string" ? row.skillKey : "",
      eligible: row.eligible === true,
      disabled: row.disabled === true,
      blockedByAllowlist: row.blockedByAllowlist === true,
      missingCount: Array.isArray(row.missing) ? row.missing.length : 0,
      installCount: Array.isArray(row.install) ? row.install.length : 0,
    }))
    .filter((x) => x.name)
    .slice(0, 300);
  const summary = {
    total: skills.length,
    eligible: skills.filter((x) => x.eligible).length,
    disabled: skills.filter((x) => x.disabled).length,
    blockedByAllowlist: skills.filter((x) => x.blockedByAllowlist).length,
    withMissing: skills.filter((x) => x.missingCount > 0).length,
    withInstallOption: skills.filter((x) => x.installCount > 0).length,
  };
  return {
    workspaceDir: typeof raw.workspaceDir === "string" ? raw.workspaceDir : "",
    managedSkillsDir: typeof raw.managedSkillsDir === "string" ? raw.managedSkillsDir : "",
    summary,
    skills,
  };
}

async function fetchSkillsStatusWithRetry(params) {
  const firstTimeoutMs = 45_000;
  const retryTimeoutMs = 60_000;
  try {
    return await spawnOpenclawGatewayCall("skills.status", params.callParams, {
      port: params.port,
      token: params.token,
      timeoutMs: firstTimeoutMs,
    });
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (!/timeout/i.test(msg)) {
      throw err;
    }
    return await spawnOpenclawGatewayCall("skills.status", params.callParams, {
      port: params.port,
      token: params.token,
      timeoutMs: retryTimeoutMs,
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  try {
    if (pathname.startsWith("/api/")) {
      if (method === "GET" && pathname === "/api/session") {
        if (!isAdmin(req)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        json(res, 200, { role: "admin" });
        return;
      }

      if (method === "POST" && pathname === "/api/login") {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!timingSafeStringEq(username, ADMIN_USER) || !timingSafeStringEq(password, ADMIN_PASS)) {
          json(res, 401, { error: "invalid credentials" });
          return;
        }
        const token = crypto.randomBytes(32).toString("hex");
        sessions.set(token, { role: "admin", expires: Date.now() + SESSION_MAX_AGE_SEC * 1000 });
        json(res, 200, { ok: true }, { "Set-Cookie": setSessionCookie(token) });
        return;
      }

      if (method === "POST" && pathname === "/api/logout") {
        const token = getSessionToken(req);
        sessions.delete(token);
        json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
        return;
      }

      if (!isAdmin(req)) {
        json(res, 401, { error: "unauthorized" });
        return;
      }

      if (method === "GET" && pathname === "/api/employees") {
        const store = loadStore();
        json(res, 200, { employees: attachGatewayStatus(store.employees) });
        return;
      }

      if (method === "POST" && pathname === "/api/employees/sync-main-models") {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
        const store = loadStore();
        const list = employeeId
          ? store.employees.filter((e) => e && e.id === employeeId)
          : store.employees.filter(Boolean);
        if (employeeId && list.length === 0) {
          json(res, 404, { error: "not found" });
          return;
        }
        if (!existsSync(OPENCLAW_ENTRY)) {
          json(res, 500, { error: "未找到 OpenClaw 入口（dist/entry）。" });
          return;
        }
        /** @type {Array<{ id: string; username: string; ok: boolean; error?: string; restarted?: boolean }>} */
        const results = [];
        for (const emp of list) {
          const wasRunning = gatewayByEmployeeId.has(emp.id);
          try {
            if (wasRunning) {
              stopGatewayFor(emp.id);
            }
            await writeEmployeeGatewayConfig(emp, {
              mergeIntoExisting: true,
              inheritMainModels: false,
              syncMainModels: true,
            });
            if (wasRunning) {
              await startGatewayProcess(emp);
            }
            results.push({
              id: emp.id,
              username: emp.username,
              ok: true,
              restarted: wasRunning,
            });
          } catch (err) {
            results.push({
              id: emp.id,
              username: emp.username,
              ok: false,
              error: String(err?.message ?? err),
            });
          }
        }
        json(res, 200, { ok: true, results });
        return;
      }

      if (method === "POST" && pathname === "/api/employees") {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
        const port = Number(body.port);
        const startGateway = body.startGateway !== false;
        const inheritMainModels = body.inheritMainModels !== false;
        const tightenWorkspaceScope = body.tightenWorkspaceScope === true;

        if (!USERNAME_RE.test(username)) {
          json(res, 400, {
            error:
              "用户名需 3–32 位，以小写字母或数字开头，仅含小写字母、数字、_、-。",
          });
          return;
        }
        if (!Number.isInteger(port) || port < 1024 || port > 65535) {
          json(res, 400, { error: "端口需为 1024–65535 的整数。" });
          return;
        }

        const store = loadStore();
        if (store.employees.some((e) => e.username === username)) {
          json(res, 400, { error: "用户名已存在。" });
          return;
        }
        if (store.employees.some((e) => e.port === port)) {
          json(res, 400, { error: "端口已被其他员工占用。" });
          return;
        }

        const id = crypto.randomUUID();
        const createdAt = Date.now();
        const gatewayToken = generateGatewayToken();
        const employeeRef = { id, username, dirName: username };
        const dir = employeeDir(employeeRef);
        await fs.mkdir(dir, { recursive: true });
        const stateDir = path.join(dir, "state");
        await fs.mkdir(stateDir, { recursive: true });

        const emp = {
          id,
          username,
          dirName: username,
          port,
          createdAt,
          gatewayToken,
          ...(tightenWorkspaceScope ? { tightenWorkspaceScope: true } : {}),
        };
        await writeEmployeeGatewayConfig(emp, { inheritMainModels });
        store.employees.push(emp);
        saveStore(store);

        let gatewayStarted = false;
        if (startGateway) {
          if (!existsSync(OPENCLAW_ENTRY)) {
            json(res, 500, { error: `未找到 openclaw 入口: ${OPENCLAW_ENTRY}` });
            return;
          }
          try {
            await startGatewayProcess(emp);
            gatewayStarted = true;
          } catch (err) {
            json(res, 500, { error: String(err?.message ?? err) });
            return;
          }
        }

        json(res, 200, {
          employee: attachGatewayStatus([emp])[0],
          gatewayStarted,
          gatewayToken,
        });
        return;
      }

      const patchMatch = pathname.match(/^\/api\/employees\/([^/]+)$/);
      if (method === "PATCH" && patchMatch) {
        const id = patchMatch[1];
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const store = loadStore();
        const emp = store.employees.find((e) => e.id === id);
        if (!emp) {
          json(res, 404, { error: "not found" });
          return;
        }
        if (body.port !== undefined && body.port !== null) {
          const newPort = Number(body.port);
          if (!Number.isInteger(newPort) || newPort < 1024 || newPort > 65535) {
            json(res, 400, { error: "端口需为 1024–65535 的整数。" });
            return;
          }
          if (newPort !== emp.port) {
            if (store.employees.some((e) => e.port === newPort && e.id !== id)) {
              json(res, 400, { error: "端口已被其他员工占用。" });
              return;
            }
            if (gatewayByEmployeeId.has(id)) {
              json(res, 400, { error: "请先停止网关再修改端口。" });
              return;
            }
            emp.port = newPort;
          }
        }
        if (body.tightenWorkspaceScope !== undefined) {
          const on = body.tightenWorkspaceScope === true;
          if (on) {
            emp.tightenWorkspaceScope = true;
            delete emp.workspaceReadPath;
          } else {
            delete emp.tightenWorkspaceScope;
            delete emp.workspaceWritePath;
            delete emp.workspaceReadPath;
          }
        }
        saveStore(store);
        const wasRunning = gatewayByEmployeeId.has(id);
        if (wasRunning) {
          stopGatewayFor(id);
        }
        try {
          await writeEmployeeGatewayConfig(emp, { mergeIntoExisting: true, inheritMainModels: false });
        } catch (err) {
          json(res, 500, { error: String(err?.message ?? err) });
          return;
        }
        if (wasRunning) {
          try {
            await startGatewayProcess(emp);
          } catch (err) {
            json(res, 500, { error: `配置已保存但重启网关失败：${String(err?.message ?? err)}` });
            return;
          }
        }
        json(res, 200, { employee: attachGatewayStatus([emp])[0] });
        return;
      }

      const delMatch = pathname.match(/^\/api\/employees\/([^/]+)$/);
      if (method === "DELETE" && delMatch) {
        const id = delMatch[1];
        const store = loadStore();
        const existing = store.employees.find((e) => e.id === id);
        const next = store.employees.filter((e) => e.id !== id);
        if (next.length === store.employees.length) {
          json(res, 404, { error: "not found" });
          return;
        }
        stopGatewayFor(id);
        await removeDirWithRetry(employeeDir(existing ?? id));
        store.employees = next;
        saveStore(store);
        json(res, 200, { ok: true });
        return;
      }

      const tokenRegenMatch = pathname.match(/^\/api\/employees\/([^/]+)\/gateway-token$/);
      if (method === "POST" && tokenRegenMatch) {
        const id = tokenRegenMatch[1];
        const store = loadStore();
        const emp = store.employees.find((e) => e.id === id);
        if (!emp) {
          json(res, 404, { error: "not found" });
          return;
        }
        const nextToken = generateGatewayToken();
        emp.gatewayToken = nextToken;
        saveStore(store);
        await writeEmployeeGatewayConfig(emp, { mergeIntoExisting: true });
        const wasRunning = gatewayByEmployeeId.has(id);
        if (wasRunning) {
          stopGatewayFor(id);
          try {
            await startGatewayProcess(emp);
          } catch (err) {
            json(res, 500, { error: String(err?.message ?? err) });
            return;
          }
        }
        json(res, 200, {
          gatewayToken: nextToken,
          restarted: wasRunning,
        });
        return;
      }

      const startMatch = pathname.match(/^\/api\/employees\/([^/]+)\/gateway\/start$/);
      if (method === "POST" && startMatch) {
        const id = startMatch[1];
        const store = loadStore();
        const emp = store.employees.find((e) => e.id === id);
        if (!emp) {
          json(res, 404, { error: "not found" });
          return;
        }
        if (gatewayByEmployeeId.has(id)) {
          json(res, 400, { error: "gateway already running" });
          return;
        }
        try {
          await startGatewayProcess(emp);
        } catch (err) {
          json(res, 500, { error: String(err?.message ?? err) });
          return;
        }
        json(res, 200, { ok: true });
        return;
      }

      const stopMatch = pathname.match(/^\/api\/employees\/([^/]+)\/gateway\/stop$/);
      if (method === "POST" && stopMatch) {
        const id = stopMatch[1];
        const store = loadStore();
        if (!store.employees.some((e) => e.id === id)) {
          json(res, 404, { error: "not found" });
          return;
        }
        stopGatewayFor(id);
        json(res, 200, { ok: true });
        return;
      }

      if (method === "GET" && pathname === "/api/main-models") {
        const cfg = await loadMainOpenclawJson();
        const main = resolveMainModel(cfg);
        const providers = MAIN_MODEL_PROVIDER_PRESETS.map((p) => {
          const prov = providerConfigEntry(cfg, p.id);
          return {
            id: p.id,
            label: p.label,
            baseUrl: typeof prov?.baseUrl === "string" && prov.baseUrl.trim() ? prov.baseUrl.trim() : p.baseUrl,
            api: typeof prov?.api === "string" && prov.api.trim() ? prov.api.trim() : p.api,
            exampleModel: `${p.id}/${p.modelId}`,
            hasApiKey: providerCredentialConfiguredForPreset(cfg, p.id),
          };
        });
        json(res, 200, {
          configPath: MAIN_OPENCLAW_JSON_PATH,
          main,
          providers,
        });
        return;
      }

      if (method === "PUT" && pathname === "/api/main-models") {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const cfg = await loadMainOpenclawJson();
        try {
          if (body.main && typeof body.main === "object") {
            mergeMainAgentModel(cfg, body.main);
          }
          mergeProviderApiKeys(cfg, body.providers);
          await saveMainOpenclawJson(cfg);
        } catch (err) {
          json(res, 400, { error: String(err?.message ?? err) });
          return;
        }
        const main = resolveMainModel(cfg);
        const providers = MAIN_MODEL_PROVIDER_PRESETS.map((p) => {
          const prov = providerConfigEntry(cfg, p.id);
          return {
            id: p.id,
            label: p.label,
            baseUrl: typeof prov?.baseUrl === "string" && prov.baseUrl.trim() ? prov.baseUrl.trim() : p.baseUrl,
            api: typeof prov?.api === "string" && prov.api.trim() ? prov.api.trim() : p.api,
            exampleModel: `${p.id}/${p.modelId}`,
            hasApiKey: providerCredentialConfiguredForPreset(cfg, p.id),
          };
        });
        json(res, 200, { ok: true, configPath: MAIN_OPENCLAW_JSON_PATH, main, providers });
        return;
      }

      if (method === "GET" && pathname === "/api/employees/usage") {
        const days = Math.min(366, Math.max(1, Math.floor(Number(url.searchParams.get("days") ?? "30"))));
        const range = usageDateRangeDays(days);
        const params = {
          startDate: range.startDate,
          endDate: range.endDate,
          limit: 800,
          includeContextWeight: false,
        };
        const store = loadStore();
        const withStatus = attachGatewayStatus(store.employees);
        const employees = await Promise.all(
          withStatus.map(async (emp) => {
            const base = {
              id: emp.id,
              username: emp.username,
              port: emp.port,
              gatewayRunning: emp.gatewayRunning,
              gatewayPid: emp.gatewayPid ?? null,
            };
            if (!emp.gatewayRunning) {
              return {
                ...base,
                ok: true,
                error: null,
                usage: null,
                skipped: true,
                note: "网关未启动，已跳过采集",
              };
            }
            if (!emp.gatewayToken) {
              return { ...base, ok: false, error: "未设置网关 Token", usage: null };
            }
            try {
              const raw = await spawnOpenclawGatewayCall("sessions.usage", params, {
                port: emp.port,
                token: emp.gatewayToken,
              });
              return { ...base, ok: true, error: null, usage: sanitizeSessionsUsageForAdmin(raw) };
            } catch (err) {
              return {
                ...base,
                ok: false,
                error: String(err?.message ?? err),
                usage: null,
              };
            }
          }),
        );
        json(res, 200, { days, range, employees });
        return;
      }

      if (method === "GET" && pathname === "/api/employees/skills") {
        const agentId = String(url.searchParams.get("agentId") ?? "main").trim() || "main";
        const callParams = { agentId };
        const store = loadStore();
        const withStatus = attachGatewayStatus(store.employees);
        const employees = await Promise.all(
          withStatus.map(async (emp) => {
            const base = {
              id: emp.id,
              username: emp.username,
              port: emp.port,
              gatewayRunning: emp.gatewayRunning,
              gatewayPid: emp.gatewayPid ?? null,
            };
            if (!emp.gatewayRunning) {
              return {
                ...base,
                ok: true,
                error: null,
                skills: null,
                skipped: true,
                note: "网关未启动，已跳过采集",
              };
            }
            if (!emp.gatewayToken) {
              return { ...base, ok: false, error: "未设置网关 Token", skills: null };
            }
            try {
              const raw = await fetchSkillsStatusWithRetry({
                callParams,
                port: emp.port,
                token: emp.gatewayToken,
              });
              return {
                ...base,
                ok: true,
                error: null,
                skills: sanitizeSkillsStatusForAdmin(raw),
              };
            } catch (err) {
              return {
                ...base,
                ok: false,
                error: String(err?.message ?? err),
                skills: null,
              };
            }
          }),
        );
        json(res, 200, { agentId, employees });
        return;
      }

      if (method === "GET" && pathname === "/api/public-skills") {
        const skills = await listPublicSkills();
        json(res, 200, { rootDir: PUBLIC_SKILLS_ROOT, skills });
        return;
      }

      if (method === "POST" && pathname === "/api/public-skills") {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const skillId = typeof body.skillId === "string" ? body.skillId.trim() : "";
        if (!isSafeSimpleName(skillId)) {
          json(res, 400, { error: "技能名称仅允许字母、数字、._-，且不能为空。" });
          return;
        }
        const dir = resolvePublicSkillDir(skillId);
        if (existsSync(dir)) {
          json(res, 400, { error: "技能已存在。" });
          return;
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
          path.join(dir, "SKILL.md"),
          `# ${skillId}\n\n请描述该技能的用途、输入与输出。\n`,
          "utf8",
        );
        json(res, 200, { ok: true });
        return;
      }

      const publicSkillOneMatch = pathname.match(/^\/api\/public-skills\/([^/]+)$/);
      if (method === "DELETE" && publicSkillOneMatch) {
        const skillId = decodeURIComponent(publicSkillOneMatch[1]);
        const dir = resolvePublicSkillDir(skillId);
        if (!existsSync(dir)) {
          json(res, 404, { error: "技能不存在。" });
          return;
        }
        await fs.rm(dir, { recursive: true, force: true });
        json(res, 200, { ok: true });
        return;
      }

      const publicSkillFileMatch = pathname.match(/^\/api\/public-skills\/([^/]+)\/file$/);
      if (method === "GET" && publicSkillFileMatch) {
        const skillId = decodeURIComponent(publicSkillFileMatch[1]);
        const relPath = String(url.searchParams.get("path") ?? "").trim();
        let filePath;
        try {
          filePath = resolvePublicSkillFile(skillId, relPath);
        } catch (err) {
          json(res, 400, { error: String(err?.message ?? err) });
          return;
        }
        if (!existsSync(filePath)) {
          json(res, 404, { error: "文件不存在。" });
          return;
        }
        const raw = await fs.readFile(filePath, "utf8");
        json(res, 200, { content: raw });
        return;
      }

      if (method === "PUT" && publicSkillFileMatch) {
        const skillId = decodeURIComponent(publicSkillFileMatch[1]);
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const relPath = typeof body.path === "string" ? body.path.trim() : "";
        const content = typeof body.content === "string" ? body.content : "";
        let filePath;
        try {
          filePath = resolvePublicSkillFile(skillId, relPath);
        } catch (err) {
          json(res, 400, { error: String(err?.message ?? err) });
          return;
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf8");
        json(res, 200, { ok: true });
        return;
      }

      if (method === "DELETE" && publicSkillFileMatch) {
        const skillId = decodeURIComponent(publicSkillFileMatch[1]);
        const relPath = String(url.searchParams.get("path") ?? "").trim();
        let filePath;
        try {
          filePath = resolvePublicSkillFile(skillId, relPath);
        } catch (err) {
          json(res, 400, { error: String(err?.message ?? err) });
          return;
        }
        if (!existsSync(filePath)) {
          json(res, 404, { error: "文件不存在。" });
          return;
        }
        await fs.rm(filePath, { force: true });
        json(res, 200, { ok: true });
        return;
      }

      json(res, 404, { error: "not found" });
      return;
    }

    if (method === "GET") {
      serveStatic(req, res);
      return;
    }

    res.writeHead(405).end();
  } catch (err) {
    json(res, 500, { error: String(err?.message ?? err) });
  }
});

await ensureDataDir();

server.listen(SERVER_PORT, SERVER_HOST, () => {
  process.stderr.write(
    `[openclaw-ui-admin] listening http://${SERVER_HOST}:${SERVER_PORT} (data: ${DATA_ROOT})\n`,
  );
  process.stderr.write(`[openclaw-ui-admin] main model config file: ${MAIN_OPENCLAW_JSON_PATH}\n`);
});

function shutdown() {
  for (const id of [...gatewayByEmployeeId.keys()]) {
    stopGatewayFor(id);
  }
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
