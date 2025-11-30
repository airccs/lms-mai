// Cloudflare Worker для API синхронизации LMS MAI Quiz Solver
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === '/api/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get statistics for a question
      if (path.startsWith('/api/stats/') && request.method === 'GET') {
        const questionHash = path.split('/api/stats/')[1];
        if (!questionHash) {
          return new Response(JSON.stringify({ error: 'Question hash required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const stats = await env.QUIZ_DATA.get(`stats_${questionHash}`);
        if (!stats) {
          return new Response(JSON.stringify({ statistics: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ statistics: JSON.parse(stats) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get all statistics
      if (path === '/api/stats' && request.method === 'GET') {
        // Note: KV doesn't support listing all keys efficiently
        // This is a simplified implementation
        return new Response(JSON.stringify({ statistics: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Submit answer statistics
      if (path === '/api/submit' && request.method === 'POST') {
        const data = await request.json();
        const { questionHash, answer, isCorrect } = data;

        if (!questionHash) {
          return new Response(JSON.stringify({ error: 'Question hash required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get existing stats
        const existingStats = await env.QUIZ_DATA.get(`stats_${questionHash}`);
        let stats = existingStats ? JSON.parse(existingStats) : {
          totalAttempts: 0,
          correctAttempts: 0,
          answers: {},
        };

        // Update stats
        stats.totalAttempts = (stats.totalAttempts || 0) + 1;
        if (isCorrect) {
          stats.correctAttempts = (stats.correctAttempts || 0) + 1;
        }

        const answerKey = JSON.stringify(answer);
        stats.answers = stats.answers || {};
        stats.answers[answerKey] = (stats.answers[answerKey] || 0) + 1;

        // Save updated stats
        await env.QUIZ_DATA.put(`stats_${questionHash}`, JSON.stringify(stats));

        return new Response(JSON.stringify({ statistics: stats }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Save answer
      if (path === '/api/save' && request.method === 'POST') {
        const data = await request.json();
        const { questionHash, answer, isCorrect } = data;

        if (!questionHash) {
          return new Response(JSON.stringify({ error: 'Question hash required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Save answer (simplified - in real implementation might want to store multiple answers)
        await env.QUIZ_DATA.put(`answer_${questionHash}`, JSON.stringify({
          answer,
          isCorrect,
          timestamp: Date.now(),
        }));

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get saved answers for a question
      if (path.startsWith('/api/answers/') && request.method === 'GET') {
        const questionHash = path.split('/api/answers/')[1];
        if (!questionHash) {
          return new Response(JSON.stringify({ error: 'Question hash required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const answer = await env.QUIZ_DATA.get(`answer_${questionHash}`);
        if (!answer) {
          return new Response(JSON.stringify({ answers: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ answers: [JSON.parse(answer)] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

