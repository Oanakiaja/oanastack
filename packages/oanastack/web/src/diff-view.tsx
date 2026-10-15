import { useEffect, useRef, useState, type ReactNode } from "react";
import { filesUnder } from "../../src/diff-tree";
import { highlightCode } from "./code-highlight";
import { DragBar } from "./drag-bar";
import { FileIcon } from "./file-icons";
import { languageOf } from "./file-kind";
import { FileTree } from "./file-tree";
import { DIFF_LEFT, MID_WIDTH, TREE_WIDTH, useDiffView, useStoredNumber } from "./layout-pref";
import { statusMark } from "./status-mark";

interface DiffRow {
  kind: "context" | "add" | "del" | "change";
  leftNo: number | null;
  rightNo: number | null;
  left: string | null;
  right: string | null;
}

interface DiffFile {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
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

interface CommitOption {
  sha: string;
  short: string;
  subject: string;
}

interface RefPayload {
  branches: string[];
  head: string | null;
  commits: CommitOption[];
}

interface DiffModelProps {
  project: string;
  feature: string;
  repo: string;
  refreshKey: number;
  targetId?: number;
  heading?: string;
  emptyText?: string;
  pickRefs?: boolean;
  baseBranch?: string;
  branch?: string;
}

const SHA = /^[0-9a-f]{7,64}$/i;

export function DiffPanel({
  project,
  feature,
  repo,
  refreshKey,
  targetId,
  heading = "左 base · 右 worktree",
  emptyText = "与 base 没有 diff。",
  compact = false,
}: {
  project: string;
  feature: string;
  repo: string;
  refreshKey: number;
  targetId?: number;
  heading?: string;
  emptyText?: string;
  compact?: boolean;
}) {
  const [treeWidth, setTreeWidth] = useStoredNumber(TREE_WIDTH);
  const model = useDiffModel({ project, feature, repo, refreshKey, targetId, heading, emptyText });
  return (
    <div
      className={compact ? "detail-diff target-diff" : "detail-diff"}
      style={{ ["--tree-width" as string]: `${treeWidth}px` }}
    >
      {model.tree}
      <DragBar
        label="目录宽度"
        value={treeWidth}
        min={TREE_WIDTH.min}
        max={TREE_WIDTH.max}
        unit="px"
        onChange={setTreeWidth}
      />
      {model.viewer}
    </div>
  );
}

/** Worktree page: meta, file tree, and diff are separate full-height columns. */
export function DiffColumns({
  meta,
  midWidth,
  onMidWidth,
  treeWidth,
  onTreeWidth,
  ...props
}: DiffModelProps & {
  baseBranch: string;
  branch: string;
  meta: ReactNode;
  midWidth: number;
  onMidWidth: (next: number) => void;
  treeWidth: number;
  onTreeWidth: (next: number) => void;
}) {
  const model = useDiffModel({ ...props, pickRefs: true });
  return (
    <>
      <section className="meta-col" aria-label="worktree">
        {meta}
      </section>
      <DragBar
        className="drag-bar split-mid"
        label="信息栏宽度"
        value={midWidth}
        min={MID_WIDTH.min}
        max={MID_WIDTH.max}
        unit="px"
        onChange={onMidWidth}
      />
      {model.tree}
      <DragBar
        className="drag-bar split-tree"
        label="目录栏宽度"
        value={treeWidth}
        min={TREE_WIDTH.min}
        max={TREE_WIDTH.max}
        unit="px"
        onChange={onTreeWidth}
      />
      <section className="diff-col" aria-label="diff">
        {model.viewer}
      </section>
    </>
  );
}

function useDiffModel({
  project,
  feature,
  repo,
  refreshKey,
  targetId,
  heading = "左 base · 右 worktree",
  emptyText = "与 base 没有 diff。",
  pickRefs = false,
  baseBranch = "",
  branch = "",
}: DiffModelProps): { tree: ReactNode; viewer: ReactNode } {
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullSection, setFullSection] = useState<DiffSection | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useDiffView();
  const [diffLeft, setDiffLeft] = useStoredNumber(DIFF_LEFT);
  const [refs, setRefs] = useState<RefPayload | null>(null);
  const [leftBranch, setLeftBranch] = useState(baseBranch);
  const [rightBranch, setRightBranch] = useState(branch);
  const [leftCommit, setLeftCommit] = useState("");
  const [rightCommit, setRightCommit] = useState("WORKTREE");
  const [leftSha, setLeftSha] = useState("");
  const [rightSha, setRightSha] = useState("");
  const pane = useRef<HTMLElement>(null);
  const scope = targetId === undefined ? "base" : `t${targetId}`;
  const leftRef = pickRefs ? sideRef(leftBranch, leftCommit, leftSha) : "";
  const rightRef = pickRefs ? sideRef(rightBranch, rightCommit, rightSha) : "";

