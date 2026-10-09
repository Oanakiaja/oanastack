#!/bin/bash
# 监听 herdr agent，done/blocked 时把最后输出 POST 给 Grok Bot webhook routine
AGENT=${1:-cx1}
. ~/.config/herdr/grokbot-webhook.env
LAST=""
while true; do
  S=$(herdr agent get "$AGENT" 2>/dev/null | jq -r '.result.agent.agent_status // empty')
  [ -z "$S" ] && { sleep 10; continue; }
  if { [ "$S" = done ] || [ "$S" = blocked ]; } && [ "$S" != "$LAST" ]; then
    TEXT=$(herdr agent read "$AGENT" --source recent-unwrapped --lines 60)
    jq -n --arg a "$AGENT" --arg s "$S" --arg t "$TEXT" '{agent:$a,status:$s,text:$t}' \
      | curl -sS -X POST "$GROKBOT_WEBHOOK" -H "Authorization: ${GROKBOT_AUTH#Authorization: }" \
          -H 'content-type: application/json' --data @- && echo "$(date) sent $AGENT $S"
  fi
  LAST=$S
  sleep 5
done
