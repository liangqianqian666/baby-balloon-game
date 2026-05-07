// audio.js — 语音播报 + 音效

const AudioManager = {
  _preferredVoice: null,
  _voiceReady: false,

  // 初始化：选一个好听的英文女声
  init() {
    const findVoice = () => {
      const voices = speechSynthesis.getVoices();
      // 优先选 Samantha(Mac)、Google UK Female、Karen 等清晰女声
      const preferred = [
        'Samantha', 'Karen', 'Victoria', 'Moira',
        'Google UK English Female', 'Google US English',
        'Microsoft Zira', 'Fiona'
      ];
      for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name));
        if (v) { this._preferredVoice = v; break; }
      }
      // 兜底：任意英文女声
      if (!this._preferredVoice) {
        this._preferredVoice = voices.find(v => v.lang.startsWith('en')) || null;
      }
      this._voiceReady = true;
    };
    // Chrome 异步加载 voices
    if (speechSynthesis.getVoices().length) {
      findVoice();
    } else {
      speechSynthesis.onvoiceschanged = findVoice;
    }
  },

  speak(text, onEnd) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;   // 慢速
    utterance.pitch = 1.3;  // 稍高，可爱
    utterance.volume = 1;
    if (this._preferredVoice) utterance.voice = this._preferredVoice;
    if (onEnd) utterance.onend = onEnd;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  },

  // ---- 合成音效（更可爱的版本）----

  _ctx: null,
  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  },

  // 气球爆炸：短促清脆的 "啵" 声
  playPop() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;

    // 噪声 burst（模拟气球破裂）
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // 高通滤波让它更清脆
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.08);

    // 加一个短促高音 "叮"
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
    oscGain.gain.setValueAtTime(0.2, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  },

  // 答对欢呼：可爱的上升琶音 + 闪亮音
  playCheer() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;
    // 上升琶音 C E G C（八度）用正弦波，柔和
    const notes = [784, 988, 1175, 1568]; // G5 B5 D6 G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      const start = t + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.25);
    });

    // 结尾闪亮 shimmer
    const shimmer = ctx.createOscillator();
    const sGain = ctx.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.value = 2093; // C7
    shimmer.connect(sGain);
    sGain.connect(ctx.destination);
    const sStart = t + 0.35;
    sGain.gain.setValueAtTime(0.15, sStart);
    sGain.gain.exponentialRampToValueAtTime(0.01, sStart + 0.4);
    shimmer.start(sStart);
    shimmer.stop(sStart + 0.4);
  },

  // 答错：轻柔的两声 "嘟嘟"
  playWrong() {
    const ctx = this._getCtx();
    const t = ctx.currentTime;
    [0, 0.2].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 0 ? 440 : 370; // A4 → F#4 下降
      gain.gain.setValueAtTime(0.15, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.15);
      osc.start(t + delay);
      osc.stop(t + delay + 0.15);
    });
  }
};
