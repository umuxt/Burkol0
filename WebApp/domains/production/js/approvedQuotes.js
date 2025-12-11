// Approved Quotes listing (read-only). Uses backend API only.
import { API_BASE, withAuth } from '../../../shared/lib/api.js'
// Core MES API imports
import { updateProductionState, launchProductionPlan, pauseProductionPlan, resumeProductionPlan, cancelProductionPlan, cancelProductionPlanWithProgress, getWorkPackages, getProductionPlanDetails, checkMesMaterialAvailability } from './mesApi.js'
import { showEnhancedProductionMonitoring, cleanupSSEConnections } from './productionMonitoring.js'
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/MESToast.js'

let quotesState = []
let selectedQuoteId = null
let queryFilter = ''
let approvedChannel = null
let productionPlansMap = {} // Map of workOrderCode to production plan data

// Sorting state
let currentSort = { field: null, direction: 'asc' }

// Filters state for Approved Quotes
const aqFilters = {
  planTypes: new Set(), // 'production' | 'template' | 'none'
  states: new Set(),    // labels from PRODUCTION_STATES
  deliveryFrom: '',     // YYYY-MM-DD
  deliveryTo: ''
}
// Plan type toggle helper (cycles: all -> production -> template -> all)
function toggleAQPlanType() {
  const hasProd = aqFilters.planTypes.has('production')
  const hasTpl = aqFilters.planTypes.has('template')
  if (!hasProd && !hasTpl) {
    aqFilters.planTypes.clear(); aqFilters.planTypes.add('production')
  } else if (hasProd) {
    aqFilters.planTypes.clear(); aqFilters.planTypes.add('template')
  } else {
    aqFilters.planTypes.clear()
  }
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}

// Production state constants (backend canonical values from mes.work_orders.productionState)
const PRODUCTION_STATES = {
  WAITING_APPROVAL: 'Üretim Onayı Bekliyor',
  IN_PRODUCTION: 'Üretiliyor',
  PAUSED: 'Üretim Durduruldu',
  COMPLETED: 'Üretim Tamamlandı',
  CANCELLED: 'İptal Edildi'
}

// Map backend state values to frontend display labels
function mapBackendStateToFrontend(backendState) {
  const stateMap = {
    'pending': PRODUCTION_STATES.WAITING_APPROVAL,
    'planned': PRODUCTION_STATES.WAITING_APPROVAL,
    'in_progress': PRODUCTION_STATES.IN_PRODUCTION,
    'paused': PRODUCTION_STATES.PAUSED,
    'completed': PRODUCTION_STATES.COMPLETED,
    'cancelled': PRODUCTION_STATES.CANCELLED
  }
  return stateMap[backendState] || backendState
}

export async function initializeApprovedQuotesUI() {
  // Subscribe to cross-tab notifications from Quotes dashboard
  try {
    approvedChannel = new BroadcastChannel('mes-approved-quotes')
    approvedChannel.onmessage = (e) => {
      const data = e?.data || {}
      if (data && (data.type === 'approvedCreated' || data.type === 'refresh')) {
        if (data.quoteId) {
          ensureApprovedQuote(data.quoteId).finally(() => loadQuotesAndRender())
        } else {
          loadQuotesAndRender()
        }
      }
    }
  } catch { }

  const search = document.getElementById('approved-quotes-search')
  if (search) {
    search.addEventListener('input', (e) => {
      queryFilter = String(e.target.value || '').toLowerCase()
      renderApprovedQuotesTable()
    })
  }
  // No default filters applied - show all quotes
  updateAQFilterBadges()
  // Also bind filter toggle buttons (in case inline onclick isn't executed)
  const btnPlan = document.getElementById('aq-filter-plan-type-btn')
  if (btnPlan) btnPlan.addEventListener('click', () => toggleAQPlanType())
  const btnState = document.getElementById('aq-filter-state-btn')
  if (btnState) btnState.addEventListener('click', () => toggleAQFilterPanel('state'))
  const btnDel = document.getElementById('aq-filter-delivery-btn')
  if (btnDel) btnDel.addEventListener('click', () => toggleAQFilterPanel('delivery'))
  const btnClearAll = document.getElementById('aq-filter-clear-all')
  if (btnClearAll) btnClearAll.addEventListener('click', clearAllAQFilters)

  // Add event listeners for panel controls that used to use onclick
  setupPanelEventListeners()

  // Initialize sort indicators
  updateSortIndicators()

  // Hide detail panel on initial load (P1.3a fix)
  const detailPanel = document.getElementById('approved-quote-detail-panel')
  if (detailPanel) {
    detailPanel.style.display = 'none'
  }

  // Initialize complete
  await loadQuotesAndRender()
}

// Setup event listeners for panel controls
function setupPanelEventListeners() {
  // State panel controls - use more specific selectors
  const stateButtons = document.querySelectorAll('#aq-filter-state-panel button')
  stateButtons.forEach(btn => {
    if (btn.textContent.trim() === 'Clear') {
      btn.addEventListener('click', () => clearAQFilter('state'))
    } else if (btn.title === 'Close') {
      btn.addEventListener('click', () => hideAQFilterPanel('state'))
    }
  })

  // Delivery panel controls
  const deliveryButtons = document.querySelectorAll('#aq-filter-delivery-panel button')
  deliveryButtons.forEach(btn => {
    if (btn.textContent.trim() === 'Clear') {
      btn.addEventListener('click', () => clearAQFilter('delivery'))
    } else if (btn.title === 'Close') {
      btn.addEventListener('click', () => hideAQFilterPanel('delivery'))
    } else if (btn.textContent.trim() === 'Apply') {
      btn.addEventListener('click', () => applyAQDeliveryFilter())
    }
  })

  // Gecikmiş workorderlar butonu
  const overdueBtn = document.getElementById('aq-filter-delivery-overdue')
  if (overdueBtn) {
    overdueBtn.addEventListener('click', () => applyOverdueFilter())
  }

  // Hızlı seçim butonları
  const quickSelectBtns = document.querySelectorAll('.quick-select-btn')
  quickSelectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const days = parseInt(e.target.getAttribute('data-days'))
      applyQuickDateFilter(days)
    })
  })

  // State filter checkboxes using data-state attribute
  const stateCheckboxes = document.querySelectorAll('#aq-filter-state-panel input[type="checkbox"][data-state]')
  stateCheckboxes.forEach(checkbox => {
    const stateValue = checkbox.getAttribute('data-state')
    if (stateValue) {
      checkbox.addEventListener('change', (e) => {
        onAQFilterChange('state', stateValue, e.target.checked)
      })
    }
  })
}

// Optional: expose manual refresh hook for other apps to call directly
try { window.refreshApprovedQuotes = () => loadQuotesAndRender() } catch { }

// Production state management functions
function getProductionState(workOrderCode) {
  // Single source of truth: quotesState from backend (mes.work_orders.productionState)
  const quote = quotesState.find(q => q.workOrderCode === workOrderCode)
  return quote?.productionState || 'pending'
}

