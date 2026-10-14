export interface DiffTreeInput {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary?: boolean;
}

export interface DiffTreeFile {
  path: string;
  name: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface DiffTreeDir {
  path: string;
  name: string;
  added: number;
  removed: number;
  fileCount: number;
  files: DiffTreeFile[];
  dirs: DiffTreeDir[];
}

/** Group changed files by directory and roll up line stats and file counts. */
export function buildDiffTree(inputs: readonly DiffTreeInput[]): DiffTreeDir {
  const root: DiffTreeDir = { path: "", name: "", added: 0, removed: 0, fileCount: 0, files: [], dirs: [] };
  for (const input of inputs) {
    const parts = input.path.split("/").filter((part) => part.length > 0);
    const name = parts[parts.length - 1];
    if (!name) continue;
    const file: DiffTreeFile = {
      path: input.path,
      name,
      status: input.status.slice(0, 1) || "?",
      added: input.added,
      removed: input.removed,
      binary: input.binary === true,
    };
    let node = root;
    let acc = "";
    for (const segment of parts.slice(0, -1)) {
      acc = acc ? `${acc}/${segment}` : segment;
      let child = node.dirs.find((dir) => dir.name === segment);
      if (!child) {
        child = { path: acc, name: segment, added: 0, removed: 0, fileCount: 0, files: [], dirs: [] };
        node.dirs.push(child);
      }
      node = child;
    }
    node.files.push(file);
  }
  rollup(root);
  sortNode(root);
  return root;
}

/** Files inside a directory, or every file when dir is empty. `src` matches `src/a` and not `src2/a`. */
export function filesUnder<T extends { path: string }>(files: readonly T[], dir: string | null | undefined): T[] {
  if (!dir) return [...files];
  const prefix = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  if (!prefix) return [...files];
  return files.filter((file) => file.path === prefix || file.path.startsWith(`${prefix}/`));
}

function rollup(node: DiffTreeDir): void {
  for (const dir of node.dirs) rollup(dir);
  node.fileCount = node.files.length + node.dirs.reduce((sum, dir) => sum + dir.fileCount, 0);
  node.added = node.files.reduce((sum, file) => sum + file.added, 0) + node.dirs.reduce((sum, dir) => sum + dir.added, 0);
  node.removed = node.files.reduce((sum, file) => sum + file.removed, 0) + node.dirs.reduce((sum, dir) => sum + dir.removed, 0);
}

function sortNode(node: DiffTreeDir): void {
  node.dirs.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.name.localeCompare(b.name));
  for (const dir of node.dirs) sortNode(dir);
}
