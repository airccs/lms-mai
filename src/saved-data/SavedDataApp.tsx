import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, Download, Trash2, Scan, Image as ImageIcon } from 'lucide-react';
import { ALLOW_DELETE_DATA } from '../config';

interface SavedAnswer {
  hash: string;
  answer: any;
  timestamp: number;
  isCorrect: boolean | null;
  questionText: string;
  questionImage?: string;
  statistics?: {
    totalAttempts: number;
    correctAttempts: number;
  };
}

export default function SavedDataApp() {
  const [data, setData] = useState<SavedAnswer[]>([]);
  const [filteredData, setFilteredData] = useState<SavedAnswer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    correct: 0,
    accuracy: 0,
    sizeKB: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterData();
  }, [searchQuery, data]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllSavedData' });
      if (response && response.success && response.data) {
        setData(response.data);
        updateStats(response.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterData = () => {
    if (!searchQuery.trim()) {
      setFilteredData(data);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = data.filter(item => {
      const questionText = (item.questionText || '').toLowerCase();
      const answerText = formatAnswer(item.answer).toLowerCase();
      return questionText.includes(query) || answerText.includes(query);
    });
    setFilteredData(filtered);
  };

  const updateStats = (items: SavedAnswer[]) => {
    // Проверяем isCorrect как boolean (true) или INTEGER (1) из SQLite
    const correctCount = items.filter(item => item.isCorrect === true || item.isCorrect === 1).length;
    const totalWithIsCorrect = items.filter(item => item.isCorrect !== null && item.isCorrect !== undefined).length;
    const accuracy = totalWithIsCorrect > 0 ? Math.round((correctCount / totalWithIsCorrect) * 100) : 0;
    const dataSize = JSON.stringify(items).length;
    setStats({
      total: items.length,
      correct: correctCount,
      accuracy: accuracy,
      sizeKB: Math.round(dataSize / 1024 * 100) / 100
    });
  };

  const deleteItem = async (hash: string) => {
    if (!confirm('Удалить этот вопрос и ответ?')) return;

    try {
      await chrome.runtime.sendMessage({ action: 'deleteSavedAnswer', hash });
      loadData();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Ошибка при удалении');
    }
  };

  const clearAllData = async () => {
    if (!confirm('⚠️ ВНИМАНИЕ! Это удалит ВСЕ сохраненные вопросы и ответы. Продолжить?')) return;
    if (!confirm('Вы уверены? Это действие нельзя отменить!')) return;

    try {
      await chrome.runtime.sendMessage({ action: 'clearAllSavedAnswers' });
      loadData();
      alert('Все данные удалены');
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Ошибка при удалении данных');
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lms-mai-saved-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startAutoScan = () => {
    const scanUrl = chrome.runtime.getURL('html/auto-scan-react.html');
    window.open(scanUrl, '_blank');
  };

  const formatAnswer = (answer: any): string => {
    if (typeof answer === 'string') return answer;
    if (Array.isArray(answer)) return answer.join(', ');
    if (typeof answer === 'object') {
      if (answer.text) return answer.text;
      if (answer.value) return answer.value;
      return JSON.stringify(answer);
    }
    return String(answer);
  };

  const getAccuracy = (item: SavedAnswer): number | null => {
    if (!item.statistics || item.statistics.totalAttempts === 0) return null;
    return Math.round((item.statistics.correctAttempts / item.statistics.totalAttempts) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-300 border-t-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 text-sm">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Сохраненные данные
          </h1>
          <p className="text-gray-500 text-sm">Просмотр всех сохраненных вопросов и ответов</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-gray-900 mb-1">{stats.total}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Всего вопросов</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-green-600 mb-1">{stats.correct}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Правильных</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-blue-600 mb-1">
              {Math.round((stats.correct / stats.total) * 100) || 0}%
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Точность</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-gray-900 mb-1">{stats.sizeKB} KB</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Размер данных</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Поиск по вопросам и ответам..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2 font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </button>
            <button
              onClick={startAutoScan}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
            >
              <Scan className="w-4 h-4" />
              Автосканирование
            </button>
            <button
              onClick={exportData}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2 font-medium"
            >
              <Download className="w-4 h-4" />
              Экспорт
            </button>
            {ALLOW_DELETE_DATA && (
              <button
                onClick={clearAllData}
                className="px-4 py-2 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors flex items-center gap-2 font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Очистить
              </button>
            )}
          </div>
        </div>

        {/* Data List */}
        {filteredData.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3 text-gray-400">📭</div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Нет сохраненных данных</h3>
            <p className="text-sm text-gray-500">
              {searchQuery ? 'По вашему запросу ничего не найдено' : 'Начните использовать расширение на тестах Moodle'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredData.map((item, index) => {
              const accuracy = getAccuracy(item);
              const date = new Date(item.timestamp).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div key={item.hash} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  {/* Header */}
                  <div className="p-5 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-medium text-gray-500">Вопрос #{index + 1}</span>
                          {(item.isCorrect === true || item.isCorrect === 1) && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium border border-green-200">
                              Правильно
                            </span>
                          )}
                          {(item.isCorrect === false || item.isCorrect === 0) && (
                            <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-medium border border-red-200">
                              Неправильно
                            </span>
                          )}
                          {item.isCorrect === null && (
                            <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs font-medium border border-gray-200">
                              Неизвестно
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>{date}</span>
                          {accuracy !== null && <span>Точность: {accuracy}%</span>}
                          {item.statistics && item.statistics.totalAttempts > 0 && (
                            <span>Попыток: {item.statistics.totalAttempts}</span>
                          )}
                        </div>
                      </div>
                      {ALLOW_DELETE_DATA && (
                        <button
                          onClick={() => deleteItem(item.hash)}
                          className="ml-4 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors font-medium"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Image */}
                    {item.questionImage && (
                      <div className="rounded-md overflow-hidden border border-gray-200 bg-gray-50 p-3 flex justify-center items-center">
                        <img
                          src={item.questionImage}
                          alt="Изображение вопроса"
                          className="max-w-full max-h-[200px] w-auto h-auto object-contain"
                          style={{ maxWidth: '100%', maxHeight: '200px', width: 'auto', height: 'auto', objectFit: 'contain' }}
                        />
                      </div>
                    )}

                    {/* Question */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Вопрос</p>
                      <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{item.questionText || 'Текст вопроса не сохранен'}</p>
                    </div>

                    {/* Answer */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Ответ</p>
                      <p className={`text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                        item.isCorrect === true ? 'text-green-700' :
                        item.isCorrect === false ? 'text-red-700' : 'text-gray-900'
                      }`}>
                        {formatAnswer(item.answer)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

