import { useState } from "react";
import { buildDiffTree, type DiffTreeDir, type DiffTreeFile } from "../../src/diff-tree";
import { FileIcon, FolderIcon } from "./file-icons";

export interface TreeFile {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
}

export function FileTree({
  files,
  activeDir,
  activeFile,
  onDir,
  onFile,
  onAll,
}: {
  files: TreeFile[];
  activeDir: string | null;
  activeFile: string | null;
  onDir: (path: string) => void;
  onFile: (path: string) => void;
  onAll: () => void;
}) {
  const tree = buildDiffTree(files);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="dir-tree">
      <button type="button" className={activeDir || activeFile ? "all-line" : "all-line selected"} onClick={onAll}>
        <span>全部</span>
        <span className="muted">{rollup(tree)}</span>
      </button>
      <DirBody
        dir={tree}
        collapsed={collapsed}
        activeDir={activeDir}
        activeFile={activeFile}
        onToggle={toggle}
        onDir={onDir}
        onFile={onFile}
      />
    </div>
  );
}

function DirBody({
  dir,
  collapsed,
  activeDir,
  activeFile,
  onToggle,
  onDir,
  onFile,
}: {
  dir: DiffTreeDir;
  collapsed: ReadonlySet<string>;
  activeDir: string | null;
  activeFile: string | null;
  onToggle: (path: string) => void;
  onDir: (path: string) => void;
  onFile: (path: string) => void;
}) {
  return (
    <>
      {dir.dirs.map((child) => {
        const open = !collapsed.has(child.path);
        return (
          <div key={child.path} className="dir-nest">
            <div className={activeDir === child.path ? "dir-line selected" : "dir-line"}>
              <button type="button" className="twist" aria-expanded={open} onClick={() => onToggle(child.path)}>
                {open ? "▾" : "▸"}
              </button>
              <button type="button" className="dir-hit" onClick={() => onDir(child.path)}>
                <FolderIcon open={open} />
                <span className="name">{child.name}</span>
                <span className="muted">{rollup(child)}</span>
              </button>
            </div>
            {open ? (
              <DirBody
                dir={child}
                collapsed={collapsed}
                activeDir={activeDir}
                activeFile={activeFile}
                onToggle={onToggle}
                onDir={onDir}
                onFile={onFile}
              />
            ) : null}
          </div>
        );
      })}
      {dir.files.map((file) => (
        <FileRow key={file.path} file={file} selected={activeFile === file.path} onFile={onFile} />
      ))}
    </>
  );
}

function FileRow({ file, selected, onFile }: { file: DiffTreeFile; selected: boolean; onFile: (path: string) => void }) {
  return (
    <button type="button" className={selected ? "file-line selected" : "file-line"} onClick={() => onFile(file.path)}>
      <span className="mono letter">{file.status}</span>
      <FileIcon name={file.name} />
      <span className="name">{file.name}</span>
      <span className="muted">+{file.added} −{file.removed}</span>
    </button>
  );
}

function rollup(dir: DiffTreeDir): string {
  const files = dir.fileCount === 1 ? "1 file" : `${dir.fileCount} files`;
  return `${files} · +${dir.added} −${dir.removed}`;
}
