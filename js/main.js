// main.js — 入口，初始化

let game;
let cameraAvailable = false;
let cameraInitialized = false;

// 学习进度追踪
const LearningTracker = {
  // 每个关卡每个 item 的正确/错误次数
  _data: {},

  init() {
    // 尝试从 localStorage 读取
    try {
      const saved = localStorage.getItem('balloon-learning-data');
      if (saved) this._data = JSON.parse(saved);
    } catch (e) {}
  },

  record(levelKey, itemId, correct) {
    if (!this._data[levelKey]) this._data[levelKey] = {};
    if (!this._data[levelKey][itemId]) this._data[levelKey][itemId] = { correct: 0, wrong: 0, lastSeen: 0 };
    const entry = this._data[levelKey][itemId];
    if (correct) entry.correct++;
    else entry.wrong++;
    entry.lastSeen = Date.now();
    this._save();
  },

  _save() {
    try {
      localStorage.setItem('balloon-learning-data', JSON.stringify(this._data));
    } catch (e) {}
  },

  // 获取关卡熟练度分数（0~1，越高越熟）
  getLevelMastery(levelKey) {
    const levelData = this._data[levelKey];
    if (!levelData) return 0;
    const items = Object.values(levelData);
    if (items.length === 0) return 0;
    const totalCorrect = items.reduce((sum, i) => sum + i.correct, 0);
    const totalAttempts = items.reduce((sum, i) => sum + i.correct + i.wrong, 0);
    if (totalAttempts === 0) return 0;
    return totalCorrect / totalAttempts;
  },

  // 智能选关卡：结合熟练度 + 时间间隔
  pickNextLevel() {
    const keys = Object.keys(LEVELS);
    const now = Date.now();

    const weights = keys.map(key => {
      const levelData = this._data[key];
      if (!levelData || Object.keys(levelData).length === 0) return 4; // 没玩过，高优先

      const mastery = this.getLevelMastery(key);
      // 最后一次学习时间
      const lastSeen = Math.max(...Object.values(levelData).map(i => i.lastSeen || 0));
      const hoursSince = (now - lastSeen) / (1000 * 60 * 60);

      // 掌握度高 + 刚学过 → 低权重
      // 掌握度低 或 很久没学 → 高权重
      const stability = 1 + mastery * 48;
      const retention = Math.exp(-hoursSince / stability);
      return Math.max(0.5, (1 - retention) * 3 + (1 - mastery) * 2);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < keys.length; i++) {
      random -= weights[i];
      if (random <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  },

  // 智能选 item：结合正确率 + 艾宾浩斯遗忘曲线
  pickWeightedItem(levelKey, excludeIds) {
    const items = LEVELS[levelKey].items;
    const available = items.filter(item => !excludeIds.includes(item.id));
    if (available.length === 0) return items[Math.floor(Math.random() * items.length)];

    const levelData = this._data[levelKey] || {};
    const now = Date.now();

    const weights = available.map(item => {
      const entry = levelData[item.id];
      if (!entry) return 4; // 全新单词，最高优先级

      const accuracy = entry.correct / (entry.correct + entry.wrong);
      // 距上次学习的时间（小时）
      const hoursSince = (now - entry.lastSeen) / (1000 * 60 * 60);

      // 艾宾浩斯：记忆保留率 R = e^(-t/S)
      // S = stability，正确率越高 stability 越大
      const stability = 1 + accuracy * 24; // 全对的稳定性约25小时
      const retention = Math.exp(-hoursSince / stability);

      // 权重 = 1 - retention（越容易忘的权重越高）
      // 最低 0.3 保证已掌握的也偶尔出现
      return Math.max(0.3, (1 - retention) * 3 + 0.3);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < available.length; i++) {
      random -= weights[i];
      if (random <= 0) return available[i];
    }
    return available[available.length - 1];
  }
};

// 页面加载直接启动
window.addEventListener('DOMContentLoaded', () => {
  autoStart();
});

async function autoStart() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('level-screen').style.display = 'none';
  document.getElementById('score-display').style.display = 'block';

  AudioManager.init();
  LearningTracker.init();

  const canvas = document.getElementById('game-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  game = new Game(canvas);

  // 初始化摄像头
  try {
    await Camera.init();
    cameraAvailable = true;
  } catch (e) {
    console.warn('Camera not available:', e.message);
    canvas.addEventListener('mousemove', (e) => {
      game.handCursor.leftHand.x = e.clientX;
      game.handCursor.leftHand.y = e.clientY;
      game.handCursor.leftHand.visible = true;
    });
    canvas.addEventListener('touchmove', (ev) => {
      ev.preventDefault();
      const t = ev.touches[0];
      game.handCursor.leftHand.x = t.clientX;
      game.handCursor.leftHand.y = t.clientY;
      game.handCursor.leftHand.visible = true;
    });
  }

  // 智能选关卡并开始
  const levelKey = LearningTracker.pickNextLevel();
  game.setLevel(levelKey);

  // 主循环
  function loop() {
    game.update();
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// 通关后自动选下一关
function startNextLevel() {
  const levelKey = LearningTracker.pickNextLevel();
  game.setLevel(levelKey);
}
