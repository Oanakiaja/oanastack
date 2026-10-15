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

云端 Grok Bot 经 herdr 驱动本机 Codex：

```bash
ln -s "$REPO_ROOT/skills/herdr-grokbot" ~/.agents/skills/herdr-grokbot
```

## Agent Readiness Report

`skills/agent-readiness-report/` 提供独立的仓库评估流程，借鉴
[Factory 的 Agent Readiness 文章](https://factory.com/news/agent-readiness)，
使用 oanastack 自己的八维度、五级量表；结果不是 Factory 官方评分。
适用于不同语言、托管平台和开源或私有仓库。默认本地检查，不接入 Factory；
宿主 Agent 的模型服务仍遵循其自身的数据策略。

安装到 Codex 的技能发现目录：

```bash
ln -s "$REPO_ROOT/skills/agent-readiness-report" ~/.agents/skills/agent-readiness-report
```

在 Codex 中用 `$agent-readiness-report`，或让已有 `$oanastack` 路由此评估。
Claude Code 的 `/agent-readiness-report` 需要同时安装 skill 和命令：

```bash
mkdir -p ~/.claude/skills ~/.claude/commands
ln -s "$REPO_ROOT/skills/agent-readiness-report" ~/.claude/skills/agent-readiness-report
ln -s "$REPO_ROOT/~/.claude/commands/agent-readiness-report.md" ~/.claude/commands/agent-readiness-report.md
```

已有同名文件时先检查，不覆盖。重开会话后可执行
`/agent-readiness-report` 或 `/agent-readiness-report <repository-path>`。
报告区分通过、失败、未知、阻塞和不适用，每项附证据与改进建议。
默认在会话中返回报告；私有项目的报告和源码不应提交到本仓。

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

## 进度看板

`oanastack` 是本仓的 TypeScript CLI（`packages/oanastack/`）。它把仓库、多仓 feature、目标、完成记录记到本地 SQLite，并用 localhost 页面供人复查。需要 Node.js >= 22.13。

默认根目录 `~/.oanastack/`，数据库是里面的 `oanastack.sqlite`。`oanastack config root <path>` 把根目录指到别处（不移动已有数据库）。`OANASTACK_HOME` 和 `OANASTACK_DB` 优先于 `~/.config/oanastack/oanastack.json`。这个配置文件和 `repos.toml` 无关。

```bash
REPO_ROOT="$HOME/Documents/github/oanastack"
mkdir -p ~/.local/bin
ln -s "$REPO_ROOT/bin/oanastack" ~/.local/bin/oanastack
```

`bin/oanastack` 在 `dist/cli.js` 缺失时会在 `packages/oanastack` 里安装依赖并 build。Agent 写法见 `skills/oanastack-progress/SKILL.md`。日志命令都支持 `--json`。

```bash
oanastack repo add billing --path "$HOME/src/billing" --test "npm test" --json
oanastack repo add ledger --path "$HOME/src/ledger" --json
oanastack project add billing-api --name "Billing API" --json
oanastack feature new billing-api charge-keys --repo billing:main --repo ledger:main --goal "One charge per checkout" --json
oanastack target add billing-api "Idempotent charge keys" --feature charge-keys --repo billing --json
oanastack target result 1 success --summary "one charge" --json
oanastack done 1 --changed "…" --why "…" --verified "npm test" --check "place the order twice" --json
oanastack feature merge charge-keys --json          # 每个仓库同步 base、跑测试、push 并打开 PR
oanastack feature merge charge-keys --local --json  # 改为合进本地 base
oanastack feature close charge-keys --json          # 已合并且干净后归档并删 worktree
oanastack show --json
oanastack serve   # http://127.0.0.1:4747 ，只绑 localhost
```

仓库根目录在磁盘任何位置，用绝对路径登记，不克隆进 `~/.oanastack`。一个 feature 可以跨多个仓库。工作区是 `~/.oanastack/projects/<project>/features/<feature>/`：每个仓库一个 worktree（`features/<feature>/<repo>/`），旁边是 `.oanastack/feature.json`、`.oanastack/tasks.md` 和给 agent 的 `AGENTS.md`（目标、仓库、分支、进度、CLI 记法）。这些文件会在记录变化时更新。`tasks.md` 只在创建时生成，之后留给人和 agent 改。

`feature merge` / `feature close` 按仓库走完该 feature 的每一个 worktree。关闭后元数据留在 `projects/<project>/archive/<feature>/`。未合并的 feature 用 `feature close --abandon`。

页面左侧始终是树：项目 → base branch → worktree。每一行只有名称、状态标签，以及相对 main/base 的领先/落后。打开首页是总看板，跨项目汇总数量、最近结果和等 review，不会自动进入第一个项目。点项目名后，右侧才是该项目汇总。点一个 worktree 后，右侧换成它的状态、对话轮次、target 结果、完成记录，以及相对 base 的左右 diff（目录按扩展名显示图标，代码按语言着色）。对话轮次默认收起。登记仓库可以粘贴绝对路径，也可以在页面里逐级选目录；创建 feature 时勾选仓库，并为每个仓库填 base 分支。点开完成记录看改了什么、为什么、如何验证、风险、用户该看什么。worktree / branch 和 herdr 结果是可选自由文本。`serve` 不需要先跑；CLI 直接写同一个 SQLite 文件，页面会自己刷新。

这套 feature 工作区和 Worktrunk（`wt`）/ `oana feature` 不是同一个目录平面。

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

完整系统：`skills/oanastack/references/ui-state.md`。oxlint 模板 `references/templates/oxlintrc.react.json`（pstack 无此配置）；Agent 循环走 React Doctor，运行时高亮走 react-scan。桌面端 Main 是权威。

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
