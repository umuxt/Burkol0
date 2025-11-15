# Material Type Migration - Quick Reference Card

## 🚀 Quick Commands

```bash
# Preview migration (safe, no changes)
npm run migrate:material-types:dry

# Execute migration
npm run migrate:material-types

# Validate migration
npm run migrate:material-types -- --validate

# Rollback (migrated materials only)
npm run rollback:material-types

# Rollback preview
npm run rollback:material-types:dry
```

---

## 📊 Type Conversions

| Old Type | New Type | Category Change |
|----------|----------|-----------------|
| `wip` | `semi_finished` | `WIP` → `SEMI_FINISHED` |
| `wip_produced` | `semi_finished` | `WIP` → `SEMI_FINISHED` |
| `final_product` | `finished_product` | - |
| `raw_material` | *(unchanged)* | - |

---

## ✅ Pre-Migration Checklist

- [ ] Backup database
- [ ] Run dry-run on production
- [ ] Review dry-run output
- [ ] Schedule maintenance window (optional)
- [ ] Notify team

---

## 📋 Migration Steps

1. **Backup**: `gcloud firestore export gs://bucket/backup`
2. **Dry-run**: `npm run migrate:material-types:dry`
3. **Execute**: `npm run migrate:material-types`
4. **Verify**: Check materials page in UI
5. **Monitor**: Watch logs for 24 hours

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Permission denied | Check `config/serviceAccountKey.json` |
| No materials migrated | Run validation to check current state |
| Frontend shows old names | Clear browser cache, rebuild frontend |
| Migration fails | Check Firestore quota, review error logs |

---

## 🎯 Success Criteria

✅ Validation shows 0 legacy types  
✅ All semi_finished have `productionHistory`  
✅ Frontend tabs show correctly  
✅ Material creation works  
✅ No errors in logs  

---

## 📞 Emergency Rollback

```bash
# Option 1: Script rollback
npm run rollback:material-types

# Option 2: Database restore
gcloud firestore import gs://bucket/backup
```

---

## 📈 Typical Duration

- 100 materials: ~10 seconds
- 1,000 materials: ~30 seconds
- 10,000 materials: ~3 minutes

---

## 🔗 Documentation

- Full Guide: `scripts/MIGRATION-MATERIAL-TYPES.md`
- Implementation: `MIGRATION-IMPLEMENTATION-SUMMARY.md`
- Scripts Docs: `scripts/README.md`

---

**Need Help?** Check logs: `pm2 logs burkol-backend`
