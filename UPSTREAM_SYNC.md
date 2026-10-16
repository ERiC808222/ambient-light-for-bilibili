# YouTube Ambient Light 上游核对

- 核对日期：2026-10-16，Asia/Shanghai。
- 仓库：https://github.com/WesselKroos/youtube-ambilight
- GitHub 最新 Release：2.38.17，2025-11-13 发布，发布计划见 https://github.com/WesselKroos/youtube-ambilight/issues/301 。
- 实时拉取默认分支：develop。
- 拉取的 HEAD：18d17188e5562e5ee913f005192d30c9a60be078（2025-11-21，Reposition controlled-by-other-setting indicator）。
- `package.json` 版本：2.38.17。许可证文件为 MIT；其 package.json 的 `license` 字段写的是 ISC，本项目保留仓库实际 LICENSE 全文。

## 本次跟进

1. [projector-2d.js](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/src/scripts/libs/projector-2d.js)：相同视频帧按多个尺寸放大，较小画面覆盖较大画面的内部，外围形成层叠延伸。Bilibili 版在原来的环境光 Canvas 内合成同等可见环带，保留原网页层级。
2. [ambientlight.js](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/src/scripts/libs/ambientlight.js)：采用 `round(spread / edge)` 外扩层数和沿长边计算的等距扩张；Blur 的像素量使用显示高度 × 0.0025 × Blur%。因此 0% 真正得到 0px。上游 WebGL 路径使用纹理坐标与着色器优化，不是实际复制多个 DOM 视频元素。
3. [settings-config.js](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/src/scripts/libs/settings-config.js)：Blur 0–100、Spread 0–400、Edge 2–50、Fade start -50–100、Fade curve 1–100。保留 Bilibili 原来的默认数值与预设，更新两个入口的范围。
4. [projector-shadow.js](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/src/scripts/libs/projector-shadow.js)：分别沿横向和纵向衰减，使用 25 / curve 的曲线指数；允许衰减从画面内部开始。

## 保留与边界

- v1.2.0 保留桌面原 CSS；v1.2.1 按用户反馈清除阴影和黑色底板，并透明显示弹幕栏。布局、层级声明及原环境光容器保持。
- 同一帧只采样一次；渲染可见环带而非对整页重复叠加透明画面，避免无意义的亮度累加。
- 不是完整移植上游 WebGL 渲染器。其 YouTube 页面选择器、worker 黑边检测以及影院模式修复不适用于本插件现有的 Bilibili DOM / 无 worker 检测流程，因此没有直接套用。
- 2.38.17 最近发布的变化主要包括 YouTube 新 UI、worker 错误及 21:9 影院布局修复；这些不是本次 Bilibili 投影改写的来源。
- 本次完成当前版本核对与跟进，没有创建后台自动更新任务。
