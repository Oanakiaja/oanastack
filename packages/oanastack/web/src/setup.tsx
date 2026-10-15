import { useEffect, useState, type FormEvent } from "react";

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

export function RepoForm({ onDone, onError }: { onDone: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [baseNote, setBaseNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath.startsWith("/")) {
      setBaseBranch(null);
      setBaseNote(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/repo-base?path=${encodeURIComponent(repoPath)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(await errorText(response));
          return (await response.json()) as { defaultBranch: string };
        })
        .then((body) => {
          if (cancelled) return;
          setBaseBranch(body.defaultBranch);
          setBaseNote(null);
        })
        .catch(() => {
          if (cancelled) return;
          setBaseBranch(null);
          setBaseNote("这个路径还不是 git 仓库");
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [repoPath]);

  async function openBrowse(nextPath: string) {
    setBrowseError(null);
    const query = nextPath ? `?path=${encodeURIComponent(nextPath)}` : "";
    try {
      const response = await fetch(`/api/browse${query}`);
      if (!response.ok) throw new Error(await errorText(response));
      setBrowse((await response.json()) as BrowseResult);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : "无法列出该目录");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, path: repoPath }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      setName("");
      setRepoPath("");
      setBaseBranch(null);
      setBaseNote(null);
      setBrowse(null);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "无法登记 repo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="stack-form">
      <summary>登记 repo</summary>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          名称
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="billing" required />
        </label>
        <label>
          绝对路径
          <span className="path-row">
            <input
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="/home/you/src/billing"
              required
            />
            <button className="chip" type="button" onClick={() => void openBrowse(repoPath)}>浏览</button>
          </span>
        </label>
        {browse ? (
          <div className="picker">
            <p className="mono picker-path">{browse.path}</p>
            <button className="chip" type="button" onClick={() => { setRepoPath(browse.path); setBrowse(null); }}>
              使用此目录
            </button>
            {browse.parent ? (
              <button type="button" onClick={() => void openBrowse(browse.parent ?? "")}>上级</button>
            ) : null}
            {browse.entries.map((entry) => (
              <button key={entry.path} type="button" onClick={() => void openBrowse(entry.path)}>
                {entry.name}
              </button>
            ))}
            {browse.truncated ? <p className="muted">只显示前 200 个目录。</p> : null}
          </div>
        ) : null}
        {browseError ? <p className="muted">{browseError}</p> : null}
        {baseBranch ? <p className="muted">主分支 <span className="mono">{baseBranch}</span></p> : null}
        {baseNote ? <p className="muted">{baseNote}</p> : null}
        <button className="chip" type="submit" disabled={busy}>登记</button>
      </form>
    </details>
  );
}
