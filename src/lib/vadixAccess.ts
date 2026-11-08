export type VadixSiteKey = "zenventora" | "puravigal" | "ularsuvai" | "saforahampers" | "bismiboutique" | "askarlandpromoters";

export type VadixSiteConfig = {
  key: VadixSiteKey;
  name: string;
  domain: string;
  provider: "github" | "gitlab";
  repository_owner: string;
  repository_name: string;
  default_branch: string;
  project_root: string;
  sitemap_url?: string;
};

export const VADIX_SITES: VadixSiteConfig[] = [
  { key: "zenventora", name: "ZenVentora", domain: "zenventora.in", provider: "github", repository_owner: "samsahabdeenm", repository_name: "zenventora", default_branch: "main", project_root: "" },
  { key: "puravigal", name: "Puravigal", domain: "puravigal.com", provider: "github", repository_owner: "samsahabdeenm", repository_name: "PuraviPos", default_branch: "main", project_root: "" },
  { key: "ularsuvai", name: "Ularsuvai", domain: "ularsuvai.in", provider: "github", repository_owner: "samsahabdeenm", repository_name: "ularsuvai", default_branch: "main", project_root: "" },
  { key: "saforahampers", name: "Safora Hampers", domain: "saforahampers.in", provider: "github", repository_owner: "samsahabdeenm", repository_name: "saforahampers", default_branch: "main", project_root: "" },
  { key: "bismiboutique", name: "Bismi Boutique", domain: "bismiboutique.online", provider: "github", repository_owner: "samsahabdeenm", repository_name: "bismi-boutique", default_branch: "main", project_root: "" },
  { key: "askarlandpromoters", name: "Askar Land Promoters", domain: "askarlandpromoters.com", provider: "github", repository_owner: "samsahabdeenm", repository_name: "asker-land-promoters", default_branch: "main", project_root: "" }
];

export function getVadixSite(key: string) {
  return VADIX_SITES.find(site => site.key === key);
}
