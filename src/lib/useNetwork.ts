import { useState, useEffect, useCallback } from 'react';
import { forceReconnect } from './firebase';

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const reconnect = useCallback(async () => {
    if (isReconnecting) return false;
    
    setIsReconnecting(true);
    try {
      // First check if server is reachable
      const healthRes = await fetch('/api/health').catch(() => null);
      if (!healthRes?.ok) {
        console.warn('Network: Server unreachable, can\'t reconnect Firestore yet.');
        return false;
      }

      const success = await forceReconnect();
      if (success) {
        setIsOnline(true);
      }
      return success;
    } finally {
      setIsReconnecting(false);
    }
  }, [isReconnecting]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      reconnect();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reconnect]);

  return { isOnline, isReconnecting, reconnect };
}