async function setProductionState(workOrderCode, newState, updateServer = true) {
  try {
    // Update backend first (single source of truth)
    if (updateServer) {
      await updateProductionState(workOrderCode, newState)
    }

    // Update local cache
    const quoteIndex = quotesState.findIndex(q => q.workOrderCode === workOrderCode)
    if (quoteIndex !== -1) {
      quotesState[quoteIndex].productionState = newState
      quotesState[quoteIndex].productionStateUpdatedAt = new Date().toISOString()
    }

    renderApprovedQuotesTable()

    console.log(`✅ Production state updated: ${workOrderCode} -> ${newState}`)
  } catch (error) {
    console.error('❌ Failed to update production state:', error)
    alert('Üretim durumu güncellenirken hata oluştu. Lütfen tekrar deneyin.')
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Check material availability for a production plan
 * Returns detailed shortage information without modifying any state
 */
async function checkPlanMaterialAvailability(plan) {
  try {
    // Fetch plan details with nodes and materials
    const planDetails = await getProductionPlanDetails(plan.id);
    const nodes = planDetails?.nodes || [];

    if (nodes.length === 0) {
      return { allAvailable: true, shortages: [], hasCriticalShortages: false };
    }

    // Aggregate materials from all nodes
    const materialMap = new Map();
    nodes.forEach(node => {
      const materials = node.material_inputs || [];
      materials.forEach(mat => {
        if (!mat.materialCode || !mat.requiredQuantity) return;

        const key = mat.materialCode;
        const qty = parseFloat(mat.requiredQuantity) || 0;

        if (qty <= 0) return;

        if (materialMap.has(key)) {
          materialMap.get(key).required += qty;
        } else {
          materialMap.set(key, {
            code: mat.materialCode,
            required: qty,
            unit: 'pcs'
          });
        }
      });
    });

    const requiredMaterials = Array.from(materialMap.values());

    if (requiredMaterials.length === 0) {
      return { allAvailable: true, shortages: [], hasCriticalShortages: false };
    }

    // Check availability via backend
    const result = await checkMesMaterialAvailability(requiredMaterials);

    // Categorize shortages: critical if >50% missing
    const criticalThreshold = 0.5;
    const criticalShortages = (result.shortages || []).filter(s =>
      s.shortage > s.required * criticalThreshold
    );

    return {
      allAvailable: result.allAvailable,
      shortages: result.shortages || [],
      hasCriticalShortages: criticalShortages.length > 0,
      criticalShortages,
      checkedAt: result.checkedAt
    };

  } catch (error) {
    console.error('Material availability check failed:', error);
    // On error, don't block launch but warn user
    return {
      allAvailable: false,
      shortages: [],
      hasCriticalShortages: false,
      error: error.message
    };
  }
}

/**
 * Start production: Launch the production plan with auto-assignment
 * Button is only enabled if quote has linked production plan with status=production and not yet launched
 */
async function startProduction(workOrderCode) {
  try {
    // Find the production plan for this work order
    const plan = productionPlansMap[workOrderCode];

    if (!plan || plan.status === 'template') {
      alert('Üretim planı bulunamadı. Lütfen önce bir üretim planı oluşturun.');
      return;
    }

    // 🆕 STEP 1: Check material availability BEFORE launching
    console.log('🔍 Checking material availability for plan:', plan.id);
    const materialCheck = await checkPlanMaterialAvailability(plan);

    // 🆕 STEP 2: Show material shortage warnings (if any)
    if (!materialCheck.allAvailable && materialCheck.shortages.length > 0) {
      const criticalList = materialCheck.hasCriticalShortages
        ? materialCheck.criticalShortages.map(s =>
          `  🚨 ${s.code}: İhtiyaç ${s.required} ${s.unit}, Stok ${s.available} ${s.unit}\n     (Eksik: ${s.shortage} ${s.unit})`
        ).join('\n')
        : '';

      const minorList = materialCheck.shortages
        .filter(s => !materialCheck.criticalShortages.includes(s))
        .map(s =>
          `  ⚠️ ${s.code}: İhtiyaç ${s.required} ${s.unit}, Stok ${s.available} ${s.unit}\n     (Eksik: ${s.shortage} ${s.unit})`
        ).join('\n');

      const warningMessage = materialCheck.hasCriticalShortages
        ? `🚨 KRİTİK MALZEME EKSİKLİĞİ\n\n${criticalList}\n${minorList ? '\n' + minorList : ''}`
        : `⚠️ MALZEME UYARISI\n\n${minorList}`;

      const proceedWithShortages = confirm(
        warningMessage +
        `\n\nYine de üretimi başlatmak istiyor musunuz?\n` +
        `(Üretim sırasında malzeme tedarik etmeniz gerekecek)`
      );

      if (!proceedWithShortages) return; // User cancelled
    }

    // 🆕 STEP 3: If material check failed (API error), warn but allow proceed
    if (materialCheck.error) {
      const proceedWithError = confirm(
        `⚠️ Malzeme kontrolü yapılamadı:\n${materialCheck.error}\n\nYine de devam etmek istiyor musunuz?`
      );
      if (!proceedWithError) return;
    }

    // STEP 4: Final confirmation
    const confirmed = confirm(
      `Üretimi Başlatmak İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `Bu işlem tüm operasyonlar için kaynak ataması yapacak ve üretim başlatılacaktır.`
    );

    if (!confirmed) return;

    // Show loading state (don't update server)
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'Başlatılıyor...', false);

    try {
      // Call launch endpoint
      const result = await launchProductionPlan(plan.id, workOrderCode);

      // Success! Update state to IN_PRODUCTION (update server)
      await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION, true);

      // Build success message with launch summary
      const totalNodes = result.summary?.totalNodes || 0;
      const assignedCount = result.summary?.assignedNodes || result.assignments?.length || 0;
      const totalWorkers = result.summary?.totalWorkers || 0;
      const queuedCount = result.queuedTasks || 0;
      const estimatedDuration = result.summary?.estimatedDuration || 0;
      const parallelPaths = result.summary?.parallelPaths || 0;

      let message = `🚀 Üretim başarıyla başlatıldı!\n\n`;
      message += `✅ ${assignedCount}${totalNodes > 0 ? ` / ${totalNodes}` : ''} operasyon atandı\n`;
      message += `👷 ${totalWorkers} işçi görevlendirildi\n`;

      // Show unassigned nodes warning if any
      if (totalNodes > assignedCount) {
        const unassigned = totalNodes - assignedCount;
        message += `⚠️ ${unassigned} operasyon atama bekliyor (kaynak müsait değil)\n`;
      }

      if (queuedCount > 0) {
        message += `⏳ ${queuedCount} operasyon kuyrukta\n`;
      }
      if (estimatedDuration > 0) {
        const hours = Math.floor(estimatedDuration / 60);
        const mins = estimatedDuration % 60;
        message += `⏱️ Tahmini süre: ${hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`}\n`;
      }
      if (parallelPaths > 1) {
        message += `🔀 ${parallelPaths} paralel yol tespit edildi\n`;
      }

      // Check for material shortage warnings (if backend adds this later)
      if (result.warnings && result.warnings.materialShortages && result.warnings.materialShortages.length > 0) {
        const shortageList = result.warnings.materialShortages.map(s =>
          `• ${s.nodeName || 'Node'} – ${s.materialCode}: İhtiyaç ${s.required} ${s.unit}, Stok ${s.available} ${s.unit}`
        ).join('\n');

        message += `\n⚠️ Malzeme Eksiklikleri (Bilgilendirme):\n${shortageList}\n\nÜretim başladı; stokları en kısa sürede tamamlayın.`;
      }

      // Check for assignment warnings (if backend adds this later)
      if (result.warnings && result.warnings.assignmentWarnings && result.warnings.assignmentWarnings.length > 0) {
        const warningList = result.warnings.assignmentWarnings.map(w =>
          `• ${w.nodeName}: ${w.warnings.join(', ')}`
        ).join('\n');

        message += `\n⚠️ Atama Uyarıları:\n${warningList}`;
      }

      alert(message);

      // Refresh quotes and plans
      await loadQuotesAndRender();

      // Emit event for other components (e.g., plan overview)
      try {
        const channel = new BroadcastChannel('mes-assignments');
        channel.postMessage({ type: 'assignments:updated', planId: plan.id, workOrderCode });
        channel.close();
      } catch { }

    } catch (error) {
      console.error('Launch failed:', error);

      // Restore original state (don't update server, just UI)
      await setProductionState(workOrderCode, originalState, false);

      // Show detailed error message based on error type
      if (error.code === 'approved_quote_not_found') {
        // Approved quote not found - direct user to create it
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else if (error.code === 'no_workers' || (error.status === 422 && error.error === 'no_workers')) {
        // No eligible workers available
        console.warn('Launch error - no eligible workers:', error);
        const sampleInfo = error.sample ? error.sample.map(s => `${s.name || s.id}: ${s.status}${s.onLeave ? ' (on leave)' : ''}`).join('\n') : '';
        alert(`Üretim Başlatılamadı\n\nAktif ve müsait işçi bulunamadı. Lütfen Worker Portal'dan işçilerin durumunu kontrol edin.\n\n${sampleInfo}`);
      } else if (error.status === 422 && error.errors) {
        // Assignment errors
        const errorList = error.errors.map(e =>
          `- ${e.nodeName || e.nodeId}: ${e.message}`
        ).join('\n');
        alert(`Kaynak Ataması Başarısız\n\n${errorList}\n\nLütfen planı kontrol edip tekrar deneyin.`);
      } else {
        // Generic error - try to extract meaningful message from backend
        let errorMessage = 'Bilinmeyen hata';

        // Check if error message contains Turkish user-friendly text
        if (error.message && error.message.includes('yetenek uyuşması')) {
          errorMessage = error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        alert(`Üretim Başlatılamadı\n\n${errorMessage}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Start production error:', error);
    alert('Üretim başlatılırken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
  }
}

/**
 * Set urgent priority for a production plan
 * Toggles the isUrgent flag across production plan, assignments, and approved quote
 */
async function setUrgentPriority(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];
    const currentUrgent = plan?.isUrgent || false;
    const newUrgent = !currentUrgent;

    const confirmed = confirm(
      `${newUrgent ? 'ACİL ÖNCELİĞE ALMAK' : 'NORMAL ÖNCELİĞE DÖNDÜRMEK'} istediğinizden emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `${newUrgent ? '🚨 Tüm work package\'lar aynı anda başlatılabilir hale gelecek!' : '⏳ Sadece ilk work package başlatılabilir hale gelecek.'}`
    );

    if (!confirmed) return;

    const response = await fetch('/api/mes/set-urgent-priority', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({ workOrderCode, urgent: newUrgent })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Öncelik ayarlanamadı');
    }

    alert(`✅ ${result.message}`);

    // Refresh data
    await fetchProductionPlans();
    renderApprovedQuotesTable();

  } catch (error) {
    console.error('Set urgent priority error:', error);
    alert(`❌ Hata: ${error.message}`);
  }
}

/**
 * Pause production: Pause all assignments for this plan
 */
async function pauseProduction(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];

    if (!plan || plan.status === 'template') {
      alert('Üretim planı bulunamadı.');
      return;
    }

    // Confirm pause
    const confirmed = confirm(
      `Üretimi Durdurmak İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `Tüm görevler duraklatılacak ve işçiler bu iş emrinde çalışamayacak.`
    );

    if (!confirmed) return;

    // Show loading state (don't update server)
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'Duraklatılıyor...', false);

    try {
      // Call pause endpoint
      const result = await pauseProductionPlan(plan.id);

      // Success! Update state to PAUSED (update server)
      await setProductionState(workOrderCode, PRODUCTION_STATES.PAUSED, true);

      // Show success message with details
      const assignments = result.pausedAssignments || [];
      let message = `Üretim planı duraklatıldı!\n\n`;

      if (assignments.length === 0) {
        message += `Duraklatılan iş paketi yok (tümü zaten başlamış).`;
      } else {
        message += `Duraklatılan iş paketleri:\n\n`;

        // Show first 5 assignments
        const showCount = Math.min(5, assignments.length);
        for (let i = 0; i < showCount; i++) {
          const a = assignments[i];
          message += `• ${a.assignmentId}\n`;
          message += `  İşçi: ${a.workerName || 'Atanmamış'}\n`;
          message += `  İstasyon: ${a.stationName || 'Atanmamış'}\n\n`;
        }

        // If more than 5, show summary
        if (assignments.length > 5) {
          message += `... ve ${assignments.length - 5} iş paketi daha`;
        }
      }

      alert(message);

      // Refresh
      await loadQuotesAndRender();

    } catch (error) {
      console.error('Pause failed:', error);
      await setProductionState(workOrderCode, originalState, false);

      // Handle specific error types
      if (error.code === 'approved_quote_not_found') {
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else {
        alert(`Üretim Durdurulamadı\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Pause production error:', error);
    alert('Üretim durdurulurken beklenmeyen bir hata oluştu.');
  }
}

/**
 * Resume production: Resume all paused assignments
 */
async function resumeProduction(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];

    if (!plan || plan.status === 'template') {
      alert('Üretim planı bulunamadı.');
      return;
    }

    // Confirm resume
    const confirmed = confirm(
      `Üretime Devam Etmek İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `Duraklatılmış görevler devam edecek.`
    );

    if (!confirmed) return;

    // Show loading state (don't update server)
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'Devam ettiriliyor...', false);

    try {
      // Call resume endpoint
      const result = await resumeProductionPlan(plan.id);

      // Success! Update state to IN_PRODUCTION (update server)
      await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION, true);

      // Show success message
      alert(
        `Üretim devam ediyor!\n\n` +
        `${result.resumedCount} görev devam ettirildi.`
      );

      // Refresh
      await loadQuotesAndRender();

    } catch (error) {
      console.error('Resume failed:', error);
      await setProductionState(workOrderCode, originalState, false);

      // Handle specific error types
      if (error.code === 'approved_quote_not_found') {
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else {
        alert(`Üretim Devam Ettirilemedi\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Resume production error:', error);
    alert('Üretim devam ettirilirken beklenmeyen bir hata oluştu.');
  }
}

async function completeProduction(workOrderCode) {
  await setProductionState(workOrderCode, PRODUCTION_STATES.COMPLETED)
}

/**
 * Cancel production: Show modal to collect production progress, then cancel with material accounting
 */
async function cancelProduction(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];

    if (!plan || plan.status === 'template') {
      alert('Üretim planı bulunamadı.');
      return;
    }

    // Confirm cancel
    const confirmed = confirm(
      `Üretimi İptal Etmek İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `⚠️ İptal işleminden önce, o ana kadar ne kadar üretim gerçekleştiğini girmeniz gerekecek.\n` +
      `Bu, malzeme stoklarının doğru şekilde güncellenmesini sağlar.`
    );

    if (!confirmed) return;

    // Show modal to collect production progress
    const progressData = await showCancelProgressModal(plan);

    if (progressData === null) {
      // User cancelled the modal
      return;
    }

    // Show loading state
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'İptal ediliyor...', false);

    try {
      // Call new cancel-with-progress endpoint
      const result = await cancelProductionPlanWithProgress(plan.id, {
        actualOutputQuantity: progressData.actualOutputQuantity,
        defectQuantity: progressData.defectQuantity
      });

      // Success! Update state to CANCELLED
      await setProductionState(workOrderCode, PRODUCTION_STATES.CANCELLED, true);

      // Show detailed success message
      const materialSummary = result.materialAdjustments ?
        `\n\nMalzeme Hareketleri:\n` +
        `- ${result.materialAdjustments.inputMaterials.length} girdi malzemesi ayarlandı\n` +
        `- Üretilen: ${result.actualOutputQuantity} adet\n` +
        `- Fire: ${result.defectQuantity} adet`
        : '';

      alert(
        `Üretim İptal Edildi\n\n` +
        `${result.cancelledCount} görev iptal edildi.\n` +
        `${result.workersCleared} işçi ve ${result.stationsCleared} istasyon temizlendi.` +
        materialSummary
      );

      // Refresh
      await loadQuotesAndRender();

    } catch (error) {
      console.error('Cancel failed:', error);
      await setProductionState(workOrderCode, originalState, false);

      // Handle specific error types
      if (error.code === 'approved_quote_not_found') {
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else {
        alert(`Üretim İptal Edilemedi\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Cancel production error:', error);
    alert('Üretim iptal edilirken beklenmeyen bir hata oluştu.');
  }
}

/**
 * Show modal to collect production progress before cancellation
 */
function showCancelProgressModal(plan) {
  return new Promise((resolve) => {
    // Extract planned output from plan
    let totalPlannedOutput = 0;
    let outputUnit = 'adet';
    let outputCode = '';

    // Try to get from first node in execution graph
    if (plan.nodes && plan.nodes.length > 0) {
      const firstNode = plan.nodes[0];
      outputCode = firstNode.outputCode || '';
      totalPlannedOutput = firstNode.outputQty || 0;
    }

    // Multiply by plan quantity
    totalPlannedOutput = totalPlannedOutput * (plan.quantity || 1);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
      <div class="modal-content modal-content-md">
        <div class="modal-header">
          <h2 class="modal-title">⚠️ Üretim İptal - İlerleme Kaydı</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); event.stopPropagation();">×</button>
        </div>
        <div class="modal-body">
          <div class="alert-box alert-box-warning">
            <div class="alert-title">
              <i class="fa-solid fa-clipboard-list"></i> Plan: ${plan.name}
            </div>
            <div class="alert-content">
              İş Emri: ${plan.orderCode || '-'}<br>
              Planlanan Çıktı: ${totalPlannedOutput} ${outputUnit}
              ${outputCode ? `<br>Çıktı Kodu: ${outputCode}` : ''}
            </div>
          </div>
          
          <div class="alert-box alert-box-danger">
            <div class="alert-title">
              ⚠️ Önemli Bilgi
            </div>
            <div class="alert-content">
              Üretim iptal edilmeden önce, o ana kadar ne kadar üretim gerçekleştiğini girmeniz gerekiyor.
              Bu bilgi, malzeme stoklarının doğru şekilde güncellenmesi için kullanılacaktır.
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="cancelActualOutput">
              Üretilen Toplam Miktar (${outputUnit})
              <span class="required-asterisk">*</span>
            </label>
            <input 
              type="number" 
              id="cancelActualOutput" 
              class="form-input" 
              min="0" 
              step="0.01" 
              value="0"
              placeholder="O ana kadar üretilen sağlam ürün miktarı"
              required
            />
            <p class="form-help">İptal anına kadar üretilmiş tüm sağlam ürünlerin toplamını girin.</p>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="cancelDefectQty">
              Fire/Hatalı Toplam Miktar (${outputUnit})
            </label>
            <input 
              type="number" 
              id="cancelDefectQty" 
              class="form-input" 
              min="0" 
              step="0.01" 
              value="0"
              placeholder="0.00"
            />
            <p class="form-help">İptal anına kadar oluşan tüm hatalı/hurda ürünlerin toplamını girin.</p>
          </div>
          
          <div class="alert-box alert-box-info">
            <div class="alert-content">
              <strong><i class="fa-solid fa-lightbulb icon-warning"></i> Not:</strong> Bu değerler, tüm görevlerin toplamı olmalıdır. 
              Sistem bu bilgilere göre malzeme stoklarını otomatik olarak düzeltecektir.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove();">Vazgeç</button>
          <button class="btn-danger" id="confirmCancelWithProgressBtn">
            Onayla ve İptal Et
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const actualOutputInput = modal.querySelector('#cancelActualOutput');
    const defectInput = modal.querySelector('#cancelDefectQty');
    const confirmBtn = modal.querySelector('#confirmCancelWithProgressBtn');

    actualOutputInput.focus();
    actualOutputInput.select();

    confirmBtn.onclick = () => {
      const actualOutputQuantity = parseFloat(actualOutputInput.value);
      const defectQuantity = parseFloat(defectInput.value) || 0;

      // Validation
      if (isNaN(actualOutputQuantity) || actualOutputQuantity < 0) {
        alert('Lütfen geçerli bir üretim miktarı girin (0 veya daha fazla)');
        actualOutputInput.focus();
        return;
      }

      if (defectQuantity < 0) {
        alert('Fire miktarı negatif olamaz');
        defectInput.focus();
        return;
      }

      // Confirm one more time
      const total = actualOutputQuantity + defectQuantity;
      const finalConfirm = confirm(
        `İptal İşlemini Onaylıyor musunuz?\n\n` +
        `Üretilen: ${actualOutputQuantity} ${outputUnit}\n` +
        `Fire: ${defectQuantity} ${outputUnit}\n` +
        `Toplam: ${total} ${outputUnit}\n\n` +
        `Bu değerlerle üretim iptal edilecek ve malzeme stokları güncellenecektir.\n\n` +
        `Devam etmek istiyor musunuz?`
      );

      if (!finalConfirm) return;

      modal.remove();
      resolve({
        actualOutputQuantity,
        defectQuantity
      });
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(null);
      }
    };

    // Allow Enter key to submit
    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    };

    actualOutputInput.addEventListener('keypress', handleEnter);
    defectInput.addEventListener('keypress', handleEnter);
  });
}

