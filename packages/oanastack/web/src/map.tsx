import { useEffect, useRef, useState } from "react";
import { filesUnder } from "../../src/diff-tree";
import { FileTree } from "./file-tree";
import { mapHash } from "./route";

interface WorktreeRow {
  featureSlug: string;
  featureStatus: string;
  goal: string | null;
  repoName: string;
  repoPath: string;
  baseBranch: string;
  branch: string;
  worktreePath: string | null;
  prUrl: string | null;
  ahead: number | null;
  behind: number | null;
  added: number | null;
  removed: number | null;
  filesChanged: number | null;
  dirty: boolean;
  error: string | null;
}

interface DiffFile {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
}

interface DiffRow {
  kind: "context" | "add" | "del" | "change";
  leftNo: number | null;
  rightNo: number | null;
  left: string | null;
  right: string | null;
}

interface DiffSection {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
  truncated: boolean;
  rows: DiffRow[];
}

interface DiffPayload {
  base: string;
  head: string;
  dirty: boolean;
  files: DiffFile[];
  sections: DiffSection[];
  sectionsTruncated: boolean;
  file: string | null;
  binary: boolean;
  truncated: boolean;
  rows: DiffRow[];
  error: string | null;
}

interface RepoGroup {
  repoName: string;
  repoPath: string;
  bases: Array<{ baseBranch: string; nodes: WorktreeRow[] }>;
}

