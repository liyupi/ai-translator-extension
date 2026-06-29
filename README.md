# AI 翻译助手 - Chrome 扩展

AI 驱动的 Chrome 浏览器翻译插件，支持全页面翻译、划词翻译和网页总结。兼容 OpenAI 协议，可自定义 API 配置。

## 功能

- **全页面翻译** - 一键翻译整个网页内容，中英互译
- **划词翻译** - 选中网页文字后自动弹出翻译结果
- **网页总结** - AI 自动总结网页内容，提取关键信息
- **右键菜单翻译** - 右键选中文本即可翻译
- **自定义 API** - 兼容 OpenAI 协议，支持 DeepSeek、OpenAI 等

## 安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目文件夹
4. 扩展图标将出现在工具栏

## 配置

1. 点击工具栏中的扩展图标，打开 Popup 弹窗
2. 在「API 设置」中填写：
   - **API Key** - 你的 API 密钥
   - **Base URL** - API 地址（如 `https://api.deepseek.com`）
   - **模型名称** - 模型标识（如 `deepseek-v4-flash`）
3. 点击「测试连接」验证配置
4. 点击「保存设置」

## 使用

- **全页面翻译**：点击 Popup 中的「全页面翻译」按钮
- **恢复原文**：点击 Popup 中的「恢复原文」按钮
- **划词翻译**：在网页中选中文字，自动弹出翻译结果
- **右键翻译**：选中文字后右键，选择「AI 翻译」
- **网页总结**：点击 Popup 中的「网页总结」按钮

## 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript（无框架依赖）
- OpenAI 兼容 API 协议

## 文件结构

```
ai-translator-extension/
├── manifest.json       # 扩展配置
├── background.js       # Service Worker（API 调用、右键菜单）
├── content.js          # 内容脚本（页面翻译、划词、总结）
├── content.css         # 内容脚本样式
├── popup/
│   ├── popup.html      # 弹窗页面
│   ├── popup.css       # 弹窗样式
│   └── popup.js        # 弹窗逻辑
├── icons/              # 图标
└── .gitignore
```
