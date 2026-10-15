import { useState } from "react";
import { buildDiffTree, type DiffTreeDir, type DiffTreeFile } from "../../src/diff-tree";
import { FileIcon, FolderIcon } from "./file-icons";
import { statusMark, statusTone } from "./status-mark";

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
  onFile,
  onAll,
}: {
  files: TreeFile[];
  activeDir: string | null;
  activeFile: string | null;
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

  function collapseAll() {
    setCollapsed(new Set(dirPaths(tree)));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  return (
    <div className="dir-tree">
      <div className="dir-head">
        <h2>目录</h2>
        <span className="dir-fold">
          <button type="button" className="text-btn" onClick={collapseAll}>统一折叠</button>
          <button type="button" className="text-btn" onClick={expandAll}>全部展开</button>
        </span>
      </div>
      <button type="button" className={activeDir || activeFile ? "all-line" : "all-line selected"} onClick={onAll}>
        <span>全部</span>
        <Counts added={tree.added} removed={tree.removed} files={fileLabel(tree.fileCount)} />
      </button>
      <DirBody
        dir={tree}
        collapsed={collapsed}
        activeDir={activeDir}
        activeFile={activeFile}
        onToggle={toggle}
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
  onFile,
}: {
  dir: DiffTreeDir;
  collapsed: ReadonlySet<string>;
  activeDir: string | null;
  activeFile: string | null;
  onToggle: (path: string) => void;
  onFile: (path: string) => void;
}) {
  return (
    <>
      {dir.dirs.map((child) => {
        const open = !collapsed.has(child.path);
        return (
          <div key={child.path} className="dir-nest">
            <button
              type="button"
              className={activeDir === child.path ? "dir-line selected" : "dir-line"}
              aria-expanded={open}
              onClick={() => onToggle(child.path)}
            >
              <span className="twist">{open ? "▾" : "▸"}</span>
              <FolderIcon open={open} />
              <span className="name">{child.name}</span>
              <Counts added={child.added} removed={child.removed} files={fileLabel(child.fileCount)} />
            </button>
            {open ? (
              <DirBody
                dir={child}
                collapsed={collapsed}
                activeDir={activeDir}
                activeFile={activeFile}
                onToggle={onToggle}
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
      <span className={`mono letter tone-${statusTone(file.status)}`}>{statusMark(file.status)}</span>
      <FileIcon name={file.name} />
      <span className="name">{file.name}</span>
      <Counts added={file.added} removed={file.removed} />
    </button>
  );
}

function Counts({ added, removed, files }: { added: number; removed: number; files?: string }) {
  return (
    <span className="counts">
      {files ? <span className="muted">{files}</span> : null}
      <span className="stat-add">+{added}</span>
      <span className="stat-del">−{removed}</span>
    </span>
  );
}

function fileLabel(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function dirPaths(dir: DiffTreeDir): string[] {
  const paths: string[] = [];
  for (const child of dir.dirs) {
    paths.push(child.path);
    paths.push(...dirPaths(child));
  }
  return paths;
}
