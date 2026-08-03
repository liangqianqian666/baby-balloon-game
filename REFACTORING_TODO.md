# REFACTORING_TODO.md — 重构台账（已归档）

> 诊断基准：配置集中化 · GameState 状态机 · 职责分离 · 内存显式销毁。
> **状态：Task 1–3 已完成（2026-08-03），台账归档**；后续需求请新开台账。

## ✅ 已完成

### Task 1 — CONFIG 集中化 + GameState 状态机
- [x] CONFIG 唯一参数源：魔法数字全收编、fx 色板去重、死配置激活修正、星星默认值对齐
- [x] GameState（IDLE/PLAYING/TRANSITION/COMPLETE）+ 转换表 + setState 校验 + IDLE 暂停 update

### Task 2 — 职责分离
- [x] render.js：Renderer 纯渲染（只读状态）+ UI DOM 垫片；Game 零 ctx/零 DOM（845→579 行）

### Task 3 — 生命周期清理
- [x] 定时器托管 `_setTimeout` + roundId 代际守卫：切关/回首页清空，过期语音回调整链作废
- [x] 显式销毁：Balloon.dispose（戳破过滤时）、Game.destroy + pagehide、rAF startLoop/stopLoop
- [x] 泄漏修复：图片缓存换关清空、Camera.stop（停流/关模型/停循环）、Analytics.init 幂等 + flush
- [x] 说明：气球为 Canvas 实体无 DOM 节点、只原地摆动无飞离路径，dispose 已覆盖唯一销毁路径

### 验证
- [x] node --check 全过 + 无头冒烟测试 43 项 ×15 连跑全过（index.html ?v=22）

## 📦 延期归档（未执行，不勾选；需要时新开任务）
- [ ] cnMap ~100 词硬编码 → 迁至 levels.js item `cn` 字段（纯数据迁移，低风险低收益）
- [ ] 提示计时帧数 → 时间戳（现依赖 rAF 60fps，实际影响小）
- [ ] main.js 拆分：角色/设置 UI/键盘导航（胶水层，不影响游戏逻辑）
- [ ] P1 清理：MoveNet/detectPose 死代码、audio 死接口（speakCorrect 含 bug）、LearningTracker 双 API
- [ ] 全局变量 + `<script>` 顺序耦合（模块化需引入构建工具，与纯静态定位冲突，暂不做）
