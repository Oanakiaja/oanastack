# Playbooks

薄 playbook 层：路由 / 调研先于动手 / UI 先定表面再动控件 / CI 先分类再重试 / review 与 babysit 分离 / worktree 清理 / 按门槛复盘。

**不是 pstack 全量分叉。** 骨干仍是 oanastack 自己的：一个 feature → `oana` 多仓 worktree → 做完再批量 merge。这里只给 Agent 可抄的步骤卡，不引入 Graphite、不 vendor pstack 脚本、不改个人 `~/` 配置。

## 路由

匹配任务 → 打开对应 playbook → **把步骤原样抄到 todo**，再写任务特有项。跳过某步须留下 `skip: <原因>`，禁止默默丢掉命名步骤。

| 任务信号 | Playbook |
| --- | --- |
| 调研 / 摸底 / 方案对比 / 探索性根因 | `research.md` |
| 开 feature / 多仓并行 / 实现新行为 | `feat.md`（先读 `../references/feature-session.md`） |
| 新/改 Settings·卡片·列表·对话框 / 「看起来不对」/ 交互要截图 | `uidesign.md`（状态 `../references/ui-state.md`） |
| 复现后的最小修复 | `bugfix.md` |
| 计划并跑目标验证 | `test.md` |
| 看 PR/diff、写评论 | `review.md` |
| 盯 PR 到 merge-ready（冲突 / 线程 / CI） | `babysit.md` |
| CI 红了：先分类再重试 | `cicd.md`（细则 `../references/ci-classify.md`） |
| 清理 worktree / `oana feature done` | `cleanup.md` |
| 排查完沉淀 / 复盘 / 架构反思 | `reflect.md` |

**没有 shipping 卡。** merge / land / ship 是 owner-only：`babysit.md` 推到 merge-ready 后由 owner 合入。只写评论走 `review.md`，不要和 babysit 混用。

共用纪律：禁止直接改生产环境配置；默认 `gh`，不要 Graphite；worktree 只用 `oana` / `wt`。长 coding session 用 `oana grokc`，仍挂在同一 worktree 平面（见 `../../grokc-local-coding-agents/SKILL.md`）。grokc 产品入口只在 oanastack，不要指向独立 grokc CLI 仓库。

## 索引

- `research.md` — 先证据和选项，再决定是否开做。
- `feat.md` — 先开 session 与 worktree，再证据导向实现。
- `uidesign.md` — 先定任务与表面，再动控件；实现交 `feat.md`。
- `bugfix.md` — 复现 → 根因 → 最小修复 → 证据。
- `test.md` — 目标验证；「编译过」不是验收。
- `review.md` — 看 diff、写可执行评论；不推 CI。
- `babysit.md` — 只推 merge frontier 到 merge-ready，不 merge。
- `cicd.md` — CI 先分类：fresh-build / fix / rebase-report。
- `cleanup.md` — 按 `oana feature done` 清理；dirty 需确认。
- `reflect.md` — 按复杂度/根因门槛沉淀或做架构反思。

配套参考卡：`../references/ci-classify.md`、`../references/feature-session.md`、`../references/bug-fix.md`、`../references/reflect.md`、`../references/ui-state.md`。
