// config.js — 全局配置常量（所有可调参数的唯一来源）

const CONFIG = {
  // === 核心玩法 ===
  starsToWin: 10,
  starsRange: { min: 1, max: 50 },   // 首页"通关星星"可调范围
  balloonCount: 4,
  balloonRadius: 65,
  balloonImmunityFrames: 60,         // 新气球生成保护帧数（~1s @60fps）
  dwellThresholdFrames: 12,          // 停留多少帧算一次命中（~200ms @60fps）
  hitRadiusFactor: 2.5,              // 命中判定面积 = 半径² × 系数
  levelCompleteDelayMs: 3500,        // 通关后回首页延迟

  // === 生词/熟词配比 ===
  newItemRatio: 0.4,       // 40% 概率选全新词
  reviewItemRatio: 0.4,    // 40% 概率选需复习的词
  masteredItemRatio: 0.2,  // 20% 概率选已掌握的词

  // === 掌握度阈值 ===
  thresholds: {
    mastered: { minCorrect: 5, minAccuracy: 0.85, minStreak: 3 },
    reviewing: { minCorrect: 2, minAccuracy: 0.5 },
    // 不满足以上条件的为 'learning'；从未见过的为 'new'
  },

  // === 艾宾浩斯遗忘曲线参数 ===
  forgetting: {
    baseStability: 1,          // 基础稳定性（小时）
    masteryStabilityBonus: 48, // 掌握度对稳定性的加成（小时）
    accuracyStabilityBonus: 24, // 正确率对单词稳定性的加成
  },

  // target 选择偏好：70% 概率从生词/学习中选
  targetPreferNew: 0.7,

  // === 提示系统（帧 @60fps）===
  hint: {
    lightFrames: 240,   // ~4s → 轻提示（目标气球闪烁 + 中文提示）
    strongFrames: 480,  // ~8s → 强提示（高亮箭头 + 语音）
  },

  // === 连击 ===
  combo: {
    textStart: 2,    // 连对 N 个起显示 combo 文字
    bigFxEvery: 3,   // 每连对 N 个：大撒花 + 金色闪光 + 特效音
    rainbowEvery: 5, // 每连对 N 个：彩虹波纹 + 星星雨
    cheerAt: {       // 语音鼓励里程碑
      3: 'You did it! Three in a row!',
      5: 'Five in a row! Can you keep going?',
      7: 'Seven in a row! Wow!',
      10: 'Ten in a row! That is a lot!',
    },
  },

  // === 特效参数 ===
  fx: {
    confettiPerPop: 30,    // 撒花粒子数/次
    balloonParticles: 12,  // 气球爆裂粒子数
    flyingStarsPerPop: 3,  // 答对飞星数
    ripplesPerCombo: 4,    // 大连击彩虹波纹数
    starRainCount: 20,     // 星星雨粒子数
    confettiGravity: 0.15,
    rippleSpeed: 6,        // 波纹半径每帧增量
    starRainGravity: 0.08,
    colors: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6BB5', '#C9B1FF'],
  },

  // === 星星瓶几何 ===
  starJar: { x: 20, topY: 70, w: 60, h: 220, cornerR: 12, starSize: 16, cols: 3, mouthX: 55, mouthY: 80 },

  // === 用户偏好（localStorage 可覆盖）===
  currentProfile: 'Luna',
  // 背景模式: 'none' = 纯摄像头无背景, 'transparent' = 半透明童趣背景
  backgroundMode: 'none',
  // 图片风格: 'svg' = 手绘SVG, 'photo' = 实物照片, 'emoji' = Emoji
  imageStyle: 'photo',
};
