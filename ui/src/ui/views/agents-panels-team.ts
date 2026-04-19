import { html, nothing } from "lit";
import { DEFAULT_AGENT_ID } from "../../../../src/routing/session-key.js";
import { t } from "../../i18n/index.ts";
import type { AgentsListResult } from "../types.ts";
import { agentBadgeText, normalizeAgentLabel } from "./agents-utils.ts";

export type AgentsTeamPanelProps = {
  agentsList: AgentsListResult | null;
  defaultId: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  deleteBusyAgentId: string | null;
  draftName: string;
  draftWorkspace: string;
  draftModel: string;
  onDraftChange: (patch: { name?: string; workspace?: string; model?: string }) => void;
  onProvision: () => void;
  onDelete: (agentId: string) => void;
};

export function renderAgentsTeamPanel(props: AgentsTeamPanelProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.defaultId ?? null;

  return html`
    <div class="agents-team">
      <div class="card">
        <div class="card-title">${t("agentsTeam.addTitle")}</div>
        <div class="card-sub">${t("agentsTeam.addSubtitle")}</div>
        ${props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing}
        <div class="form-grid" style="margin-top: 16px; gap: 12px;">
          <label class="field">
            <span class="field-label">${t("agentsTeam.displayName")}</span>
            <input
              type="text"
              .value=${props.draftName}
              ?disabled=${props.busy || props.loading}
              placeholder=${t("agentsTeam.displayNamePlaceholder")}
              @input=${(e: Event) =>
                props.onDraftChange({
                  name: (e.target as HTMLInputElement).value,
                })}
            />
            <span class="muted field-hint">${t("agentsTeam.displayNameHint")}</span>
          </label>
          <label class="field">
            <span class="field-label">${t("agentsTeam.workspacePath")}</span>
            <input
              type="text"
              .value=${props.draftWorkspace}
              ?disabled=${props.busy || props.loading}
              placeholder=${t("agentsTeam.workspacePlaceholder")}
              @input=${(e: Event) =>
                props.onDraftChange({
                  workspace: (e.target as HTMLInputElement).value,
                })}
            />
            <span class="muted field-hint">${t("agentsTeam.workspaceHint")}</span>
          </label>
          <label class="field">
            <span class="field-label">${t("agentsTeam.modelOptional")}</span>
            <input
              type="text"
              .value=${props.draftModel}
              ?disabled=${props.busy || props.loading}
              placeholder=${t("agentsTeam.modelPlaceholder")}
              @input=${(e: Event) =>
                props.onDraftChange({
                  model: (e.target as HTMLInputElement).value,
                })}
            />
          </label>
        </div>
        <div style="margin-top: 16px;">
          <button
            type="button"
            class="btn btn--primary"
            ?disabled=${props.busy ||
            props.loading ||
            !props.draftName.trim() ||
            !props.draftWorkspace.trim()}
            @click=${() => props.onProvision()}
          >
            ${props.busy ? t("common.working") : t("agentsTeam.addAgent")}
          </button>
        </div>
      </div>

      <div class="card" style="margin-top: 16px;">
        <div class="card-title">${t("agentsTeam.listTitle")}</div>
        <div class="card-sub">${t("agentsTeam.listSubtitle")}</div>
        ${agents.length === 0
          ? html`<p class="muted" style="margin-top: 12px;">${t("agentsTeam.empty")}</p>`
          : html`
              <div class="data-table-wrapper" style="margin-top: 12px;">
                <div class="data-table-container">
                  <table class="data-table">
                  <thead>
                    <tr>
                      <th>${t("agentsTeam.colAgent")}</th>
                      <th>${t("agentsTeam.colWorkspace")}</th>
                      <th>${t("agentsTeam.colModel")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${agents.map(
                      (agent) => html`
                        <tr>
                          <td>
                            <strong>${normalizeAgentLabel(agent)}</strong>
                            <div class="muted mono" style="font-size: 12px;">${agent.id}</div>
                            ${agentBadgeText(agent.id, defaultId)
                              ? html`<span class="pill">${agentBadgeText(agent.id, defaultId)}</span>`
                              : nothing}
                          </td>
                          <td class="muted" style="max-width: 280px; word-break: break-all;">
                            ${agent.workspace ?? "—"}
                          </td>
                          <td class="muted">
                            ${agent.model?.primary ?? "—"}
                          </td>
                          <td style="text-align: right;">
                            <button
                              type="button"
                              class="btn btn--sm danger"
                              ?disabled=${agent.id === DEFAULT_AGENT_ID ||
                              props.deleteBusyAgentId === agent.id ||
                              props.busy}
                              @click=${() => props.onDelete(agent.id)}
                            >
                              ${props.deleteBusyAgentId === agent.id
                                ? t("common.loading")
                                : t("agentsTeam.remove")}
                            </button>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            `}
      </div>
    </div>
  `;
}