  useEffect(() => {
    setActiveDir(null);
    setActiveFile(null);
    setFullSection(null);
  }, [project, feature, repo, targetId]);

  useEffect(() => {
    if (!pickRefs) return;
    setLeftBranch(baseBranch);
    setRightBranch(branch);
    setLeftCommit("");
    setRightCommit("WORKTREE");
    setLeftSha("");
    setRightSha("");
  }, [pickRefs, project, feature, repo, baseBranch, branch]);

  useEffect(() => {
    if (!pickRefs) return;
    let cancelled = false;
    const query = new URLSearchParams({ feature, repo });
    void fetch(`/api/projects/${encodeURIComponent(project)}/refs?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return (await response.json()) as RefPayload;
      })
      .then((body) => {
        if (!cancelled) setRefs(body);
      })
      .catch(() => {
        if (!cancelled) setRefs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pickRefs, project, feature, repo, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ feature, repo, all: "1" });
    if (targetId !== undefined) query.set("target", String(targetId));
    applyRefs(query, pickRefs, leftRef, rightRef);
    void fetch(`/api/projects/${encodeURIComponent(project)}/diff?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return (await response.json()) as DiffPayload;
      })
      .then((body) => {
        if (!cancelled) {
          setDiff(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "读取 diff 失败");
      });
    return () => {
      cancelled = true;
    };
  }, [project, feature, repo, refreshKey, targetId, pickRefs, leftRef, rightRef]);

  useEffect(() => {
    if (mode !== "full" || !diff) return;
    const pool = activeDir ? filesUnder(diff.files, activeDir) : diff.files;
    if (activeFile && pool.some((file) => file.path === activeFile)) return;
    const next = pool.find((file) => !file.binary) ?? pool[0];
    setActiveFile(next?.path ?? null);
  }, [mode, diff, activeDir, activeFile]);

