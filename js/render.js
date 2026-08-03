// render.js — 渲染层：只读取游戏状态绘制，绝不修改状态。
// UI 垫片接管所有 DOM 显示，Game 不再直接操作 DOM。

const UI = {
  els: null,

  init() {
    this.els = {
      score: document.getElementById('score'),
      hint: document.getElementById('color-hint'),
      video: document.getElementById('pose-video'),
    };
  },

  setScore(n) { this.els.score.textContent = n; },

  showTarget(item) {
    const hint = this.els.hint;
    hint.textContent = item.label;
    hint.style.color = item.color;
    hint.style.display = 'block';
  },

  // 答对后、新目标选出前的占位
  showStar() {
    this.els.hint.textContent = '⭐';
    this.els.hint.style.color = '#FFD700';
  },

  showComplete() {
    this.els.hint.textContent = '🎉 Great!';
    this.els.hint.style.color = '#FFD700';
  },

  setHintHTML(html) { this.els.hint.innerHTML = html; },
};

class Renderer {
  constructor(game) {
    this.game = game; // 只读引用：渲染所需的全部状态都在 game 上
  }

  draw() {
    const g = this.game;
    const ctx = g.ctx;
    const w = g.canvas.width;
    const h = g.canvas.height;
    ctx.clearRect(0, 0, w, h);

    this._drawBackground(ctx, w, h);

    // 星星瓶子
    this._drawStarJar(ctx);

    // 气球（支持淡入 + 提示闪烁）
    g.balloons.forEach(b => {
      if (b.fadeIn !== undefined && b.fadeIn < 1 && !b.popping) {
        ctx.globalAlpha = b.fadeIn;
      }
      b.draw(ctx, g.time);
      ctx.globalAlpha = 1;

      // 提示高亮：正确气球闪烁光圈
      if (g.hintLevel >= 1 && g.targetItem && b.item.id === g.targetItem.id && !b.popping) {
        ctx.save();
        const pulse = Math.sin(g.time * 0.1) * 0.3 + 0.5;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = g.hintLevel >= 2 ? 8 : 4;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = g.hintLevel >= 2 ? 25 : 12;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 1.3, 0, Math.PI * 2);
        ctx.stroke();

        // 强提示：画箭头指向
        if (g.hintLevel >= 2) {
          ctx.globalAlpha = pulse;
          ctx.font = '48px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('👇', b.x, b.y - b.radius * 1.5);
        }
        ctx.restore();
      }
    });

