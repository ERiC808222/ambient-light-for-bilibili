# Privacy Policy / 隐私政策

**Extension:** Ambient Light for Bilibili  
**Effective date:** 2026-10-01

## 中文

Ambient Light for Bilibili 的核心功能是在 Bilibili 视频播放页面中，根据正在播放的视频画面生成动态环境光。

### 1. 视频内容

扩展会在用户设备上的浏览器内读取当前 HTML `<video>` 元素的画面，用于：

- 生成环境光；
- 检测视频画面中的上下 / 左右黑边；
- 计算环境光采样区域。

这些视频帧仅在用户设备的浏览器内存中进行实时处理。本扩展不会将视频帧、截图或视频内容上传到扩展开发者控制的服务器。

### 2. 浏览历史和个人信息

本扩展不主动收集、存储或向开发者传输：

- 浏览历史；
- 搜索历史；
- 账号信息；
- 用户名、邮箱或其他身份信息；
- 评论、弹幕或私信内容；
- 支付信息；
- 精确位置；
- 广告标识符或用于跨站跟踪的数据。

### 3. 扩展设置

本扩展使用浏览器扩展的 `storage` API 保存用户选择的设置，例如模糊程度、扩散范围、亮度、性能模式和预设。

当前版本使用 `chrome.storage.sync`。如果用户在浏览器中启用了同步，设置可能通过 Microsoft、Google 或所使用浏览器厂商提供的浏览器同步服务，在用户自己的设备之间同步。

扩展开发者不会接收这些设置，也不会运营用于存储这些设置的服务器。

### 4. 网络请求和远程代码

本扩展不加载或执行远程 JavaScript / WebAssembly 代码，也不向扩展开发者服务器发送视频数据或使用情况数据。

### 5. 网站访问

扩展仅在以下 Bilibili 页面运行：

- `https://www.bilibili.com/video/*`
- `https://www.bilibili.com/bangumi/play/*`

网站访问用于读取视频播放器 DOM、生成视觉效果和修改与环境光相关的页面样式。

### 6. 用户控制

用户可以：

- 随时关闭环境光；
- 修改或重置扩展设置；
- 在浏览器扩展管理页面中禁用或卸载扩展；
- 通过关闭浏览器同步，阻止扩展设置通过浏览器账号在设备之间同步。

### 7. 第三方服务

本扩展不集成第三方分析、广告或追踪 SDK。

Bilibili 网站本身以及浏览器厂商的同步功能适用其各自的隐私政策，本扩展无法控制这些服务。

### 8. 政策更新

如果未来版本增加需要收集、处理或传输新类型数据的功能，本隐私政策将先行更新，并在适用情况下征得用户同意。

---

## English

Ambient Light for Bilibili generates dynamic ambient lighting around the Bilibili web video player.

### Video content
The extension reads frames from the active HTML `<video>` element in browser memory to render ambient light and detect embedded black bars. Video frames, screenshots, and video content are not uploaded to servers controlled by the extension developer.

### Personal data
The extension does not intentionally collect or transmit browsing history, search history, account credentials, comments, danmaku messages, private messages, payment information, precise location, or cross-site tracking identifiers.

### Settings
User preferences are stored with the browser extension `storage` API. The current version uses `chrome.storage.sync`. If browser sync is enabled, the browser vendor may synchronize these settings between the user's devices. The extension developer does not receive these settings.

### Remote code and analytics
The extension does not execute remotely hosted code and does not include third-party analytics, advertising, or tracking SDKs.

### Site access
The extension runs only on Bilibili video and bangumi playback pages in order to access the player DOM and render the requested visual effects.

### User controls
Users can disable the effect, change settings, disable or uninstall the extension, and control browser synchronization through their browser settings.

### Contact
After the public GitHub repository is created, use GitHub Issues as the public support/contact channel.
