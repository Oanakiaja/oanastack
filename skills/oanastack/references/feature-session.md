# Feature Session 协作规范

骨干：一个 feature → `oana` 多仓 worktree → session cwd 在 worktree → 做完再批量 merge / 清理。worktree 工具就是 `oana`（底层 `wt`），不要另造 CLI。

## 1) 工作单元：一 feature 一线程
- 一个 feature = 一个 agent / Codex 线程。做完或接受后**停**。
- 旁路修复开**新** session，不要塞进同一条。
- 线程命名：`<repo>-<feature>`，与 slug 一致；多仓共用同一个 feature slug。
- 禁止多主题马拉松线程。

## 2) 多仓隔离 + 轻量 per-repo
- 一个 feature → 每个相关仓库一个 worktree。
- session 的 cwd 必须指向 worktree，禁止主 checkout。
- Codex 跨多仓时，按 repo / cwd 隔离（轻量 per-repo profile），不要一条巨型共享线程改所有仓。

## 3) 短任务 vs 长 feature / effort
- 琐碎 / 一次性：`codex exec`（或等价非交互）。
- 长 feature：留在本 feature session 推进。
- 例行胶水（看 status、小改）用较低 effort；设计与难 bug 再升高。不要默认拉满。

## 4) 工具选择
- 创建 / 列出 / 取路径 / 清理：只走 `oana`：
  - `oana feature start <slug> [repo-alias...]`
  - `oana feature paths <slug>`
  - `oana feature hint <slug>`
  - `oana feature done <slug>`

## 5) 协调
- 已有 agent 占用该 feature 线程时，不要再开平行 session 改同一套 env / 配置。
- 排进那条线程，或停下。

## 6) 卫生 / 反膨胀
- 线程短、聚焦；做完的 feature session 与 worktree 立刻收。
- Codex rollout 体积会涨到 GB 级，拖桌面；不要堆无关 trust / 临时项目目录。
- 合并或放弃后：`oana feature done <slug> [--force]`，保持主 checkout 干净。细则见 `../playbooks/cleanup.md`。

## 7) 推荐操作顺序
1. `oana feature start <slug> ...`
2. `oana feature hint <slug>` 取线程命名与 cwd。
3. 在各 repo worktree 中开发、验证（cwd = worktree）。
4. 做完或接受后停；旁路修复另开 session。
5. 合并/放弃后 `oana feature done <slug>`。
