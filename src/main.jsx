import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/styles/index.css';
import { installGlobalErrorTracking } from '@/lib/observability';
import { applyRuntimeConfig, ensureRuntimeConfigDefaults, isRuntimeConfigPayload, parseRuntimeConfig } from '@/config/runtimeConfig';

async function loadOptionalRuntimeConfig() {
  ensureRuntimeConfigDefaults();

  try {
    const response = await fetch('/app-config.js', { cache: 'no-store' });
    if (response.status === 404) return;

    if (!response.ok) {
      console.warn(`No se pudo cargar /app-config.js (HTTP ${response.status}). Se usarán variables de entorno/defaults.`);
      return;
    }

    const configText = await response.text();
    if (!configText.trim() || !isRuntimeConfigPayload(configText)) return;

    applyRuntimeConfig(parseRuntimeConfig(configText));
  } catch (error) {
    console.warn('No se pudo cargar /app-config.js. Se usarán variables de entorno/defaults.', error);
  }
}

async function bootstrap() {
  installGlobalErrorTracking();
  await loadOptionalRuntimeConfig();

  const { default: App } = await import('@/app/App.jsx');

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
