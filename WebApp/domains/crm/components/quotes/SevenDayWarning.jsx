import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Calendar, CheckCircle, Info, XCircle } from 'lucide-react';
import API from '../../../../shared/lib/api.js';
import '../../styles/crm.css';

/**
 * SevenDayWarning Component
 * 
 * @param {string} quoteId - The ID of the quote
 * @param {string} placement - 'banner' | 'detail-row'
 *   - 'banner': Shows big alert box ONLY if critical/danger (or success explicitly requested)
 *   - 'detail-row': Shows compact inline badge in details panel
 */
export default function SevenDayWarning({ quoteId, placement = 'detail-row' }) {
    const [status, setStatus] = useState({
        loading: true,
        hasWarning: false,
        warningLevel: null,
        daysRemaining: null,
        daysElapsed: null,
        shipments: []
    });

    useEffect(() => {
        if (!quoteId) return;

        let isMounted = true;
        const checkStatus = async () => {
            try {
                // Use API wrapper which handles tokens and headers automatically
                const json = await API.checkSevenDayRule(quoteId);

                if (isMounted && json.success) {
                    setStatus({
                        ...json.data,
                        loading: false
                    });
                } else if (isMounted) {
                    setStatus(p => ({ ...p, loading: false }));
                }
            } catch (err) {
                console.error('7-Day Check Error:', err);
                if (isMounted) setStatus(prev => ({ ...prev, loading: false }));
            }
        };

        checkStatus();
        return () => { isMounted = false; };
    }, [quoteId]);

    // Loading State
    if (status.loading) {
        if (placement === 'detail-row') {
            return (
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Fatura Süresi:
                    </span>
                    <span className="text-xs text-muted">Kontrol ediliyor...</span>
                </div>
            );
        }
        return null; // Don't show loading banner to avoid layout shift
    }

    // Logic: If no shipments or data, don't show anything
    if (!status.shipments || status.shipments.length === 0) return null;

    // Logic: For 'banner', only show if Danger or Critical
    if (placement === 'banner') {
        if (status.warningLevel !== 'danger' && status.warningLevel !== 'critical') {
            return null;
        }
    }

    // --- RENDER: COMPACT ROW (Detail Panel) ---
    if (placement === 'detail-row') {
        const getLabel = () => {
            if (status.warningLevel === 'success') return 'İrsaliye ve Fatura Tamamlandı';
            if (status.daysRemaining < 0) return `${Math.abs(status.daysRemaining)} gün geçti`;
            return `${status.daysRemaining} gün kaldı`;
        };

        return (
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{
                    fontWeight: '600',
                    fontSize: '12px',
                    color: '#374151',
                    minWidth: '120px',
                    marginRight: '8px'
                }}>
                    Fatura Süresi:
                </span>

                <div className={`seven-day-compact-badge ${status.warningLevel || 'info'}`}>
                    {status.warningLevel === 'success' ? (
                        <CheckCircle size={12} />
                    ) : status.warningLevel === 'danger' || status.warningLevel === 'critical' ? (
                        <AlertTriangle size={12} />
                    ) : (
                        <Clock size={12} />
                    )}
                    <span>{getLabel()}</span>
                </div>
            </div>
        );
    }

    // --- RENDER: BANNER (Header / Critical Alerts) ---
    const getStatusConfig = (level) => {
        switch (level) {
            case 'info':
                return { icon: Info, className: 'warning-banner-info', title: 'Fatura Süresi' };
            case 'warning':
                return { icon: Clock, className: 'warning-banner-warning', title: 'Fatura Süresi Azalıyor' };
            case 'danger':
                return { icon: AlertTriangle, className: 'warning-banner-danger', title: 'Fatura Süresi Dolmak Üzere!' };
            case 'critical':
                return { icon: XCircle, className: 'warning-banner-critical', title: 'Fatura Süresi Geçti!' };
            case 'success':
                return { icon: CheckCircle, className: 'warning-banner-success', title: 'Fatura Kesildi' };
            default:
                // Fallback for unexpected level
                // Don't show anything unless we are strict
                return { icon: Info, className: 'warning-banner-info', title: 'Bilgi' };
        }
    };

    const config = getStatusConfig(status.warningLevel);
    if (!config) return null;

    // Safety check: if level is success but we want to show it in detail-row, we allow it.
    // If it is success but placement is banner, we usually hide it unless critical.
    if (placement === 'banner' && status.warningLevel !== 'danger' && status.warningLevel !== 'critical') {
        return null;
    }
    const Icon = config.icon;

    return (
        <div className={`seven-day-warning-banner ${config.className}`}>
            <div className="warning-icon-wrapper">
                <Icon size={20} strokeWidth={2} />
            </div>
            <div className="warning-content">
                <div className="warning-header">
                    <span className="warning-title">{config.title}</span>
                    {status.daysRemaining !== null && (
                        <span className="warning-days">
                            {status.daysRemaining >= 0
                                ? `Kalan: ${status.daysRemaining} Gün`
                                : `Geçen: ${Math.abs(status.daysRemaining)} Gün`}
                        </span>
                    )}
                </div>
                <div className="warning-details">
                    {status.oldestShipment ? (
                        <span>İlk irsaliye: {new Date(status.oldestShipment.date).toLocaleDateString('tr-TR')} (Belge: {status.oldestShipment.externalDocNumber || '-'})</span>
                    ) : (
                        <span>Fatura işlemleri tamam.</span>
                    )}
                </div>
            </div>
        </div>
    );
}
