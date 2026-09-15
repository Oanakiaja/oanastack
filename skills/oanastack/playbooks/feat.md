# Feat

**先隔离，再改代码。** 一个 feature 一条线程；多仓必须先有 worktree。实现步骤对齐 `../references/feature.md` 与 `../references/feature-session.md`。

匹配：开 feature、多仓并行、新行为/改行为。探索性任务先走 `research.md`。短任务可用 `codex exec`，长 feature 留在这条 session。

## 步骤（原样抄到 todo）

1. **开 feature session + worktree。** `oana feature start <slug> [repo-alias...]`；用 `oana feature hint <slug>` 取线程名与 cwd。session cwd 必须指向 worktree，禁止在主 checkout 上开发。长 session 在该 cwd 内用 `oana grokc launch|reply|…`（见 `../../grokc-local-coding-agents/SKILL.md`），不要另起 homemade worktree。
2. **写验收标准与边界。** 可验证、可失败；写清不做什么。
3. **小步实现。** 优先可验证改动；每步能独立证明。多仓按 alias 在各自 worktree 提交，不串仓污染。
4. **提交前验证并留下证据。** 目标验证走 `test.md`。「编译过」不是验收。
5. **开 PR，不在这里 merge。** 做完再批量 merge；盯 CI / 评论走 `babysit.md`。merge / land / ship 是 owner-only：babysit 到 merge-ready 后由 owner 合入。
6. **合并或放弃后清理。** `oana feature done <slug>`，纪律见 `cleanup.md`。复杂度/根因够深时走 `reflect.md`。

## 工具边界

- 创建 / 列出 / 取路径 / 清理：`oana`（底层 `wt`）。不要引入 Graphite 或额外编排层。
- 长 session 编码：`oana grokc`（在 feature worktree cwd 内）。`oana grokc worktree` 仍走 `wt`，不是第二套隔离平面。
- 编码与验证：在各 repo 的 worktree 内完成。
- 禁止直接改生产环境配置。

**回复：** slug、各仓 worktree cwd、验收标准、验证证据、未决边界。
