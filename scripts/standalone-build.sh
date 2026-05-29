#!/usr/bin/env sh
set -eu

npm ci
npm run build
npm prune --omit=dev

echo "Standalone build complete. Start with: npm start"
