---
name: oanastack-progress
description: Log reviewable progress with the oanastack CLI (repo, project, feature workspace, target, result, completion, round). Use when an agent registers a repo, opens a multi-repo feature workspace, records success/failed/rejected, logs an agent turn, or finishes work the user should review on the local dashboard. This plane is separate from oana feature / wt.
---

# oanastack progress

本地看板让用户看清做到哪、该复查什么。写记录用 CLI，不必先 `serve`。默认根目录 `~/.oanastack/`（数据库 `oanastack.sqlite`）。`oanastack config root <path>` 改根目录，不搬已有数据库。`OANASTACK_HOME` 或 `OANASTACK_DB` 优先于配置文件 `~/.config/oanastack/oanastack.json`。

需要 Node.js >= 22.13。命令是仓库里的 `bin/oanastack`（不在 PATH 时用绝对路径）。缺 `packages/oanastack/dist/cli.js` 时这个脚本会自己 build。

每次调用加 `--json`，只解析 stdout。

## 两个目录平面

`oana feature` / `wt` 仍是 Worktrunk 那套隔离。看板 feature 是另一套：仓库可以在磁盘任何位置，用绝对路径登记；feature 工作区在 `<root>/projects/<project>/features/<feature>/`，每个参与的仓库一个 worktree（`features/<feature>/<repo>/`）。元数据在工作区的 `.oanastack/`（`feature.json`、`tasks.md`、`context.md`）和旁边的 `AGENTS.md`。只在列出的 worktree 里改代码，不要改主 checkout，也不要提交 `.oanastack/` 或 `AGENTS.md`，除非用户明确要求。

`AGENTS.md` 会在 feature、target、completion 变化时重写。任务清单只写在 `.oanastack/tasks.md`，CLI 不会覆盖它。

## 何时写

1. 登记仓库一次：`repo add <name> --path <绝对路径>`
2. 新项目写一次：`project add`
3. 开一个可跨多仓的 feature：`feature new <project> <feature> --repo <name>:<base>`（可重复 `--repo`）
4. 每个目标：`target add`（带 `--feature`；多仓时再带 `--repo`）
5. 结果已知：`target result <id> success|failed|rejected`
6. 做完、要用户复查：`done`
7. 每一轮结束，记在对应 repo 的 worktree 上：`round add`（短摘要给列表，全文给展开；工具过程用 `--tools`，看板默认不展开）
8. 每个仓库都合并且工作区干净后：`feature close`。未合并要丢掉时用 `feature close --abandon`

先 `result` 再 `done`。`done` 不会改 target 状态。herdr 只存自由文本。已有 target 用 `target link <id> --feature <slug>` 挂到 feature 上。

## 命令

```bash
oanastack config root [<path>] --json
oanastack repo add <name> --path <abs> [--test <cmd>] --json
oanastack repo ls --json
oanastack project add <slug> [--name <name>] [--note <text>] --json
oanastack project ls --json
oanastack feature new <project> <feature> --repo <name>:<base> [--repo <name>:<base> ...] [--goal <text>] --json
oanastack feature ls [project] --json
oanastack feature status <feature> [--project <project>] --json
oanastack feature merge <feature> [--project <project>] [--local] --json
oanastack feature close <feature> [--project <project>] [--abandon] --json
oanastack target add <project> "<title>" [--feature <slug>] [--repo <name>] [--wt <path>] [--branch <name>] --json
oanastack target link <id> --feature <slug> [--project <project>] [--repo <name>] --json
oanastack target result <id> success|failed|rejected [--summary <text>] [--wt <path>] [--branch <name>] [--herdr-status <text>] [--herdr <text>] --json
oanastack done <id> --changed "<what>" --why "<why>" --verified "<tests/screenshots/links>" [--risks "<unfinished>"] [--check "<what the user should check>"] --json
oanastack round add <project> <feature> --repo <name> --instruction "<full ask>" --reply "<full reply>" [--summary "<short ask>"] [--outcome "<short result>"] [--tools "<tool chatter>"] --json
oanastack round ls <project> <feature> --repo <name> --json
oanastack show --json
oanastack serve
```

单个仓库也可以写成 `--repo <name> --from <base>`。`p` = `project`，`t` = `target`，`list` = `ls`。slug 用 kebab-case。同名 feature 出现在多个 project 里时，加上 `--project`。

`feature merge` 对每个仓库：把最新 base 合进 feature 分支，跑该仓库登记的 `--test`（失败则停在 open，不 push），然后 `git push` 并用 `gh pr create`。没有 `gh` 时改跑 `feature merge --local`，合进本地 base 分支。`OANASTACK_GH` 可指向别的 `gh` 可执行文件。

`feature close` 要求每个 worktree 干净，且 feature 分支已经是 base 的祖先（优先 `origin/<base>`）。然后把 `.oanastack/` 和 `AGENTS.md` 挪到 `projects/<project>/archive/<feature>/`，删掉 worktree 和本地分支，状态变为 done。`--abandon` 跳过“已合并”检查，状态为 abandoned，并用 `git branch -D` 删分支。脏工作区两种关闭都拒绝。

`--verified` 写测试命令、截图路径或链接。`--check` 写用户该看什么、期望什么。没有未完成的部分就省略 `--risks`。

`serve` 只监听 localhost，默认 `http://127.0.0.1:4747`。左侧始终是树：项目 → base branch → worktree（名称、状态标签、领先/落后）。打开 `#/` 是总看板，汇总所有项目，不会自动选中第一个。点项目名进入该项目汇总；点 worktree 后显示它的状态、对话轮次、target 结果、完成记录，以及相对 base 的左右 diff。对话轮次默认收起，一行是指令摘要和回复结果；展开后是完整指令和完整回复，工具过程另收一层。目录按扩展名显示文件和文件夹图标，代码按 TS、JS、JSON 等语言着色。状态是浅色底的标签，例如进行中、等 review、已完成、失败。登记仓库可以填绝对路径，也可以在页面里浏览目录。创建 feature 时按仓库选 base 分支。用户点开一条完成记录就能复查。

也可以把同一组字段放进 `--data '{"changed":"…","why":"…","verified":"…","check":"…"}'`。

## 不要

- 不要把看板 feature 和 `oana feature` / `wt` 当成同一套目录。
- 不要在主 checkout 里开发看板 feature。工作区路径写在 `AGENTS.md`。
- 不要解析 herdr。`--herdr-status` 和 `--herdr` 原样保存。
- 不要为了记一条记录去改生产配置或全局 git config。
