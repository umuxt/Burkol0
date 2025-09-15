#!/bin/bash

# VPS Deployment Script for Burkol Quote Portal
# This script safely deploys updates while preserving data

PROJECT_DIR="/root/Burkol0"
BACKUP_SCRIPT="/root/Burkol0/vps_backup.sh"

echo "Starting safe deployment process..."

# Navigate to project directory
cd $PROJECT_DIR

# Run backup before deployment
if [ -f "$BACKUP_SCRIPT" ]; then
    echo "Running backup..."
    bash $BACKUP_SCRIPT
else
    echo "Warning: Backup script not found, creating manual backup..."
    mkdir -p /root/burkol_backups
    if [ -f "quote-portal/db.json" ]; then
        cp quote-portal/db.json /root/burkol_backups/db_manual_$(date +%Y%m%d_%H%M%S).json
        echo "Manual backup created"
    fi
fi

# Stash any local changes
echo "Stashing local changes..."
git stash

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main

# Restore critical data files if they were overwritten
BACKUP_DIR="/root/burkol_backups"
LATEST_DB_BACKUP=$(ls -t $BACKUP_DIR/db_*.json 2>/dev/null | head -1)

if [ -f "$LATEST_DB_BACKUP" ] && [ ! -f "quote-portal/db.json" ]; then
    echo "Restoring database from backup: $LATEST_DB_BACKUP"
    cp "$LATEST_DB_BACKUP" "quote-portal/db.json"
fi

# Restart PM2 service
echo "Restarting burkol-backend service..."
pm2 restart burkol-backend

echo "Deployment completed successfully!"
pm2 status burkol-backend