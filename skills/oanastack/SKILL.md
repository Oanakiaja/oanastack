---
name: oanastack
description: oanastack 协作规则与常见工作流（开 feature、多仓并行、盯 PR/CI、合入/land/ship、清理 worktree、修复与复盘）
---

# oanastack Skill

优先阅读：

- 原则：`references/principles.md`
- 开 feature / 多仓并行：`references/feature-session.md` + `playbooks/feature.md`
- Codex 线程 / exec vs 交互 / effort / 反膨胀：见 `references/feature-session.md` 对应节
- 功能开发：`references/feature.md`
- 盯 PR / CI：`playbooks/babysit-lite.md`（分类卡：`references/ci-classify.md`）
- 合入 / land / ship：`playbooks/shipping-lite.md`
- 清理 worktree：`playbooks/cleanup.md`
- 缺陷修复：`references/bug-fix.md`
- 复盘沉淀：`references/reflect.md`

多仓 feature 推荐先用 `oana` CLI 创建/清理 worktree，再把 session cwd 指向对应 worktree。

Playbook 路由：匹配任务后，把对应 playbook 的步骤原样抄到 todo（见 `playbooks/README.md`）。本层是薄适配，不是 pstack 全量分叉。骨干仍是：一个 feature → `oana` 多仓 worktree → 做完再批量 merge。