export function MapPage({
  project,
  feature,
  repo,
  refreshKey,
}: {
  project: string;
  feature?: string;
  repo?: string;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<WorktreeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const diffPane = useRef<HTMLElement>(null);
  const comparing = Boolean(feature && repo);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetch(`/api/projects/${encodeURIComponent(project)}/worktrees`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return (await response.json()) as { worktrees: WorktreeRow[] };
      })
      .then((body) => {
        if (!cancelled) setRows(body.worktrees);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "读取 worktree 失败");
      });
    return () => {
      cancelled = true;
    };
  }, [project, refreshKey]);

  useEffect(() => {
    if (!feature || !repo) {
      setDiff(null);
      setDiffError(null);
      return;
    }
    let cancelled = false;
    const query = new URLSearchParams({ feature, repo, all: "1" });
    void fetch(`/api/projects/${encodeURIComponent(project)}/diff?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return (await response.json()) as DiffPayload;
      })
      .then((body) => {
        if (!cancelled) {
          setDiff(body);
          setDiffError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setDiffError(err instanceof Error ? err.message : "读取 diff 失败");
      });
    return () => {
      cancelled = true;
    };
  }, [project, feature, repo, refreshKey]);

  useEffect(() => {
    setActiveDir(null);
    setActiveFile(null);
  }, [project, feature, repo, refreshKey]);

  useEffect(() => {
    if (!activeFile) return;
    document.getElementById(fileAnchor(activeFile))?.scrollIntoView({ block: "start" });
  }, [activeFile, activeDir, diff]);

  const groups = groupTree(rows ?? []);

  return (
    <main className={comparing ? "map-page comparing" : "map-page"}>
      <section className="pane" aria-label="worktree 图">
        <h2>worktree 图</h2>
        <p className="muted">repo → base branch → branch。距离在打开页面时用 git 现算，不写入数据库。</p>
        {error ? <p className="muted">{error}</p> : null}
        {rows && rows.length === 0 ? <p className="muted">这个项目还没有 worktree。</p> : null}
        {rows === null && !error ? <p className="muted">读取中</p> : null}
        <div className="tree">
          {groups.map((group) => (
            <section key={`${group.repoName}:${group.repoPath}`} className="tree-repo">
              <h3>{group.repoName}</h3>
              <p className="path">{group.repoPath}</p>
              {group.bases.map((base) => (
                <div key={base.baseBranch} className="tree-base">
                  <p className="tree-label">base branch <span className="mono">{base.baseBranch}</span></p>
                  {base.nodes.map((node) => {
                    const open = node.featureSlug === feature && node.repoName === repo;
                    return (
                      <div key={`${node.featureSlug}:${node.branch}`} className={open ? "tree-branch open" : "tree-branch"}>
                        <p className="tree-label">
                          branch <span className="mono">{node.branch}</span>
                          <span className="muted"> · {node.featureSlug}</span>
                        </p>
                        {node.worktreePath ? <p className="path">{node.worktreePath}</p> : <p className="muted">worktree 已移除，仍显示当时的 repo / base / branch。</p>}
                        {statLine(node) ? <p className="mono">{statLine(node)}</p> : null}
                        {node.dirty ? <p className="muted">工作区有未提交改动</p> : null}
                        {node.error ? <p className="muted">{node.error}</p> : null}
                        {node.prUrl ? <p><a href={node.prUrl}>PR</a></p> : null}
                        <p>
                          <a href={open ? mapHash(project) : mapHash(project, node.featureSlug, node.repoName)}>
                            {open ? "收起 diff" : "对比 base"}
                          </a>
                        </p>
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
      {comparing ? (
        <section className="pane" aria-label="目录">
          <h2>目录</h2>
          {diffError ? <p className="muted">{diffError}</p> : null}
          {diff?.error ? <p className="muted">{diff.error}</p> : null}
          {diff && diff.files.length === 0 && !diff.error ? <p className="muted">与 base 没有 diff。</p> : null}
          {diff && diff.files.length > 0 ? (
            <FileTree
              files={diff.files}
              activeDir={activeDir}
              activeFile={activeFile}
              onAll={() => {
                setActiveDir(null);
                setActiveFile(null);
                diffPane.current?.scrollTo({ top: 0 });
              }}
              onDir={(path) => {
                setActiveDir(path);
                setActiveFile(null);
                diffPane.current?.scrollTo({ top: 0 });
              }}
              onFile={(path) => {
                if (activeDir && path !== activeDir && !path.startsWith(`${activeDir}/`)) setActiveDir(null);
                setActiveFile(path);
              }}
            />
          ) : null}
        </section>
      ) : null}
      {comparing ? (
        <section className="pane diff-pane" aria-label="side-by-side diff" ref={diffPane}>
          <h2>左 base · 右 worktree</h2>
          {diff ? (
            <p className="muted">
              {diff.base} · {diff.head}
              {diff.dirty ? " · 工作区有未提交改动" : ""}
              {activeDir ? ` · 目录 ${activeDir}` : " · 全部"}
            </p>
          ) : (
            <p className="muted">读取 diff</p>
          )}
          {activeDir ? (
            <p><button type="button" className="text-btn" onClick={() => { setActiveDir(null); setActiveFile(null); }}>显示全部</button></p>
          ) : null}
          {diff?.sectionsTruncated ? <p className="muted">只显示前 40 个文件。</p> : null}
          <DiffSections diff={diff} dir={activeDir} />
        </section>
      ) : null}
    </main>
  );
}

function DiffSections({ diff, dir }: { diff: DiffPayload | null; dir: string | null }) {
  const sections = filesUnder(sectionsOf(diff), dir);
  if (!diff || diff.error || sections.length === 0) return null;
  return (
    <>
      {sections.map((section) => (
        <article key={section.path} id={fileAnchor(section.path)} className="diff-file">
          <h3>
            <span className="mono">{section.status}</span>
            <span>{section.path}</span>
            <span className="muted">+{section.added} −{section.removed}</span>
          </h3>
          {section.binary ? <p className="muted">二进制文件，无法左右对照。</p> : null}
          {section.truncated ? <p className="muted">diff 已截断，只显示前 400 行。</p> : null}
          <div className="diff-table">
            {section.rows.map((row, index) => (
              <div key={`${row.kind}-${row.leftNo ?? "x"}-${row.rightNo ?? "y"}-${index}`} className={`diff-row ${row.kind}`}>
                <div className="cell">
                  <span className="ln">{row.leftNo ?? ""}</span>
                  <span className="txt">{row.left ?? ""}</span>
                </div>
                <div className="cell">
                  <span className="ln">{row.rightNo ?? ""}</span>
                  <span className="txt">{row.right ?? ""}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </>
  );
}

function sectionsOf(diff: DiffPayload | null): DiffSection[] {
  if (!diff) return [];
  if (diff.sections.length > 0) return diff.sections;
  if (!diff.file) return [];
  return [{
    path: diff.file,
    status: "",
    added: 0,
    removed: 0,
    binary: diff.binary,
    truncated: diff.truncated,
    rows: diff.rows,
  }];
}

function fileAnchor(path: string): string {
  return `diff-file-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function groupTree(rows: WorktreeRow[]): RepoGroup[] {
  const repos = new Map<string, RepoGroup>();
  for (const row of rows) {
    const key = `${row.repoName}\0${row.repoPath}`;
    let group = repos.get(key);
    if (!group) {
      group = { repoName: row.repoName, repoPath: row.repoPath, bases: [] };
      repos.set(key, group);
    }
    let base = group.bases.find((item) => item.baseBranch === row.baseBranch);
    if (!base) {
      base = { baseBranch: row.baseBranch, nodes: [] };
      group.bases.push(base);
    }
    base.nodes.push(row);
  }
  return [...repos.values()];
}

function statLine(row: WorktreeRow): string | null {
  if (row.ahead === null || row.behind === null) return null;
  const added = row.added ?? 0;
  const removed = row.removed ?? 0;
  const files = row.filesChanged ?? 0;
  return `领先 ${row.ahead} commit · 落后 ${row.behind} commit · +${added} −${removed} · ${files} files`;
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
