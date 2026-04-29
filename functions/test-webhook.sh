#!/usr/bin/env bash
# test-webhook.sh — fire a mock Google Calendar push notification at the local emulator
# Usage: ./test-webhook.sh [sync|change]

TYPE=${1:-change}
EMULATOR_URL="http://127.0.0.1:5001/huddleai-a812c/us-central1/calendarWebhook"

echo "Sending mock '${TYPE}' notification to ${EMULATOR_URL}..."

curl -s -o /dev/null -w "%{http_code}" -X POST "${EMULATOR_URL}" \
  -H "Content-Type: application/json" \
  -H "x-goog-channel-id: test-channel-001" \
  -H "x-goog-resource-state: ${TYPE}" \
  -H "x-goog-resource-id: mock-resource-id" \
  -H "x-goog-channel-expiration: $(date -u +%a,\ %d\ %b\ %Y\ %H:%M:%S\ GMT -v+7d 2>/dev/null || date -u -d '+7 days' '+%a, %d %b %Y %H:%M:%S GMT')" \
  -d "{}"

echo ""
echo "Done. Check emulator logs for output."
