# Ambient Light for Bilibili

为 Bilibili 网页播放器添加实时动态环境光，让视频颜色自然扩散到页面背景，并提供黑边检测、页面玻璃效果和性能优化。

> 本项目为独立第三方扩展，与哔哩哔哩 / Bilibili 官方无隶属、授权或合作关系。

## 功能

- 实时视频环境光
- 边缘投影与 Spread Fade 扩散
- 自动检测上下 / 左右黑边，仅裁切环境光采样源
- 可选“填充视频到裁切区域”
- 顶部栏与弹幕输入栏玻璃环境光
- 深色页面与文字适配
- 视频边缘黑晕抑制
- 小窗播放器层级修复
- 性能优化模式、渲染分辨率和帧率限制
- 轻度 / 标准 / 重度预设
- Bilibili 视频页与番剧播放页支持

## 安装

### Microsoft Edge

正式发布后，可直接从 Microsoft Edge Add-ons 安装。

开发者模式安装：

1. 下载 Release ZIP 并解压。
2. 打开 `edge://extensions`。
3. 开启“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择包含 `manifest.json` 的目录。
6. 刷新 Bilibili 视频页。

### Chrome / 其他 Chromium 浏览器

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择扩展目录。

## 默认“标准”预设

- 模糊：55%
- 扩散：85%
- 颜色强度：100%
- 亮度：80%
- 饱和度：70%
- 暗部压制：开启
- 淡入：关闭
- 布局：全部
- 深色外观
- 性能优化：开启

## 隐私

视频帧仅在浏览器内存中处理，不会由本扩展上传到开发者服务器。

扩展使用浏览器的 `storage` API 保存设置。当前实现使用 `chrome.storage.sync`；如果浏览器账号开启了同步，这些设置可能由浏览器厂商的同步服务进行同步。扩展开发者不会接收这些设置。

详细内容见 [PRIVACY.md](PRIVACY.md)。

## 兼容性

主要测试目标：

- Microsoft Edge（Chromium）
- Google Chrome
- Windows 10 / 11
- `www.bilibili.com/video/*`
- `www.bilibili.com/bangumi/play/*`

Bilibili 页面结构可能随时更新，因此部分 UI 适配可能需要随站点更新调整。

## 性能建议

如果播放高码率、4K 或高帧率视频时出现掉帧：

- 开启“性能优化”
- 将环境光帧率调到 24 fps
- 降低渲染分辨率
- 使用“轻度”或“标准”预设

## 问题反馈

请在 GitHub Issues 中提交问题，并尽量附上：

- Edge / Chrome 版本
- Bilibili 视频链接
- 扩展版本
- 设置截图
- 问题截图或录屏

## 开源说明

本项目在视觉行为和交互设计上参考了开源项目：

- WesselKroos/youtube-ambilight  
  https://github.com/WesselKroos/youtube-ambilight

本仓库不包含远程执行代码，不依赖远程脚本。

## License

MIT License。详见 [LICENSE](LICENSE)。
