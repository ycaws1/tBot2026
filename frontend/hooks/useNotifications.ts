'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/api-config';
import type { Stock } from '@/types/stock';

interface UseNotificationsReturn {
  notificationsEnabled: boolean;
  notificationPermission: NotificationPermission;
  enableNotifications: (stocks: Stock[]) => Promise<void>;
  disableNotifications: () => void;
  checkAlertConditions: (stocks: Stock[]) => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const previousStocksRef = useRef<Record<string, { trend: string; score: number; sentiment: string }>>({});

  // Register service worker and check notification permission
  useEffect(() => {
    if ('serviceWorker' in navigator && 'Notification' in window) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('Service Worker registered:', registration);
      }).catch((error) => {
        console.error('Service Worker registration failed:', error);
      });

      setNotificationPermission(Notification.permission);
    }
  }, []);

  const sendNotification = useCallback(async (stock: Stock) => {
    if (Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      registration.showNotification('Stock Alert!', {
        body: `${stock.symbol} turned BULLISH!\nScore: ${stock.potential_score.toFixed(0)}/100 | Sentiment: Positive\nPrice: $${stock.price.toFixed(2)} (${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%)`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `stock-alert-${stock.symbol}`,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { symbol: stock.symbol },
      } as NotificationOptions);
    }
  }, []);

  const enableNotifications = useCallback(async (stocks: Stock[]) => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('notificationsEnabled', 'true');

      // Initialize previous stocks state
      stocks.forEach((stock) => {
        previousStocksRef.current[stock.symbol] = {
          trend: stock.trend,
          score: stock.potential_score,
          sentiment: stock.news_sentiment || 'neutral',
        };
      });

      // Subscribe to backend push notifications
      try {
        const registration = await navigator.serviceWorker.ready;

        // Get VAPID public key from backend
        const vapidResponse = await fetch(API_ENDPOINTS.VAPID_PUBLIC_KEY());
        const { publicKey } = await vapidResponse.json();

        // Convert VAPID key to Uint8Array
        const urlBase64ToUint8Array = (base64String: string) => {
          const padding = '='.repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        // Subscribe to push manager
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // Send subscription to backend
        await fetch(API_ENDPOINTS.PUSH_SUBSCRIBE(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });

        console.log('Push subscription registered with backend');
      } catch (error) {
        console.error('Failed to subscribe to push notifications:', error);
      }
    }
  }, []);

  const disableNotifications = useCallback(() => {
    setNotificationsEnabled(false);
    localStorage.setItem('notificationsEnabled', 'false');
  }, []);

  const checkAlertConditions = useCallback((stocks: Stock[]) => {
    if (!notificationsEnabled || stocks.length === 0) return;

    stocks.forEach((stock) => {
      const prev = previousStocksRef.current[stock.symbol];
      const current = {
        trend: stock.trend,
        score: stock.potential_score,
        sentiment: stock.news_sentiment || 'neutral',
      };

      // Check alert conditions:
      // 1. Score >= 85
      // 2. Positive sentiment
      // 3. Changed from non-BULLISH to BULLISH
      if (
        current.score >= 85 &&
        current.sentiment === 'positive' &&
        current.trend === 'BULLISH' &&
        prev &&
        prev.trend !== 'BULLISH'
      ) {
        sendNotification(stock);
      }

      // Update previous state
      previousStocksRef.current[stock.symbol] = current;
    });
  }, [notificationsEnabled, sendNotification]);

  return {
    notificationsEnabled,
    notificationPermission,
    enableNotifications,
    disableNotifications,
    checkAlertConditions,
  };
}
