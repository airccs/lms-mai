import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './popup.css';

// Глобальная обработка ошибок
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[Global Error Handler]', event.error || event.message, event.filename, event.lineno);
    event.preventDefault(); // Предотвращаем вывод ошибки в консоль браузера
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    event.preventDefault();
  });
}

// Инициализация React приложения
function initApp() {
  try {
    const container = document.getElementById('root');
    if (!container) {
      console.error('[Popup Init] Root container not found');
      document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: Arial;">Ошибка: контейнер root не найден</div>';
      return;
    }

    console.log('[Popup Init] Starting React app...');
    const root = createRoot(container);
    
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    
    console.log('[Popup Init] React app rendered successfully');
  } catch (error) {
    console.error('[Popup Init Error]', error);
    const container = document.getElementById('root');
    if (container) {
      container.innerHTML = `
        <div style="padding: 20px; color: red; font-family: Arial;">
          <h2>Ошибка загрузки расширения</h2>
          <p>Проверьте консоль для деталей.</p>
          <pre style="background: #f5f5f5; padding: 10px; margin-top: 10px; overflow: auto;">${error instanceof Error ? error.stack : String(error)}</pre>
        </div>
      `;
    }
  }
}

// Запускаем инициализацию после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM уже загружен
  initApp();
}

