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
  Save
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
    loadStatistics();
    loadApiSettings();
  }, []);

  async function loadStatistics() {
    try {
      // Загружаем сохраненные ответы
      const localData = await chrome.storage.local.get(null);
      let savedCount = 0;
      for (const key of Object.keys(localData)) {
        if (key.startsWith('answer_')) {
          savedCount++;
        }
      }

      // Загружаем статистику из sync storage
      const syncData = await chrome.storage.sync.get(['questionStats']);
      const questionStats = syncData.questionStats || {};
      const questionCount = Object.keys(questionStats).length;

      // Подсчитываем общее количество попыток
      let totalAttempts = 0;
      for (const stats of Object.values(questionStats)) {
        if (typeof stats === 'object' && stats !== null && 'totalAttempts' in stats) {
          totalAttempts += (stats as any).totalAttempts || 0;
        }
      }

      setStats({
        saved: savedCount,
        total: questionCount,
        attempts: totalAttempts
      });
    } catch (e) {
      console.error('Error loading statistics:', e);
    }
  }

  async function loadApiSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getApiSettings' });
      if (response && response.settings) {
        const apiUrl = response.settings.apiUrl || 'https://lms-mai-api.iljakir-06.workers.dev';
        checkApiConnection(apiUrl);
      }
    } catch (e) {
      console.error('Error loading API settings:', e);
      checkApiConnection('https://lms-mai-api.iljakir-06.workers.dev');
    }
  }

  async function checkApiConnection(apiUrl: string) {
    setSyncStatus('⏳ Проверка соединения...');
    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        setSyncStatus('✅ Соединение установлено');
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
              title="Эвристический анализ" 
              description="Анализирует варианты ответов и выбирает наиболее вероятный"
              icon={BrainCircuit}
            />
             <InfoBlock 
              number={5} 
              title="Онлайн поиск" 
              description="Открывает Google для поиска ответа"
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
      </main>

      {/* Footer / Tip */}
      <footer className="bg-amber-50 border-t border-amber-100 p-4">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Совет:</span> Сохраняйте правильные ответы с помощью кнопки <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 rounded text-amber-800 font-semibold border border-amber-200"><Save className="w-3 h-3"/> Сохранить ответ</span> — это поможет другим пользователям и вам в будущем. Включите синхронизацию с сервером для обмена статистикой между всеми пользователями.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;