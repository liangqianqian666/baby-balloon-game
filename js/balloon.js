// balloon.js — 气球类

// 全局图片缓存
const _imageCache = {};
function preloadImage(src) {
  if (_imageCache[src]) return _imageCache[src];
  const img = new Image();
  img.src = src;
  _imageCache[src] = img;
  return img;
}
function preloadLevelImages(levelKey) {
  const level = LEVELS[levelKey];
  if (!level) return Promise.resolve();
  const promises = level.items
    .filter(item => {
      if (CONFIG.imageStyle === 'photo' && item.photo) return true;
      return item.display && item.display.startsWith('assets/');
    })
    .map(item => new Promise(resolve => {
      const src = (CONFIG.imageStyle === 'photo' && item.photo) ? item.photo : item.display;
      const img = preloadImage(src);
      if (img.complete) resolve();
      else { img.onload = resolve; img.onerror = resolve; }
    }));
  return Promise.all(promises);
}

class Balloon {
  constructor(x, y, item, radius) {
    this.homeX = x;
    this.homeY = y;
    this.x = x;
    this.y = y;
    this.item = item; // { id, label, color, lightColor, display }
    this.color = item.id; // 兼容旧逻辑
    this.radius = radius || 65;
    this.wobbleOffset = Math.random() * Math.PI * 2;
    this.wobbleSpeedX = 0.015 + Math.random() * 0.01;
    this.wobbleSpeedY = 0.02 + Math.random() * 0.015;
    this.wobbleAmountX = 8 + Math.random() * 8;
    this.wobbleAmountY = 6 + Math.random() * 6;
    this.alive = true;
    this.popping = false;
    this.popProgress = 0;
    this.shaking = false;
    this.shakeTime = 0;
    this.particles = [];
    this.breathOffset = Math.random() * Math.PI * 2;
    this.breathSpeed = 0.03 + Math.random() * 0.01;
    this.slot = 0;
    this.fadeIn = 0;
    this.immunity = 60;       // 新气球保护期：~1秒内不可被触碰
    this.dwellTime = 0;      // 手停留在气球上的帧数
    this.dwellThreshold = 12; // 需要停留约 200ms（~12帧@60fps）才算触碰

    // 预加载图片（根据图片风格选择）
    this._resolveDisplay();
  }

  _resolveDisplay() {
    this._img = null;
    this._useEmoji = false;
    this._loadFailed = false;

    if (CONFIG.imageStyle === 'photo' && this.item.photo) {
      // 实物照片模式
      const img = preloadImage(this.item.photo);
      img.onerror = () => { this._loadFailed = true; this._fallbackToEmoji(); };
      this._img = img;
    } else if (CONFIG.imageStyle === 'emoji' && this.item.emoji) {
      // Emoji 模式
      this._useEmoji = true;
    } else if (this.item.display && this.item.display.startsWith('assets/')) {
      // 手绘 SVG 模式（默认）
      this._img = preloadImage(this.item.display);
    }
  }

  // 图片加载失败时回退到 emoji
  _fallbackToEmoji() {
    this._img = null;
    if (this.item.emoji) {
      this._useEmoji = true;
    }
  }

  // 颜色现在由 item 对象提供，不再使用静态 COLORS

