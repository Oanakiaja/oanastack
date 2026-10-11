import { useState } from "react";
import type { Completion, Feature, FeatureRepoLink, Overview, Progress, Project, Target } from "../../src/types.ts";
import { featureLabel, formatTime, targetLabel } from "./labels";
import { mapHash } from "./route";
import { FeatureForm, ProjectForm, RepoForm } from "./setup";

export function Board({
  overview,
  project,
  onSelect,
  onReload,
  onError,
}: {
  overview: Overview | null;
  project: Project | undefined;
  onSelect: (slug: string) => void;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const unlinked = project?.targets.filter((item) => item.featureId === null) ?? [];

  async function act(kind: "merge" | "merge-local" | "close" | "abandon", item: Feature) {
    if (kind === "close" && !window.confirm("关闭此 feature？每个 worktree 已 merge 且干净后才会移除。")) return;
    if (kind === "abandon" && !window.confirm("放弃此 feature？未 merge 的 branch 会被删除，worktree 会移除。")) return;
    setBusy(true);
    try {
      const closing = kind === "close" || kind === "abandon";
      const url = `/api/projects/${encodeURIComponent(item.projectSlug)}/features/${encodeURIComponent(item.slug)}/${closing ? "close" : "merge"}`;
      const body = kind === "abandon" ? { abandon: true } : kind === "merge-local" ? { local: true } : {};
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      onError(null);
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace">
      <section className="pane" aria-label="项目">
        <h2>项目</h2>
        {overview && overview.projects.length === 0 ? (
          <p className="muted">还没有项目。登记 repo 的绝对路径，添加项目，再创建 feature。</p>
        ) : null}
        <ul className="project-list">
          {overview?.projects.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.slug === project?.slug ? "selected" : ""}
                aria-current={item.slug === project?.slug ? "true" : undefined}
                onClick={() => onSelect(item.slug)}
              >
                <span className="project-name">{item.name}</span>
                <span className="fraction">{fraction(item.progress)}</span>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: meterWidth(item.progress) }} />
                </span>
                {item.note ? <span className="note">{item.note}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <ProjectForm
          onError={onError}
          onDone={(slug) => {
            onError(null);
            onSelect(slug);
            void onReload();
          }}
        />
        {overview && overview.repos.length > 0 ? (
          <>
            <h2 className="section-label">repo</h2>
            <ul className="repo-mini">
              {overview.repos.map((repo) => (
                <li key={repo.id}>
                  <strong>{repo.name}</strong>
                  <span>{repo.path}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <RepoForm
          onError={onError}
          onDone={() => {
            onError(null);
            void onReload();
          }}
        />
      </section>
      <section className="pane" aria-label="worktree">
        <h2>worktree</h2>
        {project ? (
          <FeatureForm
            project={project.slug}
            onError={onError}
            onDone={() => {
              onError(null);
              void onReload();
            }}
          />
        ) : (
          <p className="muted">{overview && overview.projects.length > 0 ? "选择一个项目。" : "先添加项目。"}</p>
        )}
        {project && project.features.length === 0 && unlinked.length === 0 ? (
          <p className="muted">还没有 worktree。创建一个 feature 后，每个 repo 会有自己的 worktree。</p>
        ) : null}
        {project?.features.map((feature) => (
          <FeatureBlock key={feature.id} feature={feature} project={project} busy={busy} onAct={(kind) => void act(kind, feature)} />
        ))}
        {unlinked.length > 0 ? (
          <article className="wt">
            <header className="wt-head">
              <strong>未关联 feature</strong>
            </header>
            <ul className="target-list">
              {unlinked.map((target) => (
                <TargetBlock key={target.id} target={target} />
              ))}
            </ul>
          </article>
        ) : null}
      </section>
      <section className="pane" aria-label="汇总">
        <h2>汇总</h2>
        {project ? <Rollup project={project} /> : <p className="muted">选择一个项目。</p>}
      </section>
    </main>
  );
}

function FeatureBlock({
  feature,
  project,
  busy,
  onAct,
}: {
  feature: Feature;
  project: Project;
  busy: boolean;
  onAct: (kind: "merge" | "merge-local" | "close" | "abandon") => void;
}) {
  const targets = project.targets.filter((item) => item.featureId === feature.id);
  const attached = new Set<number>();
  const cards = feature.repos.map((repo) => {
    const matched = targets.filter((target) => belongsTo(target, repo, feature));
    for (const target of matched) attached.add(target.id);
    return { repo, targets: matched };
  });
  const loose = targets.filter((target) => !attached.has(target.id));
  const actionable = feature.status === "open" || feature.status === "review";

  return (
    <section className="feature-block">
      <header className="feature-head">
        <strong>{feature.slug}</strong>
        <span className={`status ${feature.status}`}>{featureLabel(feature.status)}</span>
        {feature.goal ? <p className="muted">{feature.goal}</p> : null}
      </header>
      {actionable ? (
        <div className="feature-actions">
          <button className="chip" type="button" disabled={busy} onClick={() => onAct("merge-local")}>本地 merge</button>
          <button className="chip" type="button" disabled={busy} onClick={() => onAct("merge")}>merge</button>
          <button className="chip" type="button" disabled={busy} onClick={() => onAct("close")}>关闭</button>
          <button className="chip" type="button" disabled={busy} onClick={() => onAct("abandon")}>放弃</button>
        </div>
      ) : null}
      {cards.map(({ repo, targets: rows }) => (
        <article key={repo.id} className="wt">
          <header className="wt-head">
            <strong>{repo.name}</strong>
            <span className="mono">{repo.baseBranch} → {repo.branch}</span>
          </header>
          <p className="path">{repo.worktreePath ?? repo.path}</p>
          <p className="links">
            <a href={mapHash(project.slug, feature.slug, repo.name)}>diff</a>
            {repo.prUrl ? <a href={repo.prUrl}>PR</a> : null}
          </p>
          {rows.length === 0 ? <p className="muted">还没有 target。</p> : null}
          <ul className="target-list">
            {rows.map((target) => (
              <TargetBlock key={target.id} target={target} />
            ))}
          </ul>
        </article>
      ))}
      {loose.length > 0 ? (
        <article className="wt">
          <header className="wt-head">
            <strong>未挂到 worktree</strong>
          </header>
          <ul className="target-list">
            {loose.map((target) => (
              <TargetBlock key={target.id} target={target} />
            ))}
          </ul>
        </article>
      ) : null}
      {feature.repos.length === 0 ? <p className="muted">这个 feature 没有 repo。</p> : null}
    </section>
  );
}

function belongsTo(target: Target, repo: FeatureRepoLink, feature: Feature): boolean {
  if (target.worktreePath && repo.worktreePath && target.worktreePath === repo.worktreePath) return true;
  if (!target.worktreePath && feature.repos.length === 1) return true;
  return false;
}

function TargetBlock({ target }: { target: Target }) {
  const [openId, setOpenId] = useState<number | null>(target.completions[0]?.id ?? null);
  return (
    <li className="target">
      <p className="target-line">
        <span className="mono">#{target.id}</span>
        <span>{target.title}</span>
        <span className={`status ${target.status}`}>{targetLabel(target.status)}</span>
      </p>
      {target.summary ? <p className="muted">{target.summary}</p> : null}
      {target.herdrStatus || target.herdrResult ? (
        <p className="muted">herdr {target.herdrStatus ?? ""} {target.herdrResult ?? ""}</p>
      ) : null}
      {target.completions.length === 0 ? <p className="muted">没有完成记录。</p> : null}
      {target.completions.map((record) => (
        <div key={record.id}>
          <button
            type="button"
            className="text-btn"
            aria-expanded={openId === record.id}
            onClick={() => setOpenId(openId === record.id ? null : record.id)}
          >
            完成记录 #{record.id} · {formatTime(record.createdAt)}
          </button>
          {openId === record.id ? <CompletionBody record={record} /> : null}
        </div>
      ))}
    </li>
  );
}

function CompletionBody({ record }: { record: Completion }) {
  return (
    <dl className="record">
      <div><dt>改了什么</dt><dd><Text text={record.changed} /></dd></div>
      <div><dt>为什么</dt><dd><Text text={record.why} /></dd></div>
      <div><dt>如何验证</dt><dd><Text text={record.verified} /></dd></div>
      <div><dt>风险</dt><dd>{record.risks ? <Text text={record.risks} /> : <span className="muted">无</span>}</dd></div>
      <div><dt>要看什么</dt><dd>{record.review ? <Text text={record.review} /> : <span className="muted">无</span>}</dd></div>
    </dl>
  );
}

function Rollup({ project }: { project: Project }) {
  const features = project.features;
  const recent = [...project.targets].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.id - a.id)).slice(0, 6);
  const reviewFeatures = features.filter((item) => item.status === "review");
  const checks = project.targets.flatMap((target) =>
    target.completions
      .filter((record) => record.review)
      .map((record) => ({ target, record })),
  );

  return (
    <div className="rollup">
      <p className="counts">
        <span>feature</span>
        <span>已完成 {countStatus(features, "done")}</span>
        <span>进行中 {countStatus(features, "open")}</span>
        <span>待复查 {countStatus(features, "review")}</span>
        <span>已放弃 {countStatus(features, "abandoned")}</span>
      </p>
      <p className="counts">
        <span>target</span>
        <span>成功 {project.progress.success}</span>
        <span>进行中 {project.progress.open}</span>
        <span>失败 {project.progress.failed}</span>
        <span>不做 {project.progress.rejected}</span>
      </p>
      <h3>最近结果</h3>
      {recent.length === 0 ? <p className="muted">还没有 target。</p> : null}
      <ul className="plain">
        {recent.map((target) => (
          <li key={target.id}>
            <span className={`status ${target.status}`}>{targetLabel(target.status)}</span>
            <span>{target.title}</span>
            {target.summary ? <span className="muted">{target.summary}</span> : null}
          </li>
        ))}
      </ul>
      <h3>待复查</h3>
      {reviewFeatures.length === 0 && checks.length === 0 ? <p className="muted">没有待复查的条目。</p> : null}
      <ul className="plain">
        {reviewFeatures.map((feature) => (
          <li key={feature.id}>
            <span className="status review">待复查</span>
            <span>{feature.slug}</span>
            {feature.goal ? <span className="muted">{feature.goal}</span> : null}
          </li>
        ))}
        {checks.map(({ target, record }) => (
          <li key={record.id}>
            <span className="mono">#{target.id}</span>
            <span>{target.title}</span>
            <span className="muted">{record.review}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Text({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("http://") || part.startsWith("https://") ? (
          <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>
        ) : (
          <span key={`${index}-${part.slice(0, 12)}`}>{part}</span>
        ),
      )}
    </>
  );
}

function countStatus(features: Feature[], status: string): number {
  return features.filter((item) => item.status === status).length;
}

function fraction(progress: Progress): string {
  if (progress.total === 0) return "0 target";
  return `成功 ${progress.success}/${progress.total}`;
}

function meterWidth(progress: Progress): string {
  if (progress.total === 0) return "0%";
  return `${(progress.success / progress.total) * 100}%`;
}
