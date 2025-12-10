// Test endpoint to debug which import fails
export default async function handler(req, res) {
  const results = {
    express: false,
    authRoutes: false,
    crmRoutes: false,
    mesRoutes: false,
    materialsRoutes: false,
    settingsRoutes: false,
    addressRoutes: false,
    errors: []
  };

  try {
    await import('express');
    results.express = true;
  } catch (e) {
    results.errors.push({ module: 'express', error: e.message });
  }

  try {
    await import('../server/authRoutes.js');
    results.authRoutes = true;
  } catch (e) {
    results.errors.push({ module: 'authRoutes', error: e.message });
  }

  try {
    await import('../domains/crm/api/index.js');
    results.crmRoutes = true;
  } catch (e) {
    results.errors.push({ module: 'crmRoutes', error: e.message });
  }

  try {
    await import('../domains/production/api/index.js');
    results.mesRoutes = true;
  } catch (e) {
    results.errors.push({ module: 'mesRoutes', error: e.message });
  }

  try {
    await import('../domains/materials/api/index.js');
    results.materialsRoutes = true;
  } catch (e) {
    results.errors.push({ module: 'materialsRoutes', error: e.message });
  }

  try {
    await import('../server/settingsRoutes.js');
    results.settingsRoutes = true;
  } catch (e) {
    results.errors.push({ module: 'settingsRoutes', error: e.message });
  }

  try {
    await import('../server/addressRoutes.js');
    results.addressRoutes = true;
  } catch (e) {
    results.errors.push({ module: 'addressRoutes', error: e.message });
  }

  res.status(200).json(results);
}
