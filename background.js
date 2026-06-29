// ==================== AI 翻译助手 - Background Service Worker ====================

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  sourceLanguage: 'auto',
  targetLanguage: 'auto'
};

// 语言映射
const LANGUAGE_MAP = {
  'auto': '自动检测',
  'zh': '中文',
  'en': '英文',
  'ja': '日文',
  'ko': '韩文',
  'fr': '法文',
  'de': '德文',
  'es': '西班牙文',
  'ru': '俄文',
  'ar': '阿拉伯文',
  'it': '意大利文',
  'pt': '葡萄牙文'
};

// 获取设置
async function getSettings() {
  return await chrome.storage.sync.get(DEFAULT_SETTINGS);
}

// 构造 API URL
function getApiUrl(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

// 构造翻译系统提示词
function buildTranslatePrompt(sourceLang, targetLang) {
  const sourceName = LANGUAGE_MAP[sourceLang] || '自动检测';
  const targetName = LANGUAGE_MAP[targetLang] || '中文';

  if (sourceLang === 'auto' && targetLang === 'auto') {
    return '你是一个专业翻译助手。请将用户提供的文本翻译成目标语言。如果文本是中文，翻译成英文；如果是英文或其他语言，翻译成中文。只返回翻译结果，不要添加任何解释或额外内容。';
  }

  if (sourceLang === 'auto') {
    return `你是一个专业翻译助手。请将用户提供的文本翻译成${targetName}。只返回翻译结果，不要添加任何解释或额外内容。`;
  }

  if (targetLang === 'auto') {
    return `你是一个专业翻译助手。请将用户提供的${sourceName}文本翻译成中文（如果原文是中文则翻译成英文）。只返回翻译结果，不要添加任何解释或额外内容。`;
  }

  return `你是一个专业翻译助手。请将用户提供的${sourceName}文本翻译成${targetName}。只返回翻译结果，不要添加任何解释或额外内容。`;
}

// 调用 AI API（OpenAI 兼容协议），返回内容和 token 用量
async function callAI(messages, settings) {
  const url = getApiUrl(settings.baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: messages,
      max_tokens: 4096,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `API请求失败 (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error && errorJson.error.message) {
        errorMsg += `: ${errorJson.error.message}`;
      }
    } catch (e) {
      errorMsg += `: ${errorText.substring(0, 200)}`;
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  if (!content || content.trim() === '') {
    throw new Error('API返回了空内容，请检查模型配置或增加 max_tokens');
  }

  // 提取 token 用量
  const usage = data.usage || {};
  return {
    content: content,
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0
    }
  };
}

// ==================== 翻译历史 & Token 统计 ====================

// 记录翻译历史
async function recordHistory(entry) {
  const data = await chrome.storage.local.get({ translationHistory: [] });
  const history = data.translationHistory;
  history.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...entry
  });
  // 最多保留 500 条
  if (history.length > 500) {
    history.length = 500;
  }
  await chrome.storage.local.set({ translationHistory: history });
}

// 记录 Token 消耗
async function recordTokenUsage(usage, type) {
  const data = await chrome.storage.local.get({
    tokenStats: {
      total: { prompt: 0, completion: 0, total: 0, count: 0 },
      byType: {}
    }
  });
  const stats = data.tokenStats;

  stats.total.prompt += usage.prompt_tokens;
  stats.total.completion += usage.completion_tokens;
  stats.total.total += usage.total_tokens;
  stats.total.count += 1;

  if (!stats.byType[type]) {
    stats.byType[type] = { prompt: 0, completion: 0, total: 0, count: 0 };
  }
  stats.byType[type].prompt += usage.prompt_tokens;
  stats.byType[type].completion += usage.completion_tokens;
  stats.byType[type].total += usage.total_tokens;
  stats.byType[type].count += 1;

  await chrome.storage.local.set({ tokenStats: stats });
}

// ==================== 右键菜单 ====================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translateSelection',
    title: 'AI 翻译: "%s"',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'translateSelection') {
    const settings = await getSettings();
    if (!settings.apiKey) {
      chrome.tabs.sendMessage(tab.id, { action: 'showError', error: '请先在插件设置中配置 API Key' });
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action: 'selectionTranslating' });
    try {
      const systemPrompt = buildTranslatePrompt(settings.sourceLanguage, settings.targetLanguage);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: info.selectionText }
      ];
      const aiResult = await callAI(messages, settings);
      const result = aiResult.content.trim();

      // 记录历史和 token
      await recordHistory({
        type: 'selection',
        original: info.selectionText,
        translated: result,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage
      });
      await recordTokenUsage(aiResult.usage, 'selection');

      chrome.tabs.sendMessage(tab.id, {
        action: 'showTranslation',
        translation: result,
        original: info.selectionText
      });
    } catch (error) {
      chrome.tabs.sendMessage(tab.id, { action: 'showError', error: error.message });
    }
  }
});

// ==================== 消息处理 ====================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translateText') {
    handleTranslateText(request, sendResponse);
    return true;
  }

  if (request.action === 'translateBatch') {
    handleTranslateBatch(request, sendResponse);
    return true;
  }

  if (request.action === 'summarize') {
    handleSummarize(request, sendResponse);
    return true;
  }

  if (request.action === 'testConnection') {
    handleTestConnection(sendResponse);
    return true;
  }

  if (request.action === 'getHistory') {
    handleGetHistory(request, sendResponse);
    return true;
  }

  if (request.action === 'clearHistory') {
    handleClearHistory(sendResponse);
    return true;
  }

  if (request.action === 'getTokenStats') {
    handleGetTokenStats(sendResponse);
    return true;
  }

  if (request.action === 'clearTokenStats') {
    handleClearTokenStats(sendResponse);
    return true;
  }
});

// 划词翻译
async function handleTranslateText(request, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendResponse({ error: '请先在插件设置中配置 API Key' });
      return;
    }
    const systemPrompt = buildTranslatePrompt(settings.sourceLanguage, settings.targetLanguage);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.text }
    ];
    const aiResult = await callAI(messages, settings);
    const result = aiResult.content.trim();

    // 记录历史和 token
    await recordHistory({
      type: 'selection',
      original: request.text,
      translated: result,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage
    });
    await recordTokenUsage(aiResult.usage, 'selection');

    sendResponse({ result: result });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

// 批量翻译（用于全页面翻译）
async function handleTranslateBatch(request, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendResponse({ error: '请先在插件设置中配置 API Key' });
      return;
    }

    const texts = request.texts;
    const delimiter = '\n@@@DELIM@@@\n';

    const sourceName = LANGUAGE_MAP[settings.sourceLanguage] || '自动检测';
    const targetName = LANGUAGE_MAP[settings.targetLanguage] || '中文';
    const langRule = settings.sourceLanguage === 'auto' && settings.targetLanguage === 'auto'
      ? '如果文本是中文，翻译成英文；如果是英文或其他语言，翻译成中文'
      : settings.sourceLanguage === 'auto'
        ? `将文本翻译成${targetName}`
        : settings.targetLanguage === 'auto'
          ? `将${sourceName}文本翻译成中文（如果原文是中文则翻译成英文）`
          : `将${sourceName}文本翻译成${targetName}`;

    const prompt = `请翻译以下文本段落。规则：
1. ${langRule}
2. 保持每段翻译的顺序与原文一致
3. 段落之间用 "@@@DELIM@@@" 分隔
4. 只返回翻译结果，不要添加序号、解释或任何额外内容
5. 保持原文的换行和格式

需要翻译的段落：
${texts.join(delimiter)}`;

    const messages = [
      {
        role: 'system',
        content: '你是一个专业翻译助手。请准确翻译文本，保持原文的格式和语气。'
      },
      { role: 'user', content: prompt }
    ];
    const aiResult = await callAI(messages, settings);
    const result = aiResult.content;

    // 记录 token
    await recordTokenUsage(aiResult.usage, 'page');

    // 按分隔符拆分翻译结果
    let translations = result.split(/@@@DELIM@@@/).map(t => t.trim());

    // 如果拆分数量不匹配，尝试其他方式
    if (translations.length !== texts.length) {
      translations = result.split('\n').filter(t => t.trim()).map(t => t.trim());
    }

    if (translations.length !== texts.length) {
      // 逐条翻译作为兜底
      translations = [];
      for (const text of texts) {
        const singleSystemPrompt = buildTranslatePrompt(settings.sourceLanguage, settings.targetLanguage);
        const singleMessages = [
          { role: 'system', content: singleSystemPrompt },
          { role: 'user', content: text }
        ];
        const singleResult = await callAI(singleMessages, settings);
        translations.push(singleResult.content.trim());
        await recordTokenUsage(singleResult.usage, 'page');
      }
    }

    // 记录历史
    await recordHistory({
      type: 'page',
      original: texts.slice(0, 3).join(' | ') + (texts.length > 3 ? ' ...' : ''),
      translated: translations.slice(0, 3).join(' | ') + (translations.length > 3 ? ' ...' : ''),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      segmentCount: texts.length
    });

    sendResponse({ result: translations });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

// 网页总结
async function handleSummarize(request, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendResponse({ error: '请先在插件设置中配置 API Key' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content: '你是一个网页内容总结助手。请根据用户提供的网页内容，生成一份简洁明了的中文总结。总结应包括：\n1. **页面主题** - 用一句话概括\n2. **主要内容** - 列出3-5个要点\n3. **关键信息** - 提取关键数据、结论或建议\n\n请使用 Markdown 格式输出，语言简洁专业。'
      },
      {
        role: 'user',
        content: `请总结以下网页内容：\n\n标题：${request.title}\n\n内容：\n${request.content}`
      }
    ];
    const aiResult = await callAI(messages, settings);
    const result = aiResult.content.trim();

    // 记录历史和 token
    await recordHistory({
      type: 'summary',
      original: request.title,
      translated: result.substring(0, 200) + (result.length > 200 ? '...' : ''),
      sourceLanguage: 'auto',
      targetLanguage: 'zh'
    });
    await recordTokenUsage(aiResult.usage, 'summary');

    sendResponse({ result: result });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

// 测试连接
async function handleTestConnection(sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendResponse({ error: '请先配置 API Key' });
      return;
    }
    const messages = [
      { role: 'user', content: '请回复"连接成功"四个字' }
    ];
    const aiResult = await callAI(messages, settings);
    sendResponse({ result: aiResult.content.trim() });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

// ==================== 历史记录管理 ====================

async function handleGetHistory(request, sendResponse) {
  const data = await chrome.storage.local.get({ translationHistory: [] });
  let history = data.translationHistory;

  // 按类型过滤
  if (request.type && request.type !== 'all') {
    history = history.filter(h => h.type === request.type);
  }

  // 分页
  const page = request.page || 1;
  const pageSize = request.pageSize || 20;
  const start = (page - 1) * pageSize;
  const paged = history.slice(start, start + pageSize);

  sendResponse({
    history: paged,
    total: history.length,
    page: page,
    pageSize: pageSize
  });
}

async function handleClearHistory(sendResponse) {
  await chrome.storage.local.set({ translationHistory: [] });
  sendResponse({ ok: true });
}

// ==================== Token 统计管理 ====================

async function handleGetTokenStats(sendResponse) {
  const data = await chrome.storage.local.get({
    tokenStats: {
      total: { prompt: 0, completion: 0, total: 0, count: 0 },
      byType: {}
    }
  });
  sendResponse({ stats: data.tokenStats });
}

async function handleClearTokenStats(sendResponse) {
  await chrome.storage.local.set({
    tokenStats: {
      total: { prompt: 0, completion: 0, total: 0, count: 0 },
      byType: {}
    }
  });
  sendResponse({ ok: true });
}
