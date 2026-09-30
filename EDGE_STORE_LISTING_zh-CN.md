# Microsoft Edge Add-ons 上架文案（zh-CN）

## 扩展名称
Ambient Light for Bilibili

## 简短说明
为 Bilibili 网页播放器添加动态环境光、自动黑边检测、页面玻璃效果与性能优化。

## 分类建议
娱乐 / Entertainment  
若后台分类名称不同，选择最接近“视频 / 娱乐 / 工具”的单一分类。

## 单一用途说明（Privacy > Single Purpose）
为 Bilibili 网页视频播放器生成与当前视频画面同步的动态环境光，并提供与该视觉效果直接相关的播放器和页面显示设置。

## 权限说明

### storage
用于保存用户设置，例如模糊程度、扩散范围、亮度、黑边检测、性能模式和预设。当前版本使用浏览器 `storage.sync`；如果浏览器同步开启，这些设置可能通过浏览器厂商的同步服务在用户自己的设备间同步。扩展开发者不会接收这些设置。

### Bilibili 视频页访问
扩展仅在以下页面运行：
- https://www.bilibili.com/video/*
- https://www.bilibili.com/bangumi/play/*

用于访问页面中的 HTML 视频元素和播放器 DOM，以在本地生成环境光、检测黑边、显示设置入口和适配页面视觉样式。

## Remote code
选择：**No, I am not using remote code.**

扩展不加载或执行远程 JavaScript、WebAssembly 或其他可执行代码。

## 数据使用建议
如果 Partner Center 的问题是“扩展是否收集并传输用户数据到开发者/第三方”，本扩展当前实现应按实际情况声明“不收集或传输用户内容到开发者”。

注意：设置使用 `chrome.storage.sync`，可能由浏览器厂商的账号同步服务进行同步。请确保 Partner Center 的具体问题措辞与 PRIVACY.md 保持一致。

## 隐私政策 URL
创建公开 GitHub 仓库后可使用：

https://github.com/ERiC808222/ambient-light-for-bilibili/blob/main/PRIVACY.md

## 网站
https://github.com/ERiC808222/ambient-light-for-bilibili

## 支持
https://github.com/ERiC808222/ambient-light-for-bilibili/issues

## 长描述

Ambient Light for Bilibili 为 Bilibili 网页播放器添加与当前视频画面同步的动态环境光，让视频颜色自然扩散到播放页面周围，获得更沉浸的观看体验。

主要功能：

• 实时视频环境光：根据当前视频画面生成动态背景光效。  
• 边缘投影与扩散：支持模糊、扩散范围、衰减起点和衰减曲线设置。  
• 自动黑边检测：识别视频内部的上下或左右黑边，仅裁切环境光采样区域，不默认裁掉原视频画面。  
• 深色页面适配：使用纯黑观看背景，并对页面文字、按钮和播放器周边区域进行暗色适配。  
• 玻璃环境光：顶部导航栏和弹幕输入栏可以透出环境光，并保持文字清晰。  
• 性能优化：支持低分辨率环境光采样、帧率限制和性能模式，减少对高码率或高帧率视频播放的影响。  
• 一键预设：提供轻度、标准和重度三种环境光预设。  
• 小窗播放适配：修复小窗播放器与评论区的层级冲突。  
• 播放器内设置：可通过播放器中的 AL 按钮快速调整环境光。

隐私与数据：

视频帧只在当前设备的浏览器内存中用于实时视觉处理，本扩展不会把视频帧或截图上传到开发者服务器。本扩展不包含第三方广告、分析或追踪 SDK。

扩展设置使用浏览器扩展 storage API 保存。浏览器同步功能开启时，部分设置可能通过浏览器厂商的同步服务在用户自己的设备间同步。

兼容页面：
• Bilibili 视频播放页  
• Bilibili 番剧播放页

本扩展是独立第三方项目，与哔哩哔哩 / Bilibili 官方无隶属、授权或合作关系。

## 商店素材

仓库 `store-assets/` 中已生成：
- `logo-300x300.png`
- `promo-small-440x280.png`
- `promo-large-1400x560.png`

建议另外准备 2–4 张真实使用截图，展示：
1. 环境光标准预设效果。
2. AL 设置面板。
3. 黑边检测前后对比。
4. 顶部栏 / 弹幕栏玻璃环境光效果。
