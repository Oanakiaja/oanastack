---
name: oanastack-progress
description: Log reviewable progress with the oanastack CLI (project, target, result, completion). Use when an agent starts a project or goal, records success/failed/rejected, or finishes work the user should review on the local dashboard. Do not use to create worktrees (oana feature) or to drive coding sessions (oana grokc).
---

# oanastack progress

本地看板让用户看清做到哪、该复查什么。写记录用 CLI，不必先 `serve`。默认数据库 `~/.oanastack/oanastack.sqlite`。`OANASTACK_DB` 指向文件，或 `OANASTACK_HOME` 换目录。

需要 Node.js >= 22.13。命令是仓库里的 `bin/oanastack`（不在 PATH 时用绝对路径）。缺 `packages/oanastack/dist/cli.js` 时这个脚本会自己 build。

每次调用加 `--json`，只解析 stdout。

## 何时写

1. 新项目写一次：`project add`
2. 每个目标或一轮迭代：`target add`（知道的话带上 `--wt` 和 `--branch`）
3. 结果已知：`target result <id> success|failed|rejected`
4. 做完、要用户复查：`done`

先 `result` 再 `done`。`done` 不会改 target 状态。herdr 只存自由文本。

## 命令

```bash
oanastack project add <slug> [--name <name>] [--note <text>] --json
oanastack project ls --json
oanastack target add <slug> "<title>" [--wt <path>] [--branch <name>] --json
oanastack target result <id> success|failed|rejected [--summary <text>] [--wt <path>] [--branch <name>] [--herdr-status <text>] [--herdr <text>] --json
oanastack done <id> --changed "<what>" --why "<why>" --verified "<tests/screenshots/links>" [--risks "<unfinished>"] [--check "<what the user should check>"] --json
oanastack show --json
oanastack serve
```

`p` = `project`，`t` = `target`，`list` = `ls`。slug 用 kebab-case。

`--verified` 写测试命令、截图路径或链接。`--check` 写用户该看什么、期望什么。没有未完成的部分就省略 `--risks`。

`serve` 只监听 localhost，默认 `http://127.0.0.1:4747`。页面是 projects → targets → completion。用户点开一条 completion 就能复查。

也可以把同一组字段放进 `--data '{"changed":"…","why":"…","verified":"…","check":"…"}'`。

## 不要

- 不要用这个 CLI 创建 worktree。隔离仍是 `oana feature` / `wt`。
- 不要解析 herdr。`--herdr-status` 和 `--herdr` 原样保存。
- 不要为了记一条记录去改生产配置。
