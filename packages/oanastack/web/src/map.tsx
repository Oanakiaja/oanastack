import { useEffect, useState } from "react";
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

interface DiffPayload {
  base: string;
  head: string;
  dirty: boolean;
  files: DiffFile[];
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
  const [picked, setPicked] = useState<{ key: string; path?: string }>({ key: "" });
  const routeKey = `${project}/${feature ?? ""}/${repo ?? ""}/${refreshKey}`;
  const file = picked.key === routeKey ? picked.path : undefined;
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
    const query = new URLSearchParams({ feature, repo });
    if (file) query.set("file", file);
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
  }, [project, feature, repo, file, refreshKey]);

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
        <section className="pane" aria-label="文件">
          <h2>文件</h2>
          {diffError ? <p className="muted">{diffError}</p> : null}
          {diff?.error ? <p className="muted">{diff.error}</p> : null}
          {diff && diff.files.length === 0 && !diff.error ? <p className="muted">与 base 没有 diff。</p> : null}
          <ul className="file-list">
            {diff?.files.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  className={diff.file === item.path ? "selected" : ""}
                  onClick={() => setPicked({ key: routeKey, path: item.path })}
                >
                  <span className="mono">{item.status}</span>
                  <span>{item.path}</span>
                  <span className="muted">+{item.added} −{item.removed}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {comparing ? (
        <section className="pane diff-pane" aria-label="side-by-side diff">
          <h2>左 base · 右 worktree</h2>
          {diff ? (
            <p className="muted">
              {diff.base} · {diff.head}
              {diff.dirty ? " · 工作区有未提交改动" : ""}
              {diff.file ? ` · ${diff.file}` : ""}
            </p>
          ) : (
            <p className="muted">读取 diff</p>
          )}
          {diff?.binary ? <p className="muted">二进制文件，无法左右对照。</p> : null}
          {diff?.truncated ? <p className="muted">diff 已截断，只显示前 400 行。</p> : null}
          <div className="diff-table">
            {diff?.rows.map((row, index) => (
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
        </section>
      ) : null}
    </main>
  );
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
