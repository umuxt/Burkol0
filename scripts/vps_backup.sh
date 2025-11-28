#!/bin/bash

# VPS Backup Script for BeePlan WebApp
# This script backs up database and important files before git operations

BACKUP_DIR="/root/beeplan_backups"
PROJECT_DIR="/root/BeePlan/WebApp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "Creating backup at $TIMESTAMP..."

# Backup database file
if [ -f "$PROJECT_DIR/db.json" ]; then
    cp "$PROJECT_DIR/db.json" "$BACKUP_DIR/db_$TIMESTAMP.json"
    echo "Database backed up to $BACKUP_DIR/db_$TIMESTAMP.json"
fi

# Backup uploads directory
if [ -d "$PROJECT_DIR/uploads" ]; then
    tar -czf "$BACKUP_DIR/uploads_$TIMESTAMP.tar.gz" -C "$PROJECT_DIR" uploads
    echo "Uploads backed up to $BACKUP_DIR/uploads_$TIMESTAMP.tar.gz"
fi

# Keep only last 10 backups
cd $BACKUP_DIR
ls -t db_*.json | tail -n +11 | xargs -r rm
ls -t uploads_*.tar.gz | tail -n +11 | xargs -r rm

echo "Backup completed successfully!"
echo "Available backups:"
ls -la $BACKUP_DIR