// hand-cursor.js — 手掌光标，跟随手腕坐标

class HandCursor {
  constructor() {
    this.leftHand = { x: -100, y: -100, visible: false };
    this.rightHand = { x: -100, y: -100, visible: false };
    this.smoothing = 0.4; // 平滑系数，越小越平滑
    this.trail = []; // 轨迹拖尾
  }

  // 从 MoveNet 关键点更新位置
  // keypoints: MoveNet 17 个关键点
  // videoW/H: 视频尺寸, canvasW/H: 画布尺寸
  update(keypoints, videoW, videoH, canvasW, canvasH) {
    if (!keypoints || keypoints.length < 17) return;

    // MoveNet 关键点索引: 9=left_wrist, 10=right_wrist
    const leftWrist = keypoints[9];
    const rightWrist = keypoints[10];

    const minConfidence = 0.3;

    // 左手（摄像头镜像，所以 MoveNet 的 left 对应屏幕的 right 方向，需要翻转）
    if (leftWrist && leftWrist.score > minConfidence) {
      // 镜像翻转 x 坐标
      const targetX = (1 - leftWrist.x / videoW) * canvasW;
      const targetY = (leftWrist.y / videoH) * canvasH;
      this.leftHand.x += (targetX - this.leftHand.x) * this.smoothing;
      this.leftHand.y += (targetY - this.leftHand.y) * this.smoothing;
      this.leftHand.visible = true;
    } else {
      this.leftHand.visible = false;
    }

    // 右手
    if (rightWrist && rightWrist.score > minConfidence) {
      const targetX = (1 - rightWrist.x / videoW) * canvasW;
      const targetY = (rightWrist.y / videoH) * canvasH;
      this.rightHand.x += (targetX - this.rightHand.x) * this.smoothing;
      this.rightHand.y += (targetY - this.rightHand.y) * this.smoothing;
      this.rightHand.visible = true;
    } else {
      this.rightHand.visible = false;
    }
  }

  draw(ctx) {
    const drawHand = (hand) => {
      if (!hand.visible) return;
      ctx.save();
      ctx.font = '50px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 光晕
      ctx.shadowColor = 'rgba(255, 200, 0, 0.5)';
      ctx.shadowBlur = 20;
      ctx.fillText('👋', hand.x, hand.y);
      ctx.restore();
    };
    drawHand(this.leftHand);
    drawHand(this.rightHand);
  }

  // 返回所有可见手的位置
  getActivePositions() {
    const positions = [];
    if (this.leftHand.visible) positions.push(this.leftHand);
    if (this.rightHand.visible) positions.push(this.rightHand);
    return positions;
  }
}
