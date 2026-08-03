// main.js — 入口，初始化和 UI 胶水

let game;
let renderer;
let rafId = null; // 主循环句柄：显式 start/stop，首页不空转
let cameraAvailable = false;

// 兼容旧代码：LearningTracker 指向 SpacedRep
const LearningTracker = {
  init: () => SpacedRep.init(),
  record: (l, i, c) => SpacedRep.record(l, i, c),
  pickNextLevel: () => SpacedRep.pickNextLevel(),
  pickWeightedItem: (l, e) => SpacedRep.pickWeightedItem(l, e),
  getLevelMastery: (l) => SpacedRep._getLevelMastery(l),
};

// 页面加载 → 显示关卡选择
window.addEventListener('DOMContentLoaded', () => {
  // 旧数据迁移：如果没有角色列表但有旧学习数据，迁移到 Luna 名下
  migrateOldData();

  // 恢复当前角色
  const savedProfile = localStorage.getItem('balloon-current-profile');
  if (savedProfile) CONFIG.currentProfile = savedProfile;

  // 确保角色列表存在
  let profiles = getProfiles();
  if (!profiles.includes(CONFIG.currentProfile)) {
    profiles.push(CONFIG.currentProfile);
    saveProfiles(profiles);
  }

  UI.init(); // DOM 引用缓存，Game/Renderer 不再直接 getElementById
  AudioManager.init();
  SpacedRep.init();
  Analytics.init();

  // 从 localStorage 恢复背景模式
  const savedBgMode = localStorage.getItem('backgroundMode');
  if (savedBgMode && ['none', 'transparent'].includes(savedBgMode)) {
    CONFIG.backgroundMode = savedBgMode;
  }

  // 从 localStorage 恢复图片风格
  const savedStyle = localStorage.getItem('imageStyle');
  if (savedStyle && ['svg', 'photo', 'emoji'].includes(savedStyle)) {
    CONFIG.imageStyle = savedStyle;
  }

  // 从 localStorage 恢复通关星星数
  const savedStars = localStorage.getItem('starsToWin');
  if (savedStars) {
    CONFIG.starsToWin = parseInt(savedStars, 10);
  }

  initProfileSelector();
  initBgToggle();
  initStyleToggle();
  initStarsToggle();
  initKeyboardNav();
  showLevelSelect();

  // 游戏中按钮
  document.getElementById('btn-back').addEventListener('click', () => {
    // 回首页先进 IDLE：暂停游戏更新，避免画布隐藏后仍持续消耗
    if (game) game.setState(GameState.IDLE);
    stopLoop(); // 渲染循环同步停止
    showLevelSelect();
  });
  document.getElementById('btn-skip').addEventListener('click', () => {
    // 随机选一个不同的关卡
    const keys = Object.keys(LEVELS);
    const others = keys.filter(k => k !== (game && game.levelKey));
    const next = others[Math.floor(Math.random() * others.length)];
    startGame(next);
  });
});

// 页面退出：显式拆除，不留定时器/监听/摄像头流
window.addEventListener('pagehide', () => {
  stopLoop();
  if (game) game.destroy();
  Camera.stop();
  Analytics.flush();
});

