import { useState, useEffect, useCallback } from 'react';
import { withAuth } from '../../../shared/lib/api.js';

// A utility to fetch with a retry mechanism for 401 errors, useful for local dev
async function fetchJsonWith401Retry(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status !== 401) return res;
  
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) return res; // Only retry on local environments

    localStorage.removeItem('bk_admin_token');
    // Retry with a fresh token from withAuth
    const retryRes = await fetch(url, { ...options, headers: withAuth(options.headers) });
    return retryRes;
  } catch (e) {
    // If retry fails, return the original 401 response
    return res;
  }
}

/**
 * Hook to fetch and manage material categories.
 * @param {boolean} autoLoad - If true, categories are loaded on component mount.
 */
export function useMaterialCategories(autoLoad = true) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJsonWith401Retry('/api/material-categories', {
        method: 'GET',
        headers: withAuth({ 'Content-Type': 'application/json' }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      setCategories(data);
    } catch (err) {
      console.error('❌ Error fetching material categories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      fetchCategories();
    }
  }, [autoLoad, fetchCategories]);

  return {
    categories,
    setCategories, // Expose setter for optimistic updates
    loading,
    error,
    refreshCategories: fetchCategories, // Provide a way to manually refetch
  };
}
