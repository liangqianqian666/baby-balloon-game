// camera.js — 摄像头 + MoveNet 骨骼检测

const Camera = {
  video: null,
  detector: null,
  ready: false,

  async init() {
    this.video = document.getElementById('pose-video');
    const cameraPreview = document.getElementById('camera-video');

    // 打开摄像头
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    // 不再显示小窗，摄像头画面通过 Canvas 全屏绘制
    // cameraPreview.srcObject = stream;

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