// Expose functions globally for onclick handlers
window.startProduction = startProduction
window.pauseProduction = pauseProduction
window.setUrgentPriority = setUrgentPriority
window.resumeProduction = resumeProduction
window.completeProduction = completeProduction
window.cancelProduction = cancelProduction

async function ensureApprovedQuote(quoteId) {
  try {
    const res = await fetch(`${API_BASE}/api/mes/approved-quotes/ensure`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ quoteId })
    })
    // Ignore non-200s silently; listing will still refresh
    await res.json().catch(() => ({}))
  } catch { }
}

async function fetchProductionPlans() {
  try {
    // Fetch both production plans and templates from same table (filtered by status)
    const [plansRes, templatesRes] = await Promise.all([
      fetch(`${API_BASE}/api/mes/production-plans?_t=${Date.now()}`, { headers: withAuth() }),
      fetch(`${API_BASE}/api/mes/templates?_t=${Date.now()}`, { headers: withAuth() })
    ])

    const plansData = plansRes.ok ? await plansRes.json() : { productionPlans: [] }
    const templatesData = templatesRes.ok ? await templatesRes.json() : { templates: [] }

    const plans = Array.isArray(plansData?.productionPlans) ? plansData.productionPlans : []
    const templates = Array.isArray(templatesData?.templates) ? templatesData.templates : []

    console.log('📦 Fetched production plans:', plans.map(p => ({
      id: p.id,
      workOrderCode: p.workOrderCode,
      status: p.status,
      nodeCount: p.nodeCount,
      launchStatus: p.launchStatus
    })));

    console.log('📦 Fetched templates:', templates.map(t => ({
      id: t.id,
      workOrderCode: t.workOrderCode,
      status: t.status,
      nodeCount: t.nodeCount
    })));

    // Create a map of workOrderCode to plan data
    productionPlansMap = {}

    // Add production plans (status='production' or 'draft')
    plans.forEach(plan => {
      if (plan.workOrderCode) {
        productionPlansMap[plan.workOrderCode] = {
          id: plan.id,
          name: plan.name || plan.planName,
          type: plan.status === 'template' ? 'template' : 'production',
          status: plan.status, // 'draft', 'production', or 'template'
          launchStatus: plan.launchStatus, // null, 'launched', 'paused', 'cancelled'
          launchedAt: plan.launchedAt,
          nodeCount: plan.nodeCount || 0,
          timingSummary: plan.timingSummary,
          materialSummary: plan.materialSummary
        }
      }
    })

    // Add templates (status='template') - these usually don't have workOrderCode
    templates.forEach(template => {
      // Templates might not have workOrderCode (stored as reusable templates)
      // Only add to map if they DO have workOrderCode (linked to specific WO)
      if (template.workOrderCode) {
        productionPlansMap[template.workOrderCode] = {
          id: template.id,
          name: template.name || template.planName,
          type: 'template',
          status: 'template',
          nodeCount: template.nodeCount || 0
        }
      }
    })

    console.log('✅ Production plans map built:', Object.keys(productionPlansMap).length, 'entries');
  } catch (e) {
    console.error('❌ Failed to fetch production plans:', e)
    productionPlansMap = {}
  }
}

