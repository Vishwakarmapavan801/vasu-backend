#!/usr/bin/env bash
# Render.com startup script
set -e

echo "=== Vasu Realty Production Deploy ==="

echo "Running database migrations..."
node src/db/run-migration-v9.js
node src/db/run-migration-v10.js
node src/db/run-migration-v11.js

echo "Starting server..."
node src/server.js
