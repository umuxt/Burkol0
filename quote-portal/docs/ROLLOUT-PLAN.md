# Canonical Model Rollout Plan

## Executive Summary

This document outlines the staged rollout plan for deploying the canonical MES data model (`nodes[]` as single source of truth) to production. The rollout is designed to minimize risk through incremental deployment, comprehensive testing, and built-in rollback mechanisms.

**Total Duration:** 6 weeks  
**Feature Flag:** `FEATURE_USE_CANONICAL_NODES`  
**Rollback Time:** < 5 minutes (disable feature flag and restart)

---

## Timeline Overview

| Phase | Duration | Goal | Status |
|-------|----------|------|--------|
| Phase 1: Development & Testing | 1 week | Complete code changes and testing | ✅ COMPLETED |
| Phase 2: Staging Deployment | 1 week | Deploy to staging, test with real data | 🔄 PENDING |
| Phase 3: Production Pilot | 1 week | Pilot with 5-10 low-risk orders | 🔄 PENDING |
| Phase 4: Full Rollout | 2 weeks | Migrate all plans, monitor stability | 🔄 PENDING |
| Phase 5: Cleanup | 1 week | Remove deprecated code and data | 🔄 PENDING |

---

## Phase 1: Development & Testing (Week 1) ✅

### Objectives
- Complete all code changes (frontend + backend)
- Implement feature flags and validation
- Run comprehensive test suite
- Conduct manual testing in development environment
- Complete code review

### Tasks Completed

#### Backend Changes
- [x] Implement canonical `nodes[]` schema in mesRoutes.js
- [x] Add `enrichNodesWithEstimatedTimes()` with efficiency calculations
- [x] Implement `validateProductionPlanNodes()` with JSON Schema validation
- [x] Add material reservation with partial reservation handling
- [x] Implement consumption capping at `actualReservedAmounts`
- [x] Add metrics collection (reservation_mismatch, validation_error, etc.)
- [x] Implement backward compatibility (executionGraph fallback)

#### Frontend Changes
- [x] Update planDesigner.js to send canonical node fields
- [x] Remove executionGraph from save payload
- [x] Map deprecated fields (time → nominalTime, skills → requiredSkills)

#### Testing
- [x] 17 unit tests implemented (all passing)
- [x] 3 integration tests for end-to-end scenarios
- [x] Manual test scenarios documented (TEST-SCENARIOS.md)
- [x] Metrics API endpoints tested

#### Documentation
- [x] API contract changes documented
- [x] Migration strategy documented
- [x] Test scenarios documented
- [x] Rollout plan created (this document)

### Exit Criteria
- ✅ All unit tests passing (17/17)
- ✅ Integration tests passing
- ✅ Code review approved
- ✅ Manual testing completed in dev environment
- ✅ Feature flags implemented and tested

---

## Phase 2: Staging Deployment (Week 2)

### Objectives
- Deploy backend and frontend to staging environment
- Test with staging database (real data structure)
- Run migration dry-run
- Enable feature flag and validate behavior
- Monitor metrics for anomalies

### Pre-Deployment Checklist

#### Backup
- [ ] Take full Firestore backup of staging database
- [ ] Document backup location and restore procedure
- [ ] Test backup restoration (on separate test instance)

#### Configuration
- [ ] Set `FEATURE_USE_CANONICAL_NODES=false` in staging .env (disabled initially)
- [ ] Set `FEATURE_ENABLE_VALIDATION=true` in staging .env
- [ ] Verify environment variables loaded correctly

#### Deployment
- [ ] Deploy backend changes to staging
- [ ] Deploy frontend changes to staging
- [ ] Verify both services are running
- [ ] Check server logs for errors

### Testing Activities

#### Migration Dry-Run
```bash
# SSH to staging server
ssh staging-server

# Navigate to project directory
cd /path/to/quote-portal

# Run migration dry-run
node scripts/migrateExecutionGraphToNodes.js --dry-run

# Review output for:
# - Number of plans to migrate
# - Any validation errors
# - Field mapping issues
```

**Expected Output:**
```
Migration Dry-Run Report
========================
Total plans: 150
Already migrated (have nodes[]): 0
Will migrate (have executionGraph[]): 150
Errors: 0

Sample conversions:
Plan PLAN-1224-001: 5 nodes → 5 canonical nodes ✓
Plan PLAN-1224-002: 8 nodes → 8 canonical nodes ✓
...
```

#### Feature Flag Testing (Disabled State)
- [ ] Create new production plan via UI
- [ ] Verify plan saves with canonical nodes
- [ ] Launch plan → verify assignments created
- [ ] Check server logs: should show "Using nodes (canonical model)"
- [ ] Start/complete assignment → verify material flows work

