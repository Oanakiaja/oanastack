---
name: oanastack
description: oanastack 协作规则与常见工作流（调研、开 feature、修 bug、验证、review、盯 PR/CI、清理 worktree、按门槛复盘）
---

# oanastack Skill

优先阅读：

- 原则：`references/principles.md`（思想已写入；折进 poteto 的落点图：`references/poteto-fold.md`，playbook 步骤尚未改）。做判断时按其中「使用方式」写出用了哪条原则或 skill、改了哪个选择。
- Playbook 路由：`playbooks/README.md`（匹配后把步骤原样抄到 todo）
- 调研：`playbooks/research.md`
- Agent readiness 评估（`/agent-readiness-report`）：`../agent-readiness-report/SKILL.md`（独立通用量表，只评估，不自动修复）
- 开 feature / 多仓并行：`references/feature-session.md` + `playbooks/feat.md`
- 长 coding session（herdr）：`../herdr-grokbot/SKILL.md`
- 功能开发参考：`references/feature.md`
- UI 状态（数据源 / 建模 / Electron）：`references/ui-state.md`
- UI oxlint 循环（模板）：`references/ui-state-oxlint.md`（`references/templates/oxlintrc.react.json`）
- UI React Doctor（Agent 可脚本循环）：`references/ui-state-react-doctor.md`
- UI react-scan（运行时高亮）：`references/ui-state-react-scan.md`
- UI 组件 / e2e 验证：`references/ui-state-testing.md`
- 缺陷修复：`playbooks/bugfix.md`（骨干：`references/bug-fix.md`）
- 验证：`playbooks/test.md`
- 看 diff / 写评论：`playbooks/review.md`
- 盯 feature→main 到 merge-ready（review + e2e，只通知）：`playbooks/babysit.md`（分类卡：`references/ci-classify.md`；验证：`playbooks/test.md`）
- CI 分诊：`playbooks/cicd.md`
- 清理 worktree：`playbooks/cleanup.md`
- 沉淀 / 架构反思：`playbooks/reflect.md`（`references/reflect.md`）

多仓 feature 推荐先用 `oana` CLI 创建/清理 worktree，再把 session cwd 指向对应 worktree。长 coding session 在该 worktree 内用 herdr 驱动本机 Codex（skill：`../herdr-grokbot/SKILL.md`）；不要另起一套 worktree 平面。

Playbook 路由：匹配任务后，把对应 playbook 的步骤原样抄到 todo（见 `playbooks/README.md`）。本层是薄适配，不是 pstack 全量分叉。骨干仍是：一个 feature → `oana` 多仓 worktree → 做完再批量 merge。merge / land / ship 没有独立 playbook，babysit 到 merge-ready（review + e2e / 目标验证）后只通知 owner，由 owner 合入。禁止直接改生产环境配置。
