#!/bin/bash

# Burkol Quote Portal - Standard Local Development Setup
# STANDARD: Backend (API) on 3000, Frontend (React+Vite) on 3001

echo "🚀 Burkol Quote Portal - Standard Development Setup"
echo ""
echo "📋 PORT ASSIGNMENT STANDARD:"
echo "   🔧 Backend (Express API): http://localhost:3000"
echo "   ⚛️  Frontend (React+Vite): http://localhost:3001"
echo ""

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
sleep 2

# Navigate to project directory
cd /Users/umutyalcin/Documents/Burkol/quote-portal

# Start both servers
echo "🎯 Starting both servers with standard configuration..."
npm run start:both

echo ""
echo "✅ DEVELOPMENT READY:"
echo "   🔧 Backend API: http://localhost:3000/api/*"
echo "   ⚛️  Main App: http://localhost:3001/"
echo "   👑 Admin Panel: http://localhost:3001/quote-dashboard.html"
echo "   ⚙️  Settings: http://localhost:3001/settings.html"
echo ""
echo "💡 Always use Frontend URLs (3001) for React components"