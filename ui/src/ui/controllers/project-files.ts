import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  AgentsWorkspaceBrowseResult,
  AgentsWorkspaceDeleteResult,
  AgentsWorkspaceDownloadResult,
  AgentsWorkspaceUploadResult,
} from "../types.ts";

export type ProjectFilesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  projectFilesLoading: boolean;
  projectFilesError: string | null;
  projectFilesList: AgentsWorkspaceBrowseResult | null;
  projectFilesCurrentPath: string;
  projectFilesUploading: boolean;
  projectFilesDeletingPath: string | null;
  projectFilesDownloadingPath: string | null;
};

export async function loadProjectFiles(state: ProjectFilesState, agentId: string, path = "") {
  if (!state.client || !state.connected || state.projectFilesLoading) {
    return;
  }
  state.projectFilesLoading = true;
  state.projectFilesError = null;
  try {
    const res = await state.client.request<AgentsWorkspaceBrowseResult | null>("agents.workspace.browse", {
      agentId,
      path,
    });
    if (res) {
      state.projectFilesList = res;
      state.projectFilesCurrentPath = res.currentPath ?? "";
    }
  } catch (err) {
    state.projectFilesError = String(err);
  } finally {
    state.projectFilesLoading = false;
  }
}

export async function downloadWorkspaceFile(state: ProjectFilesState, agentId: string, path: string) {
  if (!state.client || !state.connected || state.projectFilesDownloadingPath) {
    return;
  }
  state.projectFilesDownloadingPath = path;
  state.projectFilesError = null;
  try {
    const res = await state.client.request<AgentsWorkspaceDownloadResult | null>("agents.workspace.download", {
      agentId,
      path,
    });
    if (!res?.contentBase64) {
      return;
    }
    const binary = atob(res.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.fileName || "download.bin";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    state.projectFilesError = String(err);
  } finally {
    state.projectFilesDownloadingPath = null;
  }
}

export async function uploadProjectFile(
  state: ProjectFilesState,
  agentId: string,
  targetPath: string,
  file: File,
) {
  if (!state.client || !state.connected || state.projectFilesUploading) {
    return;
  }
  state.projectFilesUploading = true;
  state.projectFilesError = null;
  try {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const contentBase64 = btoa(binary);
    await state.client.request<AgentsWorkspaceUploadResult | null>("agents.workspace.upload", {
      agentId,
      path: targetPath,
      contentBase64,
    });
    await loadProjectFiles(state, agentId, state.projectFilesCurrentPath);
  } catch (err) {
    state.projectFilesError = String(err);
  } finally {
    state.projectFilesUploading = false;
  }
}

export async function uploadProjectFiles(
  state: ProjectFilesState,
  agentId: string,
  currentPath: string,
  files: File[],
) {
  if (!state.client || !state.connected || state.projectFilesUploading || files.length === 0) {
    return;
  }
  state.projectFilesUploading = true;
  state.projectFilesError = null;
  try {
    for (const file of files) {
      const relativeInSelection =
        typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath === "string" &&
        (file as File & { webkitRelativePath?: string }).webkitRelativePath
          ? (file as File & { webkitRelativePath?: string }).webkitRelativePath
          : file.name;
      const relativeSafe = relativeInSelection.replace(/\\/g, "/").replace(/^\/+/, "");
      const targetPath = `${currentPath ? `${currentPath}/` : ""}${relativeSafe}`;

      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      const contentBase64 = btoa(binary);
      await state.client.request<AgentsWorkspaceUploadResult | null>("agents.workspace.upload", {
        agentId,
        path: targetPath,
        contentBase64,
      });
    }
    await loadProjectFiles(state, agentId, state.projectFilesCurrentPath);
  } catch (err) {
    state.projectFilesError = String(err);
  } finally {
    state.projectFilesUploading = false;
  }
}

export async function deleteProjectPath(state: ProjectFilesState, agentId: string, path: string) {
  if (!state.client || !state.connected || state.projectFilesDeletingPath) {
    return;
  }
  state.projectFilesDeletingPath = path;
  state.projectFilesError = null;
  try {
    await state.client.request<AgentsWorkspaceDeleteResult | null>("agents.workspace.delete", {
      agentId,
      path,
    });
    await loadProjectFiles(state, agentId, state.projectFilesCurrentPath);
  } catch (err) {
    state.projectFilesError = String(err);
  } finally {
    state.projectFilesDeletingPath = null;
  }
}
