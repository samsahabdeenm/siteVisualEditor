import type { RepoFile } from "./git";

export type FrameworkKind = "static-html" | "react-vite" | "nextjs" | "unknown";

export type FrameworkAdapter = {
  id: FrameworkKind;
  label: string;
  sourceExtensions: string[];
  detect(files: RepoFile[]): boolean;
  previewMode: "direct-html" | "build-required" | "unsupported";
  note: string;
};

export const frameworkAdapters: FrameworkAdapter[] = [
  {
    id: "nextjs",
    label: "Next.js",
    sourceExtensions: [".tsx", ".ts", ".jsx", ".js", ".css", ".scss"],
    detect: files => files.some(file => /^next\.config\.(js|mjs|ts|cjs)$/.test(file.path.split("/").pop() || "")),
    previewMode: "build-required",
    note: "Requires a server-side build/preview runtime before editing JSX and route output safely."
  },
  {
    id: "react-vite",
    label: "React / Vite",
    sourceExtensions: [".tsx", ".ts", ".jsx", ".js", ".css", ".scss", ".html"],
    detect: files => files.some(file => /^vite\.config\.(js|ts|mjs)$/.test(file.path.split("/").pop() || "")) ||
      (files.some(file => /(^|\/)src\/(main|index)\.(tsx|jsx|ts|js)$/.test(file.path)) &&
       files.some(file => /(^|\/)package\.json$/.test(file.path))),
    previewMode: "build-required",
    note: "Needs an isolated dependency install and build preview; JSX source is not rewritten by the HTML editor."
  },
  {
    id: "static-html",
    label: "Static HTML / CSS / JS",
    sourceExtensions: [".html", ".htm", ".css", ".js", ".svg"],
    detect: files => files.some(file => /\.html?$/i.test(file.path)),
    previewMode: "direct-html",
    note: "HTML pages can be previewed and edited directly. CSS and JS are listed as source files."
  }
];

export function detectFramework(files: RepoFile[]): FrameworkAdapter {
  return frameworkAdapters.find(adapter => adapter.detect(files)) || {
    id: "unknown",
    label: "Unknown framework",
    sourceExtensions: [],
    detect: () => false,
    previewMode: "unsupported",
    note: "No supported project marker was detected. Inspect the project before writing changes."
  };
}