async function loadQuotesAndRender() {
  const tbody = document.getElementById('approved-quotes-table-body')
  if (tbody) tbody.innerHTML = '<tr><td colspan="7"><em>Loading quotes...</em></td></tr>'
  try {
    // Load both quotes and production plans in parallel
    const [quotesRes] = await Promise.all([
      fetch(`${API_BASE}/api/mes/approved-quotes?_t=${Date.now()}`, { headers: withAuth() }),
      fetchProductionPlans()
    ])

    if (!quotesRes.ok) throw new Error(`quotes_load_failed ${quotesRes.status}`)
    const data = await quotesRes.json()
    // API returns { approvedQuotes }
    const rows = Array.isArray(data?.approvedQuotes) ? data.approvedQuotes : []
    quotesState = rows
    renderApprovedQuotesTable()
  } catch (e) {
    console.error('Approved quotes load error:', e)
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error-text">Quotes yüklenemedi.</td></tr>'
  }
}

function renderApprovedQuotesTable() {
  const tbody = document.getElementById('approved-quotes-table-body')
  if (!tbody) return

  let rows = quotesState
  if (queryFilter) {
    rows = rows.filter(q => {
      const hay = `${q.id || ''} ${q.name || ''} ${q.customer || ''} ${q.company || ''} ${q.email || ''}`.toLowerCase()
      return hay.includes(queryFilter)
    })
  }

  // Apply advanced filters
  rows = rows.filter(q => {
    const idForRow = q.workOrderCode || q.id || q.quoteId || ''
    const plan = productionPlansMap[idForRow]
    const planType = plan ? plan.type : 'none'

    // Plan type filter
    if (aqFilters.planTypes.size > 0 && !aqFilters.planTypes.has(planType)) return false

    // Delivery date range filter
    const deliveryDate = q.deliveryDate || (q.quoteSnapshot && q.quoteSnapshot.deliveryDate) || ''
    if (aqFilters.deliveryFrom || aqFilters.deliveryTo) {
      const parseYMD = (str) => {
        if (typeof str !== 'string') return new Date('');
        const m = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
        return new Date(str)
      }
      const d = parseYMD(deliveryDate)
      if (aqFilters.deliveryFrom) {
        const from = parseYMD(aqFilters.deliveryFrom)
        if (!(d instanceof Date) || isNaN(d.getTime()) || d < from) return false
      }
      if (aqFilters.deliveryTo) {
        const to = parseYMD(aqFilters.deliveryTo)
        if (!(d instanceof Date) || isNaN(d.getTime()) || d > to) return false
      }
    }

    // Production state filter (only meaningful if has production plan)
    if (aqFilters.states.size > 0) {
      if (!plan || planType !== 'production') return false
      const st = getProductionState(idForRow)
      if (!aqFilters.states.has(st)) return false
    }

    return true
  })

  // Apply sorting
  if (currentSort.field) {
    rows.sort((a, b) => {
      let valueA, valueB

      switch (currentSort.field) {
        case 'woCode':
          valueA = (a.workOrderCode || a.id || a.quoteId || '').toLowerCase()
          valueB = (b.workOrderCode || b.id || b.quoteId || '').toLowerCase()
          break
        case 'customer':
          valueA = (a.customer || a.name || '').toLowerCase()
          valueB = (b.customer || b.name || '').toLowerCase()
          break
        case 'company':
          valueA = (a.company || '').toLowerCase()
          valueB = (b.company || '').toLowerCase()
          break
        case 'deliveryDate':
          valueA = a.deliveryDate || (a.quoteSnapshot && a.quoteSnapshot.deliveryDate) || ''
          valueB = b.deliveryDate || (b.quoteSnapshot && b.quoteSnapshot.deliveryDate) || ''
          // Convert to date for proper sorting
          valueA = valueA ? new Date(valueA) : new Date(0)
          valueB = valueB ? new Date(valueB) : new Date(0)
          break
        case 'productionPlan':
          const planA = productionPlansMap[a.workOrderCode || a.id || a.quoteId || '']
          const planB = productionPlansMap[b.workOrderCode || b.id || b.quoteId || '']
          valueA = planA ? (planA.id || '').toLowerCase() : ''
          valueB = planB ? (planB.id || '').toLowerCase() : ''
          break
        case 'productionState':
          const stateA = getProductionState(a.workOrderCode || a.id || a.quoteId || '')
          const stateB = getProductionState(b.workOrderCode || b.id || b.quoteId || '')
          valueA = stateA.toLowerCase()
          valueB = stateB.toLowerCase()
          break
        default:
          return 0
      }

      // Handle date comparison
      if (valueA instanceof Date && valueB instanceof Date) {
        return currentSort.direction === 'asc' ? valueA - valueB : valueB - valueA
      }

      // Handle string comparison
      if (valueA < valueB) return currentSort.direction === 'asc' ? -1 : 1
      if (valueA > valueB) return currentSort.direction === 'asc' ? 1 : -1
      return 0
    })
  }

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><em>Kayıt bulunamadı</em></td></tr>'
    return
  }

  tbody.innerHTML = rows.map(q => {
    const customer = q.customer || q.name || '-'
    const company = q.company || '-'
    const idForRow = (q?.workOrderCode || '').trim()
    const deliveryDate = q.deliveryDate || (q.quoteSnapshot && q.quoteSnapshot.deliveryDate) || ''
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]))

    // Build delivery date cell with remaining/overdue badge
    let deliveryCell = '-'
    if (deliveryDate) {
      // Robust parser for YYYY-M-D or YYYY-MM-DD strings (Safari-safe)
      const parseYMD = (str) => {
        if (typeof str !== 'string') return new Date('');
        const m = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) {
          const y = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10) - 1;
          const d = parseInt(m[3], 10);
          return new Date(y, mo, d);
        }
        // Fallback to native parsing
        return new Date(str);
      }
      const msPerDay = 24 * 60 * 60 * 1000
      const toMidnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
      const today = toMidnight(new Date())
      const d = parseYMD(deliveryDate)
      if (!isNaN(d.getTime())) {
        const due = toMidnight(d)
        const daysDiff = Math.ceil((due - today) / msPerDay)
        if (daysDiff >= 0) {
          const badge = `<span class="badge-success-pill">${daysDiff}</span>`
          deliveryCell = `${esc(deliveryDate)} ${badge}`
        } else {
          const overdue = Math.abs(daysDiff)
          const late = `<span class="badge-danger-pill">${overdue} gün gecikti</span>`
          deliveryCell = `${esc(deliveryDate)} ${late}`
        }
      } else {
        deliveryCell = esc(deliveryDate)
      }
    }

    // Get production plan info
    let planCell = '-'
    const plan = productionPlansMap[idForRow]
    if (plan) {
      const fullPlanId = plan.id || ''
      // Display full plan ID for new format (PPL-MMYY-XXX), keep slice for old format
      const shortPlanId = fullPlanId.startsWith('PPL-') ? fullPlanId :
        (fullPlanId.length > 10 ? fullPlanId.slice(-10) : fullPlanId)
      const planName = plan.name || ''
      // Check if template or production plan (based on status field)
      const isTemplate = plan.status === 'template'
      const typeIcon = !isTemplate ? '<i class="fa-solid fa-check-circle icon-success"></i>' : '<i class="fa-solid fa-square-check icon-muted"></i>'
      const actionIcon = !isTemplate ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-edit"></i>'
      const actionMode = !isTemplate ? 'view' : 'edit'
      const planUrl = `../pages/production.html?${actionMode}PlanId=${encodeURIComponent(fullPlanId)}&orderCode=${encodeURIComponent(idForRow)}`
      planCell = `<span class="inline-flex-center">${shortPlanId} ${typeIcon}<button onclick="event.stopPropagation(); window.open('${planUrl}', '_blank')" class="btn-transparent" title="${actionMode === 'view' ? 'View Plan' : 'Edit Plan'}">${actionIcon}</button></span>`
    } else {
      // No production plan exists - show create button
      const createPlanUrl = `../pages/production.html?view=plan-designer&action=create&orderCode=${encodeURIComponent(idForRow)}`
      planCell = `<span class="inline-flex-center"><button onclick="event.stopPropagation(); window.open('${createPlanUrl}', '_blank')" class="btn-create-plan" title="Üretim Planı Oluştur">+ Üretim Planı Oluştur</button></span>`
    }

    // Production state/actions only visible if a production plan exists (status != 'template')
    const hasProductionPlan = !!plan && plan.status !== 'template'
    let productionStateCell = '<span class="text-muted-sm">—</span>'
    let actionsCell = ''

    if (hasProductionPlan) {
      // Determine actual production state - map backend state to frontend labels
      let currentState = PRODUCTION_STATES.WAITING_APPROVAL;

      // Get backend production state and map to frontend label
      const backendState = getProductionState(idForRow);
      const mappedState = mapBackendStateToFrontend(backendState);

      console.log('🎯 State mapping:', {
        workOrderCode: idForRow,
        backendState,
        mappedState,
        planStatus: plan.status,
        launchStatus: plan.launchStatus
      });

      // Use mapped state if it's a valid known state
      if (mappedState !== backendState) {
        currentState = mappedState;
      }
      // Otherwise check plan metadata
      else if (plan.launchStatus === 'cancelled') {
        currentState = PRODUCTION_STATES.CANCELLED;
      } else if (plan.launchStatus === 'paused') {
        currentState = PRODUCTION_STATES.PAUSED;
      } else if (plan.launchStatus === 'launched') {
        currentState = PRODUCTION_STATES.IN_PRODUCTION;
      } else {
        // Not launched yet - check if plan is ready to launch
        if (plan.status === 'production' && plan.nodeCount > 0) {
          currentState = PRODUCTION_STATES.WAITING_APPROVAL; // Ready to launch
        } else if (plan.status === 'draft') {
          currentState = 'Plan Hazırlanıyor'; // Draft plan
        } else {
          currentState = 'Plan Hazırlanıyor'; // Plan not ready
        }
      }

      let stateClass = 'state-text-waiting'
      switch (currentState) {
        case PRODUCTION_STATES.WAITING_APPROVAL:
          stateClass = 'state-text-waiting'; break
        case PRODUCTION_STATES.IN_PRODUCTION:
          stateClass = 'state-text-production'; break
        case PRODUCTION_STATES.PAUSED:
          stateClass = 'state-text-paused'; break
        case PRODUCTION_STATES.COMPLETED:
          stateClass = 'state-text-completed'; break
        case PRODUCTION_STATES.CANCELLED:
          stateClass = 'state-text-cancelled'; break
        case 'Plan Hazırlanıyor':
          stateClass = 'state-text-preparing'; break
      }
      productionStateCell = `<div class="state-text ${stateClass}">${esc(currentState)}</div>`

      // Button rendering based on state
      const buttonStyle = 'border: none; background: transparent; cursor: pointer; font-size: 9px; padding: 1px 3px; margin: 1px; border-radius: 3px; white-space: nowrap; display: inline-block;'

      // Show "Başla" if plan is ready (status=production, has nodes, not launched)
      const canLaunch = plan.status === 'production' &&
        plan.nodeCount > 0 &&
        !plan.launchStatus;

      console.log('🔍 Launch check:', {
        workOrderCode: idForRow,
        status: plan.status,
        nodeCount: plan.nodeCount,
        launchStatus: plan.launchStatus,
        canLaunch
      });

      if (currentState === PRODUCTION_STATES.WAITING_APPROVAL && canLaunch) {
        actionsCell += `<button onclick=\"event.stopPropagation(); startProduction('${esc(idForRow)}')\" class="btn-action btn-start" title=\"Üretimi Başlat\">🏁 Başlat</button>`
      } else if (currentState === PRODUCTION_STATES.IN_PRODUCTION) {
        const isUrgent = plan.isUrgent || false;
        actionsCell += `<button onclick=\"event.stopPropagation(); setUrgentPriority('${esc(idForRow)}')\" class="btn-action btn-urgent ${isUrgent ? 'active' : ''}" title=\"${isUrgent ? 'Normal Önceliğe Dön' : 'Acil Önceliğe Al'}\">${isUrgent ? '🚨' : '⏱️'} ${isUrgent ? 'ACİL' : 'Normal'}</button>`;
        actionsCell += `<button onclick=\"event.stopPropagation(); pauseProduction('${esc(idForRow)}')\" class="btn-action btn-pause" title=\"Üretimi Durdur\">⏹️ Durdur</button>`;
      } else if (currentState === PRODUCTION_STATES.PAUSED) {
        actionsCell += `<button onclick=\"event.stopPropagation(); resumeProduction('${esc(idForRow)}')\" class="btn-action btn-resume" title=\"Üretime Devam Et\">▶️ Devam Et</button>`
      } else if (currentState === PRODUCTION_STATES.COMPLETED) {
        actionsCell += `<span class="action-status-completed"><i class="fa-solid fa-check-circle"></i> Tamamlandı</span>`
      } else if (currentState === PRODUCTION_STATES.CANCELLED) {
        actionsCell = `<span class="action-status-cancelled"><i class="fa-solid fa-times-circle"></i> İptal Edildi</span>`
      } else if (currentState === 'Plan Hazırlanıyor') {
        actionsCell += `<span class="action-status-preparing">Plan henüz hazır değil</span>`
      }

      // Show cancel button for all states except cancelled and completed
      if (currentState !== PRODUCTION_STATES.CANCELLED && currentState !== PRODUCTION_STATES.COMPLETED && currentState !== 'Plan Hazırlanıyor') {
        actionsCell += ` <button onclick=\"event.stopPropagation(); cancelProduction('${esc(idForRow)}')\" class="btn-action btn-cancel" title=\"İptal Et\"><i class="fa-solid fa-times-circle"></i> İptal Et</button>`
      }
    }

    return `
      <tr data-quote-id="${esc(idForRow)}" onclick="showApprovedQuoteDetail('${esc(idForRow)}')" class="cursor-pointer">
        <td class="table-cell"><span class="mes-code-text">${esc(idForRow)}</span></td>
        <td class="table-cell">${esc(customer)}</td>
        <td class="table-cell">${esc(company)}</td>
        <td class="table-cell">${deliveryCell}</td>
        <td class="table-cell">${planCell}</td>
        <td class="table-cell">${productionStateCell}</td>
        <td class="table-cell">${actionsCell}</td>
      </tr>
    `
  }).join('')

  // If details are open, keep only Quote # and Company visible
  setTableDetailMode(Boolean(selectedQuoteId))
}

