import { useCallback, useEffect, useState } from "react";
import type { Completion, Overview, Progress, Target, TargetStatus } from "../../src/types.ts";

interface Selection {
  project?: string;
  target?: number;
  completion?: number;
}

export function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(() => readHash());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/overview");
      if (!response.ok) throw new Error(`overview HTTP ${response.status}`);
      const data = (await response.json()) as Overview;
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onHash = () => setSelection(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const project =
    overview?.projects.find((item) => item.slug === selection.project) ?? overview?.projects[0];
  const target = project?.targets.find((item) => item.id === selection.target);
  const completion = target?.completions.find((item) => item.id === selection.completion);

  function choose(next: Selection) {
    setSelection(next);
    const hash = toHash(next);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash || window.location.pathname + window.location.search);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <p className="eyebrow">local review</p>
          <h1>oanastack progress</h1>
        </div>
        <div className="summary">
          <p className="headline">{headline(overview)}</p>
          <Bar progress={overview?.progress} />
          <ul className="legend">
            <li><i className="swatch success" /> succeeded</li>
            <li><i className="swatch failed" /> failed</li>
            <li><i className="swatch rejected" /> rejected</li>
            <li><i className="swatch open" /> open</li>
          </ul>
        </div>
        <div className="top-meta">
          <button type="button" onClick={() => void load()}>Refresh</button>
          <p>{overview ? overview.dbPath : "loading database"}</p>
        </div>
      </header>
      {error ? <p className="banner" role="status">{error}</p> : null}
      <main className="workspace">
        <section className="pane" aria-label="Projects">
          <h2>Projects</h2>
          {overview && overview.projects.length === 0 ? (
            <Empty />
          ) : (
            <ul className="project-list">
              {overview?.projects.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.slug === project?.slug ? "selected" : ""}
                    aria-current={item.slug === project?.slug ? "true" : undefined}
                    onClick={() => choose({ project: item.slug })}
                  >
                    <span className="project-name">{item.name}</span>
                    <span className="project-slug">{item.slug}</span>
                    <span className="fraction">{fraction(item.progress)}</span>
                    {item.note ? <span className="note">{item.note}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="pane" aria-label="Targets">
          <h2>{project ? project.name : "Targets"}</h2>
          {project && project.targets.length === 0 ? (
            <p className="muted">No targets yet. Agents add one with <code>oanastack target add</code>.</p>
          ) : (
            <ul className="target-list">
              {project?.targets.map((item) => (
                <li key={item.id}>
                  <article className={item.id === target?.id ? "target selected" : "target"}>
                    <button
                      type="button"
                      className="target-hit"
                      onClick={() =>
                        choose({
                          project: project?.slug,
                          target: item.id,
                          completion: item.completions[0]?.id,
                        })
                      }
                    >
                      <span className="target-top">
                        <span className="mono">#{item.id}</span>
                        <Status status={item.status} />
                      </span>
                      <span className="target-title">{item.title}</span>
                      {item.summary ? <span className="target-summary">{item.summary}</span> : null}
                      <Meta target={item} />
                    </button>
                    {item.completions.length > 0 ? (
                      <ul className="completion-list">
                        {item.completions.map((record) => (
                          <li key={record.id}>
                            <button
                              type="button"
                              className={record.id === completion?.id && item.id === target?.id ? "selected" : ""}
                              onClick={() =>
                                choose({ project: project?.slug, target: item.id, completion: record.id })
                              }
                            >
                              Review #{record.id}
                              <span>{formatTime(record.createdAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-review">No completion record</p>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="pane review" aria-label="Completion record">
          <h2>Review</h2>
          {completion && target ? (
            <Review target={target} completion={completion} />
          ) : target ? (
            <TargetOnly target={target} />
          ) : (
            <p className="muted">Select a completion record to see what changed, how it was verified, and what to check.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function Review({ target, completion }: { target: Target; completion: Completion }) {
  return (
    <article className="sheet">
      <header className="sheet-head">
        <p className="mono">review #{completion.id} · target #{target.id}</p>
        <h3>{target.title}</h3>
        <p className="muted">{formatTime(completion.createdAt)}</p>
        <Status status={target.status} />
      </header>
      <Section index="01" title="What changed" text={completion.changed} />
      <Section index="02" title="Why" text={completion.why} />
      <Section index="03" title="Verified" text={completion.verified} />
      <Section index="04" title="Risks / unfinished" text={completion.risks} />
      <Section index="05" title="What to check" text={completion.review} />
      <aside className="context">
        <h3>Context</h3>
        <dl>
          <div><dt>Worktree</dt><dd>{target.worktreePath ?? "Not recorded"}</dd></div>
          <div><dt>Branch</dt><dd>{target.branch ?? "Not recorded"}</dd></div>
          <div><dt>herdr status</dt><dd>{target.herdrStatus ?? "Not recorded"}</dd></div>
          <div><dt>herdr result</dt><dd>{target.herdrResult ?? "Not recorded"}</dd></div>
        </dl>
        {target.summary ? <p className="target-summary">{target.summary}</p> : null}
      </aside>
    </article>
  );
}

function TargetOnly({ target }: { target: Target }) {
  return (
    <article className="sheet">
      <header className="sheet-head">
        <p className="mono">target #{target.id}</p>
        <h3>{target.title}</h3>
        <Status status={target.status} />
      </header>
      <p className="muted">No completion record yet. The outcome can still be reviewed from the target itself.</p>
      {target.summary ? <Section index="—" title="Result summary" text={target.summary} /> : null}
      <aside className="context">
        <h3>Context</h3>
        <dl>
          <div><dt>Worktree</dt><dd>{target.worktreePath ?? "Not recorded"}</dd></div>
          <div><dt>Branch</dt><dd>{target.branch ?? "Not recorded"}</dd></div>
          <div><dt>herdr status</dt><dd>{target.herdrStatus ?? "Not recorded"}</dd></div>
          <div><dt>herdr result</dt><dd>{target.herdrResult ?? "Not recorded"}</dd></div>
        </dl>
      </aside>
    </article>
  );
}

function Section({ index, title, text }: { index: string; title: string; text: string | null }) {
  return (
    <section className="sheet-section">
      <h3><span>{index}</span>{title}</h3>
      {text ? <TextBlock text={text} /> : <p className="muted">None recorded</p>}
    </section>
  );
}

function TextBlock({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <p className="prose">
      {parts.map((part, index) =>
        part.startsWith("http://") || part.startsWith("https://") ? (
          <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={`${index}-${part.slice(0, 12)}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function Meta({ target }: { target: Target }) {
  if (!target.worktreePath && !target.branch && !target.herdrStatus) return null;
  return (
    <span className="meta">
      {target.branch ? <span>{target.branch}</span> : null}
      {target.worktreePath ? <span>{target.worktreePath}</span> : null}
      {target.herdrStatus ? <span>herdr {target.herdrStatus}</span> : null}
    </span>
  );
}

function Status({ status }: { status: TargetStatus }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function Bar({ progress }: { progress: Progress | undefined }) {
  if (!progress || progress.total === 0) return <div className="bar" aria-hidden="true" />;
  const width = (count: number) => `${(count / progress.total) * 100}%`;
  return (
    <div
      className="bar"
      role="img"
      aria-label={`${progress.success} succeeded, ${progress.failed} failed, ${progress.rejected} rejected, ${progress.open} open`}
    >
      <span className="seg success" style={{ width: width(progress.success) }} />
      <span className="seg failed" style={{ width: width(progress.failed) }} />
      <span className="seg rejected" style={{ width: width(progress.rejected) }} />
      <span className="seg open" style={{ width: width(progress.open) }} />
    </div>
  );
}

function Empty() {
  return (
    <div className="empty">
      <p>No projects yet.</p>
      <p className="muted">Agents log work with the CLI. The page refreshes on its own.</p>
      <pre>{`oanastack project add <slug> --json
oanastack target add <slug> "<title>" --json
oanastack target result <id> success --summary "…" --json
oanastack done <id> --changed "…" --why "…" --verified "…" --json`}</pre>
    </div>
  );
}

function headline(overview: Overview | null): string {
  if (!overview) return "Loading records";
  const { progress } = overview;
  if (progress.total === 0) return "Nothing recorded yet";
  return `${progress.success} of ${progress.total} targets succeeded`;
}

function fraction(progress: Progress): string {
  if (progress.total === 0) return "0 targets";
  return `${progress.success}/${progress.total}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm} UTC`;
}

function readHash(): Selection {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const project = parts[0];
  const target = parts[1] ? Number(parts[1]) : undefined;
  const completion = parts[2] ? Number(parts[2]) : undefined;
  return {
    project,
    target: Number.isInteger(target) ? target : undefined,
    completion: Number.isInteger(completion) ? completion : undefined,
  };
}

function toHash(selection: Selection): string {
  if (!selection.project) return "";
  const parts = [selection.project];
  if (selection.target !== undefined) parts.push(String(selection.target));
  if (selection.completion !== undefined) parts.push(String(selection.completion));
  return `#/${parts.join("/")}`;
}