  update(time) {
    if (this.popping) {
      this.popProgress += 0.05;
      this.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3;
        p.life -= 0.03;
      });
      if (this.popProgress >= 1) this.alive = false;
      return;
    }

    if (this.shaking) {
      this.shakeTime++;
      if (this.shakeTime > 20) this.shaking = false;
    }

    if (this.immunity > 0) this.immunity--;

    // 原地轻轻跳动/晃动（不上飘）
    this.x = this.homeX + Math.sin(time * this.wobbleSpeedX + this.wobbleOffset) * this.wobbleAmountX;
    this.y = this.homeY + Math.sin(time * this.wobbleSpeedY + this.wobbleOffset * 1.3) * this.wobbleAmountY;
  }

  pop() {
    this.popping = true;
    this.popProgress = 0;
    const fillColor = this.item.color;
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i;
      this.particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(angle) * (3 + Math.random() * 4),
        vy: Math.sin(angle) * (3 + Math.random() * 4) - 2,
        size: 6 + Math.random() * 8,
        color: fillColor,
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

    // 呼吸缩放 + 手悬停放大
    const breathScale = 1 + Math.sin(time * this.breathSpeed + this.breathOffset) * 0.04;
    const dwellScale = this.dwellTime > 0 ? 1 + (this.dwellTime / this.dwellThreshold) * 0.15 : 1;
    const r = this.radius * breathScale * dwellScale;

    // 悬停光圈
    if (this.dwellTime > 0 && !this.shaking) {
      const progress = this.dwellTime / this.dwellThreshold;
      ctx.strokeStyle = `rgba(255, 215, 0, ${progress * 0.8})`;
      ctx.lineWidth = 4 + progress * 4;
      ctx.beginPath();
      ctx.arc(drawX, this.y, r * 1.15 + 6, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    }

    if (this._useEmoji) {
      // === Emoji 实物模式 ===
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(drawX, this.y, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `${r * 1.6}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.item.emoji, drawX, this.y);
    } else if (!this.item.display) {
      // === 颜色模式：画气球 ===
      const fillColor = this.item.color;
      const lightColor = this.item.lightColor;
      const grad = ctx.createRadialGradient(
        drawX - r * 0.3, this.y - r * 0.3, r * 0.1,
        drawX, this.y, r
      );
      grad.addColorStop(0, lightColor);
      grad.addColorStop(1, fillColor);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(drawX, this.y, r, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(drawX - r * 0.25, this.y - r * 0.35, r * 0.2, r * 0.3, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // 气球底部尖角
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(drawX - 8, this.y + r * 1.1);
      ctx.lineTo(drawX, this.y + r * 1.3);
      ctx.lineTo(drawX + 8, this.y + r * 1.1);
      ctx.fill();

      // 挂线
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(drawX, this.y + r * 1.3);
      const lineWobble = Math.sin(time * 0.03 + this.wobbleOffset) * 5;
      ctx.quadraticCurveTo(drawX + lineWobble, this.y + r * 1.8, drawX, this.y + r * 2.2);
      ctx.stroke();
    } else if (this._img && this._img.complete && this._img.naturalWidth > 0) {
      // === 图片模式：画白色圆底 + 图片 ===
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(drawX, this.y, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const imgSize = r * 2;
      ctx.drawImage(this._img, drawX - imgSize / 2, this.y - imgSize / 2, imgSize, imgSize);
    } else if (this._img && !this._img.complete) {
      // === 图片还在加载中，画占位圆 ===
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(drawX, this.y, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (this._img && this._img.complete && this._img.naturalWidth === 0) {
      // === 图片加载失败，回退到 emoji ===
      this._fallbackToEmoji();
      // 画 emoji 或 label
      if (this._useEmoji) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(drawX, this.y, r * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${r * 1.6}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.item.emoji, drawX, this.y);
      } else {
        ctx.font = `bold ${r * 0.6}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.item.color || '#333';
        ctx.fillText(this.item.label, drawX, this.y);
      }
    } else if (this.item.display && !this.item.display.startsWith('assets/')) {
      // === 文本模式（数字等） ===
      ctx.font = `${r * 1.6}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 白色阴影让 emoji 在摄像头背景上清晰可见
      ctx.shadowColor = 'rgba(255,255,255,0.95)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(this.item.display, drawX, this.y);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  hitTest(px, py) {
    if (this.popping) return false;
    const dx = px - this.x;
    const dy = py - this.y;
    return (dx * dx + dy * dy) < (this.radius * this.radius * 2.5);
  }
}
