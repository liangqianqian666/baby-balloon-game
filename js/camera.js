// camera.js — 摄像头 + MoveNet 骨骼检测 + 人像分割

const Camera = {
  video: null,
  detector: null,
  ready: false,

  // 人像分割
  segmenter: null,
  segMask: null,        // 最新的分割 mask（ImageData 或 ImageBitmap）
  _segCanvas: null,     // 离屏 canvas 用于合成
  _segCtx: null,
  segReady: false,

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

    // 加载 MoveNet Lightning 模型
    console.log('Loading MoveNet...');
    const model = poseDetection.SupportedModels.MoveNet;
    this.detector = await poseDetection.createDetector(model, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    });
    console.log('MoveNet ready!');
    this.ready = true;

    // 加载人像分割模型
    this._initSegmentation();
  },

  async _initSegmentation() {
    try {
      console.log('Loading Selfie Segmentation...');
      this._segCanvas = document.createElement('canvas');
      this._segCtx = this._segCanvas.getContext('2d');

      const seg = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`,
      });
      seg.setOptions({ modelSelection: 1 }); // 1 = landscape (faster)
      seg.onResults((results) => {
        this.segMask = results.segmentationMask;
      });
      this.segmenter = seg;
      this.segReady = true;
      console.log('Selfie Segmentation ready!');

      // 持续发送帧给分割模型
      this._segLoop();
    } catch (e) {
      console.warn('Selfie Segmentation failed to load:', e.message);
    }
  },

  async _segLoop() {
    if (!this.segReady || !this.segmenter) return;
    if (this.video.readyState >= 2) {
      try {
        await this.segmenter.send({ image: this.video });
      } catch (e) { /* 静默 */ }
    }
    // 约 15fps 分割，不需要太快
    setTimeout(() => this._segLoop(), 66);
  },

  // 将人像合成到目标 canvas 上（带童趣背景）
  drawSegmented(targetCtx, canvasW, canvasH) {
    const video = this.video;
    if (!video || video.readyState < 2) return false;
    if (!this.segMask) return false;

    const offCanvas = this._segCanvas;
    offCanvas.width = canvasW;
    offCanvas.height = canvasH;
    const offCtx = this._segCtx;

    // 先在离屏 canvas 上画视频帧（镜像）
    offCtx.save();
    offCtx.translate(canvasW, 0);
    offCtx.scale(-1, 1);
    offCtx.drawImage(video, 0, 0, canvasW, canvasH);
    offCtx.restore();

    // 用 mask 做遮罩：只保留人像区域
    offCtx.save();
    offCtx.globalCompositeOperation = 'destination-in';
    // mask 也要镜像
    offCtx.translate(canvasW, 0);
    offCtx.scale(-1, 1);
    offCtx.drawImage(this.segMask, 0, 0, canvasW, canvasH);
    offCtx.restore();

    // 将抠出的人像绘制到目标 canvas
    targetCtx.drawImage(offCanvas, 0, 0);
    return true;
  },

  // 检测一帧姿态，返回 keypoints
  async detect() {
    if (!this.ready || !this.detector) return null;
    try {
      const poses = await this.detector.estimatePoses(this.video);
      if (poses.length > 0) return poses[0].keypoints;
    } catch (e) {
      // 静默忽略
    }
    return null;
  },

  getVideoSize() {
    return {
      width: this.video.videoWidth || 640,
      height: this.video.videoHeight || 480,
    };
  }
};
