import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './popup.css';

// Глобальная обработка ошибок
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler]', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

const container = document.getElementById('root');
if (container) {
  try {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('[Popup Init Error]', error);
    container.innerHTML = '<div style="padding: 20px; color: red;">Ошибка загрузки расширения. Проверьте консоль.</div>';
  }
} else {
  console.error('[Popup Init] Root container not found');
}

