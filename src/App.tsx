import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./lib/supabase";
import { commitRepositoryFile, listRepositoryFiles, parseRepositoryUrl, rawBaseUrl, readRepositoryFile } from "./lib/git";
import type { GitProvider, LoadedFile, RepoFile, RepoInfo } from "./lib/git";
import { detectFramework } from "./lib/frameworkAdapters";

type SelectedElement = { id: string; tag: string; text: string; href: string; src: string; alt: string; color: string; backgroundColor: string; fontSize: string; margin: string; padding: string; width: string; textAlign: string };
type Notice = { kind: "ok" | "error" | "info"; text: string } | null;

const runtime = `
<script id="__site_visual_editor_runtime">
(function () {
  var selected = null;
  var style = document.createElement('style');
  style.id = '__site_visual_editor_highlight';
  style.textContent = '[data-ve-id]{cursor:pointer!important} [data-ve-id]:hover{outline:2px dashed #5b7cff!important;outline-offset:2px!important} [data-ve-selected="true"]{outline:2px solid #6b8cff!important;outline-offset:2px!important}';
  document.head.appendChild(style);
  document.querySelectorAll('body *').forEach(function (node, index) {
    if (!node.hasAttribute('data-ve-id') && node.id !== '__site_visual_editor_runtime' && node.id !== '__site_visual_editor_highlight') node.setAttribute('data-ve-id', String(index + 1));
  });
  document.addEventListener('click', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-ve-id]') : null;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll('[data-ve-selected="true"]').forEach(function (el) { el.removeAttribute('data-ve-selected'); });
    node.setAttribute('data-ve-selected', 'true');
    selected = node;
    parent.postMessage({ type: 've-selected', element: { id: node.getAttribute('data-ve-id'), tag: node.tagName.toLowerCase(), text: node.innerText || node.textContent || '', href: node.getAttribute('href') || '', src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '', color: node.style.color || getComputedStyle(node).color || '', backgroundColor: node.style.backgroundColor || '', fontSize: node.style.fontSize || '', margin: node.style.margin || '', padding: node.style.padding || '', width: node.style.width || '', textAlign: node.style.textAlign || '' } }, '*');
  }, true);
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 've-apply' && selected) {
      var p = data.patch || {};
      if (p.text !== undefined && !['img','input','textarea','video','audio','source','br','hr'].includes(selected.tagName.toLowerCase())) selected.textContent = p.text;
      ['href','src','alt'].forEach(function (key) { if (p[key] !== undefined && ['a','img','source','video','audio'].includes(selected.tagName.toLowerCase())) { if (p[key]) selected.setAttribute(key, p[key]); else selected.removeAttribute(key); } });
      ['color','backgroundColor','fontSize','margin','padding','width','textAlign'].forEach(function (key) { if (p[key] !== undefined) selected.style[key] = p[key]; });
      parent.postMessage({ type: 've-selected', element: { id: selected.getAttribute('data-ve-id'), tag: selected.tagName.toLowerCase(), text: selected.innerText || selected.textContent || '', href: selected.getAttribute('href') || '', src: selected.getAttribute('src') || '', alt: selected.getAttribute('alt') || '', color: selected.style.color || '', backgroundColor: selected.style.backgroundColor || '', fontSize: selected.style.fontSize || '', margin: selected.style.margin || '', padding: selected.style.padding || '', width: selected.style.width || '', textAlign: selected.style.textAlign || '' } }, '*');
    }
    if (data.type === 've-duplicate' && selected && selected.parentElement) {
      var clone = selected.cloneNode(true); clone.removeAttribute('data-ve-selected'); clone.querySelectorAll('[data-ve-id]').forEach(function (n) { n.removeAttribute('data-ve-id'); }); selected.parentElement.insertBefore(clone, selected.nextSibling);
      parent.postMessage({ type: 've-changed' }, '*');
    }
    if (data.type === 've-remove' && selected && selected.parentElement) { selected.remove(); selected = null; parent.postMessage({ type: 've-selected', element: null }); parent.postMessage({ type: 've-changed' }, '*'); }
    if (data.type === 've-html') {
      var clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('#__site_visual_editor_runtime, #__site_visual_editor_highlight').forEach(function (n) { n.remove(); });
      clone.querySelectorAll('[data-ve-id], [data-ve-selected]').forEach(function (n) { n.removeAttribute('data-ve-id'); n.removeAttribute('data-ve-selected'); });
      parent.postMessage({ type: 've-html-result', html: '<!doctype html>\\n' + clone.outerHTML }, '*');
    }
  });
})();
</script>`;

