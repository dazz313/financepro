#!/bin/bash
# Test create-journal flow end-to-end in one shot (server must be alive)
set -e
cd /home/z/my-project

echo "=== count before ==="
curl -s --max-time 10 http://127.0.0.1:3000/api/journal?limit=200 | python3 -c "import sys,json; print('entries:', len(json.load(sys.stdin)['entries']))"

echo "=== open journal view ==="
agent-browser open "http://localhost:3000/?view=journal" 2>&1 | tail -1
agent-browser wait --load networkidle 2>&1 | tail -1; agent-browser wait 2000

echo "=== click Buat Jurnal ==="
agent-browser click @e7 2>&1 | tail -1; agent-browser wait 1200

echo "=== fill description + reference ==="
agent-browser fill @e9 "Penjualan tunai uji coba" 2>&1 | tail -1
agent-browser fill @e7 "TEST-001" 2>&1 | tail -1

echo "=== open first account select ==="
agent-browser click @e10 2>&1 | tail -1; agent-browser wait 1000

echo "=== find & click 1-1100 option ==="
# Use role option with name match
agent-browser find role option click --name "1-1100 — Kas & Setara Kas" 2>&1 | tail -2 || \
  agent-browser find text "Kas & Setara Kas" click 2>&1 | tail -2
agent-browser wait 800

echo "=== fill debit 5000000 ==="
agent-browser fill @e11 "5000000" 2>&1 | tail -1

echo "=== open second account select ==="
# refs may have shifted; re-snapshot
agent-browser snapshot -i 2>&1 | grep -iE "combobox|spinbutton" | head -10
