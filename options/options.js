/* ==================== AI 翻译助手 - 管理面板脚本 ==================== */

const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  sourceLanguage: 'auto',
  targetLanguage: 'auto'
};

const TYPE_LABELS = {
  selection: '划词翻译',
  page: '全页面翻译',
  summary: '网页总结'
};

const LANG_LABELS = {
  auto: '自动', zh: '中文', en: '英文', ja: '日文', ko: '韩文',
  fr: '法文', de: '德文', es: '西班牙文', ru: '俄文',
  ar: '阿拉伯文', it: '意大利文', pt: '葡萄牙文'
};

// ==================== Toast ====================

const toast = document.getElementById('toast');

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

// ==================== Tab 切换 ====================

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'history') loadHistory();
    if (tab === 'stats') loadTokenStats();
  });
});

// ==================== API 配置 ====================

const optApiKey = document.getElementById('opt-apiKey');
const optBaseUrl = document.getElementById('opt-baseUrl');
const optModel = document.getElementById('opt-model');

async function loadApiConfig() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  optApiKey.value = settings.apiKey || '';
  optBaseUrl.value = settings.baseUrl || DEFAULT_SETTINGS.baseUrl;
  optModel.value = settings.model || DEFAULT_SETTINGS.model;
}

document.getElementById('opt-saveBtn').addEventListener('click', async () => {
  const apiKey = optApiKey.value.trim();
  const baseUrl = optBaseUrl.value.trim();
  const model = optModel.value.trim();

  if (!apiKey) { showToast('请填写 API Key', 'error'); return; }
  if (!baseUrl) { showToast('请填写 Base URL', 'error'); return; }
  if (!model) { showToast('请填写模型名称', 'error'); return; }

  await chrome.storage.sync.set({ apiKey, baseUrl, model });
  showToast('配置已保存', 'success');
});

document.getElementById('opt-testBtn').addEventListener('click', async () => {
  const apiKey = optApiKey.value.trim();
  if (!apiKey) { showToast('请先填写 API Key', 'error'); return; }

  await chrome.storage.sync.set({
    apiKey,
    baseUrl: optBaseUrl.value.trim(),
    model: optModel.value.trim()
  });

  const testBtn = document.getElementById('opt-testBtn');
  testBtn.textContent = '测试中...';
  testBtn.disabled = true;

  chrome.runtime.sendMessage({ action: 'testConnection' }, (response) => {
    testBtn.textContent = '测试连接';
    testBtn.disabled = false;
    if (response && response.error) {
      showToast(`连接失败: ${response.error}`, 'error');
    } else if (response && response.result) {
      showToast('连接成功！', 'success');
    } else {
      showToast('连接失败，请检查配置', 'error');
    }
  });
});

// ==================== 语言设置 ====================

const optSourceLang = document.getElementById('opt-sourceLanguage');
const optTargetLang = document.getElementById('opt-targetLanguage');

async function loadLanguageSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  optSourceLang.value = settings.sourceLanguage || 'auto';
  optTargetLang.value = settings.targetLanguage || 'auto';
}

document.getElementById('langSwapBtn').addEventListener('click', () => {
  const src = optSourceLang.value;
  optSourceLang.value = optTargetLang.value;
  optTargetLang.value = src;
});

document.getElementById('lang-saveBtn').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    sourceLanguage: optSourceLang.value,
    targetLanguage: optTargetLang.value
  });
  showToast('语言设置已保存', 'success');
});

// ==================== 翻译历史 ====================

let historyPage = 1;
const historyPageSize = 15;
let historyTotal = 0;

const historyList = document.getElementById('historyList');
const historyFilter = document.getElementById('history-filter');
const historyPagination = document.getElementById('historyPagination');
const pageInfo = document.getElementById('pageInfo');

