// hand-cursor.js — 手掌光标，跟随 MediaPipe Hands 重心
// 连击时特效升级，答错时降级

class HandCursor {
  constructor() {
    this.leftHand = { x: -100, y: -100, visible: false };
    this.rightHand = { x: -100, y: -100, visible: false };
    this.smoothing = 0.4;
    this.streakLevel = 0; // 0=普通 1=发光 2=彩虹 3=火焰
    this.trail = [];      // 拖尾粒子
    this.time = 0;
  }

  setStreakLevel(streak) {
    if (streak >= 7) this.streakLevel = 3;
    else if (streak >= 5) this.streakLevel = 2;
    else if (streak >= 3) this.streakLevel = 1;
    else this.streakLevel = 0;
  }

  // 答错降一级
  downgrade() {
    this.streakLevel = Math.max(0, this.streakLevel - 1);
  }

  update(handsLandmarks, canvasW, canvasH) {
    this.time++;
    if (!handsLandmarks || handsLandmarks.length === 0) {
      this.leftHand.visible = false;
      this.rightHand.visible = false;
      return;
    }

    const hands = [this.leftHand, this.rightHand];
    for (let i = 0; i < 2; i++) {
      const hand = hands[i];
      if (i < handsLandmarks.length) {
        const landmarks = handsLandmarks[i];
        let sumX = 0, sumY = 0;
        for (const lm of landmarks) {
          sumX += lm.x;
          sumY += lm.y;
        }
        const targetX = (1 - sumX / landmarks.length) * canvasW;
        const targetY = (sumY / landmarks.length) * canvasH;

        const oldX = hand.x, oldY = hand.y;
        hand.x += (targetX - hand.x) * this.smoothing;
        hand.y += (targetY - hand.y) * this.smoothing;
        hand.visible = true;

        // 拖尾粒子（连击等级1+）
        if (this.streakLevel >= 1 && hand.visible) {
          const colors = this.streakLevel >= 3
            ? ['#FF4444', '#FF8833', '#FFD700', '#FF6B6B'] // 火焰色
            : this.streakLevel >= 2
              ? ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6BB5', '#C9B1FF'] // 彩虹
              : ['#FFD700', '#FFF8DC', '#FFED88']; // 金色
          this.trail.push({
            x: hand.x + (Math.random() - 0.5) * 10,
            y: hand.y + (Math.random() - 0.5) * 10,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 3 + this.streakLevel * 2 + Math.random() * 4,
            life: 1,
          });
        }
      } else {
        hand.visible = false;
      }
    }

    // 更新拖尾
    this.trail.forEach(p => { p.life -= 0.04; p.y -= 0.5; p.size *= 0.97; });
    this.trail = this.trail.filter(p => p.life > 0);
    // 限制粒子数
    if (this.trail.length > 60) this.trail = this.trail.slice(-60);
  }

  draw(ctx) {
    // 先画拖尾
    this.trail.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const drawHand = (hand) => {
      if (!hand.visible) return;
      ctx.save();

      const level = this.streakLevel;
      const glowSize = 45 + level * 15;

      // 外圈发光
      if (level >= 3) {
        // 火焰效果：多层渐变
        const g = ctx.createRadialGradient(hand.x, hand.y, 5, hand.x, hand.y, glowSize);
        g.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        g.addColorStop(0.3, 'rgba(255, 150, 0, 0.5)');
        g.addColorStop(0.6, 'rgba(255, 50, 0, 0.2)');
        g.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (level >= 2) {
        // 彩虹光环
        const hue = (this.time * 3) % 360;
        const g = ctx.createRadialGradient(hand.x, hand.y, 5, hand.x, hand.y, glowSize);
        g.addColorStop(0, `hsla(${hue}, 100%, 80%, 0.8)`);
        g.addColorStop(0.5, `hsla(${(hue + 60) % 360}, 100%, 60%, 0.3)`);
        g.addColorStop(1, `hsla(${(hue + 120) % 360}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (level >= 1) {
        // 增强金色光环
        const g = ctx.createRadialGradient(hand.x, hand.y, 5, hand.x, hand.y, glowSize);
        g.addColorStop(0, 'rgba(255, 255, 100, 0.9)');
        g.addColorStop(0.4, 'rgba(255, 215, 0, 0.4)');
        g.addColorStop(1, 'rgba(255, 200, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 普通光环
        const g = ctx.createRadialGradient(hand.x, hand.y, 5, hand.x, hand.y, 45);
        g.addColorStop(0, 'rgba(255, 255, 100, 0.7)');
        g.addColorStop(0.5, 'rgba(255, 200, 0, 0.3)');
        g.addColorStop(1, 'rgba(255, 200, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, 45, 0, Math.PI * 2);
        ctx.fill();
      }

      // 中心圆点
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 14, 0, Math.PI * 2);
      ctx.fill();

      // 星星 emoji（连击越高越大）
      const starSize = 30 + level * 6;
      ctx.font = `${starSize}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const emojis = ['⭐', '⭐', '🌟', '💫', '🔥'];
      ctx.fillText(emojis[Math.min(level, emojis.length - 1)], hand.x, hand.y);

      ctx.restore();
    };
    drawHand(this.leftHand);
    drawHand(this.rightHand);
  }

  getActivePositions() {
    const positions = [];
    if (this.leftHand.visible) positions.push(this.leftHand);
    if (this.rightHand.visible) positions.push(this.rightHand);
    return positions;
  }
}
