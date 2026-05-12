#!/bin/bash
cd /Users/home/.openclaw/workspace/Projects/restaurant-reservation
export DATABASE_URL="postgresql://neondb_owner:npg_SflcC8FZnyU2@ep-rapid-poetry-a7ar4pw4.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"
npx prisma db seed 2>&1 || true
