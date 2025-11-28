// Session cleanup hook - sayfa kapanırken logout yapar
import { useEffect } from 'react';
import API from '../../shared/lib/api.js';

export function useSessionCleanup() {
  useEffect(() => {
    let isLoggedOut = false;

    const handleBeforeUnload = async (event) => {
      if (isLoggedOut) return;
      
      try {
        // Sync logout - browser kapanırken
        navigator.sendBeacon('/api/auth/logout', JSON.stringify({}));
      } catch (error) {
        console.error('Logout failed on page unload:', error);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && !isLoggedOut) {
        try {
          // Async logout - tab gizlenirken
          await API.logout();
          isLoggedOut = true;
        } catch (error) {
          console.error('Logout failed on visibility change:', error);
        }
      }
    };

    // Sayfa kapanırken logout
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Tab gizlenirken logout (daha güvenilir)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}

export default useSessionCleanup;