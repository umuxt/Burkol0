import jsondb from '../src/lib/jsondb.js'

async function migrate() {
  const summary = {
    priceSettings: null,
    formConfig: null,
    quotesUpdated: 0,
    totalQuotes: 0
  }

  try {
    const legacyPriceSettings = jsondb.getPriceSettings()

    if (legacyPriceSettings && legacyPriceSettings.versionId) {
      summary.priceSettings = {
        skipped: true,
        versionId: legacyPriceSettings.versionId,
        version: legacyPriceSettings.version
      }
    } else if (legacyPriceSettings) {
      const result = await jsondb.savePriceSettingsWithVersioning(legacyPriceSettings, {
        action: 'migration:seed'
      })
      summary.priceSettings = {
        created: true,
        versionId: result.versionId,
        version: result.version
      }
    } else {
      summary.priceSettings = {
        skipped: true,
        reason: 'no price settings found'
      }
    }

    const legacyFormConfig = jsondb.getFormConfig()

    if (legacyFormConfig && legacyFormConfig.versionId) {
      summary.formConfig = {
        skipped: true,
        versionId: legacyFormConfig.versionId,
        version: legacyFormConfig.version
      }
    } else if (legacyFormConfig) {
      const result = await jsondb.saveFormConfigWithVersioning(legacyFormConfig, {
        action: 'migration:seed'
      })
      summary.formConfig = {
        created: true,
        versionId: result.versionId,
        version: result.version
      }
    } else {
      summary.formConfig = {
        skipped: true,
        reason: 'no form config found'
      }
    }

    const priceSettings = jsondb.getPriceSettings()
    const formConfig = jsondb.getFormConfig()

    const quotes = jsondb.listQuotes()
    summary.totalQuotes = quotes.length

    quotes.forEach(quote => {
      const patch = {}

      if (priceSettings?.versionId && !quote.priceVersion) {
        patch.priceVersion = {
          versionId: priceSettings.versionId,
          versionNumber: priceSettings.version,
          capturedAt: quote.createdAt || new Date().toISOString()
        }
      }

      if (formConfig?.versionId && !quote.formVersion) {
        patch.formVersion = {
          versionId: formConfig.versionId,
          versionNumber: formConfig.version,
          capturedAt: quote.createdAt || new Date().toISOString()
        }
      }

      if (quote.priceStatus || priceSettings?.versionId || formConfig?.versionId) {
        const status = { ...(quote.priceStatus || {}) }
        let statusChanged = false

        if (priceSettings?.version && !status.settingsVersion) {
          status.settingsVersion = priceSettings.version
          statusChanged = true
        }

        if (priceSettings?.versionId && !status.settingsVersionId) {
          status.settingsVersionId = priceSettings.versionId
          statusChanged = true
        }

        if (formConfig?.versionId && !status.formVersionId) {
          status.formVersionId = formConfig.versionId
          statusChanged = true
        }

        if (statusChanged) {
          patch.priceStatus = status
        }
      }

      if (Object.keys(patch).length > 0) {
        jsondb.patchQuote(quote.id, patch)
        summary.quotesUpdated += 1
      }
    })

    console.log('✅ Versioning migration completed successfully:')
    console.table(summary)
    process.exit(0)
  } catch (error) {
    console.error('❌ Versioning migration failed:', error)
    process.exit(1)
  }
}

migrate()
