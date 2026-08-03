# ARCHITECT.md — 架构字典

> 架构唯一事实源；任何代码结构修改后必须同步本文件（见 CLAUDE.md §3）。

## 目录树
```
baby-balloon-game/
├── index.html / parent.html / stats.html  # 游戏主页 / 家长面板 / 统计面板
├── style.css
├── js/            # 全局变量模块，靠 index.html <script> 顺序串联（无打包）
│   ├── config.js → levels.js → spaced-rep.js      # 配置 → 数据 → 算法
│   ├── balloon.js / hand-cursor.js / camera.js / audio.js  # 实体与设备
│   ├── game.js    # Game 类：主循环 + 碰撞 + 特效 + 渲染
│   └── main.js    # 入口胶水 + UI + 角色管理
└── assets/        # images/ 按专题 SVG+照片 · voices/ 预录 mp3
```

## 文件职责表
| 文件 | 行数 | 职责 | 全局导出 |
|---|---|---|---|
| config.js | 40 | 配比/阈值/遗忘曲线常量 | `CONFIG` |
| levels.js | 439 | 14 专题词汇 + prompt/correctSay/wrongSay 模板 | `LEVELS` `LEVEL_CATEGORIES` |
| spaced-rep.js | 234 | 记录/掌握度/遗忘权重选题 | `SpacedRep` |
| game.js | 823 | 状态、碰撞、9 种粒子特效、星星瓶、背景渲染 | `Game` |
| balloon.js | 283 | 气球实体 + 全局图片缓存/预载 | `Balloon` `_imageCache` |
| hand-cursor.js | 169 | 手掌光标 + 连击光环拖尾 | `HandCursor` |
| camera.js | 100 | 摄像头 + MoveNet + MediaPipe Hands | `Camera` |
| audio.js | 241 | TTS / 预录音 / WebAudio 合成音效 | `AudioManager` |
| analytics.js | 106 | 本地埋点（30s 定时 + beforeunload 存档） | `Analytics` |
| main.js | 472 | 初始化、关卡选择 UI、角色/设置、键盘导航 | `game` 等全局函数 |

## 核心逻辑流
1. 加载：`DOMContentLoaded` → 迁移旧数据/恢复角色与设置 → `showLevelSelect()`
2. 开局：`startGame(key)` → 预载图片 → `new Game`（仅首次）→ `Camera.init` → rAF 主循环
3. 每帧：`update()` 取手部 landmarks → 气球摆动 → 提示计时 → 停留命中检测（dwell≥12帧）
4. 答对：`onCorrect` → pop + `SpacedRep.record(true)` → **语音回调链**结束才补气球+`pickTarget`
5. 答错：`onWrong` → 抖动 + record(false) + `_speaking` 锁
6. 通关：星星满 → `onLevelComplete` → 3.5s 后回首页（全局 `startNextLevel`）

## 数据流
- 设置：`CONFIG` ← localStorage 覆盖（backgroundMode / imageStyle / starsToWin / currentProfile）
- 学习数据：`SpacedRep._data` ⇄ `balloon-learning-data-<角色>`；埋点 ⇄ `balloon-analytics-<角色>`
- 渲染：Canvas 2D 单层（视频镜像背景 → 星星瓶 → 气球 → 特效 → 手光标）
