/**
 * BeePlan Console Logger
 * Tablo formatında düzenli console logları
 */

/**
 * Session logları için tablo formatında output
 * @param {'login'|'logout'} type - Log tipi
 * @param {object} data - Log verisi
 */
export function logSession(type, data) {
    const time = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const email = (data.email || 'N/A').padEnd(26);
    const shortId = data.sessionId ? data.sessionId.slice(0, 14) + '...' : 'N/A';

    if (type === 'login') {
        console.log('┌──────────┬────────────────────────────┬──────────────────┬──────────┐');
        console.log(`│ 🔐 LOGIN │ ${email} │ ${shortId.padEnd(16)} │ ${time} │`);
        console.log('└──────────┴────────────────────────────┴──────────────────┴──────────┘');
    } else if (type === 'logout') {
        const durationMs = data.duration || 0;
        const durationStr = formatDuration(durationMs).padEnd(8);
        console.log('┌───────────┬────────────────────────────┬──────────────────┬──────────┬──────────┐');
        console.log(`│ 🔓 LOGOUT │ ${email} │ ${shortId.padEnd(16)} │ ${time} │ ${durationStr} │`);
        console.log('└───────────┴────────────────────────────┴──────────────────┴──────────┴──────────┘');
    }
}

/**
 * Audit log için tablo formatında output
 * @param {object} data - Audit log verisi
 */
export function logAudit(data) {
    const time = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const action = (data.action || 'N/A').padEnd(15);
    const entity = (data.entityType || 'N/A').padEnd(12);
    const entityId = (data.entityId?.toString().slice(0, 10) || 'N/A').padEnd(10);
    const user = (data.userEmail || 'system').slice(0, 20).padEnd(20);

    console.log(`│ 📋 AUDIT │ ${action} │ ${entity} │ ${entityId} │ ${user} │ ${time} │`);
}

/**
 * Hata logları için
 * @param {string} context - Hata bağlamı
 * @param {Error|string} error - Hata
 */
export function logError(context, error) {
    const time = new Date().toLocaleTimeString('tr-TR');
    const message = error?.message || String(error);
    console.error(`❌ [${time}] ${context}: ${message}`);
}

/**
 * Başarı logları için
 * @param {string} context - Bağlam
 * @param {string} message - Mesaj
 */
export function logSuccess(context, message) {
    const time = new Date().toLocaleTimeString('tr-TR');
    console.log(`✅ [${time}] ${context}: ${message}`);
}

/**
 * Debug logları için (sadece DEBUG=true ise göster)
 * @param {string} context - Bağlam
 * @param {any} data - Debug verisi
 */
export function logDebug(context, data) {
    if (process.env.DEBUG === 'true') {
        console.log(`🔍 [DEBUG] ${context}:`, data);
    }
}

/**
 * Duration formatla
 * @param {number} ms - Milisaniye
 * @returns {string} Formatlanmış duration
 */
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Birleşik işlem ve audit logu
 * Success/warning/error log ve audit log'u tek bir tablo formatında gösterir
 * 
 * @param {object} options
 * @param {'success'|'warning'|'error'} options.type - Log tipi
 * @param {string} options.action - Aksiyon adı: 'QUOTE CREATE', 'SHIPMENT UPDATE' vb.
 * @param {object} options.details - Detaylar: { quoteId: '...', customer: '...' }
 * @param {object} options.audit - Audit bilgisi (opsiyonel)
 * @param {function} options.auditFn - Audit fonksiyonu (logAuditEvent)
 */
export function logOperation(options) {
    const { type = 'success', action, details = {}, audit, auditFn } = options;

    const time = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
    const width = 56;

    // Üst kısım
    console.log('┌' + '─'.repeat(width) + '┐');
    console.log(`│ ${icon} ${action.padEnd(width - 4)} │`);

    // Detaylar (alt alta)
    Object.entries(details).forEach(([key, value]) => {
        const keyStr = `   ${key.padEnd(12)}`;
        const valueStr = String(value ?? '').slice(0, width - 18);
        console.log(`│${keyStr} ${valueStr.padEnd(width - keyStr.length - 1)}│`);
    });

    // Audit kısmı (varsa)
    if (audit) {
        console.log('├' + '─'.repeat(width) + '┤');
        const entityAction = `${audit.entityType || ''}.${audit.action || ''}`.slice(0, 18);
        const userEmail = (audit.performer?.email || audit.userEmail || 'system').slice(0, 18);
        const auditLine = `📋 ${entityAction.padEnd(18)} │ ${userEmail.padEnd(18)} │ ${time}`;
        console.log(`│ ${auditLine.padEnd(width - 2)} │`);

        // DB'ye yaz (fire-and-forget)
        if (auditFn && typeof auditFn === 'function') {
            auditFn(audit).catch(() => { });
        }
    }

    console.log('└' + '─'.repeat(width) + '┘');
}

export default {
    session: logSession,
    audit: logAudit,
    error: logError,
    success: logSuccess,
    debug: logDebug,
    operation: logOperation
};
