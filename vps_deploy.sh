#!/bin/bash

# VPS Deployment Script for Burkol Quote Portal (Node.js Backend)
# Frontend is deployed on Vercel. This script only handles the backend.
# VPS IP: 136.244.86.113

ssh root@136.244.86.113 << 'EOF'
PROJECT_DIR="/root/Burkol0"
BACKEND_DIR="$PROJECT_DIR/quote-portal"
PM2_PROCESS_NAME="burkol" # Matching ecosystem.config.js process name

echo "--- Starting Backend Deployment ---"

# Navigate to project directory
cd $PROJECT_DIR || { echo "Failed to enter project directory. Aborting."; exit 1; }

# Pull latest changes from the main branch
echo "Pulling latest changes from GitHub..."
git stash
git pull origin main

# Navigate to the backend directory
cd $BACKEND_DIR || { echo "Failed to enter backend directory. Aborting."; exit 1; }

echo "Installing/updating backend dependencies..."
npm install

echo "Restarting backend server with PM2..."
pm2 restart $PM2_PROCESS_NAME

echo "--- Backend Deployment Finished ---"
pm2 status
pm2 logs $PM2_PROCESS_NAME --lines 15
EOF
