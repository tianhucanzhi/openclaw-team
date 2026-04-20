# OpenClaw UI Admin

Local admin UI to manage employees (each with an isolated `OPENCLAW_STATE_DIR` + config file), spawn per-port `openclaw gateway` processes from the repo root (`openclaw.mjs`), and edit a **main-agent + models.providers** config slice used by the **模型管理** page.

## Security

- Default login is **`admin` / `admin1234`**. Set **`OPENCLAW_ADMIN_USER`** and **`OPENCLAW_ADMIN_PASSWORD`** for any non-local use.
- Binds API to **`127.0.0.1:38765`** by default. Use **`OPENCLAW_ADMIN_BIND=0.0.0.0`** only on trusted networks.
- Per-employee records store gateway metadata and Control UI **gateway token** only (no separate employee login in this admin UI).

## Commands (from repo root)

```bash
pnpm install   # from repo root so workspace links ui_admin deps (Vite, Lit)
pnpm ui-admin:dev
```

If dev still reports a missing Vite binary, run `pnpm install` again from the **repository root** (not only inside `ui_admin/`).

Then open **http://127.0.0.1:5174/** (Vite proxies `/api` to the admin server).

API only:

```bash
pnpm ui-admin:server
```

Production-like (built static files served by the same server on **38765**):

```bash
pnpm ui-admin:build
pnpm ui-admin:server
# open http://127.0.0.1:38765/
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENCLAW_ADMIN_DATA_DIR` | `ui_admin/data` | Store `store.json` and per-employee dirs |
| `OPENCLAW_ADMIN_SERVER_PORT` | `38765` | HTTP API + static (after build) |
| `OPENCLAW_ADMIN_BIND` | `127.0.0.1` | Listen address |
| `OPENCLAW_ADMIN_USER` | `admin` | Super-admin username |
| `OPENCLAW_ADMIN_PASSWORD` | `admin1234` | Super-admin password |
| `OPENCLAW_MAIN_CONFIG_PATH` | (see below) | Target `openclaw.json` for 模型管理. If unset: use **`~/.openclaw/openclaw.json`** when that file exists, else `OPENCLAW_CONFIG_PATH` if set, else `<data>/main/openclaw.json`. |
| `OPENCLAW_MAIN_STATE_DIR` | (auto) | Main install **state** root (parent of `agents/`). Default: directory containing the resolved main `openclaw.json`. Set when copying `auth-profiles.json` for new employees must use a different root than `dirname(openclaw.json)`. |

`POST /api/employees` accepts **`inheritMainModels`** (default `true`): when true, the new employee’s `openclaw.json` copies the model-related slice from the same main config file used by 模型管理 (`models`, `agents.defaults.model` / `agents.defaults.models`, `auth`, `plugins.entries`), then sets this gateway’s auth token. It also copies **`agents/main/agent/auth-profiles.json`** from the main OpenClaw state root (API keys live there, not in `openclaw.json`). State root defaults to the directory containing that main `openclaw.json`; override with **`OPENCLAW_MAIN_STATE_DIR`** if your layout differs. Set `inheritMainModels` to `false` for gateway-only minimal config.

Each employee gateway runs:

`node <repo>/openclaw.mjs gateway --bind loopback --port <port> --allow-unconfigured`

with `OPENCLAW_STATE_DIR=<data>/employees/<id>/state` and `OPENCLAW_CONFIG_PATH=<data>/employees/<id>/openclaw.json`.

On create (or **新 Token** in the admin table), the server generates a **gateway auth token**, saves it into `store.json` and `openclaw.json` under `gateway.auth` (`mode: token`). Use the same value in Control UI when connecting to `ws://127.0.0.1:<port>`.

Logs: `<data>/employees/<id>/gateway.log`.
