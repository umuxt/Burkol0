#!/bin/bash
# Auto-sync database every 5 minutes
# Add this to crontab for automatic syncing

# Crontab entry (run: crontab -e):
# */5 * * * * /Users/umutyalcin/Documents/Burkol/auto-db-sync.sh >> /Users/umutyalcin/Documents/Burkol/sync.log 2>&1

VPS_DB="/root/Burkol0/WebApp/db.json"
LOCAL_DB="/Users/umutyalcin/Documents/Burkol/WebApp/db.json"
TEMP_DB="/Users/umutyalcin/Documents/Burkol/WebApp/temp_vps_db.json"

echo "$(date): Starting auto-sync..."

# Download VPS database
scp -o StrictHostKeyChecking=no root@136.244.86.113:$VPS_DB $TEMP_DB 2>/dev/null

if [ $? -eq 0 ]; then
    # Compare file sizes/modification dates
    LOCAL_SIZE=$(stat -f%z "$LOCAL_DB" 2>/dev/null || echo "0")
    VPS_SIZE=$(stat -f%z "$TEMP_DB" 2>/dev/null || echo "0")
    
    if [ "$VPS_SIZE" -ne "$LOCAL_SIZE" ]; then
        echo "$(date): Database changes detected, syncing..."
        
        # Backup local first
        cp "$LOCAL_DB" "${LOCAL_DB}.backup.$(date +%Y%m%d_%H%M%S)"
        
        # Use VPS as master (production wins)
        cp "$TEMP_DB" "$LOCAL_DB"
        
        echo "$(date): Sync completed - VPS -> Local"
    else
        echo "$(date): No changes detected"
    fi
    
    rm -f "$TEMP_DB"
else
    echo "$(date): Failed to connect to VPS"
fi