// game.js — 游戏主逻辑

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.handCursor = new HandCursor();
    this.balloons = [];
    this.score = 0;
    this.targetItem = null; // 当前目标 item
    this.state = 'waiting'; // waiting | playing | transition
    this.time = 0;
    this.confetti = [];
    this.balloonCount = 4;
    this.streak = 0;

    // 关卡
    this.level = null;
    this.levelItems = [];
    this.starsToWin = 20; // 得到20颗星通关

    // 自适应身高：追踪孩子的活动范围
    this.bodyZone = null; // { topY, bottomY, leftX, rightX } 屏幕坐标
    this._bodySmoothing = 0.05; // 平滑系数，慢慢跟随
    this._calibrated = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // 根据 MoveNet 关键点更新孩子的活动区域
  // keypoints 索引: 0=nose, 1=leftEye, 2=rightEye, 5=leftShoulder, 6=rightShoulder,
  //   9=leftWrist, 10=rightWrist, 11=leftHip, 12=rightHip
  updateBodyZone(keypoints, videoW, videoH) {
    if (!keypoints || keypoints.length < 13) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const minConf = 0.3;

    // 收集可信的关键点
    const nose = keypoints[0];
    const leftShoulder = keypoints[5];
    const rightShoulder = keypoints[6];
    const leftWrist = keypoints[9];
    const rightWrist = keypoints[10];

    // 至少需要鼻子或肩膀可见
    if ((!nose || nose.score < minConf) &&
        (!leftShoulder || leftShoulder.score < minConf) &&
        (!rightShoulder || rightShoulder.score < minConf)) return;

    // 映射到屏幕坐标（镜像翻转）
    const mapX = (kp) => (1 - kp.x / videoW) * w;
    const mapY = (kp) => (kp.y / videoH) * h;

    // 估算头顶（鼻子往上一段距离）
    let headTopY = h * 0.15; // 默认
    if (nose && nose.score >= minConf) {
      const noseY = mapY(nose);
      // 头顶大约在鼻子上方，头部高度约为肩宽的 0.7 倍
      let headHeight = h * 0.08;
      if (leftShoulder && rightShoulder &&
          leftShoulder.score >= minConf && rightShoulder.score >= minConf) {
        headHeight = Math.abs(mapX(leftShoulder) - mapX(rightShoulder)) * 0.7;
      }
      headTopY = noseY - headHeight;
    }

    // 估算手能举到的最高点：头顶再往上一个手臂长度（约肩宽 * 1.5）
    let armReach = h * 0.15;
    if (leftShoulder && rightShoulder &&
        leftShoulder.score >= minConf && rightShoulder.score >= minConf) {
      armReach = Math.abs(mapX(leftShoulder) - mapX(rightShoulder)) * 1.5;
    }
    const reachTopY = Math.max(30, headTopY - armReach * 0.3);

    // 左右范围：身体中心 ± 手臂伸展
    let centerX = w / 2;
    if (leftShoulder && rightShoulder &&
        leftShoulder.score >= minConf && rightShoulder.score >= minConf) {
      centerX = (mapX(leftShoulder) + mapX(rightShoulder)) / 2;
    } else if (nose && nose.score >= minConf) {
      centerX = mapX(nose);
    }
    const reachLeftX = Math.max(70, centerX - armReach * 1.5);
    const reachRightX = Math.min(w - 70, centerX + armReach * 1.5);

    // 底部范围：肩膀附近（不要太低，低了孩子反而不举手了）
    let shoulderY = h * 0.5;
    if (leftShoulder && leftShoulder.score >= minConf) {
      shoulderY = mapY(leftShoulder);
    } else if (rightShoulder && rightShoulder.score >= minConf) {
      shoulderY = mapY(rightShoulder);
    }
    const reachBottomY = shoulderY - armReach * 0.1; // 稍微高于肩膀

    const target = {
      topY: reachTopY,
      bottomY: reachBottomY,
      leftX: reachLeftX,
      rightX: reachRightX,
      centerX: centerX,
    };

    // 平滑更新
    if (!this.bodyZone) {
      this.bodyZone = target;
      this._calibrated = true;
    } else {
      const s = this._bodySmoothing;
      this.bodyZone.topY += (target.topY - this.bodyZone.topY) * s;
      this.bodyZone.bottomY += (target.bottomY - this.bodyZone.bottomY) * s;
      this.bodyZone.leftX += (target.leftX - this.bodyZone.leftX) * s;
      this.bodyZone.rightX += (target.rightX - this.bodyZone.rightX) * s;
      this.bodyZone.centerX += (target.centerX - this.bodyZone.centerX) * s;
    }

    // 重新定位气球到活动区域
    this._repositionBalloons();
  }

  _repositionBalloons() {
    if (!this.bodyZone) return;
    this.balloons.forEach(b => {
      if (b.popping) return;
      const pos = this._getCirclePosition(b.slot, this.balloonCount);
      // 缓慢移动到新位置
      b.homeX += (pos.x - b.homeX) * 0.03;
      b.homeY += (pos.y - b.homeY) * 0.03;
    });
  }

  // 半圆分布，自适应孩子活动区域
  _getCirclePosition(index, total) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    let centerX, centerY, radiusX, radiusY;

    if (this.bodyZone) {
      // 根据孩子身体位置动态计算
      centerX = this.bodyZone.centerX;
      centerY = this.bodyZone.bottomY;
      radiusX = (this.bodyZone.rightX - this.bodyZone.leftX) / 2;
      radiusY = (this.bodyZone.bottomY - this.bodyZone.topY) * 0.85;
    } else {
      // 默认位置
      centerX = w / 2;
      centerY = h * 0.45;
      radiusX = Math.min(w * 0.4, 450);
      radiusY = Math.min(h * 0.32, 280);
    }

    // 从左到右的浅弧
    const arcStart = Math.PI * 0.86;
    const arcEnd = Math.PI * 0.14;
    const arcRange = arcStart - arcEnd;
    const angle = arcStart - (arcRange / (total - 1)) * index;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY - Math.sin(angle) * radiusY;
    return { x, y };
  }

  // 找一个空的位置 slot
  _findEmptySlot() {
    const usedSlots = this.balloons.filter(b => !b.popping).map(b => b.slot);
    for (let i = 0; i < this.balloonCount; i++) {
      if (!usedSlots.includes(i)) return i;
    }
    return -1;
  }

  // 智能选 item（带生词/熟词配比）
  _pickNewItem() {
    const usedIds = this.balloons.filter(b => !b.popping).map(b => b.item.id);
    return SpacedRep.pickWeightedItem(this.levelKey, usedIds);
  }

  // 添加一个新气球
  _addBalloon(slot) {
    const pos = this._getCirclePosition(slot, this.balloonCount);
    const item = this._pickNewItem();
    const b = new Balloon(pos.x, pos.y, item, 65);
    b.slot = slot;
    b.fadeIn = 0;
    this.balloons.push(b);
    return b;
  }

  // 设置关卡并开始
  setLevel(levelKey) {
    this.level = LEVELS[levelKey];
    this.levelKey = levelKey;
    this.levelItems = this.level.items;
    this.score = 0;
    this.streak = 0;
    document.getElementById('score').textContent = '0';
    this.startRound();
  }

  // 初始化
  startRound() {
    this.balloons = [];
    for (let i = 0; i < this.balloonCount; i++) {
      this._addBalloon(i);
    }
    this.pickTarget();
  }

  // 选一个新目标（优先选生词/学习中的）
  pickTarget() {
    const aliveItems = this.balloons.filter(b => !b.popping).map(b => b.item);
    if (aliveItems.length === 0) return;

    this.targetItem = SpacedRep.pickTarget(this.levelKey, aliveItems);
    this.state = 'playing';

    const hint = document.getElementById('color-hint');
    hint.textContent = this.targetItem.label;
    hint.style.color = this.targetItem.color;
    hint.style.display = 'block';

    // 用关卡的 prompt 模板生成语音
    const promptText = this.level.prompt(this.targetItem);
    AudioManager.speakGeneric(promptText);
  }

  async update() {
    this.time++;

    const keypoints = await Camera.detect();
    if (keypoints) {
      const vs = Camera.getVideoSize();
      this.handCursor.update(keypoints, vs.width, vs.height, this.canvas.width, this.canvas.height);
      // 根据身体关键点自适应气球位置
      this.updateBodyZone(keypoints, vs.width, vs.height);
    }

    // 更新气球
    this.balloons.forEach(b => {
      b.update(this.time);
      // 淡入
      if (b.fadeIn !== undefined && b.fadeIn < 1) {
        b.fadeIn = Math.min(1, b.fadeIn + 0.02);
      }
    });
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
          if (balloon.popping) continue;
          if (balloon.fadeIn !== undefined && balloon.fadeIn < 0.8) continue;
          if (balloon.hitTest(hand.x, hand.y)) {
            if (balloon.item.id === this.targetItem.id) {
              this.onCorrect(balloon);
            } else {
              this.onWrong(balloon);
            }
            break;
          }
        }
      }
    }
  }

  onCorrect(balloon) {
    const slot = balloon.slot;
    balloon.pop();
    this.score++;
    document.getElementById('score').textContent = this.score;
    this.state = 'transition';

    AudioManager.playPop();
    setTimeout(() => AudioManager.playCheer(), 150);
    this.spawnConfetti(balloon.x, balloon.y);

    // 立即清掉旧单词
    document.getElementById('color-hint').textContent = '⭐';
    document.getElementById('color-hint').style.color = '#FFD700';

    // 记录学习数据
    SpacedRep.record(this.levelKey, balloon.item.id, true);
    Analytics.track('correct', { level: this.levelKey, item: balloon.item.id });

    // 立即说单词
    this.streak++;
    const word = this.level.correctSay(balloon.item);
    AudioManager.speakColor(word, () => {
      AudioManager.speakPraise(this.streak, () => {
        // 通关检查
        if (this.score >= this.starsToWin) {
          this.onLevelComplete();
          return;
        }
        this._addBalloon(slot);
        this.pickTarget();
      });
    });
  }

  onLevelComplete() {
    this.state = 'complete';
    // 大撒花
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.spawnConfetti(
          Math.random() * this.canvas.width,
          Math.random() * this.canvas.height * 0.5
        );
      }, i * 200);
    }

    document.getElementById('color-hint').textContent = '🎉 Great!';
    document.getElementById('color-hint').style.color = '#FFD700';

    AudioManager.speakGeneric('You did it! Amazing!');
    setTimeout(() => AudioManager.playCheer(), 500);

    // 3秒后自动进入下一关
    setTimeout(() => {
      startNextLevel();
    }, 3500);
  }

  onWrong(balloon) {
    if (balloon.shaking) return;
    balloon.shake();
    this.streak = 0;
    LearningTracker.record(this.levelKey, balloon.item.id, false);
    Analytics.track('wrong', { level: this.levelKey, item: balloon.item.id, target: this.targetItem.id });
    AudioManager.playWrong();
    const wrongText = this.level.wrongSay(balloon.item, this.targetItem);
    AudioManager.speakGeneric(wrongText);
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

  _drawCloud(ctx, x, y, size) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.2, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y + size * 0.15, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // === 童趣背景 ===
    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#E0F7FF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 草地
    const grassGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
    grassGrad.addColorStop(0, '#90D26D');
    grassGrad.addColorStop(1, '#6BBF4E');
    ctx.fillStyle = grassGrad;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    // 轻微波浪草地线
    for (let x = 0; x <= w; x += w / 8) {
      ctx.quadraticCurveTo(x + w / 16, h * 0.75 + Math.sin(x * 0.005 + this.time * 0.01) * 8, x + w / 8, h * 0.78);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 白云（用时间做缓慢飘动）
    this._drawCloud(ctx, ((this.time * 0.15) % (w + 200)) - 100, h * 0.12, 60);
    this._drawCloud(ctx, ((this.time * 0.1 + w * 0.5) % (w + 200)) - 100, h * 0.22, 45);
    this._drawCloud(ctx, ((this.time * 0.08 + w * 0.25) % (w + 200)) - 100, h * 0.08, 35);

    // === 合成人像（抠图后） ===
    const video = document.getElementById('pose-video');
    if (video.readyState >= 2) {
      const segOk = Camera.drawSegmented(ctx, w, h);
      if (!segOk) {
        // 分割模型还没就绪，fallback：画半透明视频
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // 气球（支持淡入）
    this.balloons.forEach(b => {
      if (b.fadeIn !== undefined && b.fadeIn < 1 && !b.popping) {
        ctx.globalAlpha = b.fadeIn;
      }
      b.draw(ctx, this.time);
      ctx.globalAlpha = 1;
    });

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

    // 手部高亮光标
    this.handCursor.draw(ctx);
  }
}
