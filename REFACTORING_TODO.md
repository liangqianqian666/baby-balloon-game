# REFACTORING_TODO.md — 极简重构清单

> 诊断基准：配置集中化 · GameState 状态机 · 职责分离 · 内存显式销毁。

## 一、配置集中化
- [ ] CONFIG 存在死配置：`balloonCount`/`balloonRadius` 无引用；game.js 硬编码 `balloonCount=4`、半径 65
- [ ] 魔法数字散落：提示计时 240/480 帧、连击阈值 3/5/7/10、粒子数、星星瓶几何、`dwellThreshold=12`、命中区 ×2.5、星星上限 1~50
- [ ] 彩虹色数组重复 3 处（game.js×2、hand-cursor.js×1）
- [ ] `_showChineseHint` 内硬编码 ~100 词中文映射 → 应并入 levels.js 的 item（加 `cn` 字段）
- [ ] index.html 星星默认显示 15，与 `CONFIG.starsToWin=10` 不一致

## 二、GameState 状态机
- [ ] state 仅 waiting/playing/transition，`complete` 隐式使用、无转换表、无守卫
- [ ] 流程由语音回调链 + setTimeout 驱动（答对链、3.5s 进下一关），不可取消 → 中途返回/换关时残留回调触发脏状态
- [ ] 无暂停态：点"返回主页"后 update() 仍在跑；`_speaking` 为隐式音频锁
- [ ] 提示计时用帧数（假设 60fps），应改时间戳

## 三、职责分离
- [ ] game.js 823 行上帝类：逻辑 + 9 种粒子特效 + 渲染 + DOM 操作混杂
- [ ] 渲染未拆分：星星瓶 ~110 行、背景、特效绘制应抽出；balloon.js draw() 5 分支渲染
- [ ] main.js 472 行：入口胶水 + 角色管理 + 设置 UI + 键盘导航混杂；全局变量 `game`/`cameraAvailable`
- [ ] 双 API：onWrong 用兼容 shim `LearningTracker`，onCorrect 直用 `SpacedRep` → 统一后删 shim
- [ ] audio.js 死接口：`speakCorrect`（把回调当 streak，含 bug）/`speakPopCommand`/`speakWrong` 无调用方
- [ ] MoveNet 加载但 `detectPose` 零调用 → 白耗 TF.js 加载与内存
- [ ] 模块靠全局变量 + `<script>` 顺序耦合（如 game.js 调 main.js 的 `startNextLevel`）

## 四、内存显式销毁
- [ ] 全局零 destroy：rAF 主循环、`Camera._handsLoop` 无法取消；resize/beforeunload 监听不移除
- [ ] 摄像头流不停（无 `track.stop()`）、Hands detector 不 close
- [ ] **泄漏**：切角色重复调 `Analytics.init()` → setInterval 与 beforeunload 监听累积
- [ ] `_imageCache`、`AudioManager._cache` 只增不减，无淘汰策略

## 分阶段 Task
- [ ] **P1 低风险清理**：删 MoveNet 死代码与 audio 死接口、统一 SpacedRep API、修 Analytics 监听累积
- [ ] **P2 配置集中**：魔法数字收进 CONFIG，激活 balloonCount/balloonRadius，cnMap 迁至 levels.js
- [ ] **P3 职责分离**：game.js 拆出 effects.js（粒子）与 render 层；main.js 拆出 profile/settings UI
- [ ] **P4 状态机**：GameState 显式转换表 + 可取消的统一计时器 + 暂停/恢复
- [ ] **P5 生命周期**：所有 init 配对 destroy()（rAF/监听/流/缓存显式释放）
