# oanastack

跨项目的 Agent 工程原则与任务模板；工程入口 `skills/oanastack/` + CLI `bin/oana`.

Recording reusable scripts, CLI, Skill, Prompt, Plugins.

## Skill 安装

优先软链到 `~/.agents/skills/oanastack`：

```bash
REPO_ROOT="$HOME/Documents/github/oanastack"
mkdir -p ~/.agents/skills
ln -s "$REPO_ROOT/skills/oanastack" ~/.agents/skills/oanastack
```

可选：同时链到 Claude 技能目录：

```bash
mkdir -p ~/.claude/skills
ln -s "$REPO_ROOT/skills/oanastack" ~/.claude/skills/oanastack
```

本地 coding-agent 用法 skill（`oana grokc`）：

```bash
ln -s "$REPO_ROOT/skills/grokc-local-coding-agents" ~/.agents/skills/grokc-local-coding-agents
```

## Feature Session + Worktree 约定

- 一个 feature 对应一个 agent/Codex 线程（命名建议：`repo + feature`）。
- 多仓 feature 时，每仓一个 worktree；session cwd 必须指向 worktree，而不是主 checkout。
- 合并或放弃后要清理 worktree，保持主 checkout 干净。

## oana CLI

```bash
REPO_ROOT="$HOME/Documents/github/oanastack"
mkdir -p ~/.local/bin
ln -s "$REPO_ROOT/bin/oana" ~/.local/bin/oana
# 或把 "$REPO_ROOT/bin" 加到 PATH
```

### repo 映射配置

```bash
mkdir -p ~/.config/oanastack
REPO_ROOT="$HOME/Documents/github/oanastack"
cp "$REPO_ROOT/.config/oanastack/repos.example.toml" ~/.config/oanastack/repos.toml
```

复制后请按你的本地仓库路径修改 `~/.config/oanastack/repos.toml` 中每个 repo alias。
alias 名称可自定义，建议统一用 kebab-case。

### 常用命令

以下子命令由 `bin/oana` 提供，完整参数以 `oana --help` / `oana feature --help` / `oana grokc --help` 为准。

```bash
oana repos
oana feature start agent-collab one-agent-ui nexus
oana feature list
oana feature paths agent-collab
oana feature hint agent-collab
oana feature done agent-collab

# 长 coding session：在 feature worktree 内驱动本地 coding agent
oana grokc launch --harness codex --cwd <worktree> --prompt "…"
oana grokc reply <sessionId> --prompt "…"
oana grokc get <sessionId> --json
oana grokc watch <sessionId>
oana grokc approve <sessionId> --request <requestId> --decision accept
```

`oana agent …` 与 `oana grokc …` 相同。独立二进制 `grokc` 是可选薄别名（`bin/grokc` → `oana grokc`），不再作为顶层产品 CLI。

### `oana grokc` 嵌套包

本地 coding-agent CLI **只住在本仓** `packages/grokbot-coding-agent/`（npm 名仍是 `@oana/grokbot-coding-agent`）。需要 Node.js >= 20。不要再 clone / 维护独立的 grokc CLI 仓库；后续工作只在 oanastack。

```bash
cd packages/grokbot-coding-agent
npm install
npm run build
oana grokc --help
```

若 `dist/cli.js` 不存在，`oana grokc` 会在该目录自动 `npm install`（缺 node_modules 时）并 `npm run build`。用法 skill：`skills/grokc-local-coding-agents/SKILL.md`。

Worktree 平面仍是 Worktrunk（`wt`）/ `oana feature`；不要用 grokc 另起一套目录。审批默认 pending，转给人工后再 `oana grokc approve`；只有用户明确要求时才用 `--auto-approve`。

## Playbooks（借鉴 pstack）

薄 playbook 层，不替换 `oana` 骨干（一个 feature → 多仓 worktree → 做完再批量 merge）。Agent 按任务匹配后把步骤抄到 todo。索引与路由见 `skills/oanastack/playbooks/README.md`。

- 调研：`playbooks/research.md`
- 开 feature / 多仓：`playbooks/feat.md`
- 修 bug：`playbooks/bugfix.md`
- 验证：`playbooks/test.md`
- 看 diff：`playbooks/review.md`
- 盯 PR 到 merge-ready：`playbooks/babysit.md`
- CI 分诊：`playbooks/cicd.md`
- 清理 worktree：`playbooks/cleanup.md`
- 沉淀 / 复盘：`playbooks/reflect.md`

merge / land / ship 不在 playbook 里做：`babysit.md` 到 merge-ready 后由 owner 合入。

## UI / Electron 状态

完整系统：`skills/oanastack/references/ui-state.md`（数据源 / 建模 / Electron）。配套 `ui-state-oxlint.md`、`ui-state-react-scan.md`、`ui-state-testing.md`。桌面端 Main 是权威。

## 原有工具记录

```bash
brew install gum
```

```bash
claude --plugin-dir xx-plugin
```

```bash
cp -n -r ./~/.claude/commands ~/.claude/commands
```

```bash
brew install worktrunk && wt config shell install
```

```bash
curl -fsSL https://raw.githubusercontent.com/oanakiaja/claude-daily/main/scripts/install.sh | bash
```
