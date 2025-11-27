// Cloudflare Worker для синхронизации статистики Moodle Quiz Solver

// Хранилище в памяти (для демонстрации)
// В продакшене используйте KV или Durable Objects
let statistics = {};
let savedAnswers = {};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Обработка CORS preflight
function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Health check
async function handleHealth() {
  return new Response(
    JSON.stringify({ status: 'ok', message: 'Quiz Solver API is running' }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Получить статистику для конкретного вопроса
async function getStats(questionHash) {
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
async function getAllStats() {
  return new Response(
    JSON.stringify({ statistics: statistics }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// Отправить ответ (обновить статистику)
async function submitAnswer(request) {
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
    }

    // Обновляем популярность ответов
    const answerKey = JSON.stringify(answer);
    stats.answers[answerKey] = (stats.answers[answerKey] || 0) + 1;

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
      JSON.stringify({ error: 'Invalid JSON' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// Сохранить ответ
async function saveAnswer(request) {
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

    if (!savedAnswers[questionHash]) {
      savedAnswers[questionHash] = [];
    }

    savedAnswers[questionHash].push({
      answer: answer,
      isCorrect: isCorrect,
      timestamp: Date.now(),
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// Получить сохраненные ответы для вопроса
async function getAnswers(questionHash) {
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
async function getServerStats() {
  const totalQuestions = Object.keys(statistics).length;
  let totalAttempts = 0;
  let totalCorrect = 0;

  for (const stats of Object.values(statistics)) {
    totalAttempts += stats.totalAttempts || 0;
    totalCorrect += stats.correctAttempts || 0;
  }

  return new Response(
    JSON.stringify({
      totalQuestions,
      totalAttempts,
      totalCorrect,
      accuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts * 100).toFixed(2) : 0,
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

    // Маршрутизация
    if (path === '/api/health') {
      return handleHealth();
    }

    if (path === '/api/stats' && request.method === 'GET') {
      return getAllStats();
    }

    if (path.startsWith('/api/stats/') && request.method === 'GET') {
      const questionHash = path.split('/api/stats/')[1];
      return getStats(questionHash);
    }

    if (path === '/api/submit' && request.method === 'POST') {
      return submitAnswer(request);
    }

    if (path === '/api/save' && request.method === 'POST') {
      return saveAnswer(request);
    }

    if (path.startsWith('/api/answers/') && request.method === 'GET') {
      const questionHash = path.split('/api/answers/')[1];
      return getAnswers(questionHash);
    }

    if (path === '/api/server/stats' && request.method === 'GET') {
      return getServerStats();
    }

    // 404 для неизвестных маршрутов
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  },
};

