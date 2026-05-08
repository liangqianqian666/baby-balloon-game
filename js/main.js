// main.js — 入口，初始化和 UI 胶水

let game;
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
  AudioManager.init();
  SpacedRep.init();
  Analytics.init();
  showLevelSelect();
});

function showLevelSelect() {
  document.getElementById('level-screen').style.display = 'flex';
  document.getElementById('game-canvas').style.display = 'none';
  document.getElementById('score-display').style.display = 'none';
  document.getElementById('color-hint').style.display = 'none';

  const container = document.getElementById('level-buttons');
  container.innerHTML = '';

  Object.keys(LEVELS).forEach(key => {
    const level = LEVELS[key];
    const progress = SpacedRep.getLevelProgress(key);
    const btn = document.createElement('button');
    btn.className = 'level-btn';

    // 进度指示器
    let progressDot = '';
    if (progress && progress.mastered === progress.total) {
      progressDot = '<span class="level-complete">✓</span>';
    } else if (progress && progress.reviewDue > 0) {
      progressDot = `<span class="level-due">${progress.reviewDue}</span>`;
    }

    btn.innerHTML = `<span class="level-icon">${level.icon}</span><span class="level-name">${level.name}</span>${progressDot}`;
    btn.onclick = () => startGame(key);
    container.appendChild(btn);
  });
}

async function startGame(levelKey) {
  document.getElementById('level-screen').style.display = 'none';
  document.getElementById('game-canvas').style.display = 'block';
  document.getElementById('score-display').style.display = 'block';

  // 预加载图片
  await preloadLevelImages(levelKey);

  const canvas = document.getElementById('game-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  if (!game) {
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

    // 主循环
    function loop() {
      game.update();
      game.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  game.setLevel(levelKey);
  Analytics.track('level_start', { level: levelKey });
}

// 通关后回到关卡选择
function startNextLevel() {
  showLevelSelect();
}
