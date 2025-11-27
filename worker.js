// Cloudflare Worker для синхронизации статистики Moodle Quiz Solver
// Версия с поддержкой Cloudflare KV для постоянного хранения

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Ключи для KV
const KV_KEYS = {
  STATISTICS: 'statistics',
  SAVED_ANSWERS: 'saved_answers',
};

// Fallback: хранение в памяти (если KV не настроен)
let memoryStatistics = {};
let memorySavedAnswers = {};

// Обработка CORS preflight
function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Получить статистику из KV или памяти
async function getStatistics(env) {
  if (env.QUIZ_DATA) {
    // Используем KV
    const data = await env.QUIZ_DATA.get(KV_KEYS.STATISTICS, 'json');
    return data || {};
  }
  // Fallback на память
  return memoryStatistics;
}

// Сохранить статистику в KV или память
async function saveStatistics(env, statistics) {
  if (env.QUIZ_DATA) {
    // Используем KV
    await env.QUIZ_DATA.put(KV_KEYS.STATISTICS, JSON.stringify(statistics));
  } else {
    // Fallback на память
    memoryStatistics = statistics;
  }
}

// Получить сохраненные ответы из KV или памяти
async function getSavedAnswers(env) {
  if (env.QUIZ_DATA) {
    const data = await env.QUIZ_DATA.get(KV_KEYS.SAVED_ANSWERS, 'json');
    return data || {};
  }
  return memorySavedAnswers;
}

// Сохранить ответы в KV или память
async function saveSavedAnswers(env, savedAnswers) {
  if (env.QUIZ_DATA) {
    await env.QUIZ_DATA.put(KV_KEYS.SAVED_ANSWERS, JSON.stringify(savedAnswers));
  } else {
    memorySavedAnswers = savedAnswers;
  }
}

// Health check
async function handleHealth(env) {
  const storageType = env.QUIZ_DATA ? 'KV (persistent)' : 'Memory (temporary)';
  return new Response(
    JSON.stringify({
      status: 'ok',
      message: 'Quiz Solver API is running',
      storage: storageType,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Получить статистику для конкретного вопроса
async function getStats(questionHash, env) {
  const statistics = await getStatistics(env);
  const stats = statistics[questionHash] || {
    totalAttempts: 0,
    correctAttempts: 0,
    answers: {},
    errors: [],
  };
  
  return new Response(
    JSON.stringify({ statistics: stats }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Получить всю статистику
async function getAllStats(env) {
  const statistics = await getStatistics(env);
  return new Response(
    JSON.stringify({ statistics: statistics }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Отправить ответ (обновить статистику)
async function submitAnswer(request, env) {
  try {
    const body = await request.json();
    const { questionHash, answer, isCorrect } = body;

    if (!questionHash || answer === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const statistics = await getStatistics(env);

    // Инициализируем статистику, если её нет
    if (!statistics[questionHash]) {
      statistics[questionHash] = {
        totalAttempts: 0,
        correctAttempts: 0,
        answers: {},
        errors: [],
      };
    }

    const stats = statistics[questionHash];
    stats.totalAttempts++;

    if (isCorrect === true) {
      stats.correctAttempts++;
    } else if (isCorrect === false) {
      stats.errors.push({
        answer: answer,
        timestamp: Date.now(),
      });
      // Ограничиваем количество ошибок (последние 100)
      if (stats.errors.length > 100) {
        stats.errors = stats.errors.slice(-100);
      }
    }

    // Обновляем популярность ответов
    const answerKey = JSON.stringify(answer);
    stats.answers[answerKey] = (stats.answers[answerKey] || 0) + 1;

    // Сохраняем обновленную статистику
    await saveStatistics(env, statistics);

    return new Response(
      JSON.stringify({
        success: true,
        statistics: stats,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON', details: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// Сохранить ответ
async function saveAnswer(request, env) {
  try {
    const body = await request.json();
    const { questionHash, answer, isCorrect } = body;

    if (!questionHash || !answer) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const savedAnswers = await getSavedAnswers(env);

    if (!savedAnswers[questionHash]) {
      savedAnswers[questionHash] = [];
    }

    savedAnswers[questionHash].push({
      answer: answer,
      isCorrect: isCorrect,
      timestamp: Date.now(),
    });

    // Ограничиваем количество сохраненных ответов (последние 50)
    if (savedAnswers[questionHash].length > 50) {
      savedAnswers[questionHash] = savedAnswers[questionHash].slice(-50);
    }

    await saveSavedAnswers(env, savedAnswers);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON', details: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// Получить сохраненные ответы для вопроса
async function getAnswers(questionHash, env) {
  const savedAnswers = await getSavedAnswers(env);
  const answers = savedAnswers[questionHash] || [];
  
  // Фильтруем только правильные ответы
  const correctAnswers = answers.filter(a => a.isCorrect === true);
  
  return new Response(
    JSON.stringify({ answers: correctAnswers }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Статистика сервера
async function getServerStats(env) {
  const statistics = await getStatistics(env);
  const totalQuestions = Object.keys(statistics).length;
  let totalAttempts = 0;
  let totalCorrect = 0;

  for (const stats of Object.values(statistics)) {
    totalAttempts += stats.totalAttempts || 0;
    totalCorrect += stats.correctAttempts || 0;
  }

  const storageType = env.QUIZ_DATA ? 'KV (persistent)' : 'Memory (temporary)';

  return new Response(
    JSON.stringify({
      totalQuestions,
      totalAttempts,
      totalCorrect,
      accuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts * 100).toFixed(2) : 0,
      storage: storageType,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Главный обработчик
export default {
  async fetch(request, env, ctx) {
    // Обработка CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Корневой путь - информация об API
    if (path === '/' || path === '') {
      const storageType = env.QUIZ_DATA ? 'KV (persistent)' : 'Memory (temporary)';
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'LMS MAI Quiz Solver API',
          version: '1.0.0',
          storage: storageType,
          endpoints: {
            health: 'GET /api/health',
            stats: 'GET /api/stats',
            questionStats: 'GET /api/stats/:questionHash',
            submit: 'POST /api/submit',
            save: 'POST /api/save',
            answers: 'GET /api/answers/:questionHash',
            serverStats: 'GET /api/server/stats'
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Маршрутизация
    if (path === '/api/health') {
      return handleHealth(env);
    }

    if (path === '/api/stats' && request.method === 'GET') {
      return getAllStats(env);
    }

    if (path.startsWith('/api/stats/') && request.method === 'GET') {
      const questionHash = path.split('/api/stats/')[1];
      return getStats(questionHash, env);
    }

    if (path === '/api/submit' && request.method === 'POST') {
      return submitAnswer(request, env);
    }

    if (path === '/api/save' && request.method === 'POST') {
      return saveAnswer(request, env);
    }

    if (path.startsWith('/api/answers/') && request.method === 'GET') {
      const questionHash = path.split('/api/answers/')[1];
      return getAnswers(questionHash, env);
    }

    if (path === '/api/server/stats' && request.method === 'GET') {
      return getServerStats(env);
    }

    // 404 для неизвестных маршрутов
    return new Response(
      JSON.stringify({
        error: 'Not found',
        path: path,
        method: request.method,
        availableEndpoints: [
          'GET /',
          'GET /api/health',
          'GET /api/stats',
          'GET /api/stats/:questionHash',
          'POST /api/submit',
          'POST /api/save',
          'GET /api/answers/:questionHash',
          'GET /api/server/stats'
        ]
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  },
};

