import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Zap,
  Globe,
  Database,
  Lightbulb,
  Users,
  FileSearch,
  BrainCircuit,
  CheckCircle2,
  Save,
  Database as DatabaseIcon,
  Scan,
  RefreshCw
} from 'lucide-react';
import { Section } from '../components/Section';
import { InfoBlock } from '../components/InfoBlock';
import { StatsChart } from '../components/StatsChart';

const App: React.FC = () => {
  const [stats, setStats] = useState({
    saved: 0,
    total: 0,
    attempts: 0
  });
  const [syncStatus, setSyncStatus] = useState('Проверка соединения...');

  useEffect(() => {
    // Используем setTimeout для асинхронной загрузки после монтирования
    let mounted = true;
    const timer = setTimeout(() => {
      if (!mounted) return;
      
      try {
        loadStatistics().catch(err => {
          if (mounted) {
            console.error('Failed to load statistics:', err);
            setStats({ saved: 0, total: 0, attempts: 0 });
          }
        });
        loadApiSettings().catch(err => {
          if (mounted) {
            console.error('Failed to load API settings:', err);
            setSyncStatus('❌ Ошибка подключения');
          }
        });
      } catch (err) {
        if (mounted) {
          console.error('Error in useEffect:', err);
        }
      }
    }, 100);
    
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const loadStatistics = async function loadStatistics() {
    try {
      // Проверяем доступность Chrome API
      if (typeof window === 'undefined') {
        console.warn('[loadStatistics] window is undefined');
        setStats({ saved: 0, total: 0, attempts: 0 });
        return;
      }

      if (typeof chrome === 'undefined') {
        console.warn('[loadStatistics] chrome is undefined');
        setStats({ saved: 0, total: 0, attempts: 0 });
        return;
      }

      if (!chrome.storage) {
        console.warn('[loadStatistics] chrome.storage is not available');
        setStats({ saved: 0, total: 0, attempts: 0 });
        return;
      }

      if (!chrome.storage.local || !chrome.storage.sync) {
        console.warn('[loadStatistics] chrome.storage.local or sync is not available');
        setStats({ saved: 0, total: 0, attempts: 0 });
        return;
      }

      // Загружаем сохраненные ответы
      let localData: Record<string, any> = {};
      try {
        const result = await chrome.storage.local.get(null);
        localData = result || {};
      } catch (err) {
        console.warn('[loadStatistics] Error reading local storage:', err);
        localData = {};
      }

      let savedCount = 0;
      if (localData && typeof localData === 'object' && localData !== null) {
        try {
          const keys = Object.keys(localData);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key && typeof key === 'string' && key.startsWith('answer_')) {
              savedCount++;
            }
          }
        } catch (err) {
          console.warn('[loadStatistics] Error counting saved answers:', err);
        }
      }

      // Загружаем статистику из local storage (stats_${hash})
      let questionCount = 0;
      let totalAttempts = 0;
      
      if (localData && typeof localData === 'object' && localData !== null) {
        try {
          const keys = Object.keys(localData);
          const questionHashes = new Set<string>();
          
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key && typeof key === 'string') {
              // Статистика хранится как stats_${hash}
              if (key.startsWith('stats_')) {
                const hash = key.replace('stats_', '');
                questionHashes.add(hash);
                
                // Загружаем статистику для этого вопроса
                const stats = localData[key];
                if (typeof stats === 'object' && stats !== null && stats !== undefined) {
                  if ('totalAttempts' in stats) {
                    const attempts = (stats as any).totalAttempts;
                    if (typeof attempts === 'number' && !isNaN(attempts) && isFinite(attempts) && attempts >= 0) {
                      totalAttempts += attempts;
                    }
                  }
                }
              }
            }
          }
          
          questionCount = questionHashes.size;
        } catch (err) {
          console.warn('[loadStatistics] Error counting questions:', err);
        }
      }

      setStats({
        saved: savedCount,
        total: questionCount,
        attempts: totalAttempts
      });
    } catch (e) {
      console.error('[loadStatistics] Unexpected error:', e);
      // Устанавливаем значения по умолчанию при ошибке
      setStats({
        saved: 0,
        total: 0,
        attempts: 0
      });
    }
  };

  const loadApiSettings = async function loadApiSettings() {
    try {
      // Проверяем доступность Chrome API
      if (typeof window === 'undefined' || typeof chrome === 'undefined') {
        console.warn('Chrome API not available - window or chrome is undefined');
        setSyncStatus('⚠️ API недоступен');
        return;
      }

      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        console.warn('Chrome runtime API not available');
        setSyncStatus('⚠️ API недоступен');
        return;
      }

      let response: any = null;
      try {
        response = await chrome.runtime.sendMessage({ action: 'getApiSettings' });
      } catch (err) {
        console.warn('Error sending message to background:', err);
        checkApiConnection('http://130.61.200.70:8080');
        return;
      }

      if (response && response.settings && response.settings.apiUrl) {
        const apiUrl = response.settings.apiUrl;
        checkApiConnection(apiUrl);
      } else {
        checkApiConnection('http://130.61.200.70:8080');
      }
    } catch (e) {
      console.error('Error loading API settings:', e);
      checkApiConnection('http://130.61.200.70:8080');
    }
  };

  const checkApiConnection = async function checkApiConnection(apiUrl: string) {
    setSyncStatus('⏳ Проверка соединения...');
    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        setSyncStatus('Соединение установлено');
      } else {
        setSyncStatus('⚠️ Сервер недоступен');
      }
    } catch (e) {
      setSyncStatus('❌ Не удалось подключиться к серверу');
    }
  }

  return (
    <div className="w-full h-full bg-slate-50/50 flex flex-col font-sans text-slate-800">
      
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-5 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900 leading-tight">
          LMS MAI Quiz Solver
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Автоматический помощник для решения тестов
        </p>
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-8 scroll-smooth">
        
        {/* How to use */}
        <Section title="Как использовать" icon={BookOpen}>
          <div className="space-y-1">
            <InfoBlock 
              number={1} 
              title="Откройте тест в Moodle" 
            />
            <InfoBlock 
              number={2} 
              title="Нажмите «Найти ответ»" 
              description="Кнопка появится под каждым вопросом"
              icon={Search}
              highlight
            />
            <InfoBlock 
              number={3} 
              title="Автоматическое решение" 
              description="Расширение автоматически найдет и применит правильный ответ"
            />
            <InfoBlock 
              number={4} 
              title="Авто-решение" 
              description="Используйте для всех вопросов сразу"
              icon={Zap}
            />
            <InfoBlock 
              number={5} 
              title="Автоматическое сканирование" 
              description="Расширение автоматически сканирует все пройденные тесты при взаимодействии с сайтом"
              icon={Scan}
              highlight
            />
          </div>
        </Section>

        {/* Features */}
        <Section title="Возможности" icon={Lightbulb}>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
              <Search className="w-4 h-4 text-purple-500" />
              <span>Автоматический поиск правильных ответов</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
              <BrainCircuit className="w-4 h-4 text-amber-500" />
              <span>Умный анализ вопросов и вариантов</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
              <Zap className="w-4 h-4 text-orange-500" />
              <span>Массовое решение всех вопросов</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
              <Globe className="w-4 h-4 text-blue-500" />
              <span>Поиск ответов в Google для сложных вопросов</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
              <Scan className="w-4 h-4 text-green-500" />
              <span>Автоматическое сканирование всех пройденных тестов</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
              <RefreshCw className="w-4 h-4 text-indigo-500" />
              <span>Автоматическое сохранение ответов при прохождении тестов</span>
            </div>
          </div>
        </Section>

        {/* Methods */}
        <Section title="Методы поиска ответов" icon={Database}>
          <div className="space-y-2">
            <InfoBlock 
              number={1} 
              title="Сохраненные ответы" 
              description="Использует ранее сохраненные правильные ответы"
            />
            <InfoBlock 
              number={2} 
              title="Статистика других пользователей" 
              description="Показывает наиболее популярные правильные ответы"
              icon={Users}
            />
            <InfoBlock 
              number={3} 
              title="Поиск на странице" 
              description="Ищет уже отмеченные правильные ответы"
              icon={FileSearch}
            />
            <InfoBlock 
              number={4} 
              title="Онлайн поиск" 
              description="Открывает Google для поиска ответа, если ответ не найден в базе"
              icon={Globe}
            />
          </div>
        </Section>

        {/* Statistics */}
        <Section title="Статистика" icon={Search}>
          <StatsChart 
            saved={stats.saved} 
            total={stats.total} 
            attempts={stats.attempts} 
          />
        </Section>

        {/* Sync */}
        <Section title="Синхронизация между пользователями" icon={Globe}>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Синхронизация включена
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {syncStatus}
              </div>
            </div>
          </div>
        </Section>

        {/* Saved Data */}
        <Section title="Сохраненные данные" icon={DatabaseIcon}>
          <div className="space-y-2">
            <button
              onClick={() => {
                chrome.tabs.create({
                  url: chrome.runtime.getURL('html/saved-data-react.html')
                });
              }}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <DatabaseIcon className="w-4 h-4" />
              Просмотр данных
            </button>
          </div>
        </Section>

        {/* Auto Scan */}
        <Section title="Автосканирование" icon={Scan}>
          <div className="space-y-2">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-2">
              <p className="text-sm text-blue-800">
                Расширение автоматически сканирует все пройденные тесты при открытии главной страницы LMS или любой другой страницы сайта. Сканирование происходит в фоновом режиме без открытия новых вкладок.
              </p>
            </div>
            <button
              onClick={() => {
                chrome.tabs.create({
                  url: chrome.runtime.getURL('html/auto-scan-react.html')
                });
              }}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <Scan className="w-4 h-4" />
              Ручное автосканирование
            </button>
          </div>
        </Section>
      </main>

      {/* Footer / Tip */}
      <footer className="bg-amber-50 border-t border-amber-100 p-4">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">Совет:</span> Сохраняйте правильные ответы с помощью кнопки <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 rounded text-amber-800 font-semibold border border-amber-200"><Save className="w-3 h-3"/> Сохранить ответ</span> — это поможет другим пользователям и вам в будущем.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">Автосканирование:</span> Расширение автоматически сканирует все пройденные тесты при открытии страниц LMS. Ответы сохраняются автоматически при прохождении тестов.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              Включите синхронизацию с сервером для обмена статистикой между всеми пользователями.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;