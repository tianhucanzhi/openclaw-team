/**
 * Admin: per-employee gateway `skills.status` aggregation for the 技能监控 UI.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * @param {string} publicRoot
 * @param {string} skillName
 */
function resolvePublicSkillDirSafe(publicRoot, skillName) {
  const abs = path.resolve(publicRoot, skillName);
  const normalizedRoot = path.normalize(publicRoot + path.sep);
  const normalizedAbs = path.normalize(abs + path.sep);
  if (!normalizedAbs.startsWith(normalizedRoot)) {
    throw new Error("技能路径越界");
  }
  return abs;
}

/**
 * @param {string} workspaceWriteAbs
 * @param {string} skillName
 */
function employeeWorkspaceSkillDir(workspaceWriteAbs, skillName) {
  return path.join(workspaceWriteAbs, "skills", skillName);
}

/**
 * @param {{
 *   employeeId: string,
 *   skillName: string,
 *   loadStore: () => { employees: Array<{ id?: string } & Record<string, unknown>> },
 *   resolveEmployeeWorkspaceWriteAbs: (emp: unknown) => string,
 *   publicSkillsRoot: string,
 *   isSafeSimpleName: (name: string) => boolean,
 * }} args
 */
export async function promoteEmployeeSkillToPublic(args) {
  const id = String(args.employeeId ?? "").trim();
  const name = String(args.skillName ?? "").trim();
  if (!id || !name) {
    return { ok: false, error: "缺少 employeeId 或 skillName。" };
  }
  if (!args.isSafeSimpleName(name)) {
    return { ok: false, error: "技能名称仅允许字母、数字、._-，且不能为空。" };
  }
  const store = args.loadStore();
  const emp = store.employees.find((e) => e && typeof e === "object" && e.id === id);
  if (!emp) {
    return { ok: false, error: "员工不存在。" };
  }
  const ws = args.resolveEmployeeWorkspaceWriteAbs(emp);
  const src = employeeWorkspaceSkillDir(ws, name);
  try {
    const st = await fs.stat(src);
    if (!st.isDirectory()) {
      return { ok: false, error: "源路径不是技能目录。" };
    }
  } catch {
    return {
      ok: false,
      error: "该技能不在该员工工作区磁盘上（内置/未落地技能无法拷贝）。",
    };
  }
  let dest;
  try {
    dest = resolvePublicSkillDirSafe(args.publicSkillsRoot, name);
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
  if (existsSync(dest)) {
    return {
      ok: true,
      skipped: true,
      message: "公共技能库已存在同名目录，未覆盖。",
    };
  }
  await fs.mkdir(args.publicSkillsRoot, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
  return { ok: true, copied: true, message: "已复制到公共技能库。" };
}

/**
 * @param {{
 *   employeeId: string,
 *   skillName: string,
 *   loadStore: () => { employees: Array<{ id?: string; username?: string } & Record<string, unknown>> },
 *   resolveEmployeeWorkspaceWriteAbs: (emp: unknown) => string,
 *   isSafeSimpleName: (name: string) => boolean,
 * }} args
 */
export async function distributeEmployeeSkillToOtherEmployees(args) {
  const id = String(args.employeeId ?? "").trim();
  const name = String(args.skillName ?? "").trim();
  if (!id || !name) {
    return { ok: false, error: "缺少 employeeId 或 skillName。" };
  }
  if (!args.isSafeSimpleName(name)) {
    return { ok: false, error: "技能名称仅允许字母、数字、._-，且不能为空。" };
  }
  const store = args.loadStore();
  const sourceEmp = store.employees.find((e) => e && typeof e === "object" && e.id === id);
  if (!sourceEmp) {
    return { ok: false, error: "源员工不存在。" };
  }
  const ws = args.resolveEmployeeWorkspaceWriteAbs(sourceEmp);
  const src = employeeWorkspaceSkillDir(ws, name);
  try {
    const st = await fs.stat(src);
    if (!st.isDirectory()) {
      return { ok: false, error: "源路径不是技能目录。" };
    }
  } catch {
    return {
      ok: false,
      error: "该技能不在该员工工作区磁盘上（内置/未落地技能无法拷贝）。",
    };
  }

  /** @type {{ employeeId: string, username: string, copied?: boolean, skipped?: boolean, note?: string }[]} */
  const results = [];
  let copied = 0;
  let skipped = 0;
  for (const other of store.employees) {
    if (!other || typeof other !== "object" || other.id === id) {
      continue;
    }
    const oid = typeof other.id === "string" ? other.id : "";
    const ouser = typeof other.username === "string" ? other.username : oid;
    if (!oid) {
      continue;
    }
    const destWs = args.resolveEmployeeWorkspaceWriteAbs(other);
    const dest = employeeWorkspaceSkillDir(destWs, name);
    if (existsSync(dest)) {
      skipped += 1;
      results.push({ employeeId: oid, username: ouser, skipped: true, note: "目标已存在" });
      continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(src, dest, { recursive: true });
    copied += 1;
    results.push({ employeeId: oid, username: ouser, copied: true });
  }
  const message = `已处理 ${results.length} 人：新建 ${copied}，已存在跳过 ${skipped}。`;
  return { ok: true, copied, skipped, totalTargets: results.length, results, message };
}

/**
 * @param {unknown} raw
 */
export function sanitizeSkillsStatusForAdmin(raw) {
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

/**
 * @param {(
 *   method: string,
 *   params: unknown,
 *   opts: { port: number, token: string, timeoutMs?: number },
 * ) => Promise<unknown>} spawnOpenclawGatewayCall
 * @param {{ callParams: Record<string, string>, port: number, token: string }} params
 */
export async function fetchSkillsStatusWithRetry(spawnOpenclawGatewayCall, params) {
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

/**
 * GET /api/employees/skills?agentId=main
 *
 * @param {URL} url
 * @param {{
 *   loadStore: () => { employees: unknown[] },
 *   attachGatewayStatus: (employees: unknown[]) => unknown[],
 *   spawnOpenclawGatewayCall: (
 *     method: string,
 *     params: unknown,
 *     opts: { port: number, token: string, timeoutMs?: number },
 *   ) => Promise<unknown>,
 *   json: (res: import("node:http").ServerResponse, status: number, body: unknown) => void,
 *   res: import("node:http").ServerResponse,
 * }} ctx
 */
export async function respondEmployeesSkillsMonitoring(url, ctx) {
  const { loadStore, attachGatewayStatus, spawnOpenclawGatewayCall, json, res } = ctx;
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
        const raw = await fetchSkillsStatusWithRetry(spawnOpenclawGatewayCall, {
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
}
