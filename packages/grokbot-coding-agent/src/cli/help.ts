import { PACKAGE_NAME, PACKAGE_VERSION } from "../version.js";

export const HELP_TEXT = `${PACKAGE_NAME} ${PACKAGE_VERSION}

Harness-agnostic coding-agent CLI with a CloudAgent-shaped action surface.

Usage:
  oana grokc <action> [id] [options]
  grokc <action> [id] [options]
  grokbot-coding-agent <action> [id] [options]
  npx @oana/grokbot-coding-agent <action> [id] [options]

Actions (CloudAgent verbs):
  launch              Start a new session; returns id + url immediately
  reply <id>          Follow-up turn on the same session
  get <id>            Point-in-time status
  list                Enumerate sessions (scope: launched|all)
  watch <id>          Block until the session/turn settles
  dump <id>           Write the full transcript to a file
  cancel <id>         Stop the active turn
  archive <id>        Soft-delete locally (and via harness when supported)
  unarchive <id>      Restore an archived session
  rename <id>         Set the session display title
  delete <id>         Permanently remove local session state
  models              List model/sandbox hints for the active harness
  list_artifacts <id> List stored transcript artifacts
  approve <id>        Answer a pending Codex approval (forwarded to the human)

Extra:
  worktree create     Create a worktree via Worktrunk (wt switch --create)
  worktree list       List worktrees via wt list
  worktree remove     Remove a worktree via wt remove

Options:
  --harness <id>           codex | cursor-cli | claude-code | kimi
  --cwd <dir>              Working directory (local analog of repo_url)
  --repo <git-root>        Git root for worktree commands / launch --worktree
  --repo-url <path|url>    Alias for cwd / CloudAgent repo_url
  --worktree <slug>        Resolve/create cwd via Worktrunk (wt) for this slug
  --name <slug>            Worktree name (worktree create / remove)
  --base <ref>             Worktree base ref (passed to wt as -b)
  --force                  worktree remove: pass --force to wt
  --prompt <text>          Required for launch and reply
  --interrupt              On reply, preempt an in-flight turn
  --sandbox <mode>         read-only | workspace-write | danger-full-access
  --approval-policy <p>    untrusted | on-request | never
  --request <requestId>    Pending approval id (approve)
  --decision <d>           accept | acceptForSession | decline | cancel
  --auto-approve           Unattended: auto-answer approvals with acceptForSession.
                           Default is off — pending approvals are forwarded to the user.
  --model <id>             Passed through to the harness
  --title <text>           Session title (launch/rename)
  --scope <launched|all>   list filter (default: launched)
  --include-archived       Include archived sessions in list
  --path / --out <file>    dump destination
  --state-dir <dir>        Override ~/.grokbot-coding-agent
  --wait                   After launch/reply, also print the settled status
  --no-wait                Return the handle and exit. Spawns a detached worker
                           that owns the harness so the parent does not block on
                           close() or kill the child when it exits. Default is
                           wait-for-settle.
  --json                   Machine-readable JSON output
  --help, -h
  --version, -v

Examples:
  oana grokc launch --harness codex --cwd . --prompt "Reply with coach-ok"
  oana grokc reply <sessionId> --prompt "Also add tests" --interrupt
  oana grokc get <sessionId> --json
  oana grokc watch <sessionId>
  oana grokc dump <sessionId> --out /tmp/transcript.jsonl
  oana grokc approve <sessionId> --request <requestId> --decision accept
  oana grokc worktree create --repo . --name spike
  oana grokc worktree list --repo .
  oana grokc worktree remove --repo . --name spike
  oana grokc launch --no-wait --worktree spike --repo . --prompt "Add tests"
  oana grokc --help
`;