#### Feature Flag Testing (Transition to Enabled)
```bash
# Update staging .env
FEATURE_USE_CANONICAL_NODES=true

# Restart backend
pm2 restart burkol-backend
```

- [ ] Load existing plan with executionGraph → should use fallback
- [ ] Check logs: should show deprecation warning
- [ ] Create new plan → should use canonical nodes
- [ ] Launch new plan → verify effectiveTime computed correctly
- [ ] Monitor metrics endpoint: `GET /api/mes/metrics`

#### Metrics to Monitor
```bash
# Check metrics API
curl -X GET http://staging.example.com/api/mes/metrics

# Expected response:
{
  "metrics": {
    "reservation_mismatch_count": 0,
    "plan_using_executionGraph_count": 150, // Old plans
    "consumption_capped_count": 0,
    "validation_error_count": 0
  }
}
```

#### Load Testing (Optional)
- [ ] Run load test: create 10 plans simultaneously
- [ ] Run load test: launch 5 plans simultaneously
- [ ] Measure API response times (compare to baseline)

### Success Criteria
- [ ] All existing functionality works with feature flag disabled
- [ ] New canonical model works with feature flag enabled
- [ ] Backward compatibility verified (old plans load correctly)
- [ ] Migration dry-run completes without errors
- [ ] Metrics show < 1% validation errors
- [ ] API response times within 10% of baseline

### Rollback Procedure (Phase 2)
If issues are detected:
1. Disable feature flag: `FEATURE_USE_CANONICAL_NODES=false`
2. Restart backend: `pm2 restart burkol-backend`
3. Verify service restored (test plan creation and launch)
4. Investigate root cause in logs
5. Fix issues and repeat Phase 2

---

## Phase 3: Production Pilot (Week 3)

### Objectives
- Deploy to production with feature flag disabled
- Run read-only migration analysis on production data
- Select and migrate 5-10 pilot plans
- Monitor pilot plans closely
- Collect operator feedback

### Pre-Deployment Checklist

#### Backup (Critical)
- [ ] **Take full Firestore production backup**
- [ ] Store backup in secure location with retention policy
- [ ] Document backup timestamp and restore procedure
- [ ] Test restore on separate instance (mandatory)

#### Communication
- [ ] Notify team of deployment window (off-peak hours)
- [ ] Prepare incident response team (on-call)
- [ ] Notify operators about pilot testing
- [ ] Share rollback contact information

#### Monitoring Setup
- [ ] Set up alerting for validation errors > 1%
- [ ] Set up alerting for API response time > 2x baseline
- [ ] Set up alerting for reservation mismatches > 5%
- [ ] Configure log aggregation (e.g., CloudWatch, Datadog)

### Deployment

#### Production Deploy
```bash
# Deploy backend (feature flag disabled)
git pull origin production
npm install
pm2 restart burkol-backend

# Deploy frontend
npm run build
# Deploy to hosting (Vercel/Firebase/etc.)
```

- [ ] Verify services running
- [ ] Check logs for startup errors
- [ ] Test basic functionality (create plan, launch, start, complete)

#### Migration Analysis (Read-Only)
```bash
# SSH to production server
ssh production-server

# Run migration dry-run (READ ONLY - NO WRITES)
node scripts/migrateExecutionGraphToNodes.js --dry-run > migration-analysis.txt

# Review output
cat migration-analysis.txt
```

**Review Checklist:**
- [ ] Total plans to migrate
- [ ] Any plans with validation errors (investigate)
- [ ] Any plans with missing operationId (data cleanup needed)
- [ ] Any plans with circular dependencies (edge case)

**Action Items:**
- If validation errors found: document and fix data issues before proceeding
- If > 5% plans have issues: escalate to team lead for review

### Pilot Selection

#### Criteria for Pilot Plans
- Order quantity < 100 units (low risk)
- Simple workflow (< 5 operations)
- Non-urgent deadline (can afford delays)
- Available materials (no stock shortages)
- Experienced operator assigned (can provide feedback)

#### Pilot Plans Selection Process
```bash
# Query Firestore for candidate plans
# Use Firebase console or script to find:
# - status = 'draft'
# - quantity < 100
# - nodes.length < 5
# - no material stock issues
```

**Selected Pilot Plans:** (to be filled during Phase 3)
1. Plan ID: __________, Order: __________, Quantity: ____, Operations: ____
2. Plan ID: __________, Order: __________, Quantity: ____, Operations: ____
3. Plan ID: __________, Order: __________, Quantity: ____, Operations: ____
4. Plan ID: __________, Order: __________, Quantity: ____, Operations: ____
5. Plan ID: __________, Order: __________, Quantity: ____, Operations: ____

### Pilot Migration

