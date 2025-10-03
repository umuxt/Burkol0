#!/bin/bash

# BURKOL Quote Portal - Development Startup Script
# This script handles cache cleanup and stable service startup

echo "🔧 BURKOL Quote Portal - Starting Development Environment"

# Navigate to project directory
cd /Users/umutyalcin/Documents/Burkol/quote-portal

# Clear all cache directories to prevent cache-related issues
echo "🧹 Clearing cache directories..."
rm -rf node_modules/.vite 2>/dev/null
rm -rf node_modules/.cache 2>/dev/null 
rm -rf .vite 2>/dev/null
rm -rf dist 2>/dev/null
rm -rf ~/.vite 2>/dev/null

# Clear npm cache
echo "🧹 Clearing npm cache..."
npm cache clean --force 2>/dev/null

# Clear browser cache suggestions
echo "💡 To clear browser cache:"
echo "   - Safari: ⌘+⌥+E (Empty Caches)"
echo "   - Chrome: ⌘+Shift+Delete"
echo "   - Firefox: ⌘+Shift+Delete"

echo "✅ Cache cleanup completed"

# Check if backend is running
if lsof -i :3000 >/dev/null 2>&1; then
    echo "✅ Backend already running on port 3000"
else
    echo "🚀 Starting backend on port 3000..."
    PORT=3000 NODE_ENV=development node server.js &
    BACKEND_PID=$!
    echo "✅ Backend started with PID: $BACKEND_PID"
fi

# Wait a moment for backend to stabilize
sleep 2

# Check if frontend is running
if lsof -i :3001 >/dev/null 2>&1; then
    echo "✅ Frontend already running on port 3001"
else
    echo "🚀 Starting frontend on port 3001..."
    npm run dev &
    FRONTEND_PID=$!
    echo "✅ Frontend started with PID: $FRONTEND_PID"
fi

# Wait for services to start
sleep 3

# Verify services are running
echo ""
echo "🔍 Service Status:"
if lsof -i :3000 >/dev/null 2>&1; then
    echo "✅ Backend (port 3000): Running"
else
    echo "❌ Backend (port 3000): Not running"
fi

if lsof -i :3001 >/dev/null 2>&1; then
    echo "✅ Frontend (port 3001): Running"
else
    echo "❌ Frontend (port 3001): Not running"
fi

echo ""
echo "🌐 Access URLs:"
echo "   Frontend: http://localhost:3001/"
echo "   Admin Panel: http://localhost:3001/panel-gizli.html"
echo "   API Status: http://localhost:3000/api/quotes"
echo ""
echo "📝 Troubleshooting:"
echo "   1. If pages show blank/white: Clear browser cache"
echo "   2. If Safari shows connection errors: Check port status with 'lsof -i :3001'"
echo "   3. To restart services: Kill processes and run this script again"
echo ""
echo "🛑 To stop services:"
echo "   Backend: kill \$(lsof -t -i:3000)"
echo "   Frontend: kill \$(lsof -t -i:3001)"