function showLevelSelect() {
  document.getElementById('level-screen').style.display = 'flex';
  document.getElementById('game-canvas').style.display = 'none';
  document.getElementById('score-display').style.display = 'none';
  document.getElementById('color-hint').style.display = 'none';
  document.getElementById('game-buttons').style.display = 'none';

  const container = document.getElementById('level-buttons');
  container.innerHTML = '';

  function makeBtn(key, icon, name) {
    const level = LEVELS[key];
    const progress = SpacedRep.getLevelProgress(key);
    const btn = document.createElement('button');
    btn.className = 'level-btn';

    let progressDot = '';
    if (progress && progress.mastered === progress.total) {
      progressDot = '<span class="level-complete">✓</span>';
    } else if (progress && progress.reviewDue > 0) {
      progressDot = `<span class="level-due" title="${progress.reviewDue}个词需要复习">复习${progress.reviewDue}</span>`;
    }

    btn.innerHTML = `<span class="level-icon">${icon}</span><span class="level-name">${name}</span>${progressDot}`;
    btn.onclick = () => startGame(key);
    return btn;
  }

  LEVEL_CATEGORIES.forEach(cat => {
    if (!LEVELS[cat.basic]) return;

    const row = document.createElement('div');
    row.className = 'level-row';

    // 主题标签
    const topic = document.createElement('span');
    topic.className = 'level-topic';
    topic.innerHTML = `${cat.icon} ${cat.topic}`;
    row.appendChild(topic);

    // 基础玩法按钮
    const level = LEVELS[cat.basic];
    const basicBtn = makeBtn(cat.basic, '📚', 'Basic');
    row.appendChild(basicBtn);

    // 进阶玩法按钮
    if (cat.advanced && LEVELS[cat.advanced]) {
      const advBtn = makeBtn(cat.advanced, cat.advancedIcon, cat.advancedName);
      row.appendChild(advBtn);
    } else {
      // 灰色占位
      const placeholder = document.createElement('button');
      placeholder.className = 'level-btn level-btn-locked';
      placeholder.disabled = true;
      placeholder.innerHTML = `<span class="level-icon">${cat.advancedIcon || '🔒'}</span><span class="level-name">${cat.advancedName || 'Coming'}</span><span class="level-locked-tag">Soon</span>`;
      row.appendChild(placeholder);
    }

    container.appendChild(row);
  });
}

async function startGame(levelKey) {
  document.getElementById('level-screen').style.display = 'none';
  document.getElementById('game-canvas').style.display = 'block';
  document.getElementById('score-display').style.display = 'block';
  document.getElementById('game-buttons').style.display = 'flex';

  // 预加载图片
  await preloadLevelImages(levelKey);

  const canvas = document.getElementById('game-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  if (!game) {
    game = new Game(canvas);
    renderer = new Renderer(game); // 渲染层：只读 game 状态绘制

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
  }

  startLoop();
  game.setLevel(levelKey);
  Analytics.track('level_start', { level: levelKey });
}

// === 主循环生命周期：显式启停，首页/退出不空转 ===

