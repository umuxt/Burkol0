#!/bin/bash

# VPS Deployment Script for Burkol Quote Portal
# This script safely deploys updates while preserving data

PROJECT_DIR="/root/Burkol0"
BACKUP_SCRIPT="/root/Burkol0/vps_backup.sh"

echo "Starting safe deployment process..."

# Navigate to project directory
cd $PROJECT_DIR

# Backup settings before deployment
SETTINGS_MANAGER="/root/Burkol0/settings_manager.sh"
if [ -f "$SETTINGS_MANAGER" ]; then
    echo "Backing up price calculation settings..."
    bash "$SETTINGS_MANAGER" backup
fi

# Run backup before deployment
if [ -f "$BACKUP_SCRIPT" ]; then
    echo "Running full backup..."
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

# Restore critical data files and preserve settings
BACKUP_DIR="/root/burkol_backups"
LATEST_DB_BACKUP=$(ls -t $BACKUP_DIR/db_*.json 2>/dev/null | head -1)
DB_FILE="quote-portal/db.json"

# Create a temporary file to merge settings
TEMP_SETTINGS="/tmp/temp_settings.json"

# Extract settings from backup if exists
if [ -f "$LATEST_DB_BACKUP" ]; then
    echo "Extracting settings from backup..."
    jq '.settings // {}' "$LATEST_DB_BACKUP" > "$TEMP_SETTINGS"
fi

# If db.json doesn't exist, restore it from backup
if [ -f "$LATEST_DB_BACKUP" ] && [ ! -f "$DB_FILE" ]; then
    echo "Restoring database from backup: $LATEST_DB_BACKUP"
    cp "$LATEST_DB_BACKUP" "$DB_FILE"
elif [ -f "$DB_FILE" ] && [ -f "$TEMP_SETTINGS" ]; then
    # Merge preserved settings into current db.json
    echo "Merging preserved settings..."
    jq --argjson settings "$(cat $TEMP_SETTINGS)" '.settings = $settings' "$DB_FILE" > "$DB_FILE.tmp"
    mv "$DB_FILE.tmp" "$DB_FILE"
    echo "Settings merged successfully"
fi

# Clean up temporary file
rm -f "$TEMP_SETTINGS"

# Restart PM2 service
echo "Restarting burkol-backend service..."
pm2 restart burkol-backend

# Restore settings after deployment
if [ -f "$SETTINGS_MANAGER" ]; then
    echo "Restoring price calculation settings..."
    bash "$SETTINGS_MANAGER" restore
    echo "Current settings after restore:"
    bash "$SETTINGS_MANAGER" show
fi

echo "Deployment completed successfully!"
pm2 status burkol-backend