// Panel helpers (inline onclick targets)
function toggleAQFilterPanel(type) {
  const panel = document.getElementById(`aq-filter-${type}-panel`)
  const btn = document.getElementById(`aq-filter-${type}-btn`)
  if (!panel || !btn) return
  const willShow = (panel.style.display === 'none' || !panel.style.display)
  if (willShow) {
    // Render as body-level floating panel to avoid clipping
    try {
      const rect = btn.getBoundingClientRect()
      panel.style.position = 'fixed'
      panel.style.top = `${Math.round(rect.bottom + 6)}px`
      panel.style.left = 'auto'
      panel.style.right = `${Math.round(window.innerWidth - rect.right)}px`
      panel.style.zIndex = '10000'
      if (panel.parentElement !== document.body) document.body.appendChild(panel)
      panel.style.display = 'block'
      // One‑off click outside to close
      const closer = (e) => {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.style.display = 'none'
          document.removeEventListener('mousedown', closer)
        }
      }
      document.addEventListener('mousedown', closer)
    } catch { panel.style.display = 'block' }
  } else {
    panel.style.display = 'none'
  }
}
function hideAQFilterPanel(type) {
  const el = document.getElementById(`aq-filter-${type}-panel`)
  if (el) el.style.display = 'none'
}
function onAQFilterChange(type, value, checked) {
  const set = (type === 'planType') ? aqFilters.planTypes : aqFilters.states
  if (checked) set.add(value)
  else set.delete(value)
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}
function clearAQFilter(type) {
  if (type === 'planType') aqFilters.planTypes.clear()
  else if (type === 'state') aqFilters.states.clear()
  else if (type === 'delivery') {
    aqFilters.deliveryFrom = ''; aqFilters.deliveryTo = '';
    const f = document.getElementById('aq-filter-delivery-from'); if (f) f.value = ''
    const t = document.getElementById('aq-filter-delivery-to'); if (t) t.value = ''
  }
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}
function clearAllAQFilters() {
  aqFilters.planTypes.clear(); aqFilters.states.clear(); aqFilters.deliveryFrom = ''; aqFilters.deliveryTo = ''
  const f = document.getElementById('aq-filter-delivery-from'); if (f) f.value = ''
  const t = document.getElementById('aq-filter-delivery-to'); if (t) t.value = ''
  // Uncheck all checkboxes in panels
  document.querySelectorAll('#aq-filter-plan-type-panel input[type=checkbox], #aq-filter-state-panel input[type=checkbox]').forEach(cb => cb.checked = false)
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}
function applyAQDeliveryFilter() {
  const f = document.getElementById('aq-filter-delivery-from')
  const t = document.getElementById('aq-filter-delivery-to')
  aqFilters.deliveryFrom = (f && f.value) || ''
  aqFilters.deliveryTo = (t && t.value) || ''
  updateAQFilterBadges()
  hideAQFilterPanel('delivery')
  renderApprovedQuotesTable()
}

