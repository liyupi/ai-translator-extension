/* ==================== AI 翻译助手 - Popup 脚本 ==================== */

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash'
};

// DOM 元素
const apiKeyInput = document.getElementById('apiKey');
const baseUrlInput = document.getElementById('baseUrl');
const modelInput = document.getElementById('model');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const translatePageBtn = document.getElementById('translatePageBtn');
const restoreBtn = document.getElementById('restoreBtn');
const summarizeBtn = document.getElementById('summarizeBtn');
const toast = document.getElementById('toast');

// 显示 Toast 提示
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

// 加载设置
async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  apiKeyInput.value = settings.apiKey || '';
  baseUrlInput.value = settings.baseUrl || DEFAULT_SETTINGS.baseUrl;
  modelInput.value = settings.model || DEFAULT_SETTINGS.model;
}

// 保存设置
async function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();
  const model = modelInput.value.trim();

  if (!apiKey) {
    showToast('请填写 API Key', 'error');
    return;
  }
  if (!baseUrl) {
    showToast('请填写 Base URL', 'error');
    return;
  }
  if (!model) {
    showToast('请填写模型名称', 'error');
    return;
  }

  await chrome.storage.sync.set({ apiKey, baseUrl, model });
  showToast('设置已保存', 'success');
}

// 测试连接
async function testConnection() {
  const apiKey = apiKeyInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();
  const model = modelInput.value.trim();

  if (!apiKey) {
    showToast('请先填写 API Key', 'error');
    return;
  }

  // 先保存设置
  await chrome.storage.sync.set({ apiKey, baseUrl, model });

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
}

// 获取当前活动标签页
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

// 全页面翻译
async function translateFullPage() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.apiKey) {
    showToast('请先配置 API Key', 'error');
    return;
  }

  const tab = await getActiveTab();
  chrome.tabs.sendMessage(tab.id, { action: 'translateFullPage' });
  window.close();
}

// 恢复原文
async function restorePage() {
  const tab = await getActiveTab();
  chrome.tabs.sendMessage(tab.id, { action: 'restorePage' });
  window.close();
}

// 网页总结
async function summarizePage() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.apiKey) {
    showToast('请先配置 API Key', 'error');
    return;
  }

  const tab = await getActiveTab();
  chrome.tabs.sendMessage(tab.id, { action: 'summarizePage' });
  window.close();
}

// 事件绑定
saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testConnection);
translatePageBtn.addEventListener('click', translateFullPage);
restoreBtn.addEventListener('click', restorePage);
summarizeBtn.addEventListener('click', summarizePage);
document.getElementById('manageBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// 初始化
loadSettings();
