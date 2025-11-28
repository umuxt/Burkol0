#!/bin/bash
# Database sync scripts for BeePlan project

# Download database from VPS to local
download_db() {
    echo "📥 Downloading database from VPS..."
    scp root@136.244.86.113:/root/BeePlan/WebApp/db.json /Users/umutyalcin/Documents/BeePlan/WebApp/db_vps_backup.json
    echo "✅ Database downloaded to db_vps_backup.json"
}

# Upload local database to VPS
upload_db() {
    echo "📤 Uploading database to VPS..."
    scp /Users/umutyalcin/Documents/BeePlan/WebApp/db.json root@136.244.86.113:/root/BeePlan/WebApp/db.json
    ssh root@136.244.86.113 "pm2 restart WebApp"
    echo "✅ Database uploaded and server restarted"
}

# Backup VPS database
backup_vps_db() {
    echo "💾 Creating VPS database backup..."
    ssh root@136.244.86.113 "cp /root/BeePlan/WebApp/db.json /root/BeePlan/WebApp/db_backup_$(date +%Y%m%d_%H%M%S).json"
    echo "✅ VPS database backed up"
}

# Show database differences
compare_db() {
    echo "🔍 Comparing local and VPS databases..."
    download_db
    echo "Local users:"
    jq '.users | keys' /Users/umutyalcin/Documents/BeePlan/WebApp/db.json
    echo "VPS users:"
    jq '.users | keys' /Users/umutyalcin/Documents/BeePlan/WebApp/db_vps_backup.json
}

# Main menu
case "$1" in
    "download")
        download_db
        ;;
    "upload")
        backup_vps_db
        upload_db
        ;;
    "compare")
        compare_db
        ;;
    *)
        echo "Usage: $0 {download|upload|compare}"
        echo "  download - Download VPS database to local"
        echo "  upload   - Upload local database to VPS (with backup)"
        echo "  compare  - Compare local and VPS databases"
        ;;
esac