#### Migrate Pilot Plans
```bash
# Enable feature flag for production
FEATURE_USE_CANONICAL_NODES=true

# Restart backend
pm2 restart burkol-backend

# Migrate selected pilot plans one by one
node scripts/migrateExecutionGraphToNodes.js --execute --planId=PLAN-XXXX-001

# Verify migration
node scripts/migrateExecutionGraphToNodes.js --dry-run --planId=PLAN-XXXX-001
# Should show: "Already migrated"
```

#### Monitor Pilot Plans (Daily Checklist)
- [ ] Check metrics API for anomalies
- [ ] Review server logs for errors related to pilot plans
- [ ] Monitor assignment creation time (should be similar to baseline)
- [ ] Check material reservation accuracy (should have < 5% mismatches)
- [ ] Check operator feedback (any UI issues?)

#### Collect Feedback
**Operator Feedback Form:** (shared with operators)
- How easy was it to use the new plan interface?
- Did you encounter any errors or unexpected behavior?
- Were material reservations accurate?
- Did efficiency calculations seem correct?
- Any suggestions for improvement?

### Success Criteria
- [ ] All 5-10 pilot plans completed successfully
- [ ] Zero data corruption incidents
- [ ] Reservation mismatch rate < 5%
- [ ] Validation error rate < 1%
- [ ] API response times within 10% of baseline
- [ ] Positive operator feedback (no major issues)
- [ ] No rollbacks required during pilot period

### Rollback Procedure (Phase 3)

#### Immediate Rollback (< 5 minutes)
If critical issue detected:
```bash
# Disable feature flag
FEATURE_USE_CANONICAL_NODES=false

# Restart backend immediately
pm2 restart burkol-backend

# Verify service restored
curl http://production.example.com/health
```

#### Data Rollback (if corruption suspected)
```bash
# Restore Firestore from backup
gcloud firestore import gs://backup-bucket/backup-timestamp

# Or use Firebase console:
# Firestore → Manage → Import/Export → Restore from backup
```

**Escalation:**
- If rollback needed: notify team lead immediately
- Document root cause analysis
- Fix issues in staging environment
- Restart Phase 3 after fixes validated

---

## Phase 4: Full Rollout (Weeks 4-5)

### Objectives
- Migrate all production plans to canonical model
- Enable feature flag globally
- Monitor for 1 week with fallback ready
- Remove fallback code after stability confirmed

### Pre-Rollout Checklist

#### Pilot Review
- [ ] Pilot phase completed successfully (all success criteria met)
- [ ] No critical issues reported
- [ ] Operator feedback positive
- [ ] Team lead approval obtained

#### Backup (Critical)
- [ ] **Take fresh full Firestore production backup**
- [ ] Verify backup integrity
- [ ] Document restore procedure
- [ ] Assign backup restoration owner

#### Communication
- [ ] Schedule maintenance window (off-peak, e.g., Sunday 2 AM)
- [ ] Notify all stakeholders 48 hours in advance
- [ ] Prepare status update messages (success/failure templates)
- [ ] Brief incident response team

### Full Migration

#### Migration Execution
**Scheduled Time:** Sunday, [DATE], 02:00 AM (2-hour window)

**Team on Call:**
- Deployment Lead: __________
- Backend Engineer: __________
- Database Admin: __________
- On-Call Support: __________

**Migration Steps:**
```bash
# 1. Final backup before migration
timestamp=$(date +%Y%m%d_%H%M%S)
gcloud firestore export gs://backup-bucket/pre-migration-$timestamp

# 2. Verify backup completed
gsutil ls gs://backup-bucket/pre-migration-$timestamp

# 3. Run migration script (all plans)
node scripts/migrateExecutionGraphToNodes.js --execute | tee migration-log.txt

# Expected duration: ~10-30 minutes for 500 plans
# Monitor output for errors

# 4. Verify migration results
grep "ERROR" migration-log.txt
# Should show: 0 errors

# 5. Run validation check
node scripts/migrateExecutionGraphToNodes.js --dry-run
# Should show: "All plans already migrated"

# 6. Enable feature flag globally
FEATURE_USE_CANONICAL_NODES=true

# 7. Restart backend
pm2 restart burkol-backend

# 8. Smoke test
npm run test:smoke
```

**Migration Report Template:**
```
Migration Execution Report
==========================
Date: [DATE]
Start Time: 02:00 AM
End Time: [TIME]
Duration: [MINUTES] minutes

Plans Processed: [TOTAL]
Successfully Migrated: [COUNT]
Errors: [COUNT]

Validation Errors: [COUNT]
Data Issues Fixed: [COUNT]

Feature Flag Enabled: Yes
Backend Restarted: Yes
Smoke Tests: [PASS/FAIL]

Status: [SUCCESS/PARTIAL/FAILED]
```

### Monitoring (Week 4)

