// audio.js — 语音播报 + 音效

const AudioManager = {
  _cache: {},       // 缓存已加载的 Audio 对象
  _ttsReady: false, // 后备 TTS
  _preferredVoice: null,

  init() {
    // 预加载所有语音文件
    const files = [
      'pop-red', 'pop-blue', 'pop-yellow', 'pop-green', 'pop-purple', 'pop-orange', 'pop-pink',
      'praise-1', 'praise-2', 'praise-3', 'praise-4', 'praise-5',
      'thats-red', 'thats-blue', 'thats-yellow', 'thats-green', 'thats-purple', 'thats-orange', 'thats-pink',
      'find-red', 'find-blue', 'find-yellow', 'find-green', 'find-purple', 'find-orange', 'find-pink',
    ];
    files.forEach(name => {
      const audio = new Audio(`assets/voices/${name}.mp3`);
      audio.preload = 'auto';
      this._cache[name] = audio;
    });

    // 后备：初始化 Web Speech API
    const findVoice = () => {
      const voices = speechSynthesis.getVoices();
      const preferred = ['Samantha', 'Karen', 'Google UK English Female', 'Google US English'];
      for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name));
        if (v) { this._preferredVoice = v; break; }
      }
      if (!this._preferredVoice) {
        this._preferredVoice = voices.find(v => v.lang.startsWith('en')) || null;
      }
      this._ttsReady = true;
    };
    if (speechSynthesis.getVoices().length) findVoice();
    else speechSynthesis.onvoiceschanged = findVoice;
  },

  // 播放预录音频
  _play(name, onEnd) {
    const audio = this._cache[name];
    if (audio) {
      const clone = audio.cloneNode(); // 允许重叠播放
      if (onEnd) clone.onended = onEnd;
      clone.play().catch(() => {});
      return true;
    }
    return false;
  },

  // 后备 TTS
  _speakTTS(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.65;
    u.pitch = 1.4;
    if (this._preferredVoice) u.voice = this._preferredVoice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },

  // --- 游戏语音接口 ---

  // 通用语音朗读（用于关卡指令和错误提示）
  speakGeneric(text, onDone) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.7;
    u.pitch = 1.4;
    if (this._preferredVoice) u.voice = this._preferredVoice;
    if (onDone) u.onend = onDone;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },

  // "Pop the [color] balloon!" (保留兼容)
  speakPopCommand(color) {
    if (!this._play(`pop-${color}`)) {
      this._speakTTS(`Pop the ${color} balloon!`);
    }
  },

  // 答对：只说颜色名（立即）
  speakColor(color, onDone) {
    // 用 TTS 快速说一个单词，比加载 mp3 更即时
    const u = new SpeechSynthesisUtterance(color);
    u.lang = 'en-US';
    u.rate = 0.7;
    u.pitch = 1.4;
    if (this._preferredVoice) u.voice = this._preferredVoice;
    if (onDone) u.onend = onDone;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },

  // 表扬（根据连击等级递进）
  speakPraise(streak, onDone) {
    // 根据 streak 选不同等级的表扬语
    let text;
    if (streak <= 1) {
      const words = ['Good!', 'Yes!', 'Nice!'];
      text = words[Math.floor(Math.random() * words.length)];
    } else if (streak <= 3) {
      const words = ['Great job!', 'Well done!', 'Awesome!'];
      text = words[Math.floor(Math.random() * words.length)];
    } else if (streak <= 5) {
      const words = ['Amazing!', 'Fantastic!', 'Brilliant!'];
      text = words[Math.floor(Math.random() * words.length)];
    } else {
      const words = ['Incredible!', 'Superstar!', 'You are on fire!', 'Unstoppable!'];
      text = words[Math.floor(Math.random() * words.length)];
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = streak > 5 ? 0.9 : 0.75; // 高连击语速更快更兴奋
    u.pitch = Math.min(1.8, 1.3 + streak * 0.05); // 连击越多音调越高
    if (this._preferredVoice) u.voice = this._preferredVoice;
    if (onDone) u.onend = onDone;
    speechSynthesis.speak(u);
  },

  // 答对（保留兼容）
  speakCorrect(color, onDone) {
    this.speakColor(color, () => {
      this.speakPraise(onDone);
    });
  },

  // 答错："That's [wrong color]. Can you find the [target] one?"
  speakWrong(wrongColor, targetColor) {
    this._play(`thats-${wrongColor}`, () => {
      setTimeout(() => {
        this._play(`find-${targetColor}`);
      }, 300);
    });
  },

  // --- 合成音效 ---

  _ctx: null,
  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  },

  playPop() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.08);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
    oscGain.gain.setValueAtTime(0.15, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  },

  playCheer() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;
    const notes = [784, 988, 1175, 1568];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      const start = t + i * 0.1;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  },

  playWrong() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;
    [0, 0.25].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 0 ? 440 : 370;
      gain.gain.setValueAtTime(0.12, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.18);
      osc.start(t + delay);
      osc.stop(t + delay + 0.18);
    });
  },

  // 连击特效音（上行琶音，比 cheer 更华丽）
  playStreakBonus() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319, 1568]; // C5-E5-G5-C6-E6-G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      const start = t + i * 0.07;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.4);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }
