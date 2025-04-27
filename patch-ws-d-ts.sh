#!/bin/bash
# This is an ugly and terrible hack to allow proper interoperability of the `ws` module,
# which is, sadly, a CommonJS module. The issue is that module publishes its types
# nested under the `default` export, which breaks `esInterop` compatibility.

FILE="./lib/ws.d.ts"

if [ -f "$FILE" ]; then
  sed -i '' 's/import \* as ws from '\''ws'\'';/import ws from '\''ws'\'';/g' "$FILE"
fi