// Gecikmiş workorderları filtrele
function applyOverdueFilter() {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  aqFilters.deliveryFrom = ''
  aqFilters.deliveryTo = today

  // Input alanlarını da güncelle
  const f = document.getElementById('aq-filter-delivery-from')
  const t = document.getElementById('aq-filter-delivery-to')
  if (f) f.value = ''
  if (t) t.value = today

  updateAQFilterBadges()
  hideAQFilterPanel('delivery')
  renderApprovedQuotesTable()
}

// Hızlı tarih filtreleri (X gün kaldı)
function applyQuickDateFilter(days) {
  const today = new Date()
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + days)

  const todayStr = today.toISOString().split('T')[0]
  const targetStr = targetDate.toISOString().split('T')[0]

  aqFilters.deliveryFrom = todayStr
  aqFilters.deliveryTo = targetStr

  // Input alanlarını da güncelle
  const f = document.getElementById('aq-filter-delivery-from')
  const t = document.getElementById('aq-filter-delivery-to')
  if (f) f.value = todayStr
  if (t) t.value = targetStr

  updateAQFilterBadges()
  hideAQFilterPanel('delivery')
  renderApprovedQuotesTable()
}

// Sıralama fonksiyonu
function sortApprovedQuotes(field) {
  // Toggle direction if same field, otherwise reset to ascending
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'
  } else {
    currentSort.field = field
    currentSort.direction = 'asc'
  }

  // Update sort indicators
  updateSortIndicators()

  // Re-render table with sorted data
  renderApprovedQuotesTable()
}

