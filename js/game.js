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

    // 正向刺激特效
    this.flyingStars = [];    // 飞向计分板的星星
    this.screenFlash = 0;     // 屏幕闪光 (0~1)
    this.screenFlashColor = '#FFD700';
    this.comboText = '';      // 连击文字
    this.comboTextTimer = 0;
    this.ripples = [];        // 彩虹波纹
    this.starRain = [];       // 星星雨
    this.hintTimer = 0;       // 找不到计时器
    this.hintLevel = 0;       // 提示等级 0=无 1=轻提示 2=强提示
    this.celebEmojis = [];    // 答对后飘出的大表情

    // 关卡
    this.level = null;
    this.levelItems = [];
    this.starsToWin = CONFIG.starsToWin;

    // 自适应（已禁用跟随）
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // 固定四个位置：左、左上、右上、右
  _getCirclePosition(index, total) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const positions = [
      { x: w * 0.12, y: h * 0.45 },  // 左
      { x: w * 0.37, y: h * 0.22 },  // 左上
      { x: w * 0.63, y: h * 0.22 },  // 右上
      { x: w * 0.88, y: h * 0.45 },  // 右
    ];
    return positions[index % positions.length];
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
    this.starsToWin = CONFIG.starsToWin; // 每次开局刷新
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
    this.hintTimer = 0;
    this.hintLevel = 0;

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

    // MediaPipe Hands → 手部光标
    const handsLandmarks = Camera.detectHands();
    if (handsLandmarks) {
      this.handCursor.update(handsLandmarks, this.canvas.width, this.canvas.height);
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

    // 更新飞行星星
    this.flyingStars.forEach(s => {
      s.x += (s.tx - s.x) * 0.08;
      s.y += (s.ty - s.y) * 0.08;
      s.life -= 0.015;
      s.scale = 0.5 + Math.sin(s.life * Math.PI) * 0.5;
    });
    this.flyingStars = this.flyingStars.filter(s => s.life > 0);

    // 更新屏幕闪光
    if (this.screenFlash > 0) this.screenFlash *= 0.92;

    // 更新连击文字
    if (this.comboTextTimer > 0) this.comboTextTimer--;

    // 更新彩虹波纹
    this.ripples.forEach(r => { r.radius += 6; r.life -= 0.02; });
    this.ripples = this.ripples.filter(r => r.life > 0);

    // 更新星星雨
    this.starRain.forEach(s => { s.y += s.vy; s.x += s.vx; s.vy += 0.08; s.rotation += 0.05; s.life -= 0.008; });
    this.starRain = this.starRain.filter(s => s.life > 0);

    // 更新庆祝表情
    this.celebEmojis.forEach(e => { e.y -= 1.5; e.life -= 0.015; e.scale += 0.005; });
    this.celebEmojis = this.celebEmojis.filter(e => e.life > 0);

    // 找不到提示计时
    if (this.state === 'playing') {
      this.hintTimer++;
      // 4秒（~240帧）→ 轻提示：正确气球开始闪烁 + 中文提示
      if (this.hintTimer === 240 && this.hintLevel < 1) {
        this.hintLevel = 1;
        this._showChineseHint();
      }
      // 8秒（~480帧）→ 强提示：正确气球高亮箭头指向
      if (this.hintTimer === 480 && this.hintLevel < 2) {
        this.hintLevel = 2;
        AudioManager.speakGeneric('Here!');
      }
    }

    // 碰撞检测（需要停留才触发）
    if (this.state === 'playing') {
      const hands = this.handCursor.getActivePositions();
      for (const balloon of this.balloons) {
        if (balloon.popping) continue;
        if (balloon.fadeIn !== undefined && balloon.fadeIn < 0.8) continue;

        let touching = false;
        for (const hand of hands) {
          if (balloon.hitTest(hand.x, hand.y)) {
            touching = true;
            break;
          }
        }

        if (touching) {
          balloon.dwellTime++;
          if (balloon.dwellTime >= balloon.dwellThreshold) {
            if (balloon.item.id === this.targetItem.id) {
              this.onCorrect(balloon);
            } else {
              this.onWrong(balloon);
            }
            balloon.dwellTime = 0;
            break;
          }
        } else {
          balloon.dwellTime = 0;
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
    this._spawnCelebEmoji(balloon.x, balloon.y);

    // 立即清掉旧单词
    document.getElementById('color-hint').textContent = '⭐';
    document.getElementById('color-hint').style.color = '#FFD700';

    // 记录学习数据
    SpacedRep.record(this.levelKey, balloon.item.id, true);
    Analytics.track('correct', { level: this.levelKey, item: balloon.item.id });

    // 立即说单词
    this.streak++;
    this._triggerStreakEffects(balloon.x, balloon.y);
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
    if (this._speaking) return; // 语音播报中不触发

    balloon.shake();
    this.streak = 0;
    LearningTracker.record(this.levelKey, balloon.item.id, false);
    Analytics.track('wrong', { level: this.levelKey, item: balloon.item.id, target: this.targetItem.id });
    AudioManager.playWrong();
    this._speaking = true;
    const wrongText = 'No! ' + this.level.wrongSay(balloon.item, this.targetItem);
    AudioManager.speakGeneric(wrongText, () => { this._speaking = false; });
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

  // === 中文提示 ===

  _showChineseHint() {
    const hint = document.getElementById('color-hint');
    const cnMap = {
      red:'红色', blue:'蓝色', yellow:'黄色', green:'绿色', purple:'紫色',
      orange:'橙色', pink:'粉色', white:'白色', black:'黑色', brown:'棕色',
      one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7',
      eight:'8', nine:'9', ten:'10', eleven:'11', twelve:'12',
      thirteen:'13', fourteen:'14', fifteen:'15', sixteen:'16',
      seventeen:'17', eighteen:'18', nineteen:'19', twenty:'20',
      circle:'圆形', square:'正方形', triangle:'三角形', star:'星形',
      heart:'心形', diamond:'菱形', rectangle:'长方形', oval:'椭圆',
      apple:'苹果', banana:'香蕉', grape:'葡萄', watermelon:'西瓜',
      strawberry:'草莓', orange_fruit:'橙子', peach:'桃子', cherry:'樱桃',
      cat:'猫', dog:'狗', rabbit:'兔子', bear:'熊', elephant:'大象',
      lion:'狮子', monkey:'猴子', bird:'鸟', fish:'鱼', panda:'熊猫',
      tiger:'老虎', giraffe:'长颈鹿',
      head:'头', eyes:'眼睛', nose:'鼻子', mouth:'嘴巴', ears:'耳朵',
      hands:'手', feet:'脚', arms:'胳膊', legs:'腿', tummy:'肚子',
      car:'汽车', bus:'公共汽车', train:'火车', airplane:'飞机', boat:'船',
      bicycle:'自行车', helicopter:'直升机', rocket:'火箭',
      sun:'太阳', moon:'月亮', cloud:'云', rain:'雨', snow:'雪', wind:'风',
      rainbow:'彩虹', thunder:'雷',
      happy:'开心', sad:'伤心', angry:'生气', surprised:'惊讶',
      scared:'害怕', sleepy:'困了', silly:'傻傻的', love:'爱',
    };
    const en = this.targetItem.id;
    const cn = cnMap[en];
    if (cn) {
      hint.innerHTML = `${this.targetItem.label}<br><span style="font-size:28px;color:#555">小朋友，${en} 就是${cn}哦！找找看 👆</span>`;
      AudioManager.speakGeneric(`${en}! Find the ${en}!`);
    } else {
      hint.innerHTML = `${this.targetItem.label}<br><span style="font-size:28px;color:#555">找这个！👆</span>`;
      AudioManager.speakGeneric(`Find the ${en}!`);
    }
  }

  // === 庆祝表情 ===

  _spawnCelebEmoji(x, y) {
    const emojis = ['🎉', '👏', '🥳', '💪', '🤩', '😍', '🙌', '💖', '🎊', '👍'];
    for (let i = 0; i < 3; i++) {
      this.celebEmojis.push({
        x: x + (Math.random() - 0.5) * 120,
        y: y + (Math.random() - 0.5) * 60,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        life: 1,
        scale: 1 + Math.random() * 0.5,
        size: 36 + Math.random() * 24,
      });
    }
  }

  // === 连击语音鼓励（延迟说，不打断当前语音） ===

  _speakStreakCheer(text) {
    setTimeout(() => {
      AudioManager.speakGeneric(text);
    }, 1500);
  }

  // === 正向刺激特效 ===

  _triggerStreakEffects(x, y) {
    // 每次答对：飞星到计分板
    this._spawnFlyingStar(x, y);

    // 连对3个：大撒花 + 金色闪光 + combo文字
    if (this.streak >= 3 && this.streak % 3 === 0) {
      this.screenFlash = 0.4;
      this.screenFlashColor = '#FFD700';
      AudioManager.playStreakBonus();
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          this.spawnConfetti(
            x + (Math.random() - 0.5) * 200,
            y + (Math.random() - 0.5) * 100
          );
        }, i * 100);
      }
    }

    // 连对5个：彩虹波纹 + 星星雨
    if (this.streak >= 5 && this.streak % 5 === 0) {
      this._spawnRipples(x, y);
      this._spawnStarRain();
      this.screenFlash = 0.6;
      this.screenFlashColor = '#FF6BB5';
    }

    // 连击提示文字
    if (this.streak >= 2) {
      const streakMessages = {
        2: ['连对2个啦！👏', '厉害！2个了！', '真棒！继续！'],
        3: ['哇！连对3个了！🎉', '3连击！太厉害了！', '宝宝好聪明！3个了！'],
        4: ['4个了！停不下来！🔥', '天哪！4连击！', '太牛了！4个了！'],
        5: ['5连击！超级厉害！🌟', '哇哦！5个了！无敌！', '5连击！宝宝是天才！'],
      };
      const defaultMsgs = ['太强了！停不下来！🚀', '无人能挡！继续冲！💫', '宝宝无敌了！🏆'];
      const msgs = streakMessages[this.streak] || defaultMsgs;
      this.comboText = msgs[Math.floor(Math.random() * msgs.length)];
      this.comboTextTimer = 80; // ~1.3秒

      // 语音鼓励（中文穿插英文）
      if (this.streak === 3) {
        this._speakStreakCheer('Wow! Three in a row!');
      } else if (this.streak === 5) {
        this._speakStreakCheer('Five in a row! You are a superstar!');
      } else if (this.streak === 7) {
        this._speakStreakCheer('Seven! Incredible! Can you keep going?');
      } else if (this.streak === 10) {
        this._speakStreakCheer('Ten in a row! You are amazing!');
      }
    }
  }

  _spawnFlyingStar(x, y) {
    // 飞向左上角计分板
    for (let i = 0; i < 3; i++) {
      this.flyingStars.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        tx: 60, ty: 40, // 计分板位置
        life: 1,
        scale: 1,
        size: 16 + Math.random() * 10,
      });
    }
  }

  _spawnRipples(x, y) {
    const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6BB5', '#C9B1FF'];
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.ripples.push({
          x, y,
          radius: 10,
          life: 1,
          color: colors[i % colors.length],
          lineWidth: 4 + i * 2,
        });
      }, i * 80);
    }
  }

  _spawnStarRain() {
    const w = this.canvas.width;
    for (let i = 0; i < 20; i++) {
      this.starRain.push({
        x: Math.random() * w,
        y: -20 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 2,
        size: 12 + Math.random() * 16,
        rotation: Math.random() * Math.PI * 2,
        life: 1,
        emoji: ['⭐', '🌟', '✨', '💫'][Math.floor(Math.random() * 4)],
      });
    }
  }

  _drawEffects(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 屏幕闪光
    if (this.screenFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.screenFlash;
      ctx.fillStyle = this.screenFlashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 彩虹波纹
    this.ripples.forEach(r => {
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
    this.flyingStars.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.font = `${s.size * s.scale}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⭐', s.x, s.y);
      ctx.restore();
    });

    // 星星雨
    this.starRain.forEach(s => {
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
    if (this.comboTextTimer > 0) {
      ctx.save();
      const alpha = Math.min(1, this.comboTextTimer / 20);
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
      ctx.fillText(this.comboText, 0, 0);
      ctx.restore();
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // === 背景渲染（根据 CONFIG.backgroundMode） ===
    const bgMode = CONFIG.backgroundMode;
    const video = document.getElementById('pose-video');

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
        ctx.quadraticCurveTo(x + w / 16, h * 0.75 + Math.sin(x * 0.005 + this.time * 0.01) * 8, x + w / 8, h * 0.78);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      this._drawCloud(ctx, ((this.time * 0.15) % (w + 200)) - 100, h * 0.12, 60);
      this._drawCloud(ctx, ((this.time * 0.1 + w * 0.5) % (w + 200)) - 100, h * 0.22, 45);
      this._drawCloud(ctx, ((this.time * 0.08 + w * 0.25) % (w + 200)) - 100, h * 0.08, 35);

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

    // 气球（支持淡入 + 提示闪烁）
    this.balloons.forEach(b => {
      if (b.fadeIn !== undefined && b.fadeIn < 1 && !b.popping) {
        ctx.globalAlpha = b.fadeIn;
      }
      b.draw(ctx, this.time);
      ctx.globalAlpha = 1;

      // 提示高亮：正确气球闪烁光圈
      if (this.hintLevel >= 1 && this.targetItem && b.item.id === this.targetItem.id && !b.popping) {
        ctx.save();
        const pulse = Math.sin(this.time * 0.1) * 0.3 + 0.5;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = this.hintLevel >= 2 ? 8 : 4;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = this.hintLevel >= 2 ? 25 : 12;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 1.3, 0, Math.PI * 2);
        ctx.stroke();

        // 强提示：画箭头指向
        if (this.hintLevel >= 2) {
          ctx.globalAlpha = pulse;
          ctx.font = '48px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('👇', b.x, b.y - b.radius * 1.5);
        }
        ctx.restore();
      }
    });

    // 庆祝表情
    this.celebEmojis.forEach(e => {
      ctx.save();
      ctx.globalAlpha = e.life;
      ctx.font = `${e.size * e.scale}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.emoji, e.x, e.y);
      ctx.restore();
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

    // 正向刺激特效
    this._drawEffects(ctx);

    // 手部高亮光标
    this.handCursor.draw(ctx);
  }
}
