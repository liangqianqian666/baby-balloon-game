// camera.js — 摄像头 + MoveNet(身体追踪) + MediaPipe Hands(手部追踪)

const Camera = {
  video: null,
  ready: false,

  // MoveNet (身体姿态)
  detector: null,
  poseReady: false,

  // MediaPipe Hands (手部)
  hands: null,
  _latestHands: null,
  handsReady: false,

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

    // 加载 MoveNet Lightning（身体姿态追踪）
    console.log('Loading MoveNet...');
    const model = poseDetection.SupportedModels.MoveNet;
    this.detector = await poseDetection.createDetector(model, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    });
    console.log('MoveNet ready!');
    this.poseReady = true;

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
    this._handsLoop();
  },

  async _handsLoop() {
    if (!this.handsReady || !this.hands) return;
    if (this.video.readyState >= 2) {
      try {
        await this.hands.send({ image: this.video });
      } catch (e) { /* 静默 */ }
    }
    requestAnimationFrame(() => this._handsLoop());
  },

  // 检测身体姿态（MoveNet），返回 17 个 keypoints
  async detectPose() {
    if (!this.poseReady || !this.detector) return null;
    try {
      const poses = await this.detector.estimatePoses(this.video);
      if (poses.length > 0) return poses[0].keypoints;
    } catch (e) {
      // 静默忽略
    }
    return null;
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
  }
};
