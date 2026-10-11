import { useCallback, useEffect, useState } from "react";
import type { Overview, Project } from "../../src/types.ts";
import { Board } from "./board";
import { MapPage } from "./map";
import { boardHash, mapHash, readRoute, type Route } from "./route";

export function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [refreshKey, setRefreshKey] = useState(0);

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

  const project = selectedProject(overview, route.project);
  const error = actionError ?? loadError;

  function go(hash: string) {
    if (window.location.hash !== hash) window.location.hash = hash;
  }

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/">oanastack</a>
        <span className="current">{project?.name ?? "进度"}</span>
        <nav>
          {project && route.page === "board" ? <a href={mapHash(project.slug)}>worktree 图</a> : null}
          {project && route.page === "map" ? <a href={boardHash(project.slug)}>返回</a> : null}
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
      {route.page === "map" ? (
        <MapPage project={route.project} feature={route.feature} repo={route.repo} refreshKey={refreshKey} />
      ) : (
        <Board
          overview={overview}
          project={project}
          onSelect={(slug) => go(boardHash(slug))}
          onReload={load}
          onError={setActionError}
        />
      )}
    </div>
  );
}

function selectedProject(overview: Overview | null, slug: string | undefined): Project | undefined {
  if (!overview || overview.projects.length === 0) return undefined;
  if (!slug) return overview.projects[0];
  return overview.projects.find((item) => item.slug === slug);
}
