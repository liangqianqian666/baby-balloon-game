// balloon.js — 气球类

class Balloon {
  constructor(x, y, color, radius) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = radius || 60;
    this.speed = 0.5 + Math.random() * 0.5; // 上飘速度
    this.wobbleOffset = Math.random() * Math.PI * 2; // 晃动相位
    this.wobbleSpeed = 0.02 + Math.random() * 0.01;
    this.wobbleAmount = 15 + Math.random() * 10;
    this.alive = true;
    this.popping = false;
    this.popProgress = 0; // 0~1 爆炸动画进度
    this.shaking = false;
    this.shakeTime = 0;
    this.particles = []; // 爆炸碎片
  }

  // 颜色配置
  static COLORS = {
    red:    { fill: '#FF4444', light: '#FF8888', name: 'RED' },
    blue:   { fill: '#4488FF', light: '#88BBFF', name: 'BLUE' },
    yellow: { fill: '#FFD700', light: '#FFED88', name: 'YELLOW' },
    green:  { fill: '#44CC44', light: '#88EE88', name: 'GREEN' },
  };

  update(time) {
    if (this.popping) {
      this.popProgress += 0.05;
      // 更新碎片
      this.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // 重力
        p.life -= 0.03;
      });
      if (this.popProgress >= 1) this.alive = false;
      return;
    }

    if (this.shaking) {
      this.shakeTime++;
      if (this.shakeTime > 20) this.shaking = false;
    }

    // 上飘
    this.y -= this.speed;
    // 左右晃动
    this.x += Math.sin(time * this.wobbleSpeed + this.wobbleOffset) * 0.5;

    // 飘出屏幕顶部
    if (this.y < -this.radius * 2) this.alive = false;
  }

  pop() {
    this.popping = true;
    this.popProgress = 0;
    const colorInfo = Balloon.COLORS[this.color];
    // 生成碎片
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i;
      this.particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(angle) * (3 + Math.random() * 4),
        vy: Math.sin(angle) * (3 + Math.random() * 4) - 2,
        size: 6 + Math.random() * 8,
        color: colorInfo.fill,
        life: 1,
      });
    }
  }

  shake() {
    this.shaking = true;
    this.shakeTime = 0;
  }

  draw(ctx, time) {
    if (this.popping) {
      // 画爆炸碎片
      this.particles.forEach(p => {
        if (p.life <= 0) return;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      return;
    }

    ctx.save();
    let drawX = this.x;
    if (this.shaking) {
      drawX += Math.sin(this.shakeTime * 1.5) * 5;
    }

    // 气球身体（径向渐变）
    const colorInfo = Balloon.COLORS[this.color];
    const grad = ctx.createRadialGradient(
      drawX - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.1,
      drawX, this.y, this.radius
    );
    grad.addColorStop(0, colorInfo.light);
    grad.addColorStop(1, colorInfo.fill);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(drawX, this.y, this.radius, this.radius * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(drawX - this.radius * 0.25, this.y - this.radius * 0.35, this.radius * 0.2, this.radius * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 气球底部尖角
    ctx.fillStyle = colorInfo.fill;
    ctx.beginPath();
    ctx.moveTo(drawX - 8, this.y + this.radius * 1.1);
    ctx.lineTo(drawX, this.y + this.radius * 1.3);
    ctx.lineTo(drawX + 8, this.y + this.radius * 1.1);
    ctx.fill();

    // 挂线
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(drawX, this.y + this.radius * 1.3);
    const lineWobble = Math.sin(time * 0.03 + this.wobbleOffset) * 5;
    ctx.quadraticCurveTo(drawX + lineWobble, this.y + this.radius * 1.8, drawX, this.y + this.radius * 2.2);
    ctx.stroke();

    ctx.restore();
  }

  // 碰撞检测：点是否在气球内
  hitTest(px, py) {
    if (this.popping) return false;
    const dx = px - this.x;
    const dy = py - this.y;
    return (dx * dx + dy * dy) < (this.radius * this.radius * 1.3);
  }
}
