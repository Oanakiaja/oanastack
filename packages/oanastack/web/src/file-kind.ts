const ICONS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  xml: "html",
  svg: "image",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  py: "python",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  go: "go",
  rs: "rust",
};

/** Icon name for a file name, from its extension. Unknown files stay generic. */
export function iconKind(filename: string): string {
  const ext = extension(filename);
  return (ext && ICONS[ext]) || "file";
}

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  css: "css",
  scss: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  py: "python",
  sh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  go: "go",
  rs: "rust",
};

/** highlight.js language for a repo-relative path, or null when the file stays plain. */
export function languageOf(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  const ext = extension(base);
  if (!ext) return null;
  return LANGUAGES[ext] ?? null;
}

function extension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return null;
  return filename.slice(dot + 1).toLowerCase();
}
