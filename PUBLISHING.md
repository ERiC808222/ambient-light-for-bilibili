# v1.3 发布

仓库：https://github.com/ERiC808222/ambient-light-for-bilibili

显示版本 1.3，内部版本 1.3.0。使用原有商店条目更新，保留原商店扩展 ID。

## GitHub

发布标签 v1.3，说明使用 RELEASE_NOTES_v1.3.md。附件：

- Ambient-Light-for-Bilibili-v1.3-Edge-Store.zip：商店包。
- Bilibili_Ambient_Light_Edge_v1.3.zip：桌面解压加载包。

安装包根目录直接包含 manifest.json；不包含测试、诊断报告或用户设置。包含许可证和适用的第三方声明。

## Microsoft Edge Add-ons / Chrome Web Store

在现有条目的更新页面上传商店 ZIP，沿用已有商店截图和宣传素材。本文不表示已提交或通过商店审核。

- Manifest V3；商店包权限仅 storage。
- 内容脚本只匹配 Bilibili 视频页和番剧播放页。
- 无远程执行代码。
- 本地草稿使用 storage.local，合并写入 storage.sync。浏览器同步开启时可经浏览器厂商同步设置；开发者不接收设置和视频帧。
- 诊断仅由用户主动点击导出到本地，不自动上传。
- [隐私政策](https://github.com/ERiC808222/ambient-light-for-bilibili/blob/main/PRIVACY.md)
- [支持](https://github.com/ERiC808222/ambient-light-for-bilibili/issues)
- 中文说明与权限文案见 EDGE_STORE_LISTING_zh-CN.md。

参考：[Edge 包与提交要求](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)、[Chrome 商店上传](https://developer.chrome.com/docs/webstore/publish)、[版本号格式](https://developer.chrome.com/docs/extensions/reference/manifest/version)。核对日期：2026-10-16。

## 本地验证

运行 node --test tests/projector.test.cjs tests/frame-sync.test.cjs tests/settings-store.test.cjs。

Windows 且已安装 Edge 时，运行 node tests/browser-check.cjs --standard 进行合成页面检查。资料保存到被 Git 忽略的 .test-artifacts/，不代替实际 Bilibili 播放验证。
