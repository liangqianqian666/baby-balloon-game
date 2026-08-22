# Baby Balloon Game

## 项目概述
幼儿学习游戏，通过摄像头手势（或鼠标/触屏）戳气球来学习词汇。

## 部署
- **线上地址**: https://liangqianqian666.github.io/baby-balloon-game/
- **家长面板**: https://liangqianqian666.github.io/baby-balloon-game/parent.html
- **部署方式**: GitHub Pages（仓库为 public）
- **自动部署**: push 到 main 分支后自动通过 `.github/workflows/pages.yml` 部署

## 分支与发布流程
- **main** = 线上，永远可玩；只接受 dev 合入，禁止直推
- **dev** = 日常累积，允许随时坏；本地自测 `python3 -m http.server`（localhost 可用摄像头）
- **feat/xxx** = 单功能/修复，自测通过后合入 dev
- 发布：GitHub 开 PR（dev → main）→ Merge → 本地 `git checkout main && git pull && git tag vX.Y.Z && git push --tags`（main 有 Ruleset 禁直推）
- 版本号（简化 semver）：Z+1 = bug 修复/微调（默认）；Y+1 = 新功能/新专题/新关卡；X 保持 0，用户规模起来再谈 1.0
- 发布前冒烟：鼠标进一关 → 答对/答错 → 通关 → 摄像头模式 → 刷新后学习数据仍在
- 回滚：Actions 找到上个 tag 的 deploy run → Re-run，或 revert 合入提交

## 技术栈
- 纯静态 HTML/JS/Canvas，无构建工具
- TensorFlow.js MoveNet — 手势追踪
- MediaPipe Selfie Segmentation — 背景抠图
- localStorage — 所有学习数据存在用户本地

## 文件结构
```
index.html          — 游戏主页
parent.html         — 家长面板（学习进度、复习建议）
stats.html          — 简易统计面板
style.css           — 样式
js/
  config.js         — 全局常量和配比参数
  levels.js         — 14个专题词汇数据
  spaced-rep.js     — 艾宾浩斯间隔重复模块
  balloon.js        — 气球渲染（颜色/图片/文字三种模式）
  hand-cursor.js    — 手部光标
  camera.js         — 摄像头 + MoveNet + 背景分割
  game.js           — 游戏核心逻辑
  audio.js          — 音效（Web Audio API 合成）
  analytics.js      — 本地埋点
  main.js           — 入口胶水层
assets/images/      — SVG 图片资源（按专题分文件夹）
```

## 关键设计决策
- 生词/熟词配比：40% 新词 + 40% 复习 + 20% 已掌握
- 掌握判定：连续正确 ≥3 次 且 正确率 ≥85% 且 总正确 ≥5 次
- 图片来源：动物/形状用手绘 SVG，身体部位用 Twemoji

## 未来扩展（等用户多了再做）
- 埋点上报到 Cloudflare Workers + D1
- 用户体系/排行榜

## 开发规范
- **分次提交**：每个 commit 只包含一个功能，不混合多个功能
- **版本缓存**：每次改动 JS 文件后，index.html 的 `?v=N` 版本号 +1

## TODO（手动）
- [x] GitHub 给 main 设 Ruleset 禁止直推（2026-08 完成）
- [x] 建 staging 仓库 `baby-balloon-game-dev`（2026-08 完成）；真机测试 `git push staging dev:main`
