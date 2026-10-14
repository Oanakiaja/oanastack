#!/bin/bash
# Watch one herdr agent and hand done/blocked events to the local oanastack trigger.
# The trigger service dedupes and POSTs once to the Grok Bot webhook. This script
# does not read GROKBOT_WEBHOOK or GROKBOT_AUTH.
AGENT=${1:-cx1}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BIN="${OANASTACK_BIN:-$REPO_ROOT/bin/oanastack}"

if [ -x "$BIN" ]; then
  exec "$BIN" trigger attach "$AGENT"
fi
if command -v oanastack >/dev/null 2>&1; then
  exec oanastack trigger attach "$AGENT"
fi

BASE="${OANASTACK_TRIGGER_URL:-http://127.0.0.1:4748}"
LAST=""
while true; do
  RAW=$(herdr agent get "$AGENT" 2>/dev/null || true)
  S=$(printf '%s' "$RAW" | jq -r '.result.agent.agent_status // empty' 2>/dev/null || true)
  KIND=$(printf '%s' "$RAW" | jq -r '.result.agent.kind // .result.agent.agent // "codex"' 2>/dev/null || true)
  case "$KIND" in
    codex|claude) ;;
    *) KIND=codex ;;
  esac
  [ -z "$S" ] && { sleep 10; continue; }
  if [ "$S" != "$LAST" ]; then
    TEXT=""
    if [ "$S" = done ] || [ "$S" = blocked ]; then
      TEXT=$(herdr agent read "$AGENT" --source recent-unwrapped --lines 60 2>/dev/null || true)
    fi
    CWD=$(printf '%s' "$RAW" | jq -r '.result.agent.cwd // .result.agent.foreground_cwd // empty' 2>/dev/null || true)
    WT=$(printf '%s' "$RAW" | jq -r 'if (.result.agent.worktree | type) == "string" then .result.agent.worktree elif (.result.agent.worktree.path? | type) == "string" then .result.agent.worktree.path else "" end' 2>/dev/null || true)
    BRANCH=""
    PROBE="${WT:-$CWD}"
    if [ -n "$PROBE" ] && command -v git >/dev/null 2>&1; then
      BRANCH=$(git -C "$PROBE" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
      TOP=$(git -C "$PROBE" rev-parse --show-toplevel 2>/dev/null || true)
      [ -n "$TOP" ] && WT="$TOP"
    fi
    if jq -n \
      --arg a "$AGENT" --arg k "$KIND" --arg s "$S" --arg t "$TEXT" \
      --arg c "$CWD" --arg w "$WT" --arg b "$BRANCH" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{agent:$a,kind:$k,status:$s,text:$t,summary:($t|split("\n")[0]),cwd:$c,worktree:$w,branch:$b,ts:$ts}' \
      | curl -sfS -X POST "$BASE/v1/events" -H 'content-type: application/json' --data @-; then
      echo "$(date) queued $AGENT $S"
      LAST=$S
    else
      echo "$(date) trigger service unavailable; retrying" >&2
    fi
  fi
  sleep 5
done
