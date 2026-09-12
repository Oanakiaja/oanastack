# market

Recording reusable scripts, CLI, Skill, Prompt, Plugins.

## Skill 安装

```bash
ln -s /home/runner/work/oanastack/oanastack/skills/oanastack ~/.claude/skills/oanastack
```

## Feature Session + Worktree 约定

- 一个 feature 对应一个 agent/Codex 线程（命名建议：`repo + feature`）。
- 多仓 feature 时，每仓一个 worktree；session cwd 必须指向 worktree，而不是主 checkout。
- 合并或放弃后要清理 worktree，保持主 checkout 干净。

## oana CLI

```bash
ln -s /home/runner/work/oanastack/oanastack/bin/oana ~/.local/bin/oana
# 或把 /home/runner/work/oanastack/oanastack/bin 加到 PATH
```

### repo 映射配置

```bash
mkdir -p ~/.config/oanastack
cp /home/runner/work/oanastack/oanastack/.config/oanastack/repos.example.toml ~/.config/oanastack/repos.toml
```

### 常用命令

```bash
oana repos
oana feature start agent-collab one-agent-ui work_agent_server
oana feature list
oana feature paths agent-collab
oana feature hint agent-collab
oana feature done agent-collab
```

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
