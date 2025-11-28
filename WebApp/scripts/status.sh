#!/bin/bash

# BURKOL Quote Portal - System Status Check

echo "📊 BURKOL Quote Portal - System Status"
echo "========================================"

cd /Users/umutyalcin/Documents/Burkol/WebApp

# Check service status
echo ""
echo "🔍 Service Status:"
if lsof -i :3000 >/dev/null 2>&1; then
    BACKEND_PID=$(lsof -t -i:3000)
    echo "✅ Backend (port 3000): Running (PID: $BACKEND_PID)"
else
    echo "❌ Backend (port 3000): Not running"
fi

if lsof -i :3001 >/dev/null 2>&1; then
    FRONTEND_PID=$(lsof -t -i:3001)
    echo "✅ Frontend (port 3001): Running (PID: $FRONTEND_PID)"
else
    echo "❌ Frontend (port 3001): Not running"
fi

# Test connectivity
echo ""
echo "🌐 Connectivity Tests:"

# Test backend API
if curl -s http://localhost:3000/api/quotes >/dev/null 2>&1; then
    echo "✅ Backend API: Responding"
else
    echo "❌ Backend API: Not responding"
fi

# Test frontend
if curl -s http://localhost:3001/ >/dev/null 2>&1; then
    echo "✅ Frontend: Responding"
else
    echo "❌ Frontend: Not responding"
fi

# Test admin panel
if curl -s http://localhost:3001/quote-dashboard.html >/dev/null 2>&1; then
    echo "✅ Admin Panel: Accessible"
else
    echo "❌ Admin Panel: Not accessible"
fi

echo ""
echo "🔗 Quick Access URLs:"
echo "   Frontend: http://localhost:3001/"
echo "   Admin Panel: http://localhost:3001/quote-dashboard.html"
echo "   API Test: http://localhost:3000/api/quotes"

echo ""
echo "🛠️  Available Scripts:"
echo "   ./start-dev.sh    - Start development environment"
echo "   ./clear-cache.sh  - Clear all caches"
echo "   ./status.sh       - Show this status (current script)"

echo ""
if lsof -i :3000 >/dev/null 2>&1 && lsof -i :3001 >/dev/null 2>&1; then
    echo "🎉 System Status: ALL SERVICES RUNNING"
else
    echo "⚠️  System Status: SOME SERVICES DOWN"
    echo "💡 Run ./start-dev.sh to start missing services"
fi