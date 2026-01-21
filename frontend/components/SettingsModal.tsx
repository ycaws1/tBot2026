'use client';

import { useState, useEffect } from 'react';
import { getApiUrl, setApiUrl, resetApiUrl } from '@/lib/api-config';

export default function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [apiUrl, setLocalApiUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocalApiUrl(getApiUrl());
    }
  }, [isOpen]);

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Testing connection...');

    try {
      const testUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const response = await fetch(`${testUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        setTestStatus('success');
        setTestMessage(`✓ Connected successfully! ${data.message || ''}`);
      } else {
        setTestStatus('error');
        setTestMessage(`✗ Connection failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(`✗ Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSave = () => {
    if (!apiUrl.trim()) {
      alert('Please enter a valid URL');
      return;
    }

    // Validate URL format
    try {
      new URL(apiUrl);
    } catch {
      alert('Please enter a valid URL (e.g., http://localhost:8000)');
      return;
    }

    setApiUrl(apiUrl);
    alert('API URL saved! Please refresh the page for changes to take effect.');
    onClose();
    // Optionally reload the page
    // window.location.reload();
  };

  const handleReset = () => {
    resetApiUrl();
    setLocalApiUrl('http://localhost:8000');
    setTestStatus('idle');
    setTestMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">API Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Backend API URL
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setLocalApiUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                />
                <p className="mt-1 text-sm text-gray-600">
                  Enter the full URL of your backend API (e.g., http://localhost:8000 or https://api.example.com)
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={testConnection}
                  disabled={testStatus === 'testing' || !apiUrl.trim()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Reset to Default
                </button>
              </div>

              {testStatus !== 'idle' && (
                <div className={`p-3 rounded-lg ${
                  testStatus === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
                  testStatus === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                  'bg-blue-50 border border-blue-200 text-blue-800'
                }`}>
                  {testMessage}
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              💡 Tips
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Make sure your backend server is running before testing</li>
              <li>• Include the protocol (http:// or https://)</li>
              <li>• Don't include trailing slashes</li>
              <li>• For local development, use http://localhost:8000</li>
              <li>• Settings are saved in your browser's localStorage</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings button component to add to your header/nav
export function SettingsButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
        title="Settings"
      >
        ⚙️ Settings
      </button>
      <SettingsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}