#### Daily Monitoring Checklist
**Morning (9 AM):**
- [ ] Check metrics API for overnight activity
- [ ] Review server logs for errors
- [ ] Check API response times (compare to baseline)
- [ ] Review any operator reports

**Evening (6 PM):**
- [ ] Review day's metrics summary
- [ ] Check for any anomalies
- [ ] Update status report

#### Metrics Dashboard (to monitor)
```bash
# Reservation mismatch rate
curl http://production/api/mes/metrics | jq '.metrics.reservation_mismatch_count'
# Target: < 5% of total starts

# Validation errors
curl http://production/api/mes/metrics | jq '.metrics.validation_error_count'
# Target: < 1% of total plan creations

# Plans using executionGraph fallback
curl http://production/api/mes/metrics | jq '.metrics.plan_using_executionGraph_count'
# Should be 0 after migration

# Consumption capping events
curl http://production/api/mes/metrics | jq '.metrics.consumption_capped_count'
# Target: < 2% of total completions
```

#### Alert Thresholds
- **Critical:** Validation error rate > 5% → immediate investigation
- **Warning:** Reservation mismatch rate > 10% → review within 2 hours
- **Info:** API response time > 1.5x baseline → monitor trend

### Remove Fallback Code (Week 5)

#### Criteria for Fallback Removal
- [ ] 1 week of stable operation (no rollbacks)
- [ ] Metrics within acceptable ranges
- [ ] Zero critical incidents
- [ ] All plans migrated (executionGraph fallback count = 0)
- [ ] Team lead approval

#### Code Cleanup Tasks
```javascript
// In mesRoutes.js - REMOVE these lines after Week 5:

// Remove executionGraph fallback logic:
// OLD CODE (to be removed):
const nodesToUse = plan.nodes || plan.executionGraph;
if (plan.executionGraph && !plan.nodes) {
  console.warn('Using deprecated executionGraph');
}

// NEW CODE (after cleanup):
const nodesToUse = plan.nodes; // Only use canonical nodes
if (!nodesToUse) {
  throw new Error('Plan has no nodes (data corruption)');
}
```

**Files to Clean Up:**
- `/server/mesRoutes.js` — remove executionGraph fallback
- `/domains/production/js/planDesigner.js` — remove legacy field mappings (time, skills)
- `/server/models/` — update schemas to remove deprecated fields

**Commit Message:**
```
refactor: remove executionGraph fallback code after successful migration
```

### Success Criteria
- [ ] All plans migrated successfully (100% coverage)
- [ ] 1 week of stable operation with feature flag enabled
- [ ] Metrics within acceptable thresholds:
  - Reservation mismatch < 5%
  - Validation errors < 1%
  - API response times < 10% increase
- [ ] Zero rollbacks required
- [ ] Fallback code removed after stability confirmed

### Rollback Procedure (Phase 4)

#### Quick Rollback (if issues detected in first 48 hours)
```bash
# 1. Disable feature flag
FEATURE_USE_CANONICAL_NODES=false

# 2. Restart backend
pm2 restart burkol-backend

# 3. Verify fallback working (old plans use executionGraph)
npm run test:smoke

# 4. Notify team and investigate
```

#### Full Rollback (if data corruption detected)
```bash
# 1. Disable feature flag
FEATURE_USE_CANONICAL_NODES=false

# 2. Restore database from pre-migration backup
gcloud firestore import gs://backup-bucket/pre-migration-[TIMESTAMP]

# 3. Restart backend
pm2 restart burkol-backend

# 4. Verify data integrity
npm run test:smoke

# 5. Investigate and fix root cause
```

**Post-Rollback Actions:**
1. Conduct root cause analysis
2. Document lessons learned
3. Fix issues in staging
4. Re-validate Phase 3 pilot
5. Schedule new Phase 4 rollout

---

## Phase 5: Cleanup (Week 6)

### Objectives
- Remove deprecated `executionGraph` fields from database
- Remove fallback code from codebase
- Update all documentation
- Archive migration scripts

### Database Cleanup

#### Remove Deprecated Fields
**Warning:** Only proceed after Phase 4 stability confirmed (1+ week)

```bash
# Create cleanup script: scripts/cleanupDeprecatedFields.js
node scripts/cleanupDeprecatedFields.js --dry-run

# Review output (should show plans with executionGraph to remove)

# Execute cleanup (irreversible!)
node scripts/cleanupDeprecatedFields.js --execute

# Verify cleanup
node scripts/cleanupDeprecatedFields.js --dry-run
# Should show: "No deprecated fields found"
```

**Fields to Remove:**
- `plan.executionGraph` → removed (canonical `nodes[]` is source of truth)
- `plan._migration` → can be archived or removed after 6 months

### Codebase Cleanup

