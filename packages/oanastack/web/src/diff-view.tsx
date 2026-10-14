import { useEffect, useRef, useState } from "react";
import { filesUnder } from "../../src/diff-tree";
import { highlightCode } from "./code-highlight";
import { FileIcon } from "./file-icons";
import { languageOf } from "./file-kind";
import { FileTree } from "./file-tree";

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
}: {
  project: string;
  feature: string;
  repo: string;
  refreshKey: number;
}) {
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const pane = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setActiveDir(null);
    setActiveFile(null);
    const query = new URLSearchParams({ feature, repo, all: "1" });
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
  }, [project, feature, repo, refreshKey]);

  useEffect(() => {
    if (!activeFile) return;
    document.getElementById(fileAnchor(activeFile))?.scrollIntoView({ block: "start" });
  }, [activeFile, activeDir, diff]);

  return (
    <div className="detail-diff">
      <section className="pane" aria-label="目录">
        <h2>目录</h2>
        {error ? <p className="muted">{error}</p> : null}
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
              pane.current?.scrollTo({ top: 0 });
            }}
            onDir={(path) => {
              setActiveDir(path);
              setActiveFile(null);
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
      <section className="pane diff-pane" aria-label="side-by-side diff" ref={pane}>
        <h2>左 base · 右 worktree</h2>
        {diff ? (
          <p className="muted">
            {diff.base} · {diff.head}
            {diff.dirty ? " · 工作区有未提交改动" : ""}
            {activeDir ? ` · 目录 ${activeDir}` : " · 全部"}
          </p>
        ) : null}
        {activeDir ? (
          <p>
            <button type="button" className="text-btn" onClick={() => { setActiveDir(null); setActiveFile(null); }}>
              显示全部
            </button>
          </p>
        ) : null}
        {diff?.sectionsTruncated ? <p className="muted">只显示前 40 个文件。</p> : null}
        <DiffSections diff={diff} dir={activeDir} />
      </section>
    </div>
  );
}

function DiffSections({ diff, dir }: { diff: DiffPayload | null; dir: string | null }) {
  const sections = filesUnder(sectionsOf(diff), dir);
  if (!diff || diff.error || sections.length === 0) return null;
  return (
    <>
      {sections.map((section) => {
        const language = languageOf(section.path);
        const name = section.path.split("/").pop() ?? section.path;
        return (
          <article key={section.path} id={fileAnchor(section.path)} className="diff-file">
            <h3>
              <span className="mono">{section.status}</span>
              <FileIcon name={name} />
              <span>{section.path}</span>
              <span className="muted">+{section.added} −{section.removed}</span>
            </h3>
            {section.binary ? <p className="muted">二进制文件，无法左右对照。</p> : null}
            {section.truncated ? <p className="muted">diff 已截断，只显示前 400 行。</p> : null}
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

function fileAnchor(path: string): string {
  return `diff-file-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
