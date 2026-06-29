// ==================== AI 翻译助手 - Background Service Worker ====================

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  targetLanguage: 'auto'
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

// 调用 AI API（OpenAI 兼容协议）
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
  return content;
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
      const messages = [
        {
          role: 'system',
          content: '你是一个专业翻译助手。请将用户提供的文本翻译成目标语言。如果文本是中文，翻译成英文；如果是英文或其他语言，翻译成中文。只返回翻译结果，不要添加任何解释或额外内容。'
        },
        { role: 'user', content: info.selectionText }
      ];
      const result = await callAI(messages, settings);
      chrome.tabs.sendMessage(tab.id, {
        action: 'showTranslation',
        translation: result.trim(),
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
});

// 划词翻译
async function handleTranslateText(request, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendResponse({ error: '请先在插件设置中配置 API Key' });
      return;
    }
    const messages = [
      {
        role: 'system',
        content: '你是一个专业翻译助手。请将用户提供的文本翻译成目标语言。如果文本是中文，翻译成英文；如果是英文或其他语言，翻译成中文。只返回翻译结果，不要添加任何解释或额外内容。'
      },
      { role: 'user', content: request.text }
    ];
    const result = await callAI(messages, settings);
    sendResponse({ result: result.trim() });
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

    const prompt = `请翻译以下文本段落。规则：
1. 如果文本是中文，翻译成英文；如果是英文或其他语言，翻译成中文
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
    const result = await callAI(messages, settings);

    // 按分隔符拆分翻译结果
    let translations = result.split(/@@@DELIM@@@/).map(t => t.trim());

    // 如果拆分数量不匹配，尝试其他方式
    if (translations.length !== texts.length) {
      // 尝试按换行分割（每段翻译一行）
      translations = result.split('\n').filter(t => t.trim()).map(t => t.trim());
    }

    if (translations.length !== texts.length) {
      // 如果还是不匹配，逐条翻译作为兜底
      translations = [];
      for (const text of texts) {
        const singleMessages = [
          {
            role: 'system',
            content: '你是一个专业翻译助手。如果文本是中文，翻译成英文；如果是英文或其他语言，翻译成中文。只返回翻译结果。'
          },
          { role: 'user', content: text }
        ];
        const singleResult = await callAI(singleMessages, settings);
        translations.push(singleResult.trim());
      }
    }

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
    const result = await callAI(messages, settings);
    sendResponse({ result: result.trim() });
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
    const result = await callAI(messages, settings);
    sendResponse({ result: result.trim() });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}
