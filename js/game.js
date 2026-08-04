// game.js — 游戏主逻辑

// 显式游戏状态机：所有状态变更必须走 Game.setState（按转换表校验，非法转换拦截并告警）
const GameState = {
  IDLE: 'idle',             // 未开局 / 已回首页（update 暂停游戏逻辑）
  PLAYING: 'playing',       // 等待戳中目标
  TRANSITION: 'transition', // 答对反馈中（等语音回调链结束）
  COMPLETE: 'complete',     // 关卡通关
  TRANSITIONS: {
    idle: ['playing'],
    playing: ['transition', 'idle', 'playing'], // playing→playing: 中途换关/重开
    transition: ['playing', 'complete', 'idle'],
    complete: ['playing', 'idle'],
  },
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.handCursor = new HandCursor();
    this.balloons = [];
    this.score = 0;
    this.targetItem = null; // 当前目标 item
    this.state = GameState.IDLE; // 状态枚举见 GameState
    this.roundId = 0;         // 回合代际：切换关卡自增，用于拦截过期语音回调
    this._timers = new Set(); // 托管定时器：切关/回首页/销毁时统一清空
    this._speaking = false;   // 语音播报锁
    this.time = 0;
    this.confetti = [];
    this.balloonCount = CONFIG.balloonCount;
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

    // 星星瓶子（进度可视化）
    this.jarBubbles = [];     // 瓶中气泡

    // 关卡
    this.level = null;
    this.levelItems = [];
    this.starsToWin = CONFIG.starsToWin;

    // 自适应（已禁用跟随）
    this.resize();
    this._onResize = () => this.resize(); // 保存引用，destroy 时解绑
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // 状态机唯一入口：非法转换拦截并告警，不改变状态
  setState(next) {
    const allowed = GameState.TRANSITIONS[this.state] || [];
    if (!allowed.includes(next)) {
      console.warn(`[GameState] 非法转换已拦截: ${this.state} → ${next}`);
      return;
    }
    this.state = next;
    // 回首页：清空全部挂起定时器与语音，避免污染下一局
    if (next === GameState.IDLE) {
      this._clearTimers();
      AudioManager.stopSpeech();
      this._speaking = false;
    }
  }

  // 托管定时器：回合切换/销毁时统一清空，杜绝残留回调
  _setTimeout(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  _clearTimers() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers.clear();
  }

  // 显式销毁：页面退出时调用，释放监听/定时器/引用
  destroy() {
    this._clearTimers();
    AudioManager.stopSpeech();
    window.removeEventListener('resize', this._onResize);
    this.balloons.forEach(b => b.dispose());
    this.balloons = [];
    this.handCursor.trail = [];
    this.state = GameState.IDLE; // 拆除出口，不走转换表
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
    const b = new Balloon(pos.x, pos.y, item, CONFIG.balloonRadius);
    b.slot = slot;
    b.fadeIn = 0;
    this.balloons.push(b);
    return b;
  }

  // 设置关卡并开始
  setLevel(levelKey) {
    // 回合切换生命周期：清空挂起定时器/残留语音，推进回合代际使旧回调失效
    this._clearTimers();
    AudioManager.stopSpeech();
    this.roundId++;
    this._speaking = false;

    this.level = LEVELS[levelKey];
    this.levelKey = levelKey;
    this.levelItems = this.level.items;
    this.score = 0;
    this.streak = 0;
    this.starsToWin = CONFIG.starsToWin;
    this.jarBubbles = [];
    UI.setScore(0);
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
    this.setState(GameState.PLAYING);
    this.hintTimer = 0;
    this.hintLevel = 0;

    UI.showTarget(this.targetItem);

    // 用关卡的 prompt 模板生成语音
    const promptText = this.level.prompt(this.targetItem);
    AudioManager.speakGeneric(promptText);
  }

  async update() {
    // 首页/未开局：暂停全部游戏更新（画布隐藏时无意义消耗）
    if (this.state === GameState.IDLE) return;

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
    this.balloons = this.balloons.filter(b => {
      if (!b.alive) { b.dispose(); return false; } // 显式销毁：释放引用
      return true;
    });

    // 更新撒花
    this.confetti.forEach(c => {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += CONFIG.fx.confettiGravity;
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
    this.ripples.forEach(r => { r.radius += CONFIG.fx.rippleSpeed; r.life -= 0.02; });
    this.ripples = this.ripples.filter(r => r.life > 0);

    // 更新星星雨
    this.starRain.forEach(s => { s.y += s.vy; s.x += s.vx; s.vy += CONFIG.fx.starRainGravity; s.rotation += 0.05; s.life -= 0.008; });
    this.starRain = this.starRain.filter(s => s.life > 0);

    // 更新星星瓶子
    // 瓶中气泡
    this.jarBubbles.forEach(b => { b.y -= 0.3; b.life -= 0.01; b.x += Math.sin(this.time * 0.05 + b.offset) * 0.3; });
    this.jarBubbles = this.jarBubbles.filter(b => b.life > 0);

    // 找不到提示计时
    if (this.state === GameState.PLAYING) {
      this.hintTimer++;
      // ~4s → 轻提示：正确气球开始闪烁 + 中文提示
      if (this.hintTimer === CONFIG.hint.lightFrames && this.hintLevel < 1) {
        this.hintLevel = 1;
        this._showChineseHint();
      }
      // ~8s → 强提示：正确气球高亮箭头指向
      if (this.hintTimer === CONFIG.hint.strongFrames && this.hintLevel < 2) {
        this.hintLevel = 2;
        AudioManager.speakGeneric('Here!');
      }
    }

    // 碰撞检测（需要停留才触发）
    if (this.state === GameState.PLAYING) {
      const hands = this.handCursor.getActivePositions();
      for (const balloon of this.balloons) {
        if (balloon.popping) continue;
        if (balloon.fadeIn !== undefined && balloon.fadeIn < 0.8) continue;
        if (balloon.immunity > 0) continue;

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
    UI.setScore(this.score);
    this.setState(GameState.TRANSITION);

    // 更新星星瓶子
    this._addJarBubbles();

    AudioManager.playPop();
    this._setTimeout(() => AudioManager.playCheer(), 150);
    this.spawnConfetti(balloon.x, balloon.y);

    // 立即清掉旧单词
    UI.showStar();

    // 记录学习数据
    SpacedRep.record(this.levelKey, balloon.item.id, true);
    Analytics.track('correct', { level: this.levelKey, item: balloon.item.id });

    // 立即说单词
    this.streak++;
    this._triggerStreakEffects(balloon.x, balloon.y);
    this.handCursor.setStreakLevel(this.streak);
    const word = this.level.correctSay(balloon.item);
    const round = this.roundId; // 回合代际：回调触发时若已切关，整条链作废
    AudioManager.speakColor(word, () => {
      if (round !== this.roundId) return;
      AudioManager.speakPraise(this.streak, () => {
        if (round !== this.roundId) return;
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
    this.setState(GameState.COMPLETE);
    // 大撒花
    for (let i = 0; i < 5; i++) {
      this._setTimeout(() => {
        this.spawnConfetti(
          Math.random() * this.canvas.width,
          Math.random() * this.canvas.height * 0.5
        );
      }, i * 200);
    }

    UI.showComplete();

    AudioManager.speakGeneric('You did it! Amazing!');
    this._setTimeout(() => AudioManager.playCheer(), 500);

    // 延迟后回首页
    this._setTimeout(() => {
      startNextLevel();
    }, CONFIG.levelCompleteDelayMs);
  }

  onWrong(balloon) {
    if (balloon.shaking) return;
    if (this._speaking) return; // 语音播报中不触发

    balloon.shake();
    this.streak = 0;
    this.handCursor.downgrade(); // 答错降一级特效，不直接清零
    LearningTracker.record(this.levelKey, balloon.item.id, false);
    Analytics.track('wrong', { level: this.levelKey, item: balloon.item.id, target: this.targetItem.id });
    AudioManager.playWrong();
    this._speaking = true;
    const round = this.roundId;
    const wrongText = 'No! ' + this.level.wrongSay(balloon.item, this.targetItem);
    AudioManager.speakGeneric(wrongText, () => {
      if (round === this.roundId) this._speaking = false; // 过期回调不动新回合的锁
    });
  }

  spawnConfetti(x, y) {
    const colors = CONFIG.fx.colors;
    for (let i = 0; i < CONFIG.fx.confettiPerPop; i++) {
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

  // === 中文提示 ===

  _showChineseHint() {
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
      strawberry:'草莓', orange:'橙子', peach:'桃子', cherry:'樱桃',
      pear:'梨', pineapple:'菠萝', mango:'芒果', lemon:'柠檬',
      carrot:'胡萝卜', tomato:'番茄', potato:'土豆', corn:'玉米',
      broccoli:'西兰花', pea:'豌豆', onion:'洋葱', cucumber:'黄瓜',
      pumpkin:'南瓜', mushroom:'蘑菇',
      bread:'面包', egg:'鸡蛋', cake:'蛋糕', cookie:'饼干',
      cheese:'奶酪', pizza:'披萨', milk:'牛奶', juice:'果汁',
      cereal:'麦片', pancake:'薄饼', rice:'米饭', noodle:'面条',
      'ice cream':'冰淇淋', chocolate:'巧克力',
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
    UI.setHintHTML(`${this.targetItem.label}<br><span style="font-size:28px;color:#555">👆 Find the ${en}! 👆</span>`);
    if (cn) {
      AudioManager.speakGeneric(`${en}! It means ${cn}! Find the ${en}!`);
    } else {
      AudioManager.speakGeneric(`Find the ${en}!`);
    }
  }

  // === 连击语音鼓励（延迟说，不打断当前语音） ===

  _speakStreakCheer(text) {
    this._setTimeout(() => {
      AudioManager.speakGeneric(text);
    }, 1500);
  }

  // === 星星瓶子 ===

  _addJarBubbles() {
    // 答对时在瓶中冒几个气泡
    const jar = CONFIG.starJar;
    for (let i = 0; i < 3; i++) {
      this.jarBubbles.push({
        x: jar.x + 20 + Math.random() * 30,
        y: jar.topY + jar.h - 30 - Math.random() * 30,
        size: 2 + Math.random() * 4,
        life: 1,
        offset: Math.random() * Math.PI * 2,
      });
    }
  }

  // === 正向刺激特效 ===

  _triggerStreakEffects(x, y) {
    const combo = CONFIG.combo;
    // 每次答对：飞星到计分板
    this._spawnFlyingStar(x, y);

    // 每连对 bigFxEvery 个：大撒花 + 金色闪光 + 特效音
    if (this.streak >= combo.bigFxEvery && this.streak % combo.bigFxEvery === 0) {
      this.screenFlash = 0.4;
      this.screenFlashColor = '#FFD700';
      AudioManager.playStreakBonus();
      for (let i = 0; i < 3; i++) {
        this._setTimeout(() => {
          this.spawnConfetti(
            x + (Math.random() - 0.5) * 200,
            y + (Math.random() - 0.5) * 100
          );
        }, i * 100);
      }
    }

    // 每连对 rainbowEvery 个：彩虹波纹 + 星星雨
    if (this.streak >= combo.rainbowEvery && this.streak % combo.rainbowEvery === 0) {
      this._spawnRipples(x, y);
      this._spawnStarRain();
      this.screenFlash = 0.6;
      this.screenFlashColor = '#FF6BB5';
    }

    // 连击提示：纯语音+emoji，不显示中文文字
    if (this.streak >= combo.textStart) {
      const emojis = ['⭐', '🌟', '💫', '🔥', '🚀', '🏆'];
      const emojiIdx = Math.min(this.streak - combo.textStart, emojis.length - 1);
      this.comboText = `${emojis[emojiIdx]} ${this.streak}x ${emojis[emojiIdx]}`;
      this.comboTextTimer = 80;

      // 语音鼓励里程碑（集中在 CONFIG.combo.cheerAt）
      const cheer = combo.cheerAt[this.streak];
      if (cheer) this._speakStreakCheer(cheer);
    }
  }

  _spawnFlyingStar(x, y) {
    // 飞向左上角星星瓶子开口
    for (let i = 0; i < CONFIG.fx.flyingStarsPerPop; i++) {
      this.flyingStars.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        tx: CONFIG.starJar.mouthX, ty: CONFIG.starJar.mouthY, // 瓶口位置
        life: 1,
        scale: 1,
        size: 16 + Math.random() * 10,
      });
    }
  }

  _spawnRipples(x, y) {
    const colors = CONFIG.fx.colors;
    for (let i = 0; i < CONFIG.fx.ripplesPerCombo; i++) {
      this._setTimeout(() => {
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
    for (let i = 0; i < CONFIG.fx.starRainCount; i++) {
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

}
