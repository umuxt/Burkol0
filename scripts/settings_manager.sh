#!/bin/bash

# Settings Protection Script for Burkol Quote Portal
# This script preserves price calculation settings during deployments

PROJECT_DIR="/root/Burkol0/quote-portal"
SETTINGS_BACKUP="/root/burkol_settings_backup.json"
DB_FILE="$PROJECT_DIR/db.json"

# Function to backup settings
backup_settings() {
    if [ -f "$DB_FILE" ]; then
        echo "Backing up current settings..."
        jq '.settings // {}' "$DB_FILE" > "$SETTINGS_BACKUP"
        echo "Settings backed up to $SETTINGS_BACKUP"
    else
        echo "No database file found to backup settings from"
    fi
}

# Function to restore settings
restore_settings() {
    if [ -f "$SETTINGS_BACKUP" ] && [ -f "$DB_FILE" ]; then
        echo "Restoring settings from backup..."
        # Read settings from backup
        SETTINGS_JSON=$(cat "$SETTINGS_BACKUP")
        
        # Merge settings into current db.json
        jq --argjson settings "$SETTINGS_JSON" '.settings = $settings' "$DB_FILE" > "$DB_FILE.tmp"
        mv "$DB_FILE.tmp" "$DB_FILE"
        
        echo "Settings restored successfully"
        echo "Restored settings:"
        jq '.settings' "$DB_FILE"
    else
        echo "Cannot restore settings - backup or database file not found"
    fi
}

# Function to show current settings
show_settings() {
    if [ -f "$DB_FILE" ]; then
        echo "Current settings in database:"
        jq '.settings' "$DB_FILE"
    else
        echo "No database file found"
    fi
}

# Main script logic
case "$1" in
    backup)
        backup_settings
        ;;
    restore)
        restore_settings
        ;;
    show)
        show_settings
        ;;
    *)
        echo "Usage: $0 {backup|restore|show}"
        echo "  backup  - Backup current settings"
        echo "  restore - Restore settings from backup"
        echo "  show    - Show current settings"
        exit 1
        ;;
esac