#### Remove Fallback Code
- [ ] Remove executionGraph fallback logic from mesRoutes.js
- [ ] Remove legacy field mappings (time, skills) from planDesigner.js
- [ ] Remove deprecated field support in validation schemas
- [ ] Remove conversion functions (convertExecutionGraphToNodes)

#### Update Tests
- [ ] Remove backward compatibility tests
- [ ] Update unit tests to only test canonical schema
- [ ] Remove mock executionGraph data from test fixtures

### Documentation Updates

#### Update API Documentation
- [ ] Remove references to executionGraph in API docs
- [ ] Update request/response examples to only show canonical nodes
- [ ] Remove backward compatibility notes
- [ ] Mark old API contracts as deprecated

#### Update Internal Documentation
- [ ] Update README.md with canonical model as default
- [ ] Update TEKNIK-KLAVUZ.md with new schema
- [ ] Update KULLANIM-KLAVUZU.md for operators (efficiency UI)
- [ ] Archive Optimized-DATA-FLOW-STUDY.md (mark as historical)

#### Update Training Materials
- [ ] Update operator training slides
- [ ] Update efficiency calculation examples
- [ ] Update troubleshooting guides
- [ ] Create FAQ for common issues

### Archive Migration Scripts

#### Archive Plan
```bash
# Create archive directory
mkdir -p archives/migration-2025-11

# Move migration scripts
mv scripts/migrateExecutionGraphToNodes.js archives/migration-2025-11/
mv scripts/cleanupDeprecatedFields.js archives/migration-2025-11/

# Create archive README
cat > archives/migration-2025-11/README.md << EOF
# Migration Archive - Canonical Model (November 2025)

This archive contains migration scripts used for the canonical model rollout.

**Migration Date:** [DATE]
**Executed By:** [TEAM MEMBER]
**Plans Migrated:** [COUNT]
**Success Rate:** 100%

## Scripts
- migrateExecutionGraphToNodes.js - Main migration script
- cleanupDeprecatedFields.js - Cleanup script for deprecated fields

## Results
- Total plans: [COUNT]
- Successfully migrated: [COUNT]
- Errors: 0

Do not delete this archive. Keep for audit and reference purposes.
EOF

# Commit archive
git add archives/migration-2025-11/
git commit -m "chore: archive canonical model migration scripts"
```

### Final Verification

#### Post-Cleanup Checks
- [ ] All tests passing with fallback code removed
- [ ] No references to executionGraph in codebase (search: `grep -r "executionGraph"`)
- [ ] Documentation updated and accurate
- [ ] Migration scripts archived
- [ ] Team trained on new canonical model

#### Performance Baseline (New Baseline)
- [ ] Measure average plan creation time
- [ ] Measure average launch time
- [ ] Measure average assignment processing time
- [ ] Document new baseline for future comparisons

### Success Criteria
- [ ] All deprecated code removed
- [ ] All deprecated data fields removed from database
- [ ] Documentation fully updated
- [ ] Migration scripts archived
- [ ] Team trained and confident with new model
- [ ] New performance baseline established

---

## Rollback & Emergency Procedures

### Quick Reference Card (Print and Keep Handy)

#### 🔴 Emergency Rollback (< 5 minutes)
```bash
# 1. Disable feature flag
export FEATURE_USE_CANONICAL_NODES=false
# OR edit .env file and set to false

# 2. Restart backend
pm2 restart burkol-backend

# 3. Verify service restored
curl http://production/health
npm run test:smoke

# 4. Notify team
# Send message: "Canonical model rolled back, investigating issue"
```

**When to Use:**
- Critical errors in production
- Data corruption suspected
- API response time > 3x baseline
- Validation errors > 10%

#### 🟠 Partial Rollback (Specific Plans)
If only certain plans are problematic:
```bash
# Option 1: Revert specific plan to executionGraph
# (Requires manual Firestore edit or restore from backup)

# Option 2: Disable feature flag temporarily
# Fix problematic plans
# Re-enable feature flag
```

#### 🟢 Data Restore (Last Resort)
```bash
# 1. Disable feature flag
FEATURE_USE_CANONICAL_NODES=false

# 2. Restore Firestore from backup
gcloud firestore import gs://backup-bucket/[BACKUP_TIMESTAMP]

# 3. Restart backend
pm2 restart burkol-backend

# 4. Verify data integrity
# Check critical plans, assignments, materials

# 5. Document incident
# Fill out incident report template
```

### Incident Response Team

**Roles and Responsibilities:**

| Role | Name | Contact | Responsibility |
|------|------|---------|----------------|
| Deployment Lead | __________ | __________ | Overall rollout coordination |
| Backend Engineer | __________ | __________ | Backend code and API issues |
| Database Admin | __________ | __________ | Firestore backups and restores |
| Frontend Engineer | __________ | __________ | UI and frontend issues |
| On-Call Support | __________ | __________ | After-hours emergency response |
| Product Owner | __________ | __________ | Business decisions and stakeholder communication |

