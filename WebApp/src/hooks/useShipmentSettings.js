import { useState, useEffect, useContext, createContext } from 'react';

/**
 * useShipmentSettings Hook
 * 
 * Waybill & Invoice Integration - S-3
 * Sevkiyat modülü ayarlarını global state olarak yöneten React hook
 * 
 * @version 1.0
 * @date 7 Aralık 2025
 */

// Context for global settings state
const ShipmentSettingsContext = createContext(null);

/**
 * Provider component for ShipmentSettings
 * Wrap your app/module with this to enable global settings access
 */
export function ShipmentSettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings/shipment_module_config');
      const data = await response.json();

      if (data.success && data.value) {
        setSettings(data.value);
      } else {
        // Use default settings if not found
        setSettings(getDefaultSettings());
      }
    } catch (err) {
      console.error('Failed to fetch shipment settings:', err);
      setError(err.message);
      setSettings(getDefaultSettings());
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      const response = await fetch('/api/settings/shipment_module_config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: newSettings }),
      });

      const data = await response.json();

      if (data.success) {
        setSettings(newSettings);
        return { success: true };
      } else {
        throw new Error(data.error || 'Failed to update settings');
      }
    } catch (err) {
      console.error('Failed to update shipment settings:', err);
      return { success: false, error: err.message };
    }
  };

  const value = {
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings: fetchSettings,
  };

  return (
    <ShipmentSettingsContext.Provider value={value}>
      {children}
    </ShipmentSettingsContext.Provider>
  );
}

/**
 * Hook to access shipment settings
 * 
 * @returns {{
 *   settings: Object | null,
 *   loading: boolean,
 *   error: string | null,
 *   updateSettings: Function,
 *   refreshSettings: Function,
 *   isIntegratedMode: boolean,
 *   isStandaloneMode: boolean,
 *   canUseQuickShipment: boolean,
 *   canUseTemplates: boolean,
 *   defaultTransportType: string,
 *   companyInfo: Object
 * }}
 * 
 * @example
 * const { settings, isIntegratedMode, updateSettings } = useShipmentSettings();
 * 
 * if (isIntegratedMode) {
 *   // Show quote selector
 * } else {
 *   // Show inline customer form
 * }
 */
export function useShipmentSettings() {
  const context = useContext(ShipmentSettingsContext);

  if (!context) {
    // If no provider, fetch settings locally
    return useLocalShipmentSettings();
  }

  const { settings, loading, error, updateSettings, refreshSettings } = context;

  // Computed properties for convenience
  const computed = {
    isIntegratedMode: settings?.operationMode === 'integrated',
    isStandaloneMode: settings?.operationMode === 'standalone',
    canUseQuickShipment: settings?.allowQuickShipment === true,
    canUseTemplates: settings?.enableTemplates === true,
    defaultTransportType: settings?.defaultTransportType || 'OWN_VEHICLE',
    companyInfo: settings?.companyInfo || {},
    erpEnabled: settings?.erpIntegration?.enabled === true,
    defaultCurrency: settings?.erpIntegration?.defaultCurrency || 'TRY',
    defaultVatRate: settings?.erpIntegration?.defaultVatRate || 20,
  };

  return {
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings,
    ...computed,
  };
}

/**
 * Local hook implementation (when no provider)
 * Fetches settings directly without global state
 */
function useLocalShipmentSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings/shipment_module_config');
      const data = await response.json();

      if (data.success && data.value) {
        setSettings(data.value);
      } else {
        setSettings(getDefaultSettings());
      }
    } catch (err) {
      console.error('Failed to fetch shipment settings:', err);
      setError(err.message);
      setSettings(getDefaultSettings());
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      const response = await fetch('/api/settings/shipment_module_config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: newSettings }),
      });

      const data = await response.json();

      if (data.success) {
        setSettings(newSettings);
        return { success: true };
      } else {
        throw new Error(data.error || 'Failed to update settings');
      }
    } catch (err) {
      console.error('Failed to update shipment settings:', err);
      return { success: false, error: err.message };
    }
  };

  const computed = {
    isIntegratedMode: settings?.operationMode === 'integrated',
    isStandaloneMode: settings?.operationMode === 'standalone',
    canUseQuickShipment: settings?.allowQuickShipment === true,
    canUseTemplates: settings?.enableTemplates === true,
    defaultTransportType: settings?.defaultTransportType || 'OWN_VEHICLE',
    companyInfo: settings?.companyInfo || {},
    erpEnabled: settings?.erpIntegration?.enabled === true,
    defaultCurrency: settings?.erpIntegration?.defaultCurrency || 'TRY',
    defaultVatRate: settings?.erpIntegration?.defaultVatRate || 20,
  };

  return {
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings: fetchSettings,
    ...computed,
  };
}

/**
 * Default settings configuration
 * Used as fallback when settings are not found in database
 */
function getDefaultSettings() {
  return {
    operationMode: 'integrated',
    allowQuickShipment: true,
    enableTemplates: true,
    autoFillCustomer: true,
    requireWaybillDetails: true,
    defaultTransportType: 'OWN_VEHICLE',
    enableDraftMode: true,
    autoSaveInterval: 30000,
    companyInfo: {
      name: '',
      taxOffice: '',
      taxNumber: '',
      address: '',
      city: '',
      phone: '',
      email: '',
    },
    erpIntegration: {
      enabled: false,
      system: 'none',
      defaultCurrency: 'TRY',
      defaultVatRate: 20,
    },
  };
}

/**
 * Helper: Check if current mode requires quote/WO integration
 */
export function requiresQuoteIntegration(settings) {
  return settings?.operationMode === 'integrated';
}

/**
 * Helper: Get transport type display name
 */
export function getTransportTypeLabel(type) {
  const labels = {
    OWN_VEHICLE: '🚚 Kendi Aracımız',
    LOGISTICS_COMPANY: '📦 Lojistik Firması',
  };
  return labels[type] || type;
}

/**
 * Helper: Validate company info completeness
 */
export function isCompanyInfoComplete(companyInfo) {
  if (!companyInfo) return false;
  
  return Boolean(
    companyInfo.name &&
    companyInfo.taxOffice &&
    companyInfo.taxNumber &&
    companyInfo.address
  );
}

export default useShipmentSettings;
