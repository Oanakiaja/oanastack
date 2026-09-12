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

以下子命令由 `bin/oana` 提供，完整参数以 `oana --help` / `oana feature --help` 为准。

```bash
oana repos
oana feature start agent-collab one-agent-ui nexus
oana feature list
oana feature paths agent-collab
oana feature hint agent-collab
oana feature done agent-collab
```

## Playbooks（借鉴 pstack）

薄 playbook 层，不替换 `oana` 骨干（一个 feature → 多仓 worktree → 做完再批量 merge）。Agent 按任务匹配后把步骤抄到 todo。索引与路由见 `skills/oanastack/playbooks/README.md`。

- 开 feature / 多仓：`playbooks/feature.md`
- 盯 PR / CI：`playbooks/babysit-lite.md`
- 合入 / land / ship：`playbooks/shipping-lite.md`
- 清理 worktree：`playbooks/cleanup.md`

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
