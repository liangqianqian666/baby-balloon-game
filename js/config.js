// config.js — 全局配置常量

const CONFIG = {
  // 游戏参数
  starsToWin: 20,
  balloonCount: 4,
  balloonRadius: 65,

  // 生词/熟词配比
  newItemRatio: 0.4,       // 40% 概率选全新词
  reviewItemRatio: 0.4,    // 40% 概率选需复习的词
  masteredItemRatio: 0.2,  // 20% 概率选已掌握的词

  // 掌握度阈值
  thresholds: {
    mastered: { minCorrect: 5, minAccuracy: 0.85, minStreak: 3 },
    reviewing: { minCorrect: 2, minAccuracy: 0.5 },
    // 不满足以上条件的为 'learning'
    // 从未见过的为 'new'
  },

  // 艾宾浩斯遗忘曲线参数
  forgetting: {
    baseStability: 1,         // 基础稳定性（小时）
    masteryStabilityBonus: 48, // 掌握度对稳定性的加成（小时）
    accuracyStabilityBonus: 24, // 正确率对单词稳定性的加成
  },

  // target 选择偏好
  targetPreferNew: 0.7, // 70% 概率从生词/学习中选 target
};