**Escalation Path:**
1. Issue detected → On-Call Support
2. If critical → Deployment Lead + Backend Engineer
3. If data corruption → Database Admin + Deployment Lead
4. If rollback needed → Deployment Lead approval → Execute rollback
5. Post-incident → All team members for retrospective

### Common Issues and Fixes

#### Issue 1: Validation Errors > 1%
**Symptoms:** Plans failing to save, 400 errors in logs  
**Diagnosis:**
```bash
# Check validation error logs
grep "Invalid plan schema" /var/log/burkol/backend.log | tail -20

# Check which fields are failing
curl http://production/api/mes/metrics
```
**Fix:**
- Review error messages for specific field issues
- If schema too strict: adjust validation rules in ProductionPlanSchema.json
- If data quality issue: fix problematic plans manually

#### Issue 2: Reservation Mismatches > 5%
**Symptoms:** Partial material reservations, stock warnings  
**Diagnosis:**
```bash
# Check reservation logs
grep "Partial reservation" /var/log/burkol/backend.log

# Check material stock levels
# Query Firestore: materials collection, filter by stock < 100
```
**Fix:**
- Review material planning accuracy
- Check if preProductionReservedAmount calculations correct
- Adjust defect rate expectations if needed

#### Issue 3: Performance Degradation (API > 2x baseline)
**Symptoms:** Slow plan creation, slow launches  
**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" http://production/api/mes/production-plans

# Check server resources
pm2 monit
top
```
**Fix:**
- Review enrichNodesWithEstimatedTimes performance (may need optimization)
- Check Firestore query performance (add indexes if needed)
- Scale up server resources if needed

#### Issue 4: Plans Missing Nodes (Data Corruption)
**Symptoms:** Plans load with empty nodes[], errors in logs  
**Diagnosis:**
```bash
# Check plans without nodes or executionGraph
# Query Firestore: mes-production-plans where nodes is empty AND executionGraph is empty
```
**Fix:**
- If before migration: run migration script
- If after migration: restore from backup (data corruption)
- Investigate root cause (migration script bug?)

---

## Communication Plan

### Stakeholder Communication

#### Pre-Deployment (Phase 2 & 3)
**Audience:** Engineering team, QA team  
**Timing:** 1 week before deployment  
**Message:**
```
Subject: Canonical Model Deployment - Phase 2/3

Team,

We will be deploying the canonical MES data model to [staging/production] on [DATE] at [TIME].

Changes:
- New canonical node schema (nodes[] as single source of truth)
- Feature flag system for safe rollout
- Backward compatibility with existing plans

Testing needed:
- Plan creation and editing
- Plan launch and assignment creation
- Material reservation and consumption
- Efficiency calculations

Please report any issues to [CONTACT].

Thank you,
[DEPLOYMENT LEAD]
```

#### Deployment Day (Phase 4)
**Audience:** All stakeholders (engineering, operations, management)  
**Timing:** Morning of deployment  
**Message:**
```
Subject: Canonical Model Full Rollout - Today [DATE]

Team,

We will be migrating all production plans to the canonical model today at [TIME].

Maintenance Window: [START TIME] - [END TIME]
Expected Duration: 2 hours
Impact: None (backend only, no downtime expected)

What to watch for:
- Any errors in plan creation/launch
- Unusual material reservation warnings
- Performance issues

Rollback plan: Feature flag can be disabled in < 5 minutes if needed.

Status updates will be sent every 30 minutes during the window.

Thank you,
[DEPLOYMENT LEAD]
```

#### Post-Deployment Success
**Audience:** All stakeholders  
**Timing:** 1 hour after deployment  
**Message:**
```
Subject: ✅ Canonical Model Rollout - Success

Team,

The canonical model has been successfully deployed to production.

Deployment Summary:
- Start Time: [TIME]
- End Time: [TIME]
- Duration: [MINUTES] minutes
- Plans Migrated: [COUNT]
- Errors: 0
- Status: ✅ SUCCESS

Monitoring will continue for the next week. Please report any issues immediately.

Thank you for your support!

[DEPLOYMENT LEAD]
```

#### Post-Deployment Issues
**Audience:** All stakeholders  
**Timing:** Immediately if issues detected  
**Message:**
```
Subject: ⚠️ Canonical Model - Issue Detected

Team,

An issue has been detected with the canonical model deployment.

Issue: [DESCRIPTION]
Impact: [SEVERITY - Critical/High/Medium/Low]
Status: [Investigating/Rollback in progress/Resolved]

Actions taken:
- [ACTION 1]
- [ACTION 2]

Next steps:
- [NEXT STEP]

