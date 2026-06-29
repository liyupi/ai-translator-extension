/* ==================== AI 翻译助手 - Content Script ==================== */

// ==================== 全局状态 ====================
let isTranslating = false;
let originalNodes = []; // 存储原始节点信息用于恢复
let selectionPopup = null;
let summaryPanel = null;
let loadingOverlay = null;

// ==================== 工具函数 ====================

// 发送消息到 background
function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response);
    });
  });
}

// 判断是否包含中文
function containsChinese(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}

// 判断是否主要是英文
function isMainlyEnglish(text) {
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return englishChars > chineseChars;
}

// ==================== 划词翻译 ====================

// 显示翻译结果弹窗
function showSelectionPopup(x, y, originalText, translation, isError = false) {
  removeSelectionPopup();

  selectionPopup = document.createElement('div');
  selectionPopup.id = 'ai-translator-selection-popup';
  selectionPopup.className = 'ai-translator-popup';

  const header = document.createElement('div');
  header.className = 'ai-translator-popup-header';
  header.textContent = isError ? '翻译出错' : '翻译结果';

  const closeBtn = document.createElement('span');
  closeBtn.className = 'ai-translator-popup-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = removeSelectionPopup;
  header.appendChild(closeBtn);

  const originalDiv = document.createElement('div');
  originalDiv.className = 'ai-translator-original';
  originalDiv.textContent = originalText;

  const translationDiv = document.createElement('div');
  translationDiv.className = 'ai-translator-translation';
  if (isError) {
    translationDiv.classList.add('ai-translator-error');
  }
  translationDiv.textContent = translation;

  selectionPopup.appendChild(header);
  selectionPopup.appendChild(originalDiv);
  selectionPopup.appendChild(translationDiv);

  document.body.appendChild(selectionPopup);

  // 定位弹窗
  const popupRect = selectionPopup.getBoundingClientRect();
  let left = x;
  let top = y + 10;

  if (left + popupRect.width > window.innerWidth - 10) {
    left = window.innerWidth - popupRect.width - 10;
  }
  if (top + popupRect.height > window.innerHeight - 10) {
    top = y - popupRect.height - 10;
  }

  selectionPopup.style.left = `${left}px`;
  selectionPopup.style.top = `${top}px`;
}

function removeSelectionPopup() {
  if (selectionPopup) {
    selectionPopup.remove();
    selectionPopup = null;
  }
}

// 划词翻译
async function translateSelection(text, x, y) {
  showSelectionPopup(x, y, text, '翻译中...', false);

  const response = await sendMessage({ action: 'translateText', text: text });
  if (response && response.error) {
    showSelectionPopup(x, y, text, response.error, true);
  } else if (response && response.result) {
    showSelectionPopup(x, y, text, response.result, false);
  }
}

// 监听鼠标释放事件（划词翻译）
document.addEventListener('mouseup', (e) => {
  // 忽略弹窗内的点击
  if (selectionPopup && selectionPopup.contains(e.target)) return;
  if (loadingOverlay && loadingOverlay.contains(e.target)) return;
  if (summaryPanel && summaryPanel.contains(e.target)) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText && selectedText.length > 0 && selectedText.length < 5000) {
    // 延迟执行，避免与双击等事件冲突
    setTimeout(() => {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      translateSelection(selectedText, rect.right, rect.bottom);
    }, 100);
  } else {
    removeSelectionPopup();
  }
});

// ==================== 全页面翻译 ====================

// 获取需要翻译的文本节点
function getTextNodes() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // 排除脚本、样式等
        const parentTag = node.parentElement.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'textarea', 'input', 'select'].includes(parentTag)) {
          return NodeFilter.FILTER_REJECT;
        }
        // 排除我们自己的 UI
        if (node.parentElement.closest('.ai-translator-popup') ||
            node.parentElement.closest('.ai-translator-summary-panel') ||
            node.parentElement.closest('.ai-translator-loading-overlay')) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent.trim();
        if (text.length < 1) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }
  return nodes;
}

// 显示加载遮罩
function showLoadingOverlay(text = '正在翻译页面...') {
  removeLoadingOverlay();
  loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'ai-translator-loading-overlay';

  const spinner = document.createElement('div');
  spinner.className = 'ai-translator-spinner';

  const textDiv = document.createElement('div');
  textDiv.className = 'ai-translator-loading-text';
  textDiv.textContent = text;

  loadingOverlay.appendChild(spinner);
  loadingOverlay.appendChild(textDiv);
  document.body.appendChild(loadingOverlay);
}

function removeLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.remove();
    loadingOverlay = null;
  }
}

