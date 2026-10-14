import { useState } from "react";
import type { Completion, Feature, FeatureRepoLink, Overview, Project, Round, Target } from "../../src/types.ts";
import { DiffPanel } from "./diff-view";
import { formatTime } from "./labels";
import { StatusPill } from "./status-pill";
import { distanceText, groupByBase, worktreeName, type WorktreeNode } from "./nav-tree";
import { projectHash, worktreeHash } from "./route";
import { FeatureForm, ProjectForm, RepoForm } from "./setup";

export function Shell({
  overview,
  distances,
  project,
  featureSlug,
  repoName,
  refreshKey,
  onError,
  onReload,
}: {
  overview: Overview | null;
  distances: Record<string, Record<string, { ahead: number | null; behind: number | null }>>;
  project: Project | undefined;
  featureSlug?: string;
  repoName?: string;
  refreshKey: number;
  onError: (message: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const feature = featureSlug ? project?.features.find((item) => item.slug === featureSlug) : undefined;
  const repo = feature?.repos.find((item) => item.name === repoName);
  const detail = feature && repo ? { feature, repo } : null;

  return (
    <main className="split">
      <section className="pane nav-pane" aria-label="项目">
        <h2>项目</h2>
        {overview && overview.projects.length === 0 ? (
          <p className="muted">还没有项目。登记 repo，添加项目，再创建 feature。</p>
        ) : null}
        <ul className="nav-tree">
          {overview?.projects.map((item) => (
            <ProjectBranch
              key={item.id}
              project={item}
              distances={distances[item.slug] ?? {}}
              selected={item.slug === project?.slug && !detail}
              activeFeature={item.slug === project?.slug ? featureSlug : undefined}
              activeRepo={item.slug === project?.slug ? repoName : undefined}
            />
          ))}
        </ul>
        <ProjectForm
          onError={onError}
          onDone={(slug) => {
            onError(null);
            window.location.hash = projectHash(slug);
            void onReload();
          }}
        />
        <RepoForm
          onError={onError}
          onDone={() => {
            onError(null);
            void onReload();
          }}
        />
      </section>
      <section className={detail ? "detail" : "pane overview-pane"} aria-label={detail ? "worktree" : "汇总"}>
        {detail && project ? (
          <WorktreeDetail
            project={project}
            feature={detail.feature}
            repo={detail.repo}
            distance={distances[project.slug]?.[distanceKey(detail.feature.slug, detail.repo.name)]}
            refreshKey={refreshKey}
            onError={onError}
            onReload={onReload}
          />
        ) : (
          <ProjectOverview project={project} onError={onError} onReload={onReload} />
        )}
      </section>
    </main>
  );
}

function ProjectBranch({
  project,
  distances,
  selected,
  activeFeature,
  activeRepo,
}: {
  project: Project;
  distances: Record<string, { ahead: number | null; behind: number | null }>;
  selected: boolean;
  activeFeature?: string;
  activeRepo?: string;
}) {
  const nodes = project.features.flatMap((feature) =>
    feature.repos.map((repo) => ({
      featureSlug: feature.slug,
      featureStatus: feature.status,
      repoName: repo.name,
      baseBranch: repo.baseBranch,
      branch: repo.branch,
      ahead: distances[distanceKey(feature.slug, repo.name)]?.ahead ?? null,
      behind: distances[distanceKey(feature.slug, repo.name)]?.behind ?? null,
    })),
  );
  const groups = groupByBase(nodes);

  return (
    <li>
      <a className={selected ? "nav-row nav-project selected" : "nav-row nav-project"} href={projectHash(project.slug)}>
        <span className="name">{project.name}</span>
      </a>
      {groups.map((group) => (
        <div key={group.baseBranch} className="nav-base">
          <p className="nav-base-name"><span className="mono">{group.baseBranch}</span></p>
          <ul>
            {group.worktrees.map((node) => (
              <li key={`${node.featureSlug}:${node.repoName}`}>
                <WorktreeRow
                  project={project.slug}
                  node={node}
                  siblings={group.worktrees}
                  selected={node.featureSlug === activeFeature && node.repoName === activeRepo}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </li>
  );
}

function WorktreeRow({
  project,
  node,
  siblings,
  selected,
}: {
  project: string;
  node: WorktreeNode;
  siblings: WorktreeNode[];
  selected: boolean;
}) {
  const distance = distanceText(node.ahead, node.behind);
  return (
    <a
      className={selected ? "nav-row nav-wt selected" : "nav-row nav-wt"}
      href={worktreeHash(project, node.featureSlug, node.repoName)}
      aria-current={selected ? "true" : undefined}
    >
      <span className="name">{worktreeName(node, siblings)}</span>
      <StatusPill kind="feature" status={node.featureStatus} />
      {distance ? <span className="dist">{distance}</span> : null}
    </a>
  );
}

function ProjectOverview({
  project,
  onError,
  onReload,
}: {
  project: Project | undefined;
  onError: (message: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const unlinked = project?.targets.filter((item) => item.featureId === null) ?? [];
  return (
    <>
      <h2>汇总</h2>
      {project ? (
        <>
          {project.note ? <p className="muted">{project.note}</p> : null}
          <Rollup project={project} />
          <FeatureForm
            project={project.slug}
            onError={onError}
            onDone={() => {
              onError(null);
              void onReload();
            }}
          />
          {unlinked.length > 0 ? (
            <>
              <h3>未关联 feature</h3>
              <ul className="target-list">
                {unlinked.map((target) => (
                  <TargetBlock key={target.id} target={target} />
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <p className="muted">选择一个项目。</p>
      )}
    </>
  );
}

function WorktreeDetail({
  project,
  feature,
  repo,
  distance,
  refreshKey,
  onError,
  onReload,
}: {
  project: Project;
  feature: Feature;
  repo: FeatureRepoLink;
  distance: { ahead: number | null; behind: number | null } | undefined;
  refreshKey: number;
  onError: (message: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const targets = project.targets.filter((item) => item.featureId === feature.id && belongsTo(item, repo, feature));
  const away = distanceText(distance?.ahead ?? null, distance?.behind ?? null);
  const actionable = feature.status === "open" || feature.status === "review";

  async function act(kind: "merge" | "merge-local" | "close" | "abandon") {
    if (kind === "close" && !window.confirm("关闭此 feature？每个 worktree 已 merge 且干净后才会移除。")) return;
    if (kind === "abandon" && !window.confirm("放弃此 feature？未 merge 的 branch 会被删除，worktree 会移除。")) return;
    setBusy(true);
    try {
      const closing = kind === "close" || kind === "abandon";
      const url = `/api/projects/${encodeURIComponent(feature.projectSlug)}/features/${encodeURIComponent(feature.slug)}/${closing ? "close" : "merge"}`;
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
    <>
      <div className="detail-meta">
        <header className="detail-head">
          <h2>{repo.name}</h2>
          <p>
            <StatusPill kind="feature" status={feature.status} />
            <span className="muted">{feature.slug}</span>
          </p>
          <p className="mono">{repo.baseBranch} → {repo.branch}</p>
          {away ? <p className="mono">{away}</p> : null}
          {feature.goal ? <p className="muted">{feature.goal}</p> : null}
          {repo.prUrl ? <p><a href={repo.prUrl}>PR</a></p> : null}
        </header>
        {actionable ? (
          <div className="feature-actions">
            <button className="chip" type="button" disabled={busy} onClick={() => void act("merge-local")}>本地 merge</button>
            <button className="chip" type="button" disabled={busy} onClick={() => void act("merge")}>merge</button>
            <button className="chip" type="button" disabled={busy} onClick={() => void act("close")}>关闭</button>
            <button className="chip" type="button" disabled={busy} onClick={() => void act("abandon")}>放弃</button>
          </div>
        ) : null}
        <RoundList rounds={repo.rounds} />
        {targets.length === 0 ? <p className="muted">还没有 target。</p> : null}
        <ul className="target-list">
          {targets.map((target) => (
            <TargetBlock key={target.id} target={target} />
          ))}
        </ul>
      </div>
      <DiffPanel project={project.slug} feature={feature.slug} repo={repo.name} refreshKey={refreshKey} />
    </>
  );
}

function RoundList({ rounds }: { rounds: Round[] }) {
  const ordered = [...rounds].sort((a, b) => b.id - a.id);
  return (
    <section className="rounds">
      <h3>对话轮次</h3>
      {ordered.length === 0 ? <p className="muted">还没有对话轮次。</p> : null}
      <ul className="plain">
        {ordered.map((round) => (
          <RoundRow key={round.id} round={round} />
        ))}
      </ul>
    </section>
  );
}

function RoundRow({ round }: { round: Round }) {
  const [open, setOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  return (
    <li className="round">
      <button
        type="button"
        className="text-btn round-line"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="mono">#{round.id}</span>
        <span>{round.summary}</span>
        <span className="muted">{round.outcome}</span>
      </button>
      {open ? (
        <div className="round-body">
          <p className="muted">指令</p>
          <pre className="round-text">{round.instruction}</pre>
          <p className="muted">回复</p>
          <pre className="round-text">{round.reply}</pre>
          {round.tools ? (
            <>
              <button
                type="button"
                className="text-btn"
                aria-expanded={toolsOpen}
                onClick={() => setToolsOpen((current) => !current)}
              >
                工具过程
              </button>
              {toolsOpen ? <pre className="round-text">{round.tools}</pre> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
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
        <StatusPill kind="target" status={target.status} />
      </p>
      {target.summary ? <p className="muted">{target.summary}</p> : null}
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
    target.completions.filter((record) => record.review).map((record) => ({ target, record })),
  );
  return (
    <div className="rollup">
      <p className="counts">
        <span>feature</span>
        <span>已完成 {countStatus(features, "done")}</span>
        <span>进行中 {countStatus(features, "open")}</span>
        <span>等 review {countStatus(features, "review")}</span>
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
            <StatusPill kind="target" status={target.status} />
            <span>{target.title}</span>
            {target.summary ? <span className="muted">{target.summary}</span> : null}
          </li>
        ))}
      </ul>
      <h3>等 review</h3>
      {reviewFeatures.length === 0 && checks.length === 0 ? <p className="muted">没有等待 review 的条目。</p> : null}
      <ul className="plain">
        {reviewFeatures.map((item) => (
          <li key={item.id}>
            <StatusPill kind="feature" status={item.status} />
            <span>{item.slug}</span>
            {item.goal ? <span className="muted">{item.goal}</span> : null}
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

export function distanceKey(feature: string, repo: string): string {
  return `${feature}/${repo}`;
}
