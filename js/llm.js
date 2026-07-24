/**
 * Адаптер нейронки (итерация 8).
 *
 * Работает с любым OpenAI-совместимым API (OpenAI, прокси, свой бэкенд):
 * endpoint и модель настраиваются. Ключ хранится ТОЛЬКО в localStorage браузера —
 * в код и репозиторий не попадает. Для публичной страницы рекомендуется лёгкий
 * прокси-бэкенд (Cloudflare Worker и т.п.), чтобы не раздавать ключ; для локального
 * показа достаточно вставить ключ в настройках «ИИ» в шапке демо.
 *
 * Без ключа демо работает как раньше — на шаблонных текстах.
 */

// миграция: старый дефолт заменяем на nano
if (localStorage.getItem('llm_model') === 'gpt-4o-mini') localStorage.removeItem('llm_model');

const LLM = {
  get key() { return localStorage.getItem('llm_key') || ''; },
  get url() { return localStorage.getItem('llm_url') || 'https://api.openai.com/v1/chat/completions'; },
  get model() { return localStorage.getItem('llm_model') || 'gpt-5-nano'; },

  save({ key, url, model }) {
    if (key !== undefined) localStorage.setItem('llm_key', key.trim());
    if (url !== undefined && url.trim()) localStorage.setItem('llm_url', url.trim());
    if (model !== undefined && model.trim()) localStorage.setItem('llm_model', model.trim());
  },

  clear() {
    localStorage.removeItem('llm_key');
  },

  enabled() { return !!this.key; },

  /** Один запрос: system + user, возвращает текст ответа. */
  async complete(userPrompt, { temperature = 0.3, maxTokens = 4000 } = {}) {
    // gpt-5-* и o-*: max_completion_tokens (включая reasoning-токены!), temperature не передаём,
    // reasoning_effort=low, чтобы бюджет уходил в текст, а не в размышления
    const reasoning = /^(gpt-5|o\d)/.test(this.model);
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: PROMPTS.system },
        { role: 'user', content: userPrompt }
      ]
    };
    if (reasoning) {
      body.max_completion_tokens = maxTokens;
      body.reasoning_effort = 'low';
    } else {
      body.temperature = temperature;
      body.max_tokens = maxTokens;
    }

    console.log('[LLM] →', this.model, this.url, `prompt ${userPrompt.length} chars, limit ${maxTokens}`);
    const r = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.key
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('[LLM] HTTP', r.status, errText);
      let apiMsg = '';
      try { apiMsg = JSON.parse(errText).error.message.slice(0, 120); } catch {}
      throw new Error(`HTTP ${r.status}${apiMsg ? ': ' + apiMsg : ''}`);
    }
    const j = await r.json();
    const choice = j.choices && j.choices[0];
    const text = choice && choice.message && choice.message.content;
    console.log('[LLM] ←', {
      finish_reason: choice && choice.finish_reason,
      usage: j.usage,
      contentLength: (text || '').length
    });
    if (!text) {
      console.error('[LLM] пустой ответ, полный JSON:', j);
      const reason = choice && choice.finish_reason === 'length'
        ? 'бюджет токенов ушёл в reasoning (finish_reason=length) — увеличьте лимит'
        : 'пустой content';
      throw new Error(reason);
    }
    return text.trim();
  }
};