// 全页面翻译
async function translateFullPage() {
  if (isTranslating) return;
  isTranslating = true;
  showLoadingOverlay('正在翻译页面，请稍候...');

  try {
    const textNodes = getTextNodes();
    if (textNodes.length === 0) {
      removeLoadingOverlay();
      isTranslating = false;
      return;
    }

    // 保存原始节点信息
    originalNodes = textNodes.map(node => ({
      node: node,
      originalText: node.textContent
    }));

    // 分批翻译（每批最多 20 条）
    const batchSize = 20;
    for (let i = 0; i < textNodes.length; i += batchSize) {
      const batch = textNodes.slice(i, i + batchSize);
      const texts = batch.map(n => n.textContent.trim());

      const response = await sendMessage({
        action: 'translateBatch',
        texts: texts
      });

      if (response && response.error) {
        throw new Error(response.error);
      }

      if (response && response.result) {
        for (let j = 0; j < batch.length && j < response.result.length; j++) {
          batch[j].textContent = response.result[j];
        }
      }
    }

    removeLoadingOverlay();
  } catch (error) {
    removeLoadingOverlay();
    showSelectionPopup(window.innerWidth / 2 - 150, 100, '', error.message, true);
  } finally {
    isTranslating = false;
  }
}

// 恢复原始页面
function restorePage() {
  for (const item of originalNodes) {
    if (item.node) {
      item.node.textContent = item.originalText;
    }
  }
  originalNodes = [];
  removeLoadingOverlay();
}

// ==================== 网页总结 ====================

// 获取页面正文内容
function getPageContent() {
  // 尝试获取主要内容区域
  const selectors = ['article', 'main', '.content', '.article', '.post', '#content'];
  let mainContent = null;

  for (const selector of selectors) {
    mainContent = document.querySelector(selector);
    if (mainContent && mainContent.textContent.trim().length > 100) break;
    mainContent = null;
  }

  if (!mainContent) {
    mainContent = document.body;
  }

  // 提取文本，限制长度
  let content = mainContent.innerText || mainContent.textContent;
  content = content.replace(/\s+/g, ' ').trim();
  if (content.length > 8000) {
    content = content.substring(0, 8000) + '...';
  }

  return {
    title: document.title,
    content: content
  };
}

// 显示总结面板
function showSummaryPanel(summary, isError = false) {
  removeSummaryPanel();

  summaryPanel = document.createElement('div');
  summaryPanel.className = 'ai-translator-summary-panel';

  const header = document.createElement('div');
  header.className = 'ai-translator-summary-header';

  const title = document.createElement('span');
  title.textContent = '网页总结';
  header.appendChild(title);

  const closeBtn = document.createElement('span');
  closeBtn.className = 'ai-translator-popup-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = removeSummaryPanel;
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'ai-translator-summary-content';
  if (isError) {
    content.classList.add('ai-translator-error');
    content.textContent = summary;
  } else {
    // 渲染简单的 Markdown
    content.innerHTML = renderMarkdown(summary);
  }

  summaryPanel.appendChild(header);
  summaryPanel.appendChild(content);
  document.body.appendChild(summaryPanel);
}

// 简单的 Markdown 渲染
function renderMarkdown(text) {
  let html = text;
  // 转义 HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // 换行
  html = html.replace(/\n/g, '<br>');
  return html;
}

function removeSummaryPanel() {
  if (summaryPanel) {
    summaryPanel.remove();
    summaryPanel = null;
  }
}

// 网页总结
async function summarizePage() {
  showLoadingOverlay('正在总结网页内容...');

  try {
    const pageData = getPageContent();
    const response = await sendMessage({
      action: 'summarize',
      title: pageData.title,
      content: pageData.content
    });

    removeLoadingOverlay();

    if (response && response.error) {
      showSummaryPanel(response.error, true);
    } else if (response && response.result) {
      showSummaryPanel(response.result, false);
    }
  } catch (error) {
    removeLoadingOverlay();
    showSummaryPanel(error.message, true);
  }
}

// ==================== 消息监听 ====================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translateFullPage') {
    translateFullPage();
    sendResponse({ ok: true });
  }

  if (request.action === 'restorePage') {
    restorePage();
    sendResponse({ ok: true });
  }

  if (request.action === 'summarizePage') {
    summarizePage();
    sendResponse({ ok: true });
  }

  if (request.action === 'showTranslation') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showSelectionPopup(rect.right, rect.bottom, request.original, request.translation);
    }
    sendResponse({ ok: true });
  }

  if (request.action === 'selectionTranslating') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showSelectionPopup(rect.right, rect.bottom, selection.toString(), '翻译中...');
    }
    sendResponse({ ok: true });
  }

  if (request.action === 'showError') {
    showSelectionPopup(window.innerWidth / 2 - 150, 100, '', request.error, true);
    sendResponse({ ok: true });
  }
});
