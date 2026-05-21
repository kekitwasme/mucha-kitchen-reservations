#!/bin/bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to seed the database."
  exit 1
fi

npx prisma db seed
