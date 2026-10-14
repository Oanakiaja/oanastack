# @oana/oanastack-trigger

Local trigger for herdr agents. Canonical command is **`oanastack trigger`** (`bin/oanastack` in this repo). Skill: [`../../skills/oanastack-trigger/SKILL.md`](../../skills/oanastack-trigger/SKILL.md).

Codex and Claude agents started through `oanastack trigger start` run in dangerously yolo mode and auto-attach a watcher. When herdr status becomes `done` or `blocked`, the watcher posts one event to a loopback service. The service dedupes, then POSTs once to the daily-work Grok Bot webhook with `Authorization: Bearer …`. Failures retry and append a line to `~/.oanastack/trigger.log`.

This package sits next to the progress dashboard (`packages/oanastack`). `bin/oanastack` sends `trigger` here and, when that package exists, every other subcommand there. State is a separate sqlite file, `~/.oanastack/trigger.sqlite`, not the dashboard database.

- Package: `@oana/oanastack-trigger` (private)
- Node.js: >= 22.13 (`node:sqlite`, no native addon)
- Service: `http://127.0.0.1:4748`
- Database: `~/.oanastack/trigger.sqlite`
- Delivery log: `~/.oanastack/trigger.log`
- Webhook secrets: `GROKBOT_WEBHOOK` and `GROKBOT_AUTH` in the environment, else `~/.oanastack/grokbot-webhook.env`, else `~/.config/herdr/grokbot-webhook.env`

```bash
cd packages/oanastack-trigger
npm install
npm test
npm run build
```

`bin/oanastack` builds `dist/cli.js` on first use when it is missing.

```bash
oanastack trigger serve
oanastack trigger start cx1 --kind codex --pane w1:p1
oanastack trigger start cl1 --kind claude --pane w1:p2
oanastack trigger attach cx1
oanastack trigger status
oanastack trigger doctor
```

`trigger serve` watches `herdr agent list` and attaches every live `codex` or `claude` agent. `trigger attach <agent>` is the same watch for one agent (the `grokbot-notify.sh` loop posts here instead of calling the webhook itself). `trigger start` runs:

```bash
herdr agent start <agent> --kind codex --pane <pane> -- --dangerously-bypass-approvals-and-sandbox
herdr agent start <agent> --kind claude --pane <pane> -- --dangerously-skip-permissions
```

Event JSON, both on the loopback service and on the webhook:

```json
{
  "agent": "cx1",
  "kind": "codex",
  "status": "done",
  "summary": "shipped the trigger",
  "text": "shipped the trigger",
  "cwd": "/work",
  "worktree": "/work/wt",
  "ts": "2026-10-14T16:18:00.000Z"
}
```

`kind` is `codex` or `claude`. `status` on the wire to Grok Bot is only `done` or `blocked`. Other herdr statuses update the agent cursor so the next terminal status posts again, even when the text matches. A repeat of the same terminal status does not post twice.

Stack: `node:sqlite`, [citty](https://github.com/unjs/citty), Hono on loopback. Webhook URL and `Authorization` never go to stdout, status, doctor, or the delivery log.