function loop() {
  game.update();
  renderer.draw();
  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (rafId === null) rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// === 角色管理 ===

function getProfiles() {
  try {
    return JSON.parse(localStorage.getItem('balloon-profiles') || '["Luna"]');
  } catch (e) { return ['Luna']; }
}

function saveProfiles(profiles) {
  localStorage.setItem('balloon-profiles', JSON.stringify(profiles));
}

function migrateOldData() {
  // 如果已有角色列表，说明已迁移过
  if (localStorage.getItem('balloon-profiles')) return;
  // 如果有旧的无前缀数据，迁移到 Luna 名下
  const oldData = localStorage.getItem('balloon-learning-data');
  if (oldData) {
    localStorage.setItem('balloon-learning-data-Luna', oldData);
    localStorage.removeItem('balloon-learning-data');
  }
  const oldAnalytics = localStorage.getItem('balloon-analytics');
  if (oldAnalytics) {
    localStorage.setItem('balloon-analytics-Luna', oldAnalytics);
    localStorage.removeItem('balloon-analytics');
  }
  saveProfiles(['Luna']);
}

function switchProfile(name) {
  CONFIG.currentProfile = name;
  localStorage.setItem('balloon-current-profile', name);
  SpacedRep.init();
  Analytics.init();
  showLevelSelect();
}

function initProfileSelector() {
  const container = document.getElementById('profile-list');
  const profiles = getProfiles();
  container.innerHTML = '';

  profiles.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'profile-btn' + (name === CONFIG.currentProfile ? ' active' : '');
    btn.textContent = name;
    btn.onclick = () => {
      switchProfile(name);
      initProfileSelector(); // 刷新高亮
    };

    const wrapper = document.createElement('span');
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '2px';
    wrapper.appendChild(btn);

    // 删除按钮（至少保留1个角色）
    if (profiles.length > 1) {
      const del = document.createElement('span');
      del.className = 'profile-del';
      del.textContent = '✕';
      del.title = '删除 ' + name;
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm('确定删除玩家「' + name + '」的所有学习记录吗？')) return;
        const newProfiles = profiles.filter(p => p !== name);
        saveProfiles(newProfiles);
        // 删除该角色的数据
        localStorage.removeItem('balloon-learning-data-' + name);
        localStorage.removeItem('balloon-analytics-' + name);
        // 如果删的是当前角色，切到第一个
        if (CONFIG.currentProfile === name) {
          switchProfile(newProfiles[0]);
        }
        initProfileSelector();
      };
      wrapper.appendChild(del);
    }

    container.appendChild(wrapper);
  });

  // 添加按钮
  const addBtn = document.createElement('button');
  addBtn.className = 'profile-add-btn';
  addBtn.textContent = '+';
  addBtn.title = '添加新玩家';
  addBtn.onclick = () => {
    const name = prompt('输入新玩家名字：');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (profiles.includes(trimmed)) {
      alert('该玩家已存在');
      return;
    }
    profiles.push(trimmed);
    saveProfiles(profiles);
    switchProfile(trimmed);
    initProfileSelector();
  };
  container.appendChild(addBtn);
}

// 背景模式切换
function initBgToggle() {
  const btns = document.querySelectorAll('.bg-mode-btn');
  // 高亮当前模式
  btns.forEach(btn => {
    if (btn.dataset.mode === CONFIG.backgroundMode) btn.classList.add('active');
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CONFIG.backgroundMode = btn.dataset.mode;
      localStorage.setItem('backgroundMode', btn.dataset.mode);
    });
  });
}

// 图片风格切换
function initStyleToggle() {
  const btns = document.querySelectorAll('.style-btn');
  btns.forEach(btn => {
    if (btn.dataset.style === CONFIG.imageStyle) btn.classList.add('active');
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CONFIG.imageStyle = btn.dataset.style;
      localStorage.setItem('imageStyle', btn.dataset.style);
    });
  });
}

// 通关星星数调整（+/- 按钮 + 滚轮）
function initStarsToggle() {
  const display = document.getElementById('stars-value');
  const minStars = CONFIG.starsRange.min, maxStars = CONFIG.starsRange.max, step = 1;

  function updateDisplay() {
    display.textContent = CONFIG.starsToWin;
  }
  updateDisplay();

  document.getElementById('stars-minus').addEventListener('click', () => {
    CONFIG.starsToWin = Math.max(minStars, CONFIG.starsToWin - step);
    localStorage.setItem('starsToWin', CONFIG.starsToWin);
    updateDisplay();
  });
  document.getElementById('stars-plus').addEventListener('click', () => {
    CONFIG.starsToWin = Math.min(maxStars, CONFIG.starsToWin + step);
    localStorage.setItem('starsToWin', CONFIG.starsToWin);
    updateDisplay();
  });

  // 滚轮调整
  const container = document.getElementById('stars-toggle');
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      CONFIG.starsToWin = Math.min(maxStars, CONFIG.starsToWin + step);
    } else {
      CONFIG.starsToWin = Math.max(minStars, CONFIG.starsToWin - step);
    }
    localStorage.setItem('starsToWin', CONFIG.starsToWin);
    updateDisplay();
  }, { passive: false });
}

// 通关后回到关卡选择
function startNextLevel() {
  showLevelSelect();
}