Updates will be provided every 15 minutes.

[DEPLOYMENT LEAD]
```

### Training Materials

#### Operator Training (Before Phase 3)
**Create Training Document:** `/quote-portal/docs/OPERATOR-TRAINING.md`

**Topics to Cover:**
1. What is efficiency and how it affects time estimates
2. How to override efficiency for specific operations
3. Understanding effectiveTime vs nominalTime
4. What to do if material reservation warnings appear
5. New efficiency indicators in UI
6. FAQ and troubleshooting

**Training Schedule:**
- Week 2 (Phase 2): Create training materials
- Week 3 (Phase 3): Conduct training sessions with pilot operators
- Week 4 (Phase 4): Train all operators before full rollout

#### Developer FAQ

**Q: What if a plan has both nodes and executionGraph?**  
A: The system will prefer nodes[] (with feature flag enabled). If flag is disabled, executionGraph is used.

**Q: How do I debug a validation error?**  
A: Check the API response details field. It will list all schema violations (e.g., "nominalTime must be > 0").

**Q: What if material reservation fails due to insufficient stock?**  
A: Partial reservation will occur. Check actualReservedAmounts vs preProductionReservedAmount. Operator can decide to proceed or cancel.

**Q: Can I manually trigger a rollback?**  
A: Yes. Disable FEATURE_USE_CANONICAL_NODES in .env and restart backend. Notify Deployment Lead immediately.

**Q: How do I check if migration is complete?**  
A: Run `node scripts/migrateExecutionGraphToNodes.js --dry-run`. It should show "All plans already migrated."

---

## Monitoring & Metrics

### Metrics Dashboard

#### Key Performance Indicators (KPIs)

| Metric | Target | Alert Threshold | Critical Threshold |
|--------|--------|-----------------|-------------------|
| Reservation Mismatch Rate | < 5% | > 10% | > 20% |
| Validation Error Rate | < 1% | > 2% | > 5% |
| API Response Time (P95) | < 500ms | > 750ms | > 1000ms |
| Plans Using Fallback | 0% (post-migration) | > 0% (week 5+) | > 5% (week 5+) |
| Consumption Capping Rate | < 2% | > 5% | > 10% |

#### Metrics API Endpoints

**Get Current Metrics:**
```bash
curl -X GET http://production/api/mes/metrics
```

**Response:**
```json
{
  "success": true,
  "metrics": {
    "reservation_mismatch_count": 12,
    "plan_using_executionGraph_count": 0,
    "consumption_capped_count": 3,
    "validation_error_count": 1
  },
  "timestamp": "2025-11-14T10:30:00Z"
}
```

**Reset Metrics (for testing):**
```bash
curl -X POST http://production/api/mes/metrics/reset
```

#### Log Monitoring

**Key Log Patterns to Monitor:**

```bash
# Validation errors
grep "Invalid plan schema" /var/log/burkol/backend.log

# Reservation mismatches
grep "Partial reservation" /var/log/burkol/backend.log

# Deprecation warnings (should be 0 after migration)
grep "executionGraph is deprecated" /var/log/burkol/backend.log

# Consumption capping events
grep "Consumption capped" /var/log/burkol/backend.log

# Feature flag status
grep "FEATURE_USE_CANONICAL_NODES" /var/log/burkol/backend.log
```

#### Alert Configuration (Example: CloudWatch)

```yaml
# Example CloudWatch alarm configuration
ValidationErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: MES-ValidationErrors-High
    MetricName: ValidationErrorCount
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
    EvaluationPeriods: 1
    Period: 300  # 5 minutes
    AlarmActions:
      - !Ref SNSTopic  # Send to incident response team
```

### Weekly Monitoring Report Template

```markdown
# Canonical Model - Weekly Monitoring Report

**Week:** [WEEK NUMBER]
**Date Range:** [START DATE] - [END DATE]
**Reported By:** [NAME]

## Metrics Summary

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| Reservation Mismatches | [COUNT] | [COUNT] | < 5% | ✅/⚠️/🔴 |
| Validation Errors | [COUNT] | [COUNT] | < 1% | ✅/⚠️/🔴 |
| Plans Using Fallback | [COUNT] | [COUNT] | 0% | ✅/⚠️/🔴 |
| Avg API Response Time | [MS] | [MS] | < 500ms | ✅/⚠️/🔴 |

## Incidents

**Total Incidents:** [COUNT]
**Critical:** [COUNT]
**High:** [COUNT]
**Medium:** [COUNT]
**Low:** [COUNT]

Details:
- [Incident description and resolution]

## Operator Feedback

**Total Feedback Received:** [COUNT]
**Positive:** [COUNT]
**Neutral:** [COUNT]
**Negative:** [COUNT]

Key Themes:
- [Theme 1]
- [Theme 2]

