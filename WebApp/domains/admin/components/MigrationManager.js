// Migration management UI used to control legacy-to-PriceStatus conversions
// Drives the admin dashboard widgets for running, validating, and cleaning migrations

import React from 'react'

const { useState, useEffect } = React

const MigrationManager = () => {
  const [migrationStatus, setMigrationStatus] = useState(null)
  const [migrationReport, setMigrationReport] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  // Load migration status
  const loadMigrationStatus = async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/migration/status', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      
      if (data.success) {
        setMigrationStatus(data.status)
        setLastUpdate(new Date().toLocaleString())
      } else {
        console.error('Failed to load migration status:', data.error)
      }
    } catch (error) {
      console.error('Error loading migration status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Load detailed migration report
  const loadMigrationReport = async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/migration/report', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      
      if (data.success) {
        setMigrationReport(data.report)
      } else {
        console.error('Failed to load migration report:', data.error)
      }
    } catch (error) {
      console.error('Error loading migration report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Run migration process
  const runMigration = async () => {
    if (!confirm('Start migration process? This will convert legacy quotes to the new architecture.')) {
      return
    }

    try {
      setIsLoading(true)
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/migration/migrate', { 
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      
      if (data.success) {
        alert(`Migration completed!\n\nMigrated: ${data.stats.migrated}\nErrors: ${data.stats.errors}\nSkipped: ${data.stats.skipped}`)
        await loadMigrationStatus()
        await loadMigrationReport()
      } else {
        alert(`Migration failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error running migration:', error)
      alert('Migration failed: Network error')
    } finally {
      setIsLoading(false)
    }
  }

  // Validate migration
  const validateMigration = async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/migration/validate', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      
      if (data.success) {
        const validation = data.validation
        alert(`Validation completed!\n\nValid: ${validation.valid}\nInvalid: ${validation.invalid}\nIssues: ${validation.issues.length}`)
        
        if (validation.issues.length > 0) {
          console.log('Validation issues:', validation.issues)
        }
      } else {
        alert(`Validation failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error validating migration:', error)
      alert('Validation failed: Network error')
    } finally {
      setIsLoading(false)
    }
  }

  // Clean up legacy flags
  const cleanupLegacy = async () => {
    if (!confirm('Clean up legacy flags? This will permanently remove old price flags from migrated quotes.')) {
      return
    }

    try {
      setIsLoading(true)
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/migration/cleanup', { 
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      
      if (data.success) {
        alert(`Cleanup completed!\n\nCleaned: ${data.cleaned} quotes`)
        await loadMigrationStatus()
        await loadMigrationReport()
      } else {
        alert(`Cleanup failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error cleaning up:', error)
      alert('Cleanup failed: Network error')
    } finally {
      setIsLoading(false)
    }
  }

  // Emergency rollback
  const rollbackMigration = async () => {
    if (!confirm('EMERGENCY ROLLBACK: This will restore all quotes to the legacy system. Are you absolutely sure?')) {
      return
    }
    
    if (!confirm('This action cannot be undone. Type "ROLLBACK" to confirm.')) {
      return
    }

    try {
      setIsLoading(true)
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/migration/rollback', { 
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      
      if (data.success) {
        alert(`Rollback completed!\n\nRestored: ${data.rolledBack} quotes to legacy system`)
        await loadMigrationStatus()
        await loadMigrationReport()
      } else {
        alert(`Rollback failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error during rollback:', error)
      alert('Rollback failed: Network error')
    } finally {
      setIsLoading(false)
    }
  }

  // Load initial data
  useEffect(() => {
    loadMigrationStatus()
    loadMigrationReport()
  }, [])

  if (!migrationStatus) {
    return React.createElement('div', { className: 'migration-manager' },
      React.createElement('h3', null, '🔄 Migration Manager'),
      React.createElement('div', { className: 'loading' }, 'Loading migration status...')
    )
  }

  const isComplete = migrationStatus.needsMigration === 0 && migrationStatus.migrated > 0
  const hasIssues = migrationReport?.validation?.invalid > 0

  return React.createElement('div', { className: 'migration-manager' },
    // Header
    React.createElement('div', { className: 'migration-header' },
      React.createElement('h3', null, '🔄 Migration Manager'),
      React.createElement('div', { className: 'migration-subtitle' }, 'Legacy → New Architecture Migration Control'),
      lastUpdate && React.createElement('div', { className: 'last-update' }, `Last updated: ${lastUpdate}`)
    ),

    // Migration Status Overview
    React.createElement('div', { className: 'migration-status' },
      React.createElement('h4', null, '📊 Migration Status'),
      React.createElement('div', { className: 'status-grid' },
        React.createElement('div', { className: 'status-card' },
          React.createElement('div', { className: 'status-value' }, migrationStatus.total),
          React.createElement('div', { className: 'status-label' }, 'Total Quotes')
        ),
        React.createElement('div', { className: 'status-card migrated' },
          React.createElement('div', { className: 'status-value' }, migrationStatus.migrated),
          React.createElement('div', { className: 'status-label' }, 'Migrated')
        ),
        React.createElement('div', { className: 'status-card needs-migration' },
          React.createElement('div', { className: 'status-value' }, migrationStatus.needsMigration),
          React.createElement('div', { className: 'status-label' }, 'Need Migration')
        ),
        React.createElement('div', { className: 'status-card new-architecture' },
          React.createElement('div', { className: 'status-value' }, migrationStatus.alreadyNewArchitecture),
          React.createElement('div', { className: 'status-label' }, 'New Architecture')
        ),
        React.createElement('div', { className: 'status-card legacy' },
          React.createElement('div', { className: 'status-value' }, migrationStatus.legacy),
          React.createElement('div', { className: 'status-label' }, 'Legacy Only')
        )
      ),

      isComplete && React.createElement('div', { className: 'migration-complete' },
        '✅ Migration appears complete! All quotes have been migrated to the new architecture.'
      ),

      hasIssues && React.createElement('div', { className: 'migration-issues' },
        `⚠️ ${migrationReport.validation.invalid} quotes have validation issues that need attention.`
      )
    ),

    // Migration Actions
    React.createElement('div', { className: 'migration-actions' },
      React.createElement('h4', null, '🎛️ Migration Controls'),
      React.createElement('div', { className: 'action-buttons' },
        React.createElement('button', {
          onClick: runMigration,
          disabled: isLoading || migrationStatus.needsMigration === 0,
          className: 'btn btn-primary'
        }, isLoading ? '⏳ Migrating...' : '🔄 Start Migration'),

        React.createElement('button', {
          onClick: validateMigration,
          disabled: isLoading || migrationStatus.migrated === 0,
          className: 'btn btn-secondary'
        }, isLoading ? '⏳ Validating...' : '🔍 Validate Migration'),

        React.createElement('button', {
          onClick: cleanupLegacy,
          disabled: isLoading || migrationStatus.migrated === 0 || hasIssues,
          className: 'btn btn-warning'
        }, isLoading ? '⏳ Cleaning...' : '🧹 Cleanup Legacy'),

        React.createElement('button', {
          onClick: rollbackMigration,
          disabled: isLoading || migrationStatus.migrated === 0,
          className: 'btn btn-danger'
        }, isLoading ? '⏳ Rolling back...' : '⚠️ Emergency Rollback')
      ),

      React.createElement('div', { className: 'action-descriptions' },
        React.createElement('div', { className: 'action-desc' },
          React.createElement('strong', null, 'Start Migration:'), ' Convert legacy quotes to new architecture'
        ),
        React.createElement('div', { className: 'action-desc' },
          React.createElement('strong', null, 'Validate Migration:'), ' Check migration results for issues'
        ),
        React.createElement('div', { className: 'action-desc' },
          React.createElement('strong', null, 'Cleanup Legacy:'), ' Remove old flags after successful migration'
        ),
        React.createElement('div', { className: 'action-desc' },
          React.createElement('strong', null, 'Emergency Rollback:'), ' Restore all quotes to legacy system'
        )
      )
    ),

    // Migration Report
    migrationReport && React.createElement('div', { className: 'migration-report' },
      React.createElement('h4', null, '📄 Migration Report'),
      
      migrationReport.patterns.byStatus && Object.keys(migrationReport.patterns.byStatus).length > 0 &&
      React.createElement('div', { className: 'report-section' },
        React.createElement('h5', null, 'Migration by Original Status'),
        React.createElement('div', { className: 'pattern-grid' },
          ...Object.entries(migrationReport.patterns.byStatus).map(([status, count]) =>
            React.createElement('div', { key: status, className: 'pattern-item' },
              React.createElement('span', { className: 'pattern-label' }, `${status}:`),
              React.createElement('span', { className: 'pattern-value' }, count)
            )
          )
        )
      ),

      migrationReport.validation.issues.length > 0 &&
      React.createElement('div', { className: 'report-section' },
        React.createElement('h5', null, '⚠️ Validation Issues'),
        React.createElement('div', { className: 'issues-list' },
          ...migrationReport.validation.issues.slice(0, 5).map((issue, index) =>
            React.createElement('div', { key: index, className: 'issue-item' },
              React.createElement('strong', null, `Quote ${issue.quoteId}:`),
              React.createElement('ul', null,
                ...issue.issues.map((description, i) =>
                  React.createElement('li', { key: i }, description)
                )
              )
            )
          ),
          migrationReport.validation.issues.length > 5 &&
          React.createElement('div', { className: 'more-issues' },
            `... and ${migrationReport.validation.issues.length - 5} more issues`
          )
        )
      ),

      migrationReport.recommendations.length > 0 &&
      React.createElement('div', { className: 'report-section' },
        React.createElement('h5', null, '💡 Recommendations'),
        React.createElement('ul', { className: 'recommendations' },
          ...migrationReport.recommendations.map((rec, index) =>
            React.createElement('li', { key: index }, rec)
          )
        )
      )
    ),

    // Refresh Controls
    React.createElement('div', { className: 'migration-refresh' },
      React.createElement('button', {
        onClick: () => { loadMigrationStatus(); loadMigrationReport(); },
        disabled: isLoading,
        className: 'btn btn-small'
      }, '🔄 Refresh Status')
    )
  )
}

export default MigrationManager
