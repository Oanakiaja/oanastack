---
name: oanastack trigger
description: 本机 herdr 上的 Codex / Claude 在 dangerously yolo 模式启动时自动挂上 trigger；状态变成 done 或 blocked 后，由本地 trigger 服务去重并只 POST 一次到 Grok Bot webhook。不要用于把 webhook URL 或 Authorization 写进聊天、绕过本地服务直接 curl webhook、或代替 oana grokc / Cursor Cloud Agent。
---

# oanastack trigger

herdr 不会发 webhook。`oanastack trigger` 补上这条回路：agent 启动时自动 attach，`done` / `blocked` 进本地服务，服务规范化后带 `Authorization: Bearer` POST 给每日工作的 Grok Bot webhook。

需要 Node.js >= 22.13。命令是仓库里的 `bin/oanastack`（不在 PATH 时用绝对路径）。缺 `packages/oanastack-trigger/dist/cli.js` 时这个脚本会自己 build。

密钥只放环境变量，或 `~/.oanastack/grokbot-webhook.env`，或 `~/.config/herdr/grokbot-webhook.env`：

```bash
GROKBOT_WEBHOOK=…
GROKBOT_AUTH=…
```

`GROKBOT_AUTH` 可以是裸 token、`Bearer <token>`，或 `Authorization: Bearer <token>`。服务会收成 `Authorization: Bearer <token>`。不要把这两行贴进聊天。`status` / `doctor` 只报告是否已配置。

## 启动

常驻服务（默认 `http://127.0.0.1:4748`，只绑 loopback）。它会轮询 `herdr agent list`，对每个 `codex` / `claude` 自动 attach：

```bash
oanastack trigger serve
```

启动 agent 时用 `trigger start`，不要手写 herdr 参数。Codex 与 Claude 都会进 dangerously yolo 模式，并在后台 attach：

```bash
oanastack trigger start cx1 --kind codex --pane <pane>
oanastack trigger start cl1 --kind claude --pane <pane>
```

等价于在 `herdr agent start … --` 后面加上：

- codex: `--dangerously-bypass-approvals-and-sandbox`
- claude: `--dangerously-skip-permissions`

pane 必须是已有的空闲 shell。agent 名匹配 `[a-z][a-z0-9_-]{0,31}`。

只要服务在跑，之后别人用原始 `herdr agent start` 拉起的 codex / claude 也会被 serve 自动 attach。原始启动不会自动加上 yolo 参数；要 yolo 就走 `trigger start`。

单独盯一个 agent（`grokbot-notify.sh` 也是这条）：

```bash
oanastack trigger attach cx1
oanastack trigger status --json
oanastack trigger doctor
```

## 事件

watcher 在状态变化时 POST 给本地 `/v1/events`。服务只把 `done` 和 `blocked` 转发到 webhook，且同一次停驻只发一次。中间回到 `working` / `idle` 之后，下一次 `done` / `blocked` 会再发。

```json
{
  "agent": "cx1",
  "kind": "codex",
  "status": "done",
  "summary": "一句话",
  "text": "最近输出",
  "cwd": "/work",
  "worktree": "/work/wt",
  "ts": "2026-10-14T16:18:00.000Z"
}
```

`kind` 只能是 `codex` 或 `claude`。`summary` 缺省时取 `text` 的第一行。失败写到 `~/.oanastack/trigger.log` 并按退避重试，不会把 webhook URL 或 token 写进日志。数据库是 `~/.oanastack/trigger.sqlite`（`OANASTACK_HOME` / `OANASTACK_TRIGGER_DB` 可覆盖），和进度看板的 `oanastack.sqlite` 不是同一个文件。

## 不要

- 不要从 shell 直接 curl `GROKBOT_WEBHOOK`。去重和重试在 trigger 服务里。
- 不要把 webhook URL 或 Authorization 写进聊天、PR 或仓库。
- 不要用这条回路代替 `oana grokc` 或 Cursor Cloud Agent。
- 不要对非 loopback 地址执行 `trigger serve`。
