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
│   ├── game.js    # GameState 状态机 + Game（逻辑/碰撞/计分/特效状态）
│   ├── render.js  # Renderer（纯渲染，只读状态）+ UI（DOM 垫片）
│   └── main.js    # 入口胶水 + 渲染循环启停 + 角色管理
└── assets/        # images/ 按专题 SVG+照片 · voices/ 预录 mp3
```

## 架构模式
- **分层 + 单向数据流**：数据层（config/levels/spaced-rep）→ 逻辑层（Game：状态机/计分/特效状态）→ 渲染层（Renderer 只读绘制、UI 管 DOM）；渲染层永不写回状态
- **显式状态机**：`IDLE→PLAYING⇄TRANSITION→COMPLETE→IDLE`；`setState` 校验转换表、拦截非法转换；进 IDLE 停 update + 清定时器 + 断语音
- **代际守卫**：`roundId` 切关自增，过期语音回调整链作废；定时器统一 `_setTimeout` 托管，切关/回首页/销毁清空
- **生命周期配对**：init↔destroy（Game.destroy / Camera.stop / Analytics.flush）；rAF `startLoop/stopLoop`；`pagehide` 统一拆除

## 文件职责表
| 文件 | 行数 | 职责 | 全局导出 |
|---|---|---|---|
| config.js | 77 | 全部可调参数（玩法/提示/连击/特效/星星瓶） | `CONFIG` |
| levels.js | 439 | 14 专题词汇 + prompt/correctSay/wrongSay 模板 | `LEVELS` `LEVEL_CATEGORIES` |
| spaced-rep.js | 234 | 记录/掌握度/遗忘权重选题 | `SpacedRep` |
| game.js | 557 | 状态机校验、碰撞、计分、特效状态更新、托管定时器 | `GameState` `Game` |
| render.js | 355 | 纯渲染（背景/星星瓶/气球/特效）+ DOM 代理 | `Renderer` `UI` |
| balloon.js | 296 | 气球实体 + 图片缓存/预载/dispose | `Balloon` `_imageCache` |
| hand-cursor.js | 169 | 手掌光标 + 连击光环拖尾 | `HandCursor` |
| camera.js | 116 | 摄像头 + MoveNet + Hands（含 stop()） | `Camera` |
| audio.js | 246 | TTS / 预录音 / 合成音效 + stopSpeech | `AudioManager` |
| analytics.js | 113 | 本地埋点（幂等 init + flush） | `Analytics` |
| main.js | 501 | 初始化、rAF 循环启停、关卡 UI、角色/设置 | `game` `renderer` 等 |

## 核心逻辑流
1. 加载：`DOMContentLoaded` → UI.init/恢复设置 → `showLevelSelect()`
2. 开局：`startGame` → 预载图片（先清旧缓存）→ `new Game + Renderer`（仅首次）→ `Camera.init` → `startLoop()`
3. 每帧：`update()`（手部→摆动→提示计时→停留命中）与 `renderer.draw()`（纯渲染）分离
4. 答对：`onCorrect`→TRANSITION → **语音回调链**结束（roundId 校验）→ 补气球 + `pickTarget`→PLAYING
5. 答错：抖动 + streak 清零 + 语音锁，保持 PLAYING；通关：星满→COMPLETE→延迟回首页
6. 拆除：回首页 `setState(IDLE)` + `stopLoop()`；`pagehide` → destroy + Camera.stop + flush

## 数据流
- 设置：`CONFIG` ← localStorage 覆盖（backgroundMode / imageStyle / starsToWin / currentProfile）
- 学习数据：`SpacedRep._data` ⇄ `balloon-learning-data-<角色>`；埋点 ⇄ `balloon-analytics-<角色>`
- 渲染：Canvas 2D 单层（视频镜像背景 → 星星瓶 → 气球 → 特效 → 手光标）；DOM 仅提示/计分，由 UI 垫片读写