// Güncelle sıralama göstergelerini
function updateSortIndicators() {
  // Reset all sort indicators
  document.querySelectorAll('[onclick*="sortApprovedQuotes"] span').forEach(span => {
    span.textContent = '↕'
    span.style.opacity = '0.6'
  })

  // Set active sort indicator
  if (currentSort.field) {
    const button = document.querySelector(`[onclick*="sortApprovedQuotes('${currentSort.field}')"] span`)
    if (button) {
      button.textContent = currentSort.direction === 'asc' ? '↑' : '↓'
      button.style.opacity = '1'
    }
  }
}

function updateAQFilterBadges() {
  const planCount = document.getElementById('aq-filter-plan-type-count')
  if (planCount) planCount.textContent = ''
  const planLabel = document.getElementById('aq-filter-plan-type-label')
  if (planLabel) {
    const hasProd = aqFilters.planTypes.has('production')
    const hasTpl = aqFilters.planTypes.has('template')
    if (hasProd) planLabel.textContent = 'Tamamlanan Planlar'
    else if (hasTpl) planLabel.textContent = 'Taslak Planlar'
    else planLabel.textContent = 'Plan'
  }
  const stateCount = document.getElementById('aq-filter-state-count')
  if (stateCount) stateCount.textContent = aqFilters.states.size ? `(${aqFilters.states.size})` : ''
  const del = document.getElementById('aq-filter-delivery-summary')
  if (del) {
    if (aqFilters.deliveryFrom || aqFilters.deliveryTo) {
      del.textContent = `${aqFilters.deliveryFrom || '—'} → ${aqFilters.deliveryTo || '—'}`
    } else del.textContent = ''
  }
  const clearAll = document.getElementById('aq-filter-clear-all')
  if (clearAll) {
    const any = aqFilters.planTypes.size || aqFilters.states.size || aqFilters.deliveryFrom || aqFilters.deliveryTo
    clearAll.style.display = any ? 'inline-flex' : 'none'
  }
}

// Expose helpers for inline HTML onclicks - moved to main.js to avoid conflicts
// try {
//   Object.assign(window, { toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType })
// } catch {}

