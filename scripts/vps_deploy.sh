#!/bin/bash

# VPS Deployment Script for Burkol Quote Portal (Node.js Backend)
# Frontend is deployed on Vercel. This script only handles the backend.
# VPS IP: 136.244.86.113

echo "🚀 Starting VPS deployment..."

ssh root@136.244.86.113 << 'EOF'
set -e  # Exit on any error

PROJECT_DIR="/root/Burkol0"
BACKEND_DIR="$PROJECT_DIR/WebApp"
PM2_PROCESS_NAME="burkol" # Matching ecosystem.config.js process name

echo "--- Starting Backend Deployment ---"

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Project directory not found. Cloning repository..."
    cd /root
    git clone https://github.com/umuxt/Burkol0.git
fi

# Navigate to project directory
cd $PROJECT_DIR || { echo "❌ Failed to enter project directory. Aborting."; exit 1; }

# Check git status and pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git fetch origin main
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Local changes detected, stashing..."
    git stash
fi
git pull origin main

# Navigate to the backend directory
cd $BACKEND_DIR || { echo "❌ Failed to enter backend directory. Aborting."; exit 1; }

# Create logs directory if it doesn't exist
mkdir -p logs

echo "📦 Installing/updating backend dependencies..."
npm install --production

# Check if PM2 process exists
if pm2 describe $PM2_PROCESS_NAME > /dev/null 2>&1; then
    echo "🔄 Restarting existing PM2 process..."
    pm2 restart $PM2_PROCESS_NAME
else
    echo "🚀 Starting new PM2 process..."
    pm2 start ecosystem.config.js
fi

echo "✅ Backend Deployment Finished!"
echo "📊 PM2 Status:"
pm2 status
echo "📝 Recent logs:"
pm2 logs $PM2_PROCESS_NAME --lines 10
EOF

echo "✅ VPS deployment completed!"
