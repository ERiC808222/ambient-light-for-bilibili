# 发布清单

## GitHub

推荐仓库名：

`ambient-light-for-bilibili`

建议设置：
- Public
- Description: `Dynamic ambient lighting for the Bilibili web video player.`
- Topics: `bilibili`, `browser-extension`, `edge-extension`, `chrome-extension`, `ambient-light`, `chromium`, `manifest-v3`

首次上传后：
1. 检查 README 首页显示。
2. 开启 Issues。
3. 创建 Release `v1.1.1`。
4. 将 `dist/Ambient-Light-for-Bilibili-v1.1.1.zip` 作为 Release Asset。
5. 将 `PRIVACY.md` 的 GitHub 页面 URL 填入 Edge Partner Center。

## Microsoft Edge Add-ons

上传：
`dist/Ambient-Light-for-Bilibili-v1.1.1-Edge-Store.zip`

检查：
- ZIP 根目录直接存在 `manifest.json`
- Manifest V3
- 只请求 `storage`
- 内容脚本只匹配 Bilibili 视频 / 番剧页
- 无远程执行代码

Partner Center 推荐：
- Visibility: Public
- Markets: All markets
- Remote code: No
- Logo: `store-assets/logo-300x300.png`
- Small promotional tile: `store-assets/promo-small-440x280.png`
- Large promotional tile: `store-assets/promo-large-1400x560.png`
- Privacy policy: 公开 GitHub 的 `PRIVACY.md`
- Support: GitHub Issues

上架描述见：
`EDGE_STORE_LISTING_zh-CN.md`
