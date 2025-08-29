#!/usr/bin/env bash
BASE=${1:-http://localhost:3000}
SID=$(curl -s -X POST $BASE/session/start | jq -r .session_id)
say(){ echo -e "\n>> $1"; curl -s -X POST $BASE/chat -H "Content-Type: application/json" -d "{"session_id":"$SID","message":"$1"}" | jq; }
say "Bonjour"
say "Je m'appelle Paul, société TOTO, mail paul@example.com, tel 0600000000, CP 33000"
say "Usage pro, 10 modules MOD-845x1200, budget 5000"
say "Plan hexagone diamètre 3000 mm"
say "1er choix pour les modules"
say "Livraison à 75010, 1200 kg, 2.4 m3"
