import { useCallback, useEffect, useState } from "react";
import type { Overview, Project } from "../../src/types.ts";
import { distanceKey, Shell } from "./shell";
import { projectHash, readRoute, type Route } from "./route";

interface Distance {
  ahead: number | null;
  behind: number | null;
}

export function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [refreshKey, setRefreshKey] = useState(0);
  const [distances, setDistances] = useState<Record<string, Record<string, Distance>>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/overview");
      if (!response.ok) throw new Error(`overview HTTP ${response.status}`);
      setOverview((await response.json()) as Overview);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "读取失败");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const slugKey = overview?.projects.map((item) => item.slug).join("\n") ?? "";

  useEffect(() => {
    if (!overview) return;
    let cancelled = false;
    const projects = overview.projects;
    void Promise.all(
      projects.map(async (item) => {
        const response = await fetch(`/api/projects/${encodeURIComponent(item.slug)}/worktrees`);
        if (!response.ok) return [item.slug, {}] as const;
        const body = (await response.json()) as {
          worktrees: Array<{ featureSlug: string; repoName: string; ahead: number | null; behind: number | null }>;
        };
        const map: Record<string, Distance> = {};
        for (const row of body.worktrees) {
          map[distanceKey(row.featureSlug, row.repoName)] = { ahead: row.ahead, behind: row.behind };
        }
        return [item.slug, map] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, Record<string, Distance>> = {};
      for (const [slug, map] of entries) next[slug] = map;
      setDistances(next);
    }).catch(() => {
      // The tree still renders from the database. Distance stays blank until a later refresh.
    });
    return () => {
      cancelled = true;
    };
  }, [slugKey, refreshKey]);

  const project = selectedProject(overview, route.project);
  const error = actionError ?? loadError;

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/">oanastack</a>
        <span className="current">{project?.name ?? "进度"}</span>
        <nav>
          {project && route.feature && route.repo ? <a href={projectHash(project.slug)}>汇总</a> : null}
          <button
            type="button"
            onClick={() => {
              setRefreshKey((value) => value + 1);
              void load();
            }}
          >
            刷新
          </button>
        </nav>
        {error ? <p className="banner" role="status">{error}</p> : null}
      </header>
      <Shell
        overview={overview}
        distances={distances}
        project={project}
        featureSlug={route.feature}
        repoName={route.repo}
        refreshKey={refreshKey}
        onError={setActionError}
        onReload={load}
      />
    </div>
  );
}

function selectedProject(overview: Overview | null, slug: string | undefined): Project | undefined {
  if (!overview || overview.projects.length === 0) return undefined;
  if (!slug) return overview.projects[0];
  return overview.projects.find((item) => item.slug === slug);
}