  useEffect(() => {
    if (mode !== "full" || !activeFile) {
      setFullSection(null);
      setFullError(null);
      return;
    }
    let cancelled = false;
    setFullError(null);
    const query = new URLSearchParams({ feature, repo, file: activeFile, full: "1" });
    if (targetId !== undefined) query.set("target", String(targetId));
    applyRefs(query, pickRefs, leftRef, rightRef);
    void fetch(`/api/projects/${encodeURIComponent(project)}/diff?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return (await response.json()) as DiffPayload;
      })
      .then((body) => {
        if (cancelled) return;
        const section = body.sections.find((item) => item.path === activeFile) ?? sectionsOf(body)[0] ?? null;
        setFullSection(section);
        setFullError(body.error);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFullError(err instanceof Error ? err.message : "读取完整 diff 失败");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, activeFile, project, feature, repo, refreshKey, targetId, pickRefs, leftRef, rightRef]);

  useEffect(() => {
    if (mode !== "scroll" || !activeFile) return;
    document.getElementById(fileAnchor(activeFile, scope))?.scrollIntoView({ block: "start" });
  }, [mode, activeFile, activeDir, diff, scope]);

  useEffect(() => {
    if (mode !== "full") return;
    pane.current?.scrollTo({ top: 0 });
  }, [mode, activeFile, fullSection]);

  const scrollSections = filesUnder(sectionsOf(diff), activeDir);
  const shown = mode === "full" ? (fullSection ? [fullSection] : []) : scrollSections;
  const branches = branchChoices(refs?.branches, baseBranch, branch, leftBranch, rightBranch);

  const tree = (
    <section className="pane tree-col" aria-label="目录">
      <h2>目录</h2>
      {error ? <p className="muted">{error}</p> : null}
      {diff?.error ? <p className="muted">{diff.error}</p> : null}
      {diff && diff.files.length === 0 && !diff.error ? <p className="muted">{emptyText}</p> : null}
      {diff && diff.files.length > 0 ? (
        <FileTree
          files={diff.files}
          activeDir={activeDir}
          activeFile={activeFile}
          onAll={() => {
            setActiveDir(null);
            if (mode === "scroll") setActiveFile(null);
            pane.current?.scrollTo({ top: 0 });
          }}
          onDir={(path) => {
            setActiveDir(path);
            if (mode === "scroll") setActiveFile(null);
            pane.current?.scrollTo({ top: 0 });
          }}
          onFile={(path) => {
            if (activeDir && path !== activeDir && !path.startsWith(`${activeDir}/`)) setActiveDir(null);
            setActiveFile(path);
          }}
        />
      ) : null}
      {diff === null && !error ? <p className="muted">读取 diff</p> : null}
    </section>
  );

  const viewer = (
    <>
      <section
        className={mode === "full" ? "pane diff-pane full-file" : "pane diff-pane"}
        aria-label="side-by-side diff"
        ref={pane}
        style={{ ["--diff-left" as string]: `${diffLeft}%` }}
      >
        {pickRefs ? (
          <div className="ref-picks">
            <RefPick
              side="左"
              branch={leftBranch}
              commit={leftCommit}
              sha={leftSha}
              branches={branches}
              commits={refs?.commits ?? []}
              onBranch={(value) => {
                setLeftBranch(value);
                setLeftCommit("");
                setLeftSha("");
              }}
              onCommit={(value) => {
                setLeftCommit(value);
                setLeftSha("");
              }}
              onSha={setLeftSha}
            />
            <RefPick
              side="右"
              branch={rightBranch}
              commit={rightCommit}
              sha={rightSha}
              branches={branches}
              commits={refs?.commits ?? []}
              worktree
              onBranch={(value) => {
                setRightBranch(value);
                setRightCommit("");
                setRightSha("");
              }}
              onCommit={(value) => {
                setRightCommit(value);
                setRightSha("");
              }}
              onSha={setRightSha}
            />
          </div>
        ) : (
          <h2>{heading}</h2>
        )}
        {diff ? (
          <p className="muted">
            {diff.base} · {diff.head}
            {diff.dirty ? " · 工作区有未提交改动" : ""}
            {mode === "full" && activeFile ? ` · ${activeFile}` : activeDir ? ` · 目录 ${activeDir}` : " · 全部"}
          </p>
        ) : null}
        {mode === "scroll" && activeDir ? (
          <p>
            <button type="button" className="text-btn" onClick={() => { setActiveDir(null); setActiveFile(null); }}>
              显示全部
            </button>
          </p>
        ) : null}
        {mode === "scroll" && diff?.sectionsTruncated ? <p className="muted">只显示前 40 个文件。</p> : null}
        {mode === "full" && fullError ? <p className="muted">{fullError}</p> : null}
        {mode === "full" && activeFile && !fullSection && !fullError ? <p className="muted">读取完整 diff</p> : null}
        {mode === "full" && !activeFile && diff && diff.files.length > 0 ? <p className="muted">选择一个文件，查看完整 diff。</p> : null}
        <div className="diff-stage">
          {shown.length > 0 ? (
            <DragBar
              className="diff-col-bar"
              label="左右列宽"
              value={diffLeft}
              min={DIFF_LEFT.min}
              max={DIFF_LEFT.max}
              unit="percent"
              onChange={setDiffLeft}
              style={{ left: `${diffLeft}%` }}
            />
          ) : null}
          <DiffSections sections={shown} scope={scope} mode={mode} />
        </div>
      </section>
      <aside className="view-rail" aria-label="diff 查看方式">
        <button type="button" className={mode === "full" ? "on" : ""} aria-pressed={mode === "full"} title="点文件，看这个文件的完整 diff" onClick={() => setMode("full")}>全量</button>
        <button type="button" className={mode === "scroll" ? "on" : ""} aria-pressed={mode === "scroll"} title="在右侧连续滚动所有文件" onClick={() => setMode("scroll")}>滚动</button>
      </aside>
    </>
  );

  return { tree, viewer };
}

function RefPick({
  side,
  branch,
  commit,
  sha,
  branches,
  commits,
  worktree = false,
  onBranch,
  onCommit,
  onSha,
}: {
  side: "左" | "右";
  branch: string;
  commit: string;
  sha: string;
  branches: string[];
  commits: CommitOption[];
  worktree?: boolean;
  onBranch: (value: string) => void;
  onCommit: (value: string) => void;
  onSha: (value: string) => void;
}) {
  return (
    <div className="ref-pick">
      <span className="ref-side">{side}</span>
      <span className="muted">branch</span>
      <select aria-label={`${side} branch`} value={branch} onChange={(event) => onBranch(event.target.value)}>
        {branches.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <span className="muted">commit</span>
      <select aria-label={`${side} commit`} value={commit} onChange={(event) => onCommit(event.target.value)}>
        {worktree ? <option value="WORKTREE">工作区</option> : null}
        <option value="">分支顶端</option>
        {commits.map((item) => (
          <option key={item.sha} value={item.sha}>{commitLabel(item)}</option>
        ))}
      </select>
      <input
        aria-label={`${side} SHA`}
        placeholder="commit"
        spellCheck={false}
        value={sha}
        onChange={(event) => onSha(event.target.value.trim())}
      />
    </div>
  );
}

function DiffSections({
  sections,
  scope,
  mode,
}: {
  sections: DiffSection[];
  scope: string;
  mode: "scroll" | "full";
}) {
  if (sections.length === 0) return null;
  return (
    <>
      {sections.map((section) => {
        const language = languageOf(section.path);
        const name = section.path.split("/").pop() ?? section.path;
        return (
          <article key={section.path} id={fileAnchor(section.path, scope)} className="diff-file">
            <h3>
              <span className="mono">{statusMark(section.status)}</span>
              <FileIcon name={name} />
              <span>{section.path}</span>
              <span className="muted">+{section.added} −{section.removed}</span>
            </h3>
            {section.binary ? <p className="muted">二进制文件，无法左右对照。</p> : null}
            {section.truncated ? <p className="muted">diff 已截断，只显示前 400 行。用右侧「全量」看完整文件。</p> : null}
            {mode === "full" && !section.binary && section.rows.length === 0 ? <p className="muted">这个文件没有 diff。</p> : null}
            <div className="diff-table">
              {section.rows.map((row, index) => (
                <div key={`${row.kind}-${row.leftNo ?? "x"}-${row.rightNo ?? "y"}-${index}`} className={`diff-row ${row.kind}`}>
                  <CodeCell lineNo={row.leftNo} text={row.left} language={language} />
                  <CodeCell lineNo={row.rightNo} text={row.right} language={language} />
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </>
  );
}

function CodeCell({
  lineNo,
  text,
  language,
}: {
  lineNo: number | null;
  text: string | null;
  language: string | null;
}) {
  return (
    <div className="cell">
      <span className="ln">{lineNo ?? ""}</span>
      <span className="txt" dangerouslySetInnerHTML={{ __html: highlightCode(text ?? "", language) }} />
    </div>
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

function fileAnchor(path: string, scope: string): string {
  return `diff-file-${scope}-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function sideRef(branch: string, commit: string, sha: string): string {
  if (SHA.test(sha)) return sha;
  if (commit) return commit;
  return branch;
}

function applyRefs(query: URLSearchParams, pickRefs: boolean, left: string, right: string): void {
  if (!pickRefs) return;
  if (left) query.set("left", left);
  if (right) query.set("right", right);
}

function branchChoices(loaded: string[] | undefined, ...extra: string[]): string[] {
  const names = new Set(loaded ?? []);
  for (const name of extra) {
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function commitLabel(commit: CommitOption): string {
  const subject = commit.subject.length > 48 ? `${commit.subject.slice(0, 48)}…` : commit.subject;
  return `${commit.short} ${subject}`;
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
