import { useEffect, useRef, useState } from "react";
import { filesUnder } from "../../src/diff-tree";
import { highlightCode } from "./code-highlight";
import { DragBar } from "./drag-bar";
import { FileIcon } from "./file-icons";
import { languageOf } from "./file-kind";
import { FileTree } from "./file-tree";
import { DIFF_LEFT, TREE_WIDTH, useDiffView, useStoredNumber } from "./layout-pref";
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
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullSection, setFullSection] = useState<DiffSection | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useDiffView();
  const [treeWidth, setTreeWidth] = useStoredNumber(TREE_WIDTH);
  const [diffLeft, setDiffLeft] = useStoredNumber(DIFF_LEFT);
  const pane = useRef<HTMLElement>(null);
  const scope = targetId === undefined ? "base" : `t${targetId}`;

  useEffect(() => {
    let cancelled = false;
    setActiveDir(null);
    setActiveFile(null);
    setFullSection(null);
    const query = new URLSearchParams({ feature, repo, all: "1" });
    if (targetId !== undefined) query.set("target", String(targetId));
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
  }, [project, feature, repo, refreshKey, targetId]);

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
  }, [mode, activeFile, project, feature, repo, refreshKey, targetId]);

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

  return (
    <div
      className={compact ? "detail-diff target-diff" : "detail-diff"}
      style={{ ["--tree-width" as string]: `${treeWidth}px` }}
    >
      <section className="pane" aria-label="目录">
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
      <DragBar
        label="目录宽度"
        value={treeWidth}
        min={TREE_WIDTH.min}
        max={TREE_WIDTH.max}
        unit="px"
        onChange={setTreeWidth}
      />
      <section
        className={mode === "full" ? "pane diff-pane full-file" : "pane diff-pane"}
        aria-label="side-by-side diff"
        ref={pane}
        style={{ ["--diff-left" as string]: `${diffLeft}%` }}
      >
        <h2>{heading}</h2>
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

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