    // 庆祝表情
    g.celebEmojis.forEach(e => {
      ctx.save();
      ctx.globalAlpha = e.life;
      ctx.font = `${e.size * e.scale}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.emoji, e.x, e.y);
      ctx.restore();
    });

    // 撒花
    g.confetti.forEach(c => {
      ctx.save();
      ctx.globalAlpha = c.life;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      ctx.restore();
    });

    // 正向刺激特效
    this._drawEffects(ctx);

    // 手部高亮光标
    g.handCursor.draw(ctx);
  }

  // === 背景渲染（根据 CONFIG.backgroundMode）===

  _drawBackground(ctx, w, h) {
    const g = this.game;
    const bgMode = CONFIG.backgroundMode;
    const video = UI.els.video;

    if (bgMode === 'none') {
      // 纯摄像头画面，无背景装饰
      if (video.readyState >= 2) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      }
    } else if (bgMode === 'transparent') {
      // 先画童趣背景
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
      skyGrad.addColorStop(0, '#87CEEB');
      skyGrad.addColorStop(1, '#E0F7FF');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      const grassGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
      grassGrad.addColorStop(0, '#90D26D');
      grassGrad.addColorStop(1, '#6BBF4E');
      ctx.fillStyle = grassGrad;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.78);
      for (let x = 0; x <= w; x += w / 8) {
        ctx.quadraticCurveTo(x + w / 16, h * 0.75 + Math.sin(x * 0.005 + g.time * 0.01) * 8, x + w / 8, h * 0.78);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      this._drawCloud(ctx, ((g.time * 0.15) % (w + 200)) - 100, h * 0.12, 60);
      this._drawCloud(ctx, ((g.time * 0.1 + w * 0.5) % (w + 200)) - 100, h * 0.22, 45);
      this._drawCloud(ctx, ((g.time * 0.08 + w * 0.25) % (w + 200)) - 100, h * 0.08, 35);

      // 半透明摄像头叠加
      if (video.readyState >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  _drawCloud(ctx, x, y, size) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.2, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y + size * 0.15, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // === 星星瓶子 ===

  _drawStarJar(ctx) {
    const g = this.game;
    const total = g.starsToWin;
    const filled = g.score;

    // 瓶子位置和尺寸（集中在 CONFIG.starJar）
    const jarX = CONFIG.starJar.x;
    const jarTopY = CONFIG.starJar.topY;
    const jarW = CONFIG.starJar.w;
    const jarH = CONFIG.starJar.h;
    const jarBottomY = jarTopY + jarH;
    const cornerR = CONFIG.starJar.cornerR;

    // 瓶口
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;

    // 瓶身（圆角矩形）
    const bx = jarX, by = jarTopY, bw = jarW, bh = jarH;
    ctx.beginPath();
    ctx.moveTo(bx + cornerR, by);
    ctx.lineTo(bx + bw - cornerR, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + cornerR);
    ctx.lineTo(bx + bw, by + bh - cornerR);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - cornerR, by + bh);
    ctx.lineTo(bx + cornerR, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - cornerR);
    ctx.lineTo(bx, by + cornerR);
    ctx.quadraticCurveTo(bx, by, bx + cornerR, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 星星网格：从下往上排列
    const cols = CONFIG.starJar.cols;
    const starSize = CONFIG.starJar.starSize;
    const padX = (jarW - cols * starSize) / (cols + 1);
    const padY = 4;
    const rows = Math.ceil(total / cols);

    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const sx = jarX + padX + col * (starSize + padX) + starSize / 2;
      // 从底部往上排
      const sy = jarBottomY - cornerR - padY - (row + 0.5) * (starSize + padY);

      const isLit = i < filled;
      const wobble = isLit ? Math.sin(g.time * 0.05 + i) * 1.5 : 0;

      ctx.font = `${starSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (isLit) {
        // 金色星星 — 带发光
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.fillText('⭐', sx, sy + wobble);
        ctx.shadowBlur = 0;
      } else {
        // 灰色星星
        ctx.globalAlpha = 0.3;
        ctx.fillText('⭐', sx, sy);
        ctx.globalAlpha = 1;
      }
    }

    // 瓶中气泡
    g.jarBubbles.forEach(b => {
      ctx.globalAlpha = b.life * 0.5;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 进度数字
    ctx.font = 'bold 18px Arial Rounded MT Bold, Nunito, Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(`${filled}/${total}`, jarX + jarW / 2, jarBottomY + 20);
    ctx.shadowBlur = 0;

    // 满瓶闪光
    if (filled >= total) {
      const glow = Math.sin(g.time * 0.1) * 0.2 + 0.3;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx + cornerR, by);
      ctx.lineTo(bx + bw - cornerR, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + cornerR);
      ctx.lineTo(bx + bw, by + bh - cornerR);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - cornerR, by + bh);
      ctx.lineTo(bx + cornerR, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - cornerR);
      ctx.lineTo(bx, by + cornerR);
      ctx.quadraticCurveTo(bx, by, bx + cornerR, by);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // === 正向刺激特效 ===

  _drawEffects(ctx) {
    const g = this.game;
    const w = g.canvas.width;
    const h = g.canvas.height;

    // 屏幕闪光
    if (g.screenFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = g.screenFlash;
      ctx.fillStyle = g.screenFlashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 彩虹波纹
    g.ripples.forEach(r => {
      ctx.save();
      ctx.globalAlpha = r.life * 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth * r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // 飞行星星
    g.flyingStars.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.font = `${s.size * s.scale}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⭐', s.x, s.y);
      ctx.restore();
    });

    // 星星雨
    g.starRain.forEach(s => {
      ctx.save();
      ctx.globalAlpha = s.life;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rotation);
      ctx.font = `${s.size}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, 0, 0);
      ctx.restore();
    });

    // 连击文字
    if (g.comboTextTimer > 0) {
      ctx.save();
      const alpha = Math.min(1, g.comboTextTimer / 20);
      const scale = 1 + (1 - alpha) * 0.3;
      ctx.globalAlpha = alpha;
      ctx.translate(w / 2, h * 0.25);
      ctx.scale(scale, scale);
      ctx.font = 'bold 52px "Arial Rounded MT Bold", Nunito, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      ctx.fillText(g.comboText, 0, 0);
      ctx.restore();
    }
  }
}
