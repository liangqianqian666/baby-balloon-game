// analytics.js — 简单埋点统计（本地存储 + 可选远程上报）

const Analytics = {
  _sessionId: null,
  _startTime: null,
  _events: [],

  init() {
    this._sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    this._startTime = Date.now();

    // 生成或获取用户 ID
    let userId = localStorage.getItem('balloon-user-id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('balloon-user-id', userId);
    }
    this._userId = userId;

    // 页面关闭时保存
    window.addEventListener('beforeunload', () => this._saveSession());

    // 每30秒自动保存
    setInterval(() => this._saveSession(), 30000);

    this.track('session_start', { userAgent: navigator.userAgent });
  },

  // 记录事件
  track(event, data = {}) {
    this._events.push({
      event,
      time: Date.now(),
      ...data,
    });
  },

  // 保存会话数据到 localStorage
  _saveSession() {
    const session = {
      sessionId: this._sessionId,
      userId: this._userId,
      startTime: this._startTime,
      duration: Date.now() - this._startTime,
      events: this._events,
      lastSaved: Date.now(),
    };

    // 保存到历史记录
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('balloon-analytics') || '[]');
    } catch (e) {}

    // 更新或添加当前会话
    const idx = history.findIndex(s => s.sessionId === this._sessionId);
    if (idx >= 0) {
      history[idx] = session;
    } else {
      history.push(session);
    }

    // 只保留最近 100 条会话
    if (history.length > 100) history = history.slice(-100);

    try {
      localStorage.setItem('balloon-analytics', JSON.stringify(history));
    } catch (e) {}
  },

  // 获取统计摘要
  getSummary() {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('balloon-analytics') || '[]');
    } catch (e) {}

    const uniqueUsers = [...new Set(history.map(s => s.userId))];
    const totalSessions = history.length;
    const totalDuration = history.reduce((sum, s) => sum + (s.duration || 0), 0);
    const avgDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    // 统计各关卡玩了多少次
    const levelPlays = {};
    history.forEach(s => {
      (s.events || []).forEach(e => {
        if (e.event === 'level_start') {
          levelPlays[e.level] = (levelPlays[e.level] || 0) + 1;
        }
      });
    });

    return {
      uniqueUsers: uniqueUsers.length,
      totalSessions,
      totalDurationMin: Math.round(totalDuration / 60000),
      avgDurationMin: Math.round(avgDuration / 60000),
      levelPlays,
      history,
    };
  },
};
