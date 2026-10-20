export type GitProvider = "github" | "gitlab";

export type RepoInfo = {
  provider: GitProvider;
  owner: string;
  name: string;
  branch: string;
  root: string;
};

export type RepoFile = { path: string; type: "blob" | "tree"; size?: number };

function cleanPath(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function parseRepositoryUrl(input: string, branch: string, root = ""): RepoInfo {
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const provider: GitProvider = url.hostname.toLowerCase().includes("gitlab") ? "gitlab" : "github";
  if (provider === "github") {
    if (parts.length < 2) throw new Error("Enter a repository URL such as https://github.com/owner/repository");
    return { provider, owner: parts[0], name: parts[1].replace(/\.git$/, ""), branch: branch.trim() || "main", root: cleanPath(root) };
  }
  if (parts.length < 2) throw new Error("Enter a GitLab project URL such as https://gitlab.com/group/project");
  return { provider, owner: parts.slice(0, -1).join("/"), name: parts[parts.length - 1].replace(/\.git$/, ""), branch: branch.trim() || "main", root: cleanPath(root) };
}

function apiRoot(repo: RepoInfo) {
  return repo.provider === "github"
    ? `https://api.github.com/repos/${repo.owner}/${repo.name}`
    : `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${repo.owner}/${repo.name}`)}`;
}

function headers(repo: RepoInfo, token: string, json = false) {
  return repo.provider === "github"
    ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(json ? { "Content-Type": "application/json" } : {}) }
    : { "PRIVATE-TOKEN": token, ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function checkedFetch(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.message || body.error || body.error_description || "";
    } catch { /* response body was not JSON */ }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Access denied. Check the token permissions and repository access.");
    }
    if (response.status === 404) throw new Error("Repository, branch, or file was not found. Check the URL and branch.");
    throw new Error(detail || `Git provider returned HTTP ${response.status}`);
  }
  return response;
}

export async function listRepositoryFiles(repo: RepoInfo, token: string): Promise<RepoFile[]> {
  if (repo.provider === "github") {
    const response = await checkedFetch(`${apiRoot(repo)}/git/trees/${repo.branch.split("/").map(encodeURIComponent).join("/")}?recursive=1`, { headers: headers(repo, token) });
    const data = await response.json();
    if (data.truncated) throw new Error("This repository tree is too large for one scan. Narrow the project folder or scan support can be extended.");
    return (data.tree || [])
      .filter((item: any) => item.type === "blob" && (!repo.root || item.path.startsWith(repo.root + "/") || item.path === repo.root))
      .map((item: any) => ({ path: item.path, type: "blob" as const, size: item.size }));
  }
  const files: RepoFile[] = [];
  let page = 1;
  while (page <= 10) {
    const url = `${apiRoot(repo)}/repository/tree?ref=${encodeURIComponent(repo.branch)}&recursive=true&per_page=100&page=${page}`;
    const response = await checkedFetch(url, { headers: headers(repo, token) });
    const batch = await response.json();
    files.push(...batch.filter((item: any) => item.type === "blob" && (!repo.root || item.path.startsWith(repo.root + "/") || item.path === repo.root))
      .map((item: any) => ({ path: item.path, type: "blob" as const, size: item.size })));
    if (batch.length < 100) break;
    page += 1;
  }
  return files;
}

export type LoadedFile = { path: string; content: string; sha?: string };

export async function readRepositoryFile(repo: RepoInfo, token: string, path: string): Promise<LoadedFile> {
  if (repo.provider === "github") {
    const response = await checkedFetch(`${apiRoot(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(repo.branch)}`, { headers: headers(repo, token) });
    const data = await response.json();
    if (Array.isArray(data) || data.type !== "file") throw new Error("Choose a file, not a directory.");
    const binary = atob((data.content || "").replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return { path, content: new TextDecoder().decode(bytes), sha: data.sha };
  }
  const filePath = encodeURIComponent(path);
  const response = await checkedFetch(`${apiRoot(repo)}/repository/files/${filePath}?ref=${encodeURIComponent(repo.branch)}`, { headers: headers(repo, token) });
  const data = await response.json();
  const binary = atob(data.content || "");
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return { path, content: new TextDecoder().decode(bytes), sha: data.last_commit_id };
}

function toBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function commitRepositoryFile(repo: RepoInfo, token: string, file: LoadedFile, message: string) {
  if (repo.provider === "github") {
    const response = await checkedFetch(`${apiRoot(repo)}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT",
      headers: headers(repo, token, true),
      body: JSON.stringify({ message, content: toBase64Utf8(file.content), branch: repo.branch, ...(file.sha ? { sha: file.sha } : {}) })
    });
    const data = await response.json();
    return { commitSha: data.commit?.sha as string | undefined, fileSha: data.content?.sha as string | undefined };
  }
  const response = await checkedFetch(`${apiRoot(repo)}/repository/files/${encodeURIComponent(file.path)}`, {
    method: "PUT",
    headers: headers(repo, token, true),
    body: JSON.stringify({ branch: repo.branch, content: file.content, commit_message: message, encoding: "text" })
  });
  const data = await response.json();
  return { commitSha: data.commit_id as string | undefined, fileSha: undefined };
}

export function rawBaseUrl(repo: RepoInfo, filePath: string) {
  const directory = filePath.split("/").slice(0, -1).join("/");
  if (repo.provider === "github") return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.branch.split("/").map(encodeURIComponent).join("/")}/${directory ? directory + "/" : ""}`;
  return `https://gitlab.com/${repo.owner}/${repo.name}/-/raw/${repo.branch.split("/").map(encodeURIComponent).join("/")}/${directory ? directory + "/" : ""}`;
}