async function loadHistory() {
  const type = historyFilter.value;
  const response = await sendMessage({
    action: 'getHistory',
    type: type,
    page: historyPage,
    pageSize: historyPageSize
  });

  if (!response || !response.history) return;

  historyTotal = response.total;

  if (response.history.length === 0) {
    historyList.innerHTML = '<div class="empty-state">暂无翻译记录</div>';
    historyPagination.style.display = 'none';
    return;
  }

  historyList.innerHTML = response.history.map(item => {
    const typeLabel = TYPE_LABELS[item.type] || item.type;
    const time = formatTime(item.timestamp);
    const srcLang = LANG_LABELS[item.sourceLanguage] || '自动';
    const tgtLang = LANG_LABELS[item.targetLanguage] || '自动';
    const segInfo = item.segmentCount ? ` (${item.segmentCount} 段)` : '';

    return `
      <div class="history-item">
        <div class="history-item-header">
          <span class="history-type-badge ${item.type}">${typeLabel}${segInfo}</span>
          <span class="history-time">${time}</span>
        </div>
        <div class="history-original">${escapeHtml(item.original)}</div>
        <div class="history-translated">${escapeHtml(item.translated)}</div>
        <div class="history-lang">${srcLang} → ${tgtLang}</div>
      </div>
    `;
  }).join('');

  const totalPages = Math.ceil(historyTotal / historyPageSize);
  if (totalPages > 1) {
    historyPagination.style.display = 'flex';
    pageInfo.textContent = `第 ${historyPage} / ${totalPages} 页 (共 ${historyTotal} 条)`;
    document.getElementById('prevPageBtn').disabled = historyPage <= 1;
    document.getElementById('nextPageBtn').disabled = historyPage >= totalPages;
  } else {
    historyPagination.style.display = 'none';
  }
}

function formatTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diff = (now - d) / 1000;

  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;

  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

historyFilter.addEventListener('change', () => {
  historyPage = 1;
  loadHistory();
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (historyPage > 1) { historyPage--; loadHistory(); }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
  const totalPages = Math.ceil(historyTotal / historyPageSize);
  if (historyPage < totalPages) { historyPage++; loadHistory(); }
});

document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空所有翻译历史吗？此操作不可撤销。')) return;
  await sendMessage({ action: 'clearHistory' });
  showToast('历史记录已清空', 'success');
  loadHistory();
});

// ==================== Token 统计 ====================

async function loadTokenStats() {
  const response = await sendMessage({ action: 'getTokenStats' });
  if (!response || !response.stats) return;

  const stats = response.stats;
  document.getElementById('stat-total-tokens').textContent = formatNumber(stats.total.total);
  document.getElementById('stat-total-calls').textContent = formatNumber(stats.total.count);
  document.getElementById('stat-prompt-tokens').textContent = formatNumber(stats.total.prompt);
  document.getElementById('stat-completion-tokens').textContent = formatNumber(stats.total.completion);

  const container = document.getElementById('statsByType');
  const types = Object.keys(stats.byType);

  if (types.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无统计数据</div>';
    return;
  }

  const maxTotal = Math.max(...types.map(t => stats.byType[t].total), 1);

  container.innerHTML = types.map(type => {
    const data = stats.byType[type];
    const label = TYPE_LABELS[type] || type;
    const percent = Math.round((data.total / maxTotal) * 100);
    return `
      <div class="stat-type-row">
        <div class="stat-type-label">${label}</div>
        <div class="stat-type-bar">
          <div class="stat-type-bar-fill ${type}" style="width: ${percent}%;">
            ${formatNumber(data.total)} tokens
          </div>
        </div>
        <div class="stat-type-count">${data.count} 次调用</div>
      </div>
    `;
  }).join('');
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

document.getElementById('clearStatsBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空所有 Token 统计数据吗？此操作不可撤销。')) return;
  await sendMessage({ action: 'clearTokenStats' });
  showToast('统计数据已清空', 'success');
  loadTokenStats();
});

// ==================== 工具函数 ====================

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response);
    });
  });
}

// ==================== 初始化 ====================

loadApiConfig();
loadLanguageSettings();
