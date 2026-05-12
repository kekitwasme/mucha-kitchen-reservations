#!/bin/bash
# Start the restaurant reservation system locally

echo "🍽️  Restaurant Reservation System"
echo "=================================="

# Check postgres is running
if ! pg_isready >/dev/null 2>&1; then
  echo "⚠️  PostgreSQL is not running. Starting it..."
  brew services start postgresql@16
  sleep 3
fi

echo "✅ PostgreSQL running"

# Check database exists
if ! psql -d restaurant -c "SELECT 1" >/dev/null 2>&1; then
  echo "Creating database 'restaurant'..."
  createdb restaurant
  echo "Running migrations..."
  npx prisma migrate dev --name init
  echo "Seeding data..."
  npx prisma db seed
else
  echo "✅ Database 'restaurant' exists"
fi

echo ""
echo "🚀 Starting Next.js dev server on http://localhost:3000"
echo ""
echo "📱 Public booking:    http://localhost:3000/book"
echo "🔒 Staff login:        http://localhost:3000/login"
echo "📋 Reservations:      http://localhost:3000/staff/reservations"
echo "🗺️  Floor plan:        http://localhost:3000/staff/floor-plan"
echo ""

npm run dev