export async function showApprovedQuoteDetail(id) {
  selectedQuoteId = id
  const panel = document.getElementById('approved-quote-detail-panel')
  const content = document.getElementById('approved-quote-detail-content')
  if (!panel || !content) return
  panel.style.display = 'block'

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]))
  const field = (label, value) => `
    <div class="detail-row-wide">
      <div class="detail-label-wide">${esc(label)}</div>
      <div class="detail-value-wide">${esc(value ?? '-')}</div>
    </div>`

  // Show loading state
  content.innerHTML = `
    <div class="loading-state-center">
      <i class="fa-solid fa-spinner fa-spin"></i> Detaylar yükleniyor...
    </div>
  `

  // Hide extra columns while details are open
  setTableDetailMode(true)

  try {
    // Fetch full details from new API endpoint
    const response = await fetch(`${API_BASE}/api/mes/approved-quotes/${encodeURIComponent(id)}`, {
      headers: withAuth()
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const details = await response.json()
    const { workOrder, quote, customer, formData } = details

    // Format dates
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('tr-TR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (e) {
        return '-';
      }
    };

    const deliveryDateFormatted = formatDate(details.deliveryDate);
    const createdAtFormatted = workOrder?.createdAt ? new Date(workOrder.createdAt).toLocaleString('tr-TR') : '-';

    // Format price
    const priceFormatted = details.price != null ? `₺${Number(details.price).toFixed(2)}` : '-';

    // Build customer section - only production-relevant fields
    let customerHtml = `
      ${field('Firma', details.company || customer?.company || '-')}
      ${field('Yetkili', customer?.contactPerson || details.customerName || customer?.name || '-')}
      ${field('Telefon', details.phone || customer?.phone || '-')}
    `

    // Add address if available
    if (customer?.address) {
      let addressStr = customer.address
      if (customer.city) addressStr += `, ${customer.city}`
      if (customer.country && customer.country !== 'Türkiye') addressStr += ` - ${customer.country}`
      customerHtml += field('Adres', addressStr)
    }

    // Build form data section (labels are now resolved by backend)
    let formDataHtml = ''
    if (formData && Object.keys(formData).length > 0) {
      const formFields = Object.entries(formData)
        .filter(([key, value]) => value != null && value !== '')
        .map(([key, value]) => field(key, value))
        .join('')

      if (formFields) {
        formDataHtml = `
          <div class="section-block">
            <div class="section-title">📋 Teklif Detayları</div>
            ${formFields}
          </div>
        `
      }
    }

    // Render full content
    content.innerHTML = `
      <div class="section-block">
        <div class="section-title">📌 Temel Bilgiler</div>
        ${field('WO Kodu', workOrder?.code || id)}
        ${field('Teklif #', quote?.id || workOrder?.quoteId)}
        ${field('Durum', workOrder?.status || '-')}
        ${field('Üretim Durumu', workOrder?.productionState || '-')}
        ${field('Teslim Tarihi', deliveryDateFormatted)}
        ${field('Toplam Fiyat', priceFormatted)}
        ${field('Oluşturulma', createdAtFormatted)}
        ${workOrder?.productionLaunched ? field('Üretim Başladı', formatDate(workOrder.productionLaunchedAt)) : ''}
      </div>
      <div class="section-block">
        <div class="section-title">👤 Müşteri</div>
        ${customerHtml}
      </div>
      ${formDataHtml}
      ${quote?.notes ? `
        <div class="section-block">
          <div class="section-title">📝 Notlar</div>
          <div class="detail-notes">${esc(quote.notes)}</div>
        </div>
      ` : ''}
      <div id="assignments-section" class="assignments-section">
        <div class="section-title">🎯 Üretim İzleme</div>
        <div class="loading-state-center">
          <i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...
        </div>
      </div>
    `

    // Load enhanced production monitoring UI
    const assignmentsSection = document.getElementById('assignments-section')
    if (assignmentsSection) {
      const workOrderCode = workOrder?.code || id
      const plan = productionPlansMap[workOrderCode]

      if (plan) {
        showEnhancedProductionMonitoring(workOrderCode, plan, 'assignments-section')
      } else {
        assignmentsSection.innerHTML = `
          <div class="section-title">🎯 Üretim İzleme</div>
          <div class="loading-state-center">
            <i class="fa-solid fa-info-circle"></i> Henüz üretim planı oluşturulmamış
          </div>
        `
      }
    }
  } catch (error) {
    console.error('Failed to fetch work order details:', error)

    // Fallback to cached data from quotesState
    const q = quotesState.find(x => x.id === id || x.workOrderCode === id || x.quoteId === id)

    if (q) {
      const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return '-';
          return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        } catch (e) {
          return '-';
        }
      };

      const deliveryDateFormatted = formatDate(q?.deliveryDate || q?.quoteSnapshot?.deliveryDate);
      const createdAtFormatted = q?.createdAt ? new Date(q.createdAt).toLocaleString('tr-TR') : '-';

      content.innerHTML = `
        <div class="alert-box alert-box-warning">
          <i class="fa-solid fa-exclamation-triangle"></i> 
          Detay verisi yüklenemedi. Önbellek verileri gösteriliyor.
        </div>
        <div class="section-block">
          <div class="section-title">Temel Bilgiler</div>
          ${field('WO Kodu', q?.workOrderCode || q?.id)}
          ${field('Teklif #', q?.quoteId || q?.quoteSnapshot?.id)}
          ${field('Durum', q?.status)}
          ${field('Teslim Tarihi', deliveryDateFormatted)}
          ${field('Toplam Fiyat', (q?.price != null ? `₺${Number(q.price).toFixed(2)}` : '-'))}
          ${field('Oluşturulma', createdAtFormatted)}
        </div>
        <div class="section-block">
          <div class="section-title">Müşteri</div>
          ${field('Ad Soyad', q?.customer || q?.name || q?.quoteSnapshot?.name)}
          ${field('Firma', q?.company)}
          ${field('E‑posta', q?.email)}
          ${field('Telefon', q?.phone)}
        </div>
        <div id="assignments-section" class="assignments-section">
          <div class="section-title">Work Packages</div>
          <div class="loading-state-center">
            <i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...
          </div>
        </div>
      `

      // Still try to load production monitoring
      const assignmentsSection = document.getElementById('assignments-section')
      if (assignmentsSection) {
        const workOrderCode = q?.workOrderCode || q?.id
        const plan = productionPlansMap[workOrderCode]

        if (plan) {
          showEnhancedProductionMonitoring(workOrderCode, plan, 'assignments-section')
        } else {
          assignmentsSection.innerHTML = `
            <div class="section-title">🎯 Üretim İzleme</div>
            <div class="loading-state-center">
              <i class="fa-solid fa-info-circle"></i> Henüz üretim planı oluşturulmamış
            </div>
          `
        }
      }
    } else {
      content.innerHTML = `
        <div class="error-text">
          <i class="fa-solid fa-exclamation-circle"></i> 
          Detay bilgisi yüklenemedi. Lütfen sayfayı yenileyin.
        </div>
      `
    }
  }
}

export function closeApprovedQuoteDetail() {
  const panel = document.getElementById('approved-quote-detail-panel')
  if (panel) panel.style.display = 'none'
  selectedQuoteId = null

  // Cleanup SSE connections
  cleanupSSEConnections()

  // Restore columns when details closed
  setTableDetailMode(false)
}

// Toggle table columns visibility based on details panel state
function setTableDetailMode(isDetailsOpen) {
  const table = document.querySelector('.approved-quotes-table table')
  if (!table) return
  const theadCells = table.querySelectorAll('thead th')
  const tbodyRows = table.querySelectorAll('tbody tr')
  // We keep columns 1 (WO Code) and 3 (Company); hide 2 (Customer), 4 (Delivery), 5 (Production Plan), 6 (Production State), 7 (Actions)
  const hideCols = [2, 4, 5, 6, 7] // 1-based index
  hideCols.forEach(colIdx => {
    const th = theadCells[colIdx - 1]
    if (th) th.style.display = isDetailsOpen ? 'none' : ''
  })
  tbodyRows.forEach(tr => {
    const tds = tr.querySelectorAll('td')
    hideCols.forEach(colIdx => {
      const td = tds[colIdx - 1]
      if (td) td.style.display = isDetailsOpen ? 'none' : ''
    })
  })
}

// Export the filter functions for use in main.js
export { toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter, sortApprovedQuotes }
