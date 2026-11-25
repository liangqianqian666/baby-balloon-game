// camera.js — 摄像头 + MediaPipe Hands(手部追踪)

const Camera = {
  video: null,
  ready: false,

  // MediaPipe Hands (手部)
  hands: null,
  _latestHands: null,
  handsReady: false,
  _loopRunning: false, // hands 喂帧循环开关：stop() 时关闭

  async init() {
    this.video = document.getElementById('pose-video');

    // 打开摄像头
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;

    await new Promise(resolve => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });

    // 加载 MediaPipe Hands（手部追踪）
    console.log('Loading MediaPipe Hands...');
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    hands.onResults((results) => {
      this._latestHands = results.multiHandLandmarks || null;
    });
    this.hands = hands;
    this.handsReady = true;
    console.log('MediaPipe Hands ready!');

    this.ready = true;

    // 持续发送帧给 Hands
    this._loopRunning = true;
    this._handsLoop();
  },

  async _handsLoop() {
    if (!this._loopRunning || !this.handsReady || !this.hands) return;
    if (this.video.readyState >= 2) {
      try {
        await this.hands.send({ image: this.video });
      } catch (e) { /* 静默 */ }
    }
    requestAnimationFrame(() => this._handsLoop());
  },

  // 检测手部（MediaPipe Hands），返回 hands landmarks 数组
  detectHands() {
    if (!this.handsReady || !this._latestHands || this._latestHands.length === 0) return null;
    return this._latestHands;
  },

  getVideoSize() {
    return {
      width: this.video.videoWidth || 640,
      height: this.video.videoHeight || 480,
    };
  },

  // 显式停止：关闭喂帧循环、释放检测器、停摄像头流（页面退出时调用）
  stop() {
    this._loopRunning = false;
    this.handsReady = false;
    if (this.hands && this.hands.close) {
      try { this.hands.close(); } catch (e) {}
    }
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
    this.ready = false;
  },
};
