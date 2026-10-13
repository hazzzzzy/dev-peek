# DEV Peek

用于 Chrome / Edge 的浏览器扩展，在 GMGN 和 Axiom 代币页面查看开发者钱包与发币记录。

## 技术栈

- Manifest V3、原生 JavaScript / ES Modules、HTML / CSS。
- Shadow DOM 隔离界面，Service Worker 处理后台查询。
- GMGN OpenAPI、Chrome Storage、Web Crypto API。

## 插件功能

- 自动识别代币页面并读取完整 DEV 地址，支持 SOL、BSC、RH、Base、ETH、Arc 查询。
- 展示钱包余额、年龄、来源、标签及毕业统计。
- 合并适用链的发币记录，按峰值市值排序展示前 10 个代币。
- 悬停币名选择 GMGN 或 Axiom 跳转，保留推广链接；支持复制 DEV 与来源钱包地址。
- 浮窗拖动、收起、明暗主题，以及位置和偏好保存。
- 用户自行填写 GMGN API Key，密钥保存在本地浏览器；支持逐步显示结果、切页取消与请求限频。
