import { html } from "lit";
import { t } from "../../i18n/index.ts";
import { icons } from "../icons.ts";
import type { WorkspaceEntry } from "../types.ts";

type ProjectFilesViewProps = {
  loading: boolean;
  error: string | null;
  workspace: string;
  currentPath: string;
  canWrite: boolean;
  entries: WorkspaceEntry[];
  uploading: boolean;
  deletingPath: string | null;
  downloadingPath: string | null;
  onOpenPath: (path: string) => void;
  onGoUp: () => void;
  onDownload: (path: string) => void;
  onDelete: (path: string) => void;
  onUploadFile: (file: File) => void;
  onUploadFolder: (files: File[]) => void;
};

const FILE_INPUT_HIDE =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

function formatBytes(bytes?: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function renderProjectFiles(props: ProjectFilesViewProps) {
  const canGoUp = Boolean(props.currentPath);
  const displayPath = props.currentPath ? `/${props.currentPath}` : "/";
  const isEmpty = !props.loading && props.entries.length === 0;

  return html`
    <section class="card project-files">
      <header class="project-files__header">
        <div class="project-files__title-row">
          <div class="project-files__brand-icon" aria-hidden="true">${icons.folder}</div>
          <div class="project-files__title-block">
            <h2 class="project-files__title">${t("projectFiles.title")}</h2>
            <p class="project-files__lead">${t("projectFiles.lead")}</p>
          </div>
        </div>

        <div class="project-files__meta">
          <div class="project-files__chip project-files__chip--workspace">
            <span class="project-files__chip-label">${t("projectFiles.workspace")}</span>
            <code class="project-files__chip-value" title=${props.workspace || ""}
              >${props.workspace || "—"}</code
            >
          </div>
          <div class="project-files__chip project-files__chip--path">
            <span class="project-files__chip-label">${t("projectFiles.currentPath")}</span>
            <span class="project-files__path-text">${displayPath}</span>
          </div>
        </div>
      </header>

      <div class="project-files__toolbar">
        <button
          type="button"
          class="btn btn--subtle btn--sm project-files__toolbar-btn"
          ?disabled=${!canGoUp}
          @click=${props.onGoUp}
        >
          <span
            class="project-files__btn-icon project-files__btn-icon--up"
            aria-hidden="true"
            >${icons.arrowDown}</span
          >
          ${t("projectFiles.goUp")}
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm project-files__toolbar-btn"
          @click=${() => props.onOpenPath("")}
        >
          ${t("projectFiles.root")}
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm project-files__toolbar-btn"
          @click=${() => props.onOpenPath("project")}
        >
          ${t("projectFiles.projectRoot")}
        </button>
      </div>

      ${props.canWrite
        ? html`<div class="project-files__upload">
            <div class="project-files__upload-actions">
              <label
                class="btn btn--subtle btn--sm project-files__upload-label"
                style=${props.uploading
                  ? "opacity:0.55;pointer-events:none;cursor:not-allowed"
                  : "cursor:pointer"}
              >
                <input
                  type="file"
                  style=${FILE_INPUT_HIDE}
                  ?disabled=${props.uploading}
                  @change=${(e: Event) => {
                    const input = e.currentTarget as HTMLInputElement;
                    const file = input.files?.[0];
                    if (!file) {
                      return;
                    }
                    props.onUploadFile(file);
                    input.value = "";
                  }}
                />
                <span class="project-files__btn-icon" aria-hidden="true">${icons.fileText}</span>
                ${t("projectFiles.selectFile")}
              </label>
              <label
                class="btn btn--ghost btn--sm project-files__upload-label"
                style=${props.uploading
                  ? "opacity:0.55;pointer-events:none;cursor:not-allowed"
                  : "cursor:pointer"}
              >
                <input
                  type="file"
                  webkitdirectory
                  directory
                  multiple
                  style=${FILE_INPUT_HIDE}
                  ?disabled=${props.uploading}
                  @change=${(e: Event) => {
                    const input = e.currentTarget as HTMLInputElement;
                    const files = input.files ? Array.from(input.files) : [];
                    if (files.length === 0) {
                      return;
                    }
                    props.onUploadFolder(files);
                    input.value = "";
                  }}
                />
                <span class="project-files__btn-icon" aria-hidden="true">${icons.folder}</span>
                ${t("projectFiles.selectFolder")}
              </label>
            </div>
            <p class="project-files__upload-hint">
              ${props.uploading ? t("projectFiles.uploading") : t("projectFiles.uploadHint")}
            </p>
          </div>`
        : html`<div class="project-files__readonly">
            <span class="project-files__readonly-icon" aria-hidden="true">${icons.eyeOff}</span>
            <span>${t("projectFiles.readonlyHint")}</span>
          </div>`}

      ${props.error
        ? html`<div class="project-files__alert" role="alert">${props.error}</div>`
        : null}

      <div class="data-table-wrapper project-files__table-wrap">
        ${props.loading
          ? html`<div class="project-files__loading">
              <span class="project-files__loading-icon" aria-hidden="true">${icons.loader}</span>
              <span>${t("projectFiles.loading")}</span>
            </div>`
          : html`<div class="data-table-container">
              <table class="data-table project-files__table">
                <thead>
                  <tr>
                    <th>${t("projectFiles.columns.name")}</th>
                    <th>${t("projectFiles.columns.type")}</th>
                    <th>${t("projectFiles.columns.size")}</th>
                    <th>${t("projectFiles.columns.updatedAt")}</th>
                    <th class="project-files__col-actions">${t("projectFiles.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${isEmpty
                    ? html`<tr>
                        <td colspan="5" class="project-files__empty">${t("projectFiles.emptyFolder")}</td>
                      </tr>`
                    : props.entries.map(
                        (entry) => html`
                          <tr>
                            <td class="project-files__cell-name">
                              ${entry.kind === "directory"
                                ? html`<button
                                    type="button"
                                    class="project-files__dir-link"
                                    @click=${() => props.onOpenPath(entry.path)}
                                  >
                                    <span class="project-files__row-icon" aria-hidden="true"
                                      >${icons.folder}</span
                                    >
                                    <span>${entry.name}</span>
                                  </button>`
                                : html`<span class="project-files__file-line">
                                    <span class="project-files__row-icon" aria-hidden="true"
                                      >${icons.fileText}</span
                                    >
                                    <span>${entry.name}</span>
                                  </span>`}
                            </td>
                            <td>
                              <span
                                class="project-files__type ${entry.kind === "directory"
                                  ? "project-files__type--dir"
                                  : "project-files__type--file"}"
                              >
                                ${entry.kind === "directory"
                                  ? t("projectFiles.directory")
                                  : t("projectFiles.file")}
                              </span>
                            </td>
                            <td class="project-files__mono">${entry.kind === "file" ? formatBytes(entry.size) : "—"}</td>
                            <td class="project-files__muted">
                              ${entry.updatedAtMs ? new Date(entry.updatedAtMs).toLocaleString() : "—"}
                            </td>
                            <td class="project-files__actions">
                              ${html`<button
                                    type="button"
                                    class="btn btn--subtle btn--sm project-files__action-btn"
                                    ?disabled=${props.downloadingPath === entry.path}
                                    @click=${() => props.onDownload(entry.path)}
                                  >
                                    <span class="project-files__btn-icon" aria-hidden="true"
                                      >${icons.download}</span
                                    >
                                    ${props.downloadingPath === entry.path
                                      ? t("projectFiles.downloading")
                                      : t("projectFiles.download")}
                                  </button>`}
                              ${entry.path.toLowerCase().startsWith("project/")
                                ? html`<button
                                    type="button"
                                    class="btn btn--danger btn--sm project-files__action-btn"
                                    ?disabled=${props.deletingPath === entry.path}
                                    @click=${() => props.onDelete(entry.path)}
                                  >
                                    <span class="project-files__btn-icon" aria-hidden="true"
                                      >${icons.trash}</span
                                    >
                                    ${props.deletingPath === entry.path
                                      ? t("projectFiles.deleting")
                                      : t("projectFiles.delete")}
                                  </button>`
                                : null}
                            </td>
                          </tr>
                        `,
                      )}
                </tbody>
              </table>
            </div>`}
      </div>
    </section>
  `;
}
