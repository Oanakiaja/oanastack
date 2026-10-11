import { useEffect, useState, type FormEvent } from "react";

interface RepoInfo {
  id: number;
  name: string;
  path: string;
  testCommand: string | null;
  defaultBranch: string;
  branches: string[];
}

interface BrowseResult {
  path: string;
  parent: string | null;
  entries: Array<{ name: string; path: string }>;
  truncated: boolean;
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function ProjectForm({ onDone, onError }: { onDone: (slug: string) => void; onError: (message: string) => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name: name || undefined }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const created = (await response.json()) as { slug: string };
      setSlug("");
      setName("");
      onDone(created.slug);
    } catch (err) {
      onError(err instanceof Error ? err.message : "could not add project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={(event) => void submit(event)}>
      <h2 className="section-label">New project</h2>
      <label>
        Slug
        <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="billing-api" required />
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Billing API" />
      </label>
      <button className="chip" type="submit" disabled={busy}>Add project</button>
    </form>
  );
}

export function RepoForm({ onDone, onError }: { onDone: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);

  async function openBrowse(nextPath: string) {
    setBrowseError(null);
    const query = nextPath ? `?path=${encodeURIComponent(nextPath)}` : "";
    try {
      const response = await fetch(`/api/browse${query}`);
      if (!response.ok) throw new Error(await errorText(response));
      setBrowse((await response.json()) as BrowseResult);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : "could not list that directory");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, path: repoPath, testCommand: testCommand || undefined }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      setName("");
      setRepoPath("");
      setTestCommand("");
      setBrowse(null);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "could not register repo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={(event) => void submit(event)}>
      <h2 className="section-label">Register repo</h2>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="billing" required />
      </label>
      <label>
        Absolute path
        <span className="path-row">
          <input
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="/home/you/src/billing"
            required
          />
          <button className="chip" type="button" onClick={() => void openBrowse(repoPath)}>Browse</button>
        </span>
      </label>
      {browse ? (
        <div className="picker">
          <p className="mono picker-path">{browse.path}</p>
          <button className="chip" type="button" onClick={() => { setRepoPath(browse.path); setBrowse(null); }}>
            Use this directory
          </button>
          {browse.parent ? (
            <button type="button" onClick={() => void openBrowse(browse.parent ?? "")}>Up</button>
          ) : null}
          {browse.entries.map((entry) => (
            <button key={entry.path} type="button" onClick={() => void openBrowse(entry.path)}>
              {entry.name}
            </button>
          ))}
          {browse.truncated ? <p className="muted">Showing the first 200 directories.</p> : null}
        </div>
      ) : null}
      {browseError ? <p className="muted">{browseError}</p> : null}
      <label>
        Test command
        <input value={testCommand} onChange={(event) => setTestCommand(event.target.value)} placeholder="npm test" />
      </label>
      <button className="chip" type="submit" disabled={busy}>Register</button>
    </form>
  );
}

export function FeatureForm({
  project,
  onDone,
  onError,
}: {
  project: string;
  onDone: (slug: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [goal, setGoal] = useState("");
  const [catalog, setCatalog] = useState<RepoInfo[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [bases, setBases] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/repos")
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return (await response.json()) as RepoInfo[];
      })
      .then((repos) => {
        if (cancelled) return;
        setCatalog(repos);
        setBases((current) => {
          const next = { ...current };
          for (const repo of repos) {
            if (!next[repo.name]) next[repo.name] = repo.defaultBranch;
          }
          return next;
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : "could not load repos");
      });
    return () => {
      cancelled = true;
    };
  }, [open, onError]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const repos = catalog
      .filter((repo) => picked[repo.name])
      .map((repo) => ({ name: repo.name, base: bases[repo.name] || repo.defaultBranch }));
    if (repos.length === 0) {
      onError("Choose at least one repo and a base branch");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project)}/features`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, goal: goal || undefined, repos }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const created = (await response.json()) as { slug: string };
      setSlug("");
      setGoal("");
      setPicked({});
      onDone(created.slug);
    } catch (err) {
      onError(err instanceof Error ? err.message : "could not create feature");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="stack-form"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>New feature</summary>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Slug
          <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="charge-keys" required />
        </label>
        <label>
          Goal
          <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="One charge per checkout" />
        </label>
        {catalog.length === 0 ? <p className="muted">Register a repo before creating a feature.</p> : null}
        {catalog.map((repo) => (
          <div key={repo.id} className="repo-choice">
            <label className="check">
              <input
                type="checkbox"
                checked={picked[repo.name] === true}
                onChange={(event) => setPicked((current) => ({ ...current, [repo.name]: event.target.checked }))}
              />
              {repo.name}
            </label>
            <label>
              Base branch
              <input
                value={bases[repo.name] ?? repo.defaultBranch}
                list={`bases-${repo.id}`}
                onChange={(event) => setBases((current) => ({ ...current, [repo.name]: event.target.value }))}
              />
              <datalist id={`bases-${repo.id}`}>
                {repo.branches.map((branch) => (
                  <option key={branch} value={branch} />
                ))}
              </datalist>
            </label>
          </div>
        ))}
        <button className="chip" type="submit" disabled={busy || !project}>Create feature</button>
      </form>
    </details>
  );
}
