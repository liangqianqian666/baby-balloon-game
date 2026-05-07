// main.js — 入口，初始化

let game;

async function startGame() {
  // 隐藏开始界面
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('score-display').style.display = 'block';

  // 初始化音频（选择好听的声音）
  AudioManager.init();

  // 初始化 Canvas
  const canvas = document.getElementById('game-canvas');
  game = new Game(canvas);

  // 初始化摄像头 + MoveNet
  try {
    await Camera.init();
  } catch (e) {
    alert('Unable to access camera. Please allow camera permission and try again.\n\n' + e.message);
    return;
  }

  // 开始第一轮
  game.startRound();

  // 主循环
  function loop() {
    game.update();
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
