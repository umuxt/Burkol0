// New Price Status Model - Single Source of Truth
// Replaces the complex multi-flag system

class PriceStatus {
  constructor({
    settingsVersion = null,
    settingsVersionId = null,
    formVersionId = null,
    calculatedPrice = null,
    appliedPrice = null,
    status = 'unknown',
    lastCalculated = null,
    lastApplied = null,
    calculationDetails = null,
    differenceSummary = null,
    statusReason = null
  } = {}) {
    this.settingsVersion = settingsVersion  // Numeric price settings version used
    this.settingsVersionId = settingsVersionId  // Canonical version ID in Firestore
    this.formVersionId = formVersionId      // Form configuration version snapshot ID
    this.calculatedPrice = calculatedPrice  // Latest calculated price
    this.appliedPrice = appliedPrice        // Currently applied/displayed price
    this.status = status                    // 'current' | 'outdated' | 'calculating' | 'error' | 'unknown' | 'price-drift' | 'content-drift'
    this.lastCalculated = lastCalculated    // When was price last calculated
    this.lastApplied = lastApplied          // When was price last applied
    this.calculationDetails = calculationDetails  // Full calculation breakdown
    this.differenceSummary = differenceSummary    // Summary of detected differences between versions
    this.statusReason = statusReason              // Human-readable reason for status
  }

  // Check if price needs update based on current settings version/id
  needsUpdate(currentSettingsVersion, currentSettingsVersionId = null) {
    const versionMismatch = currentSettingsVersion !== undefined && currentSettingsVersion !== null && this.settingsVersion !== currentSettingsVersion
    const versionIdMismatch = currentSettingsVersionId && this.settingsVersionId && this.settingsVersionId !== currentSettingsVersionId
    const requiresAttentionStatuses = new Set(['outdated', 'error', 'unknown', 'price-drift', 'content-drift'])
    return versionMismatch || versionIdMismatch || requiresAttentionStatuses.has(this.status)
  }

  // Check if calculated price differs from applied price or status flags require refresh
  hasPendingUpdate() {
    if (['outdated', 'unknown', 'price-drift', 'content-drift'].includes(this.status)) {
      return true
    }

    if (this.calculatedPrice !== null && this.appliedPrice === null) return true

    if (this.calculatedPrice !== null && this.appliedPrice !== null) {
      return Math.abs(this.calculatedPrice - this.appliedPrice) > 0.01
    }

    return false
  }

  setVersionInfo({ settingsVersion, settingsVersionId, formVersionId } = {}) {
    if (settingsVersion !== undefined) this.settingsVersion = settingsVersion
    if (settingsVersionId !== undefined) this.settingsVersionId = settingsVersionId
    if (formVersionId !== undefined) this.formVersionId = formVersionId
    return this
  }

  // Mark as outdated (generic)
  markOutdated(reason = null) {
    this.status = 'outdated'
    this.statusReason = reason
    return this
  }

  markPriceDrift(summary = null) {
    this.status = 'price-drift'
    this.differenceSummary = summary
    return this
  }

  markContentDrift(summary = null) {
    this.status = 'content-drift'
    this.differenceSummary = summary
    return this
  }

  // Mark as calculating
  markCalculating() {
    this.status = 'calculating'
    this.statusReason = null
    return this
  }

  // Update with new calculation
  updateCalculation(price, settingsVersion, calculationDetails = null, options = {}) {
    const { settingsVersionId = null, formVersionId = null, differenceSummary = null } = options
    this.calculatedPrice = price
    this.settingsVersion = settingsVersion
    if (settingsVersionId !== null) this.settingsVersionId = settingsVersionId
    if (formVersionId !== null) this.formVersionId = formVersionId
    this.lastCalculated = new Date().toISOString()
    this.calculationDetails = calculationDetails
    this.differenceSummary = differenceSummary
    this.status = 'current'
    this.statusReason = null
    return this
  }

  // Apply calculated price
  applyPrice() {
    if (this.calculatedPrice !== null) {
      this.appliedPrice = this.calculatedPrice
      this.lastApplied = new Date().toISOString()
    }
    return this
  }

  // Mark as error
  markError(errorMessage = null) {
    this.status = 'error'
    this.errorMessage = errorMessage
    this.statusReason = errorMessage
    return this
  }

  // Get display info for UI
  getDisplayInfo() {
    const needsUpdate = this.hasPendingUpdate()
    const isOutdated = ['outdated', 'unknown', 'price-drift', 'content-drift'].includes(this.status)
    const driftType = this.status === 'price-drift'
      ? 'price'
      : this.status === 'content-drift'
        ? 'content'
        : null
    
    return {
      price: this.appliedPrice || 0,
      needsUpdate,
      isOutdated,
      status: this.status,
      calculatedPrice: this.calculatedPrice,
      canApply: needsUpdate && ['current', 'content-drift', 'price-drift'].includes(this.status),
      buttonType: this.getButtonType(),
      differenceSummary: this.differenceSummary,
      statusReason: this.statusReason,
      driftType
    }
  }

  // Get button type for UI
  getButtonType() {
    if (this.status === 'calculating') return 'calculating'
    if (this.status === 'error') return 'error'
     if (this.status === 'price-drift') return 'price-drift'
     if (this.status === 'content-drift') return 'content-drift'
    if (this.hasPendingUpdate()) return 'pending-update'
    if (this.status === 'outdated' || this.status === 'unknown') return 'outdated'
    return 'current'
  }

  // Serialize for JSON storage
  toJSON() {
    return {
      settingsVersion: this.settingsVersion,
      settingsVersionId: this.settingsVersionId,
      formVersionId: this.formVersionId,
      calculatedPrice: this.calculatedPrice,
      appliedPrice: this.appliedPrice,
      status: this.status,
      lastCalculated: this.lastCalculated,
      lastApplied: this.lastApplied,
      calculationDetails: this.calculationDetails,
      differenceSummary: this.differenceSummary,
      statusReason: this.statusReason,
      errorMessage: this.errorMessage
    }
  }

  // Create from JSON data
  static fromJSON(data) {
    if (!data) return new PriceStatus()
    return new PriceStatus(data)
  }

  // Create initial status for new quote
  static createForNewQuote(price, settingsVersion, calculationDetails, options = {}) {
    const { settingsVersionId = null, formVersionId = null } = options
    return new PriceStatus({
      settingsVersion,
      settingsVersionId,
      formVersionId,
      calculatedPrice: price,
      appliedPrice: price,
      status: 'current',
      lastCalculated: new Date().toISOString(),
      lastApplied: new Date().toISOString(),
      calculationDetails
    })
  }

  // Create outdated status (when settings change)
  static createOutdated(reason = null) {
    return new PriceStatus({
      status: 'outdated',
      statusReason: reason
    })
  }
}

export default PriceStatus