## Action Items

- [ ] [Action item 1]
- [ ] [Action item 2]

## Recommendations

[Any recommendations for improvements or next steps]
```

---

## Success Metrics & KPIs (Overall)

### Technical Success Criteria

- ✅ Zero data loss or corruption incidents
- ✅ < 5% material reservation mismatch rate
- ✅ < 1% validation error rate
- ✅ API response times within 10% of baseline
- ✅ 100% plan migration success rate
- ✅ Zero rollbacks after Phase 4
- ✅ All tests passing (unit + integration)
- ✅ Feature flag system working correctly

### Business Success Criteria

- ✅ No production downtime during rollout
- ✅ Positive operator feedback (> 80% satisfaction)
- ✅ No increase in support tickets related to planning
- ✅ Improved planning accuracy (efficiency calculations)
- ✅ Faster plan creation time (target: 10% faster)
- ✅ Reduced material waste (due to better reservation accuracy)

### Long-Term Success (6 months)

- Deprecated code fully removed from codebase
- All documentation updated and accurate
- Team fully trained on canonical model
- New features built on canonical model (not legacy)
- Performance improvements realized (faster launches, more accurate estimates)

---

## Appendix

### A. Feature Flag Reference

**File:** `/quote-portal/config/featureFlags.js`

```javascript
module.exports = {
  USE_CANONICAL_NODES: process.env.FEATURE_USE_CANONICAL_NODES === 'true',
  ENABLE_VALIDATION: process.env.FEATURE_ENABLE_VALIDATION !== 'false', // default true
};
```

**Environment Variables:**

```bash
# .env or .env.production
FEATURE_USE_CANONICAL_NODES=false  # Set to 'true' to enable canonical model
FEATURE_ENABLE_VALIDATION=true     # Set to 'false' to disable validation
```

**Usage in Code:**

```javascript
const featureFlags = require('../config/featureFlags');

// In launch endpoint
const nodesToUse = featureFlags.USE_CANONICAL_NODES && plan.nodes 
  ? plan.nodes 
  : (plan.executionGraph || plan.nodes);

if (!featureFlags.USE_CANONICAL_NODES && plan.executionGraph) {
  console.log('Using executionGraph (feature flag disabled)');
}
```

### B. Migration Script Reference

**File:** `/quote-portal/scripts/migrateExecutionGraphToNodes.js`

**Usage:**
```bash
# Dry-run (no changes, show what would be migrated)
node scripts/migrateExecutionGraphToNodes.js --dry-run

# Migrate all plans
node scripts/migrateExecutionGraphToNodes.js --execute

# Migrate single plan
node scripts/migrateExecutionGraphToNodes.js --execute --planId=PLAN-1224-001

# Migrate with verbose logging
node scripts/migrateExecutionGraphToNodes.js --execute --verbose
```

### C. Test Commands Reference

```bash
# Run all tests
npm test

# Run MES unit tests
npm run test:mes:unit

# Run MES integration tests
npm run test:mes:integration

# Run all MES tests
npm run test:mes

# Run smoke tests (quick sanity check)
npm run test:smoke
```

### D. Useful Database Queries

**Find plans without nodes:**
```javascript
// Firestore console query
db.collection('mes-production-plans')
  .where('nodes', '==', null)
  .get()
```

**Find plans using executionGraph fallback:**
```javascript
// Check server logs
grep "executionGraph is deprecated" /var/log/burkol/backend.log | wc -l
```

**Count migrated vs non-migrated plans:**
```bash
node scripts/migrateExecutionGraphToNodes.js --dry-run --stats
```

### E. Contact Information

**Project Stakeholders:**

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Project Owner | __________ | __________ | __________ |
| Tech Lead | __________ | __________ | __________ |
| Deployment Lead | __________ | __________ | __________ |
| Backend Engineer | __________ | __________ | __________ |
| Frontend Engineer | __________ | __________ | __________ |
| Database Admin | __________ | __________ | __________ |
| QA Lead | __________ | __________ | __________ |
| Operations Manager | __________ | __________ | __________ |

**Emergency Contacts (24/7):**
- On-Call Engineer: __________
- Deployment Lead (backup): __________
- Database Admin (backup): __________

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-14 | [Name] | Initial rollout plan created |
| 1.1 | [Date] | [Name] | Updated after Phase 1 completion |
| 1.2 | [Date] | [Name] | Updated after Phase 2 staging tests |
| 1.3 | [Date] | [Name] | Updated after Phase 3 pilot |
| 2.0 | [Date] | [Name] | Final version after Phase 5 cleanup |

---

**Last Updated:** November 14, 2025  
**Status:** Phase 1 Completed ✅  
**Next Phase:** Phase 2 (Staging Deployment) - Scheduled for [DATE]
