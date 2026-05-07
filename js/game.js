// game.js — 游戏主逻辑

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.handCursor = new HandCursor();
    this.balloons = [];
    this.score = 0;
    this.targetColor = null;
    this.state = 'waiting'; // waiting | playing | transition
    this.time = 0;
    this.colorKeys = Object.keys(Balloon.COLORS);
    this.confetti = []; // 撒花粒子

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // 开始新一轮
  startRound() {
    this.balloons = [];
    this.state = 'playing';

    // 随机选 3 个不同颜色
    const shuffled = [...this.colorKeys].sort(() => Math.random() - 0.5);
    const roundColors = shuffled.slice(0, 3);

    // 目标颜色从这 3 个里选
    this.targetColor = roundColors[Math.floor(Math.random() * roundColors.length)];

    // 生成气球
    const spacing = this.canvas.width / (roundColors.length + 1);
    roundColors.forEach((color, i) => {
      const x = spacing * (i + 1) + (Math.random() - 0.5) * 40;
      const y = this.canvas.height + 80 + Math.random() * 100;
      this.balloons.push(new Balloon(x, y, color, 70));
    });

    // 更新 UI 提示
    const colorInfo = Balloon.COLORS[this.targetColor];
    const hint = document.getElementById('color-hint');
    hint.textContent = colorInfo.name;
    hint.style.color = colorInfo.fill;
    hint.style.display = 'block';

    // 语音播报
    AudioManager.speak(`Pop the ${this.targetColor} balloon!`);
  }

  // 每帧更新
  async update() {
    this.time++;

    // 检测姿态
    const keypoints = await Camera.detect();
    if (keypoints) {
      const vs = Camera.getVideoSize();
      this.handCursor.update(keypoints, vs.width, vs.height, this.canvas.width, this.canvas.height);
    }

    // 更新气球
    this.balloons.forEach(b => b.update(this.time));
    this.balloons = this.balloons.filter(b => b.alive);

    // 更新撒花
    this.confetti.forEach(c => {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.15;
      c.rotation += c.rotSpeed;
      c.life -= 0.01;
    });
    this.confetti = this.confetti.filter(c => c.life > 0);

    // 碰撞检测
    if (this.state === 'playing') {
      const hands = this.handCursor.getActivePositions();
      for (const hand of hands) {
        for (const balloon of this.balloons) {
          if (balloon.hitTest(hand.x, hand.y)) {
            if (balloon.color === this.targetColor) {
              // 答对！
              this.onCorrect(balloon);
            } else {
              // 答错
              this.onWrong(balloon);
            }
            break; // 一次只处理一个碰撞
          }
        }
      }
    }

    // 如果所有气球都飘走了，重新开始一轮
    if (this.state === 'playing' && this.balloons.length === 0) {
      this.startRound();
    }
  }

  onCorrect(balloon) {
    balloon.pop();
    this.score++;
    document.getElementById('score').textContent = this.score;
    this.state = 'transition';

    AudioManager.playPop();
    setTimeout(() => AudioManager.playCheer(), 150);

    // 撒花
    this.spawnConfetti(balloon.x, balloon.y);

    // 1.5秒后下一轮
    setTimeout(() => this.startRound(), 1800);
  }

  onWrong(balloon) {
    if (balloon.shaking) return; // 已在抖动中，不重复触发
    balloon.shake();
    AudioManager.playWrong();
    AudioManager.speak(`Try again! Find the ${this.targetColor} one!`);
  }

  spawnConfetti(x, y) {
    const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6BB5', '#C9B1FF'];
    for (let i = 0; i < 30; i++) {
      this.confetti.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 8 - 2,
        size: 5 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 1,
      });
    }
  }

  // 渲染
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 摄像头画面作为全屏背景（镜像翻转）
    const video = document.getElementById('pose-video');
    if (video.readyState >= 2) {
      ctx.save();
      ctx.translate(this.canvas.width, 0);
      ctx.scale(-1, 1); // 镜像
      ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
      // 半透明蓝色遮罩，让气球更突出
      ctx.fillStyle = 'rgba(135, 206, 235, 0.25)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      // 摄像头未就绪时用渐变背景
      const bgGrad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      bgGrad.addColorStop(0, '#87CEEB');
      bgGrad.addColorStop(1, '#E0F0FF');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // 几朵白云装饰
    this.drawClouds(ctx);

    // 气球
    this.balloons.forEach(b => b.draw(ctx, this.time));

    // 撒花
    this.confetti.forEach(c => {
      ctx.save();
      ctx.globalAlpha = c.life;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      ctx.restore();
    });

    // 不再画手掌光标，用真实手臂
  }

  drawClouds(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const drawCloud = (x, y, s) => {
      ctx.beginPath();
      ctx.arc(x, y, 30 * s, 0, Math.PI * 2);
      ctx.arc(x + 25 * s, y - 10 * s, 25 * s, 0, Math.PI * 2);
      ctx.arc(x + 50 * s, y, 30 * s, 0, Math.PI * 2);
      ctx.arc(x + 20 * s, y + 10 * s, 20 * s, 0, Math.PI * 2);
      ctx.fill();
    };
    drawCloud(150, 80, 1);
    drawCloud(this.canvas.width - 200, 120, 1.2);
    drawCloud(this.canvas.width / 2, 60, 0.8);
  }
}
