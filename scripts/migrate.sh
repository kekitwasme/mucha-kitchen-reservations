#!/bin/bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to run migrations."
  exit 1
fi

npx prisma migrate deploy
