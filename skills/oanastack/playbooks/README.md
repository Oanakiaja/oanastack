# Playbooks

薄 playbook 层：从 pstack 吸收「路由 / CI 先分类再重试 / babysit 与 shipping 分离 / worktree 清理纪律」。

**不是 pstack 全量分叉。** 骨干仍是 oanastack 自己的：一个 feature → `oana` 多仓 worktree → 做完再批量 merge。这里只给 Agent 可抄的步骤卡，不引入 Graphite、不 vendor pstack 脚本、不改个人 `~/` 配置。

## 路由

匹配任务 → 打开对应 playbook → **把步骤原样抄到 todo**，再写任务特有项。跳过某步须留下 `skip: <原因>`，禁止默默丢掉命名步骤。

| 任务信号 | Playbook |
| --- | --- |
| 开 feature / 多仓并行 / 实现新行为 | `feature.md`（先读 `../references/feature-session.md`） |
| 盯 PR / 变绿 / CI / review 线程 | `babysit-lite.md` |
| 清理 worktree / `oana feature done` | `cleanup.md` |

明确要求 merge / land / ship 的请求**不是** babysit：停在 merge-ready 之后交给人（或后续独立的 shipping 动作）。本目录不提供 shipping playbook。

## 索引

- `feature.md` — 先开 session 与 worktree，再证据导向实现。
- `babysit-lite.md` — 只推 merge frontier 到 merge-ready，不 merge。
- `cleanup.md` — 按 `oana feature done` 清理；dirty 需确认。

配套参考卡：`../references/ci-classify.md`。
