import React, { useState, useRef } from 'react';
import { Play, Square } from 'lucide-react';

interface LogItem {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: string;
}

const MAX_CONCURRENT_TABS = 2;
const MAX_RETRY_ATTEMPTS = 3;

export default function AutoScanApp() {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Готов к запуску');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const openTabsCountRef = useRef(0);
  const isScanningRef = useRef(false);

  React.useEffect(() => {
    console.log('[AutoScan] Компонент AutoScanApp загружен');
  }, []);

  const addLog = (message: string, type: LogItem['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    const logItem = { message, type, timestamp };
    setLogs(prev => [...prev, logItem]);
    
    // Логирование в консоль для отладки
    const consoleMethod = type === 'error' ? 'error' : 
                         type === 'warning' ? 'warn' : 
                         type === 'success' ? 'log' : 'log';
    console[consoleMethod](`[AutoScan] [${timestamp}] ${message}`);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const waitForTabLoad = (tabId: number): Promise<void> => {
    return new Promise((resolve) => {
      const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  };

  const createTabWithRetry = async (url: string, maxAttempts = MAX_RETRY_ATTEMPTS): Promise<chrome.tabs.Tab> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
          chrome.tabs.create({ url, active: false }, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!tab) {
              reject(new Error('Tab creation failed'));
            } else {
              resolve(tab);
            }
          });
        });
        return tab;
      } catch (error) {
        if (attempt < maxAttempts) {
          await sleep(attempt * 1000);
        } else {
          throw error;
        }
      }
    }
    throw new Error('Failed after retries');
  };

  const findCourses = async (tabId: number): Promise<string[]> => {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const courses: string[] = [];
          const links = document.querySelectorAll('a[href*="/course/view.php"], a[href*="/course/"]');
          links.forEach(a => {
            if (a.href && a.href.includes('/course/') && !courses.includes(a.href)) {
              courses.push(a.href);
            }
          });
          return courses;
        }
      });
      return result?.result || [];
    } catch (error) {
      return [];
    }
  };

  const findTestsInCourse = async (courseUrl: string): Promise<string[]> => {
    while (openTabsCountRef.current >= MAX_CONCURRENT_TABS) {
      await sleep(1000);
    }

    return new Promise((resolve) => {
      const urlWithLang = courseUrl.includes('?') ? `${courseUrl}&lang=ru` : `${courseUrl}?lang=ru`;
      openTabsCountRef.current++;

      chrome.tabs.create({ url: urlWithLang, active: false }, async (tab) => {
        if (chrome.runtime.lastError || !tab) {
          openTabsCountRef.current--;
          resolve([]);
          return;
        }

        try {
          await waitForTabLoad(tab.id!);
          await sleep(3000);

          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              const tests: string[] = [];
              const links = document.querySelectorAll('a[href*="/mod/quiz/view.php"]');
              links.forEach(a => {
                if (a.href && !tests.includes(a.href)) {
                  tests.push(a.href);
                }
              });
              return tests;
            }
          });

          await sleep(500);
          chrome.tabs.remove(tab.id!, () => {
            openTabsCountRef.current--;
          });

          const quizLinks = result?.result || [];
          const reviewLinks: string[] = [];

          for (const quizUrl of quizLinks) {
            if (!isScanningRef.current) break;
            await sleep(1000);
            const reviews = await findReviewLinksFromQuiz(quizUrl);
            reviewLinks.push(...reviews);
          }

          resolve(reviewLinks);
        } catch (error) {
          try {
            chrome.tabs.remove(tab.id!);
          } catch (e) {}
          openTabsCountRef.current--;
          resolve([]);
        }
      });
    });
  };

  const findReviewLinksFromQuiz = async (quizUrl: string, shouldLog = true): Promise<string[]> => {
    while (openTabsCountRef.current >= MAX_CONCURRENT_TABS) {
      await sleep(1000);
    }

    return new Promise((resolve) => {
      const urlWithLang = quizUrl.includes('?') ? `${quizUrl}&lang=ru` : `${quizUrl}?lang=ru`;
      openTabsCountRef.current++;

      chrome.tabs.create({ url: urlWithLang, active: false }, async (tab) => {
        if (chrome.runtime.lastError || !tab) {
          openTabsCountRef.current--;
          resolve([]);
          return;
        }

        try {
          await waitForTabLoad(tab.id!);
          await sleep(2000);

          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              const links: string[] = [];
              const attemptTable = document.querySelector(
                'table.quizattemptsummary, table.quizreviewsummary, .quizattempt, #attempts'
              );
              const startButton = document.querySelector(
                'button[type="submit"]:not([name="cancel"]), input[type="submit"]:not([name="cancel"]), form[action*="/attempt.php"]'
              );

              if (startButton && !attemptTable) {
                return { links: [], isPassed: false };
              }

              if (attemptTable) {
                const reviewAnchors = attemptTable.querySelectorAll('a[href*="/mod/quiz/review.php"]');
                reviewAnchors.forEach(a => {
                  if (a.href && a.href.includes('attempt=') && !links.includes(a.href)) {
                    links.push(a.href);
                  }
                });
              }

              if (links.length === 0) {
                const allReviewLinks = document.querySelectorAll('a[href*="/mod/quiz/review.php"]');
                allReviewLinks.forEach(a => {
                  const linkText = a.textContent?.trim().toLowerCase() || '';
                  if (a.href && 
                      a.href.includes('attempt=') && 
                      (linkText.includes('просмотр') || linkText.includes('review')) &&
                      !links.includes(a.href)) {
                    links.push(a.href);
                  }
                });
              }

              return { links, isPassed: links.length > 0 };
            }
          });

          await sleep(500);
          chrome.tabs.remove(tab.id!, () => {
            openTabsCountRef.current--;
          });

          const resultData = result?.result || { links: [], isPassed: false };
          if (shouldLog) {
            if (!resultData.isPassed) {
              addLog('  ℹ️ Тест не пройден (есть кнопка "Начать тестирование")', 'info');
            } else if (resultData.links.length === 0) {
              addLog('  ℹ️ Нет доступных результатов', 'info');
            } else {
              addLog(`  ✅ Найдено ${resultData.links.length} попыток`, 'success');
            }
          }

          resolve(resultData.links);
        } catch (error) {
          try {
            chrome.tabs.remove(tab.id!);
          } catch (e) {}
          openTabsCountRef.current--;
          resolve([]);
        }
      });
    });
  };

  const findDirectReviewLinks = async (tabId: number): Promise<string[]> => {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const links: string[] = [];
          document.querySelectorAll('a[href*="/mod/quiz/review.php"]').forEach(a => {
            if (a.href && !links.includes(a.href)) links.push(a.href);
          });
          return links;
        }
      });
      return result?.result || [];
    } catch (error) {
      return [];
    }
  };

  const findQuizLinks = async (tabId: number): Promise<string[]> => {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const links: string[] = [];
          document.querySelectorAll('a[href*="/mod/quiz/view.php"]').forEach(a => {
            if (a.href && !links.includes(a.href)) links.push(a.href);
          });
          return links;
        }
      });
      return result?.result || [];
    } catch (error) {
      return [];
    }
  };

  const findAllReviewLinks = async (tabs: chrome.tabs.Tab[]): Promise<string[]> => {
    console.log('[AutoScan] findAllReviewLinks: начинаю поиск ссылок');
    const allLinks = new Set<string>();

    for (const tab of tabs) {
      if (!tab.id) continue;

      try {
        const [urlResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.location.href
        });

        const currentUrl = urlResult?.result || '';
        console.log(`[AutoScan] Проверяю вкладку: ${currentUrl}`);
        addLog(`🔍 Проверяю: ${currentUrl}`, 'info');

        if (currentUrl.includes('lms.mai.ru') && 
            (currentUrl === 'https://lms.mai.ru/' || 
             currentUrl.includes('lms.mai.ru/my') ||
             currentUrl.includes('lms.mai.ru/?redirect=0'))) {
          
          addLog('🎓 Обнаружена главная страница, ищу курсы...', 'info');
          const courseLinks = await findCourses(tab.id);

          if (courseLinks.length > 0) {
            addLog(`✅ Найдено ${courseLinks.length} курсов`, 'success');

            for (let i = 0; i < courseLinks.length; i++) {
              if (!isScanningRef.current) break;
              const courseUrl = courseLinks[i];
              addLog(`📚 [${i + 1}/${courseLinks.length}] Открываю курс...`, 'info');
              const testsFromCourse = await findTestsInCourse(courseUrl);
              testsFromCourse.forEach(link => allLinks.add(link));
            }
          }
        }

        const directLinks = await findDirectReviewLinks(tab.id);
        directLinks.forEach(link => allLinks.add(link));

        const quizLinks = await findQuizLinks(tab.id);
        for (let i = 0; i < quizLinks.length; i++) {
          if (!isScanningRef.current) break;
          const quizUrl = quizLinks[i];
          addLog(`📝 [${i + 1}/${quizLinks.length}] Проверяю тест...`, 'info');
          const reviewLinks = await findReviewLinksFromQuiz(quizUrl, false);
          reviewLinks.forEach(link => allLinks.add(link));
        }
      } catch (error) {
        console.error('[AutoScan] Ошибка при обработке вкладки:', error);
      }
    }

    const linksArray = Array.from(allLinks);
    console.log(`[AutoScan] findAllReviewLinks: найдено ${linksArray.length} ссылок на результаты`);
    return linksArray;
  };

  const scanReviewPage = async (url: string): Promise<{ questions: number; saved: number }> => {
    console.log(`[AutoScan] scanReviewPage: начинаю сканирование ${url}`);
    while (openTabsCountRef.current >= MAX_CONCURRENT_TABS) {
      await sleep(1000);
    }

    const urlWithLang = url.includes('?') ? `${url}&lang=ru` : `${url}?lang=ru`;
    openTabsCountRef.current++;
    console.log(`[AutoScan] Открываю вкладку для сканирования, открытых вкладок: ${openTabsCountRef.current}`);

    const beforeData = await chrome.storage.local.get(null);
    const beforeCount = Object.keys(beforeData).filter(key => key.startsWith('answer_')).length;
    console.log(`[AutoScan] Количество сохраненных ответов до сканирования: ${beforeCount}`);

    const tab = await createTabWithRetry(urlWithLang);

    try {
      await waitForTabLoad(tab.id!);
      await sleep(5000);

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
          const questions = document.querySelectorAll('.que');
          const isReviewPage = document.querySelector('.reviewoptions, #page-mod-quiz-review');
          return {
            count: questions.length,
            isValid: isReviewPage !== null && questions.length > 0
          };
        }
      });

      const pageData = result?.result || { count: 0, isValid: false };
      await sleep(2000);

      const afterData = await chrome.storage.local.get(null);
      const afterCount = Object.keys(afterData).filter(key => key.startsWith('answer_')).length;
      const savedCount = afterCount - beforeCount;
      console.log(`[AutoScan] Количество сохраненных ответов после сканирования: ${afterCount}, новых: ${savedCount}`);

      await sleep(500);
      chrome.tabs.remove(tab.id!, () => {
        openTabsCountRef.current--;
        console.log(`[AutoScan] Вкладка закрыта, открытых вкладок: ${openTabsCountRef.current}`);
      });

      if (!pageData.isValid || pageData.count === 0) {
        console.warn(`[AutoScan] Страница невалидна или нет вопросов: isValid=${pageData.isValid}, count=${pageData.count}`);
        throw new Error('Тест не пройден или страница недоступна');
      }

      console.log(`[AutoScan] scanReviewPage завершено: вопросы=${pageData.count}, сохранено=${Math.max(savedCount, 0)}`);
      return { 
        questions: pageData.count, 
        saved: Math.max(savedCount, 0)
      };
    } catch (error) {
      try {
        chrome.tabs.remove(tab.id!);
      } catch (e) {}
      openTabsCountRef.current--;
      throw error;
    }
  };

  const startScanning = async () => {
    if (isScanning) return;
    
    console.log('[AutoScan] Начинаю автосканирование...');
    setIsScanning(true);
    isScanningRef.current = true;
    setScannedCount(0);
    setFoundCount(0);
    setSavedCount(0);
    setProgress(0);
    setLogs([]);
    
    addLog('🚀 Начинаю автосканирование...', 'info');
    setStatus('Ищу тесты...');
    
    try {
      console.log('[AutoScan] Ищу открытые вкладки lms.mai.ru...');
      const tabs = await chrome.tabs.query({ url: '*://lms.mai.ru/*' });
      console.log('[AutoScan] Найдено вкладок:', tabs.length);
      
      if (tabs.length === 0) {
        addLog('❌ Не найдено открытых вкладок lms.mai.ru', 'error');
        addLog('💡 Откройте https://lms.mai.ru/ или страницу с вашими курсами', 'warning');
        stopScanning();
        return;
      }
      
      addLog(`✅ Найдено ${tabs.length} вкладок Moodle`, 'success');
      addLog('🔍 Ищу курсы и тесты...', 'info');
      addLog('⏳ Это может занять несколько минут...', 'info');
      setStatus('Поиск курсов и тестов...');
      
      console.log('[AutoScan] Начинаю поиск ссылок на результаты...');
      const reviewLinks = await findAllReviewLinks(tabs);
      console.log('[AutoScan] Найдено ссылок на результаты:', reviewLinks.length);
      
      if (reviewLinks.length === 0) {
        addLog('❌ Не найдено результатов тестов', 'error');
        addLog('💡 Убедитесь что вы прошли хотя бы один тест', 'warning');
        stopScanning();
        return;
      }
      
      addLog(`✅ Найдено ${reviewLinks.length} результатов тестов`, 'success');
      
      console.log('[AutoScan] Начинаю сканирование страниц результатов...');
      for (let i = 0; i < reviewLinks.length; i++) {
        if (!isScanningRef.current) {
          console.log('[AutoScan] Сканирование остановлено пользователем');
          addLog('⏹️ Сканирование остановлено пользователем', 'warning');
          break;
        }
        
        const link = reviewLinks[i];
        setScannedCount(i + 1);
        setProgress((i + 1) / reviewLinks.length * 100);
        
        console.log(`[AutoScan] Сканирование ${i + 1}/${reviewLinks.length}: ${link}`);
        addLog(`📄 Сканирование ${i + 1}/${reviewLinks.length}: ${link.substring(0, 50)}...`, 'info');
        setStatus(`Сканирование ${i + 1} из ${reviewLinks.length}...`);
        
        try {
          const result = await scanReviewPage(link);
          console.log(`[AutoScan] Результат сканирования: вопросы=${result.questions}, сохранено=${result.saved}`);
          setFoundCount(prev => prev + result.questions);
          setSavedCount(prev => prev + result.saved);
          
          if (result.saved > 0) {
            addLog(`✅ На странице: ${result.questions} вопросов, сохранено: ${result.saved}. Всего найдено: ${foundCount + result.questions}, сохранено: ${savedCount + result.saved}`, 'success');
          } else {
            addLog(`✅ На странице: ${result.questions} вопросов (уже сохранены ранее). Всего найдено: ${foundCount + result.questions}`, 'info');
          }
        } catch (error: any) {
          console.error(`[AutoScan] Ошибка при сканировании:`, error);
          addLog(`⚠️ Пропущено: ${error.message}`, 'warning');
        }
        
        await sleep(1500);
      }
      
      if (isScanningRef.current) {
        console.log('[AutoScan] Сканирование успешно завершено');
        addLog('🎉 Автосканирование завершено!', 'success');
        
        const finalData = await chrome.storage.local.get(null);
        const finalCount = Object.keys(finalData).filter(key => key.startsWith('answer_')).length;
        console.log(`[AutoScan] Итоговое количество сохраненных вопросов: ${finalCount}`);
        setSavedCount(finalCount);
        
        addLog(`📊 Итого: просканировано ${scannedCount} тестов, найдено ${foundCount} вопросов на страницах`, 'success');
        addLog(`💾 В хранилище: ${finalCount} уникальных сохраненных вопросов`, 'success');
        setStatus('Сканирование завершено');
      }
      
    } catch (error: any) {
      console.error('[AutoScan] Критическая ошибка:', error);
      addLog(`❌ Критическая ошибка: ${error.message}`, 'error');
    } finally {
      console.log('[AutoScan] Остановка сканирования');
      stopScanning();
    }
  };

  const stopScanning = () => {
    setIsScanning(false);
    isScanningRef.current = false;
    openTabsCountRef.current = 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Автосканирование тестов
          </h1>
          <p className="text-gray-500 text-sm">Автоматическое сканирование всех пройденных тестов в Moodle</p>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-900 mb-1">{status}</div>
            <div className="text-xs text-gray-500 mt-3">
              <div className="font-medium mb-2">Инструкция:</div>
              <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                <li>Откройте <a href="https://lms.mai.ru/" target="_blank" className="text-blue-600 hover:underline">lms.mai.ru</a> (главную страницу или "Мои курсы")</li>
                <li>Или откройте страницу любого вашего курса</li>
                <li>Нажмите "Начать сканирование" ниже</li>
                <li>Расширение автоматически найдет все тесты и просканирует результаты</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-gray-900 mb-1">{scannedCount}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Просканировано</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-gray-900 mb-1">{foundCount}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Найдено вопросов</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-gray-900 mb-1">{savedCount}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Сохранено</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex gap-3 justify-center">
            <button
              onClick={startScanning}
              disabled={isScanning}
              className="px-6 py-2.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              Начать сканирование
            </button>
            <button
              onClick={stopScanning}
              disabled={!isScanning}
              className="px-6 py-2.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-4 h-4" />
              Остановить
            </button>
          </div>
        </div>

        {/* Log */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm font-medium text-gray-900 mb-3">Лог сканирования</div>
          <div className="bg-gray-50 rounded-md p-3 max-h-96 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-400 text-center py-4">Лог пуст</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`${
                      log.type === 'success' ? 'text-green-600' :
                      log.type === 'error' ? 'text-red-600' :
                      log.type === 'warning' ? 'text-orange-600' :
                      'text-gray-600'
                    }`}
                  >
                    <span className="text-gray-400">[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
