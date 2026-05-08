// spaced-rep.js — 艾宾浩斯间隔重复模块

const SpacedRep = {
  _data: {},  // { [levelKey]: { [itemId]: { correct, wrong, lastSeen, streak } } }

  init() {
    try {
      const saved = localStorage.getItem('balloon-learning-data');
      if (saved) this._data = JSON.parse(saved);
    } catch (e) {}
  },

  // 记录一次学习结果
  record(levelKey, itemId, correct) {
    if (!this._data[levelKey]) this._data[levelKey] = {};
    if (!this._data[levelKey][itemId]) {
      this._data[levelKey][itemId] = { correct: 0, wrong: 0, lastSeen: 0, streak: 0 };
    }
    const entry = this._data[levelKey][itemId];
    if (correct) {
      entry.correct++;
      entry.streak++;
    } else {
      entry.wrong++;
      entry.streak = 0;
    }
    entry.lastSeen = Date.now();
    this._save();
  },

  _save() {
    try {
      localStorage.setItem('balloon-learning-data', JSON.stringify(this._data));
    } catch (e) {}
  },

  // ===== 掌握度判断 =====

  getItemStatus(levelKey, itemId) {
    const entry = this._getEntry(levelKey, itemId);
    if (!entry) return 'new';
    const total = entry.correct + entry.wrong;
    if (total === 0) return 'new';
    const accuracy = entry.correct / total;
    const t = CONFIG.thresholds;
    if (entry.correct >= t.mastered.minCorrect &&
        accuracy >= t.mastered.minAccuracy &&
        entry.streak >= t.mastered.minStreak) {
      return 'mastered';
    }
    if (entry.correct >= t.reviewing.minCorrect &&
        accuracy >= t.reviewing.minAccuracy) {
      return 'reviewing';
    }
    return 'learning';
  },

  // 判断是否需要复习（记忆已衰退）
  isDue(levelKey, itemId) {
    const entry = this._getEntry(levelKey, itemId);
    if (!entry) return false; // new items are not "due"
    const retention = this._getRetention(entry);
    return retention < 0.7; // 记忆保持率低于 70% 需要复习
  },

  // 获取关卡进度
  getLevelProgress(levelKey) {
    const level = LEVELS[levelKey];
    if (!level) return null;
    const items = level.items;
    let mastered = 0, learning = 0, reviewing = 0, newCount = 0, reviewDue = 0;
    items.forEach(item => {
      const status = this.getItemStatus(levelKey, item.id);
      if (status === 'mastered') mastered++;
      else if (status === 'reviewing') reviewing++;
      else if (status === 'learning') learning++;
      else newCount++;
      if (this.isDue(levelKey, item.id)) reviewDue++;
    });
    return { total: items.length, mastered, learning, reviewing, new: newCount, reviewDue };
  },

  // 获取所有关卡进度
  getAllProgress() {
    const result = {};
    Object.keys(LEVELS).forEach(key => {
      result[key] = this.getLevelProgress(key);
    });
    return result;
  },

  // 获取需要复习的词列表（按遗忘概率排序）
  getDueItems(levelKey) {
    const level = LEVELS[levelKey];
    if (!level) return [];
    return level.items
      .filter(item => this.isDue(levelKey, item.id))
      .map(item => {
        const entry = this._getEntry(levelKey, item.id);
        return { ...item, retention: this._getRetention(entry), entry };
      })
      .sort((a, b) => a.retention - b.retention); // 最容易忘的排前面
  },

  // ===== 智能选择 =====

  // 选下一个关卡
  pickNextLevel() {
    const keys = Object.keys(LEVELS);
    const now = Date.now();
    const f = CONFIG.forgetting;

    const weights = keys.map(key => {
      const levelData = this._data[key];
      if (!levelData || Object.keys(levelData).length === 0) return 4;

      const mastery = this._getLevelMastery(key);
      const lastSeen = Math.max(...Object.values(levelData).map(i => i.lastSeen || 0));
      const hoursSince = (now - lastSeen) / (1000 * 60 * 60);
      const stability = f.baseStability + mastery * f.masteryStabilityBonus;
      const retention = Math.exp(-hoursSince / stability);
      return Math.max(0.5, (1 - retention) * 3 + (1 - mastery) * 2);
    });

    return this._weightedRandom(keys, weights);
  },

  // 选一个 item（带生词/熟词配比）
  pickWeightedItem(levelKey, excludeIds = [], options = {}) {
    const items = LEVELS[levelKey].items;
    const available = items.filter(item => !excludeIds.includes(item.id));
    if (available.length === 0) return items[Math.floor(Math.random() * items.length)];

    const newRatio = options.newRatio ?? CONFIG.newItemRatio;
    const reviewRatio = options.reviewRatio ?? CONFIG.reviewItemRatio;

    // 按状态分组
    const groups = { new: [], learning: [], reviewing: [], mastered: [] };
    available.forEach(item => {
      const status = this.getItemStatus(levelKey, item.id);
      groups[status].push(item);
    });

    // 合并 new + learning 为 "生词池"
    const newPool = [...groups.new, ...groups.learning];
    // 合并 reviewing + mastered 为 "复习池"（优先 due 的）
    const reviewPool = [...groups.reviewing, ...groups.mastered];

    // 按配比决定从哪个池子选
    const rand = Math.random();
    let pool;
    if (rand < newRatio && newPool.length > 0) {
      pool = newPool;
    } else if (rand < newRatio + reviewRatio && reviewPool.length > 0) {
      pool = reviewPool;
    } else {
      pool = available; // fallback: 全部
    }

    // 在选定的池子中按遗忘权重选
    const f = CONFIG.forgetting;
    const now = Date.now();
    const weights = pool.map(item => {
      const entry = this._getEntry(levelKey, item.id);
      if (!entry) return 4; // 全新词高权重
      const accuracy = entry.correct / (entry.correct + entry.wrong);
      const hoursSince = (now - entry.lastSeen) / (1000 * 60 * 60);
      const stability = f.baseStability + accuracy * f.accuracyStabilityBonus;
      const retention = Math.exp(-hoursSince / stability);
      return Math.max(0.3, (1 - retention) * 3 + 0.3);
    });

    return this._weightedRandom(pool, weights);
  },

  // 选 target：优先选生词/学习中的
  pickTarget(levelKey, balloonItems) {
    if (balloonItems.length === 0) return null;

    // 按状态分
    const newOrLearning = balloonItems.filter(item => {
      const s = this.getItemStatus(levelKey, item.id);
      return s === 'new' || s === 'learning';
    });

    // 70% 概率从生词中选 target
    if (newOrLearning.length > 0 && Math.random() < CONFIG.targetPreferNew) {
      return newOrLearning[Math.floor(Math.random() * newOrLearning.length)];
    }
    // 否则随机
    return balloonItems[Math.floor(Math.random() * balloonItems.length)];
  },

  // ===== 内部辅助 =====

  _getEntry(levelKey, itemId) {
    return this._data[levelKey]?.[itemId] || null;
  },

  _getRetention(entry) {
    if (!entry || (entry.correct + entry.wrong) === 0) return 1;
    const f = CONFIG.forgetting;
    const accuracy = entry.correct / (entry.correct + entry.wrong);
    const hoursSince = (Date.now() - entry.lastSeen) / (1000 * 60 * 60);
    const stability = f.baseStability + accuracy * f.accuracyStabilityBonus;
    return Math.exp(-hoursSince / stability);
  },

  _getLevelMastery(levelKey) {
    const levelData = this._data[levelKey];
    if (!levelData) return 0;
    const items = Object.values(levelData);
    if (items.length === 0) return 0;
    const totalCorrect = items.reduce((sum, i) => sum + i.correct, 0);
    const totalAttempts = items.reduce((sum, i) => sum + i.correct + i.wrong, 0);
    if (totalAttempts === 0) return 0;
    return totalCorrect / totalAttempts;
  },

  _weightedRandom(items, weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  },
};
