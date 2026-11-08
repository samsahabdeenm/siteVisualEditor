export type DiscoveredPage = {
  url: string;
  path: string;
  source: "sitemap" | "repository";
  title?: string;
};

function normalizeUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.href.replace(/#.*$/, "");
  } catch {
    return null;
  }
}

function sitemapLocations(xml: string, origin: string) {
  const locations: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const normalized = normalizeUrl(match[1], origin);
    if (normalized) locations.push(normalized);
  }
  return locations;
}

export async function discoverSitemapPages(domain: string, explicitSitemap?: string): Promise<DiscoveredPage[]> {
  const base = new URL(domain.includes("://") ? domain : "https://" + domain);
  const root = explicitSitemap || new URL("/sitemap.xml", base).href;
  const visited = new Set<string>();
  const pages = new Map<string, DiscoveredPage>();

  async function visit(url: string, depth: number) {
    if (depth > 4 || visited.has(url)) return;
    visited.add(url);
    const response = await fetch(url, { headers: { Accept: "application/xml,text/xml,text/plain" } });
    if (!response.ok) throw new Error("Sitemap request failed: " + response.status);
    const xml = await response.text();
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    const locations = sitemapLocations(xml, base.origin);
    if (isIndex) {
      for (const location of locations) await visit(location, depth + 1);
      return;
    }
    for (const location of locations) {
      if (!location.startsWith(base.origin)) continue;
      const parsed = new URL(location);
      pages.set(location, { url: location, path: parsed.pathname || "/", source: "sitemap" });
    }
  }

  await visit(root, 0);
  return Array.from(pages.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export function repositoryPages(files: Array<{ path: string }>): DiscoveredPage[] {
  return files
    .filter(file => /\.html?$/i.test(file.path) && !/(^|\/)backup(\/|$)/i.test(file.path))
    .map(file => ({ url: file.path, path: "/" + file.path.replace(/^\/+/, ""), source: "repository" as const }))
    .sort((a, b) => a.path.localeCompare(b.path));
}


export function mapSitemapToRepositoryPages(sitemapPages: DiscoveredPage[], files: Array<{ path: string }>): DiscoveredPage[] {
  const htmlFiles = files.filter(file => /\.html?$/i.test(file.path) && !/(^|\/)backup(\/|$)/i.test(file.path));
  const normalized = (value: string) => value.replace(/^\/+|\/+$/g, "").toLowerCase();
  const matches = new Map<string, string>();
  for (const file of htmlFiles) {
    const noExt = file.path.replace(/\.html?$/i, "");
    const variants = [
      "/" + normalized(file.path),
      "/" + normalized(noExt),
      "/" + normalized(noExt.replace(/\/index$/i, "")),
      "/" + normalized(noExt) + "/"
    ];
    for (const variant of variants) matches.set(variant || "/", file.path);
  }
  matches.set("/", htmlFiles.find(file => /^index\.html?$/i.test(file.path))?.path || htmlFiles.find(file => /(^|\/)index\.html?$/i.test(file.path))?.path || "");
  return sitemapPages
    .map(page => {
      const key = page.path === "/" ? "/" : "/" + normalized(page.path);
      const repoPath = matches.get(key) || matches.get(key.endsWith("/") ? key.slice(0, -1) : key + "/");
      return repoPath ? { ...page, path: "/" + repoPath.replace(/^\/+/, "") } : null;
    })
    .filter((page): page is DiscoveredPage => Boolean(page));
}