const emptyElement: SelectedElement = { id: "", tag: "", text: "", href: "", src: "", alt: "", color: "", backgroundColor: "", fontSize: "", margin: "", padding: "", width: "", textAlign: "" };
const editableExtensions = /\.(html?|css|js|jsx|ts|tsx|json|svg)$/i;

function buildPreview(content: string, repo: RepoInfo, filePath: string) {
  let html = content;
  if (!/<html[\s>]/i.test(html)) html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  const base = `<base href="${rawBaseUrl(repo, filePath)}">`;
  html = /<head[\s>]/i.test(html) ? html.replace(/<head([^>]*)>/i, match => match + base) : html.replace(/<html([^>]*)>/i, match => match + '<head>' + base + '</head>');
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, runtime + '</body>') : html + runtime;
}

function inferFramework(files: RepoFile[]) {
  return detectFramework(files).label;
}

export default function App() {
  const [provider, setProvider] = useState<GitProvider>("github");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [root, setRoot] = useState("");
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [filter, setFilter] = useState("");
  const [currentFile, setCurrentFile] = useState<LoadedFile | null>(null);
  const [originalFile, setOriginalFile] = useState<LoadedFile | null>(null);
  const [frameHtml, setFrameHtml] = useState("");
  const [selected, setSelected] = useState<SelectedElement>(emptyElement);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "info", text: "Connect a repository to start editing existing pages." });
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [commitMessage, setCommitMessage] = useState("Update website with visual editor");
  const [showConnect, setShowConnect] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const htmlResultResolve = useRef<((html: string) => void) | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "ve-selected") setSelected(event.data.element || emptyElement);
      if (event.data?.type === "ve-changed") { setDirty(true); setNotice({ kind: "info", text: "Preview changed. Save a draft or commit to Git to keep it." }); }
      if (event.data?.type === "ve-html-result" && htmlResultResolve.current) {
        htmlResultResolve.current(event.data.html);
        htmlResultResolve.current = null;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const previewSrc = useMemo(() => frameHtml, [frameHtml]);
  const visibleFiles = useMemo(() => files.filter(file => editableExtensions.test(file.path) && file.path.toLowerCase().includes(filter.toLowerCase())), [files, filter]);

  async function connectRepository(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice({ kind: "info", text: "Scanning repository files…" });
    try {
      const parsed = parseRepositoryUrl(repoUrl, branch, root);
      if (parsed.provider !== provider) setProvider(parsed.provider);
      const list = await listRepositoryFiles(parsed, token.trim());
      setRepo(parsed);
      setFiles(list);
      setCurrentFile(null);
      setOriginalFile(null);
      setFrameHtml("");
      setSelected(emptyElement);
      setDirty(false);
      setNotice({ kind: "ok", text: `Connected to ${parsed.owner}/${parsed.name}. Found ${list.length} files. Framework hint: ${inferFramework(list)}.` });
      setShowConnect(false);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not connect to repository." });
    } finally { setLoading(false); }
  }

  async function openFile(path: string) {
    if (!repo) return;
    setLoading(true);
    try {
      const file = await readRepositoryFile(repo, token.trim(), path);
      if (!/\.html?$/i.test(path)) {
        setCurrentFile(file); setOriginalFile(file); setFrameHtml(""); setSelected(emptyElement);
        setNotice({ kind: "info", text: "This source file is loaded. Direct visual preview is available for HTML files; CSS/JS/JSX source editing will be added through framework-aware editing." });
      } else {
        setCurrentFile(file); setOriginalFile(file); setFrameHtml(buildPreview(file.content, repo, path)); setSelected(emptyElement); setDirty(false);
        setNotice({ kind: "ok", text: `Loaded ${path} in isolated preview. Select an element to edit its properties.` });
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not open file." });
    } finally { setLoading(false); }
  }

  function applyPatch(patch: Partial<SelectedElement>) {
    const next = { ...selected, ...patch };
    setSelected(next);
    frameRef.current?.contentWindow?.postMessage({ type: "ve-apply", patch }, "*");
    setDirty(true);
  }

  function requestEditedHtml() {
    return new Promise<string>((resolve, reject) => {
      if (!frameRef.current?.contentWindow) return reject(new Error("Preview is not ready."));
      htmlResultResolve.current = resolve;
      frameRef.current.contentWindow.postMessage({ type: "ve-html" }, "*");
      window.setTimeout(() => {
        if (htmlResultResolve.current) { htmlResultResolve.current = null; reject(new Error("Could not read the preview HTML. Reload the page and try again.")); }
      }, 3000);
    });
  }

  async function saveDraft() {
    if (!repo || !currentFile) return setNotice({ kind: "error", text: "Connect a repository and open an HTML page first." });
    if (!user) return setNotice({ kind: "error", text: "Sign in with your account to save drafts to the database." });
    setLoading(true);
    try {
      const content = /\.html?$/i.test(currentFile.path) ? await requestEditedHtml() : currentFile.content;
      let projectId = savedProjectId;
      const projectPayload = { owner_id: user.id, name: `${repo.owner}/${repo.name}`, provider: repo.provider, repository_owner: repo.owner, repository_name: repo.name, default_branch: repo.branch, project_root: repo.root || "/", framework: inferFramework(files), settings: { lastOpenedFile: currentFile.path, editor: "visual" }, updated_at: new Date().toISOString() };
      if (projectId) {
        const { error } = await supabase.from("visual_editor_projects").update(projectPayload).eq("id", projectId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("visual_editor_projects").insert(projectPayload).select("id").single();
        if (error) throw error;
        projectId = data.id; setSavedProjectId(projectId);
      }
      const { error: revisionError } = await supabase.from("visual_editor_revisions").insert({ project_id: projectId, owner_id: user.id, label: `Draft · ${currentFile.path}`, status: "draft", snapshot: { path: currentFile.path, content, selectedElement: selected, savedAt: new Date().toISOString() }, changed_files: dirty ? [currentFile.path] : [] });
      if (revisionError) throw revisionError;
      setNotice({ kind: "ok", text: "Draft snapshot saved to the database." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Database save failed. Check sign-in and database configuration." });
    } finally { setLoading(false); }
  }

  async function saveToGit() {
    if (!repo || !currentFile || !originalFile) return setNotice({ kind: "error", text: "Connect a repository and open an HTML page first." });
    setLoading(true);
    try {
      const content = /\.html?$/i.test(currentFile.path) ? await requestEditedHtml() : currentFile.content;
      if (content === originalFile.content) {
        setNotice({ kind: "info", text: "No source changes detected. Edit an element before committing." });
        setLoading(false);
        return;
      }
      const result = await commitRepositoryFile(repo, token.trim(), { ...currentFile, content }, commitMessage.trim() || "Update website with visual editor");
      const updated = { ...currentFile, content, sha: result.fileSha };
      setCurrentFile(updated); setOriginalFile(updated); setDirty(false);
      if (user && savedProjectId) {
        await supabase.from("visual_editor_projects").update({ last_commit_sha: result.commitSha || null, updated_at: new Date().toISOString() }).eq("id", savedProjectId);
        await supabase.from("visual_editor_revisions").insert({ project_id: savedProjectId, owner_id: user.id, label: `Commit · ${currentFile.path}`, status: "committed", snapshot: { path: currentFile.path, content, savedAt: new Date().toISOString() }, changed_files: [currentFile.path], commit_sha: result.commitSha || null });
      }
      setNotice({ kind: "ok", text: `Committed ${currentFile.path} to ${repo.branch}.${result.commitSha ? ` Commit: ${result.commitSha.slice(0, 8)}` : ""}` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Git commit failed. Check token permissions." });
    } finally { setLoading(false); }
  }

  async function authAction(mode: "signin" | "signup") {
    setAuthBusy(true);
    try {
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: userEmail, password })
        : await supabase.auth.signUp({ email: userEmail, password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) setNotice({ kind: "info", text: "Account created. Check your email to confirm, then sign in." });
      else setNotice({ kind: "ok", text: mode === "signin" ? "Signed in. Drafts can now be saved." : "Account created and signed in." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Authentication failed." });
    } finally { setAuthBusy(false); }
  }

  function downloadHtml() {
    if (!currentFile) return;
    const content = currentFile.path.endsWith(".html") ? requestEditedHtml() : Promise.resolve(currentFile.content);
    content.then(value => {
      const url = URL.createObjectURL(new Blob([value], { type: "text/html;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = currentFile.path.split("/").pop() || "page.html"; anchor.click(); URL.revokeObjectURL(url);
    }).catch(error => setNotice({ kind: "error", text: error.message }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Site Visual Editor home"><span className="brand-mark">SV</span><span>site<span className="brand-light">visual</span><small>GIT WORKSPACE</small></span></a>
        <div className="topbar-center"><span className="status-dot" /> Existing website editor <span className="topbar-separator">/</span> <span className="muted">{repo ? `${repo.owner}/${repo.name}` : "No repository connected"}</span></div>
        <div className="topbar-actions">
          {user ? <><span className="user-pill">{user.email}</span><button className="button subtle small" onClick={() => supabase.auth.signOut()}>Sign out</button></> : <button className="button subtle small" onClick={() => document.getElementById("account-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Database account</button>}
          <button className="button primary small" disabled={loading || !currentFile} onClick={saveToGit}>{loading ? "Working…" : "↥ Commit to Git"}</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-rail">
          <div className="rail-heading"><span>PROJECT</span><button className="icon-button" title="Connect another repository" onClick={() => setShowConnect(!showConnect)}>＋</button></div>
          {showConnect && <form className="connect-form" onSubmit={connectRepository}>
            <label>Git provider</label>
            <div className="segmented"><button type="button" className={provider === "github" ? "active" : ""} onClick={() => { setProvider("github"); if (repoUrl.includes("gitlab")) setRepoUrl(""); }}>GitHub</button><button type="button" className={provider === "gitlab" ? "active" : ""} onClick={() => { setProvider("gitlab"); if (repoUrl.includes("github")) setRepoUrl(""); }}>GitLab</button></div>
            <label htmlFor="repo-url">Repository URL</label><input id="repo-url" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder={provider === "github" ? "https://github.com/org/site" : "https://gitlab.com/group/site"} required />
            <div className="field-row"><div><label htmlFor="branch">Branch</label><input id="branch" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" required /></div><div><label htmlFor="root">Folder (optional)</label><input id="root" value={root} onChange={e => setRoot(e.target.value)} placeholder="/" /></div></div>
            <label htmlFor="git-token">Access token <span className="label-hint">memory only</span></label><input id="git-token" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste repository token" required autoComplete="off" />
            <p className="helper">Token stays in this tab's memory and is never saved to the database. Use the minimum repository read/write permissions needed.</p>
            <button className="button primary full" type="submit" disabled={loading}>{loading ? "Connecting…" : "Connect repository →"}</button>
          </form>}
          <div className="files-heading"><span>FILES</span><span className="count">{visibleFiles.length}</span></div>
          <input className="file-search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="⌕  Find a page or file…" />
          <div className="file-list">
            {visibleFiles.map(file => <button key={file.path} className={currentFile?.path === file.path ? "file-item selected" : "file-item"} onClick={() => openFile(file.path)} title={file.path}><span className="file-type">{file.path.toLowerCase().endsWith(".html") || file.path.toLowerCase().endsWith(".htm") ? "HTML" : file.path.split(".").pop()?.toUpperCase().slice(0, 4)}</span><span className="file-path">{file.path.split("/").pop()}<small>{file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "root"}</small></span></button>)}
            {!visibleFiles.length && <div className="empty-files">{repo ? "No matching editable files." : "Connect a repository to browse its existing files."}</div>}
          </div>
          <div className="left-bottom"><span className="shield">▣</span><span><b>Backup-first workflow</b><small>Original backup folder is not modified.</small></span></div>
        </aside>

        <section className="editor-main">
          <div className="editor-toolbar">
            <div className="breadcrumbs"><span>Pages</span><span>›</span><b>{currentFile?.path || "Choose a page"}</b>{dirty && <span className="unsaved-dot" title="Unsaved changes" />}</div>
            <div className="toolbar-controls"><div className="viewport-switch"><button className={viewport === "desktop" ? "active" : ""} onClick={() => setViewport("desktop")} title="Desktop preview">▰</button><button className={viewport === "tablet" ? "active" : ""} onClick={() => setViewport("tablet")} title="Tablet preview">▯</button><button className={viewport === "mobile" ? "active" : ""} onClick={() => setViewport("mobile")} title="Mobile preview">▯</button></div><button className="button subtle small" onClick={downloadHtml} disabled={!currentFile}>↓ Export</button></div>
          </div>
          <div className="canvas-area">
            {previewSrc ? <div className={`preview-device ${viewport}`}><div className="preview-browser"><div className="browser-dots"><i/><i/><i/></div><div className="browser-url">{repo?.owner}/{repo?.name}/{currentFile?.path}</div><span className="browser-lock">⌁</span></div><iframe ref={frameRef} title="Isolated website preview" className="preview-frame" sandbox="allow-scripts allow-forms allow-popups" srcDoc={previewSrc} /></div>
              : <div className="empty-canvas"><div className="empty-illustration"><div className="mock-window"><div className="mock-top"><i/><i/><i/></div><div className="mock-layout"><div/><div/><div/><div/></div></div><span className="mock-cursor">↖</span></div><h2>Make changes to the site you already have.</h2><p>Connect a Git repository, choose an HTML page, then click any element in the preview to edit it. No new headers or generated layouts.</p><button className="button primary" onClick={() => setShowConnect(true)}>Connect a repository</button><div className="feature-pills"><span>✦ Content edits</span><span>▧ Section clone / remove</span><span>⌘ Git commits</span></div></div>}
          </div>
          <div className="statusbar"><span className="status-ready"><i/> Preview sandbox</span><span>{repo ? inferFramework(files) : "Waiting for project"}</span><span>{currentFile ? currentFile.path : "No page selected"}</span><span className={dirty ? "changes-pending" : ""}>{dirty ? "● Unsaved changes" : "✓ No pending changes"}</span></div>
        </section>

        <aside className="right-panel">
          <div className="panel-tabs"><button className="active">Properties</button><button onClick={() => setNotice({ kind: "info", text: "Section operations are available for the selected preview element." })}>Structure</button></div>
          <div className="panel-content">
            <div className="panel-title"><div><span className="eyebrow">SELECTED ELEMENT</span><h3>{selected.tag ? `<${selected.tag}>` : "Nothing selected"}</h3></div>{selected.tag && <span className="element-badge">{selected.tag.toUpperCase()}</span>}</div>
            {!selected.tag ? <div className="select-hint"><div className="target-icon">⌖</div><b>Select an element</b><p>Click text, image, button or section in the preview to edit its existing attributes and styles.</p></div> : <>
              <section className="property-section"><h4>CONTENT</h4>{!["img","input","video","audio","source","br","hr"].includes(selected.tag) && <><label htmlFor="prop-text">Text content</label><textarea id="prop-text" rows={3} value={selected.text} onChange={e => applyPatch({ text: e.target.value })} /></>}
                {["a","img","source","video","audio"].includes(selected.tag) && <><label htmlFor="prop-link">{selected.tag === "img" ? "Image source URL" : "Link / source URL"}</label><input id="prop-link" value={selected.tag === "img" ? selected.src : selected.href} onChange={e => applyPatch(selected.tag === "img" ? { src: e.target.value } : { href: e.target.value })} placeholder="https://…" />{selected.tag === "img" && <><label htmlFor="prop-alt">Alternative text</label><input id="prop-alt" value={selected.alt} onChange={e => applyPatch({ alt: e.target.value })} /></>}</>}
              </section>
              <section className="property-section"><h4>APPEARANCE</h4><div className="field-row"><div><label htmlFor="prop-color">Text color</label><input id="prop-color" value={selected.color} onChange={e => applyPatch({ color: e.target.value })} placeholder="#222 or CSS" /></div><div><label htmlFor="prop-bg">Background</label><input id="prop-bg" value={selected.backgroundColor} onChange={e => applyPatch({ backgroundColor: e.target.value })} placeholder="#fff or CSS" /></div></div><div className="field-row"><div><label htmlFor="prop-font">Font size</label><input id="prop-font" value={selected.fontSize} onChange={e => applyPatch({ fontSize: e.target.value })} placeholder="16px" /></div><div><label htmlFor="prop-width">Width</label><input id="prop-width" value={selected.width} onChange={e => applyPatch({ width: e.target.value })} placeholder="100% / auto" /></div></div><div className="field-row"><div><label htmlFor="prop-margin">Margin</label><input id="prop-margin" value={selected.margin} onChange={e => applyPatch({ margin: e.target.value })} placeholder="16px 0" /></div><div><label htmlFor="prop-padding">Padding</label><input id="prop-padding" value={selected.padding} onChange={e => applyPatch({ padding: e.target.value })} placeholder="12px" /></div></div><label htmlFor="prop-align">Text alignment</label><select id="prop-align" value={selected.textAlign} onChange={e => applyPatch({ textAlign: e.target.value })}><option value="">Theme default</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></section>
              <section className="property-section"><h4>SECTION ACTIONS</h4><p className="helper">These actions affect the selected element and its nested content.</p><div className="action-row"><button className="button subtle" onClick={() => { frameRef.current?.contentWindow?.postMessage({ type: "ve-duplicate" }, "*"); setDirty(true); }}>▢ Clone</button><button className="button danger" onClick={() => { if (window.confirm("Remove this element from the page preview? This change is not committed until you save it.")) { frameRef.current?.contentWindow?.postMessage({ type: "ve-remove" }, "*"); setSelected(emptyElement); setDirty(true); } }}>⌫ Remove</button></div></section>
            </>}
            <div className="panel-save"><button className="button primary full" disabled={loading || !currentFile || !user} onClick={saveDraft}>{loading ? "Saving…" : "▣ Save draft to database"}</button><small>{user ? "Saves a version snapshot to your private workspace." : "Sign in below to enable database drafts."}</small><button className="button subtle full" disabled={loading || !currentFile} onClick={saveToGit}>↥ Commit changes to Git</button></div>
          </div>
          <div id="account-panel" className="account-panel"><div className="account-title"><span className="database-icon">▤</span><div><b>Database workspace</b><small>{user ? "Signed in" : "Sign in to save drafts"}</small></div></div>
            {user ? <div className="account-signed"><span className="account-check">✓</span><span>Draft history is enabled for {user.email}.</span></div> : <><input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} placeholder="Email address" autoComplete="email" /><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 characters)" autoComplete="current-password" /><div className="action-row"><button className="button subtle" disabled={authBusy || !userEmail || password.length < 6} onClick={() => authAction("signin")}>Sign in</button><button className="button subtle" disabled={authBusy || !userEmail || password.length < 6} onClick={() => authAction("signup")}>Create account</button></div></>}
          </div>
        </aside>
      </main>
      {notice && <div className={`toast ${notice.kind}`} role="status"><span>{notice.kind === "ok" ? "✓" : notice.kind === "error" ? "!" : "i"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}
    </div>
  );
}