// 首页键盘导航
// 可聚焦区域：bgToggle（背景模式）、starsToggle（星星数）、levels（关卡按钮网格）
function initKeyboardNav() {
  // 当前聚焦区域: 'bg' | 'stars' | 'levels'
  let zone = 'levels';
  let levelIndex = 0;

  function getLevelBtns() {
    return Array.from(document.querySelectorAll('#level-buttons .level-btn'));
  }
  function getBgBtns() {
    return Array.from(document.querySelectorAll('.bg-mode-btn'));
  }
  function getActiveBgIndex() {
    const btns = getBgBtns();
    return Math.max(0, btns.findIndex(b => b.classList.contains('active')));
  }

  function highlightLevel(idx) {
    const btns = getLevelBtns();
    btns.forEach(b => b.style.outline = '');
    if (btns[idx]) {
      btns[idx].style.outline = '4px solid #FF6B6B';
      btns[idx].scrollIntoView({ block: 'nearest' });
    }
  }
  function highlightBg(idx) {
    const btns = getBgBtns();
    btns.forEach(b => b.style.outline = '');
    if (btns[idx]) btns[idx].style.outline = '4px solid #FF6B6B';
  }
  function highlightStars() {
    document.getElementById('stars-toggle').style.outline = '4px solid #FF6B6B';
  }
  function clearAll() {
    getLevelBtns().forEach(b => b.style.outline = '');
    getBgBtns().forEach(b => b.style.outline = '');
    document.getElementById('stars-toggle').style.outline = '';
  }

  function applyHighlight() {
    clearAll();
    if (zone === 'bg') highlightBg(getActiveBgIndex());
    else if (zone === 'stars') highlightStars();
    else if (zone === 'levels') highlightLevel(levelIndex);
  }

  // 估算一行有几个按钮（根据容器宽度和按钮宽度）
  function getCols() {
    const btns = getLevelBtns();
    if (btns.length < 2) return 1;
    const firstTop = btns[0].offsetTop;
    for (let i = 1; i < btns.length; i++) {
      if (btns[i].offsetTop !== firstTop) return i;
    }
    return btns.length;
  }

  document.addEventListener('keydown', (e) => {
    // 只在首页生效
    if (document.getElementById('level-screen').style.display === 'none') return;

    const key = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(key)) return;
    e.preventDefault();

    const levelBtns = getLevelBtns();
    const bgBtns = getBgBtns();
    const cols = getCols();

    if (key === 'ArrowUp') {
      if (zone === 'levels') {
        if (levelIndex - cols >= 0) {
          levelIndex -= cols;
        } else {
          zone = 'stars';
        }
      } else if (zone === 'stars') {
        zone = 'bg';
      }
    } else if (key === 'ArrowDown') {
      if (zone === 'bg') {
        zone = 'stars';
      } else if (zone === 'stars') {
        zone = 'levels';
        levelIndex = Math.min(levelIndex, levelBtns.length - 1);
      } else if (zone === 'levels') {
        if (levelIndex + cols < levelBtns.length) {
          levelIndex += cols;
        }
      }
    } else if (key === 'ArrowLeft') {
      if (zone === 'levels') {
        if (levelIndex > 0) levelIndex--;
      } else if (zone === 'bg') {
        const idx = getActiveBgIndex();
        if (idx > 0) bgBtns[idx - 1].click();
      } else if (zone === 'stars') {
        document.getElementById('stars-minus').click();
      }
    } else if (key === 'ArrowRight') {
      if (zone === 'levels') {
        if (levelIndex < levelBtns.length - 1) levelIndex++;
      } else if (zone === 'bg') {
        const idx = getActiveBgIndex();
        if (idx < bgBtns.length - 1) bgBtns[idx + 1].click();
      } else if (zone === 'stars') {
        document.getElementById('stars-plus').click();
      }
    } else if (key === 'Enter' || key === ' ') {
      if (zone === 'levels' && levelBtns[levelIndex]) {
        levelBtns[levelIndex].click();
      }
    }

    applyHighlight();
  });
}
