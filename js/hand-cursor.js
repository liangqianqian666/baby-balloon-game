// hand-cursor.js — 手掌光标，跟随 MediaPipe Hands 重心

class HandCursor {
  constructor() {
    this.leftHand = { x: -100, y: -100, visible: false };
    this.rightHand = { x: -100, y: -100, visible: false };
    this.smoothing = 0.4;
  }

  // 从 MediaPipe Hands landmarks 更新位置
  // handsLandmarks: 数组，每个元素是 21 个 {x, y, z}（归一化 0~1）
  // canvasW/H: 画布尺寸
  update(handsLandmarks, canvasW, canvasH) {
    if (!handsLandmarks || handsLandmarks.length === 0) {
      this.leftHand.visible = false;
      this.rightHand.visible = false;
      return;
    }

    // 处理每只手（最多2只）
    const hands = [this.leftHand, this.rightHand];
    for (let i = 0; i < 2; i++) {
      const hand = hands[i];
      if (i < handsLandmarks.length) {
        const landmarks = handsLandmarks[i];
        // 计算 21 个 landmark 的重心
        let sumX = 0, sumY = 0;
        for (const lm of landmarks) {
          sumX += lm.x;
          sumY += lm.y;
        }
        // landmarks 是归一化坐标 (0~1)，镜像翻转 x
        const targetX = (1 - sumX / landmarks.length) * canvasW;
        const targetY = (sumY / landmarks.length) * canvasH;

        hand.x += (targetX - hand.x) * this.smoothing;
        hand.y += (targetY - hand.y) * this.smoothing;
        hand.visible = true;
      } else {
        hand.visible = false;
      }
    }
  }

  draw(ctx) {
    const drawHand = (hand) => {
      if (!hand.visible) return;
      ctx.save();

      // 外圈发光光环
      const gradient = ctx.createRadialGradient(hand.x, hand.y, 5, hand.x, hand.y, 45);
      gradient.addColorStop(0, 'rgba(255, 255, 100, 0.7)');
      gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 45, 0, Math.PI * 2);
      ctx.fill();

      // 中心圆点
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 14, 0, Math.PI * 2);
      ctx.fill();

      // 星星 emoji
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2b50', hand.x, hand.y);

      ctx.restore();
    };
    drawHand(this.leftHand);
    drawHand(this.rightHand);
  }

  getActivePositions() {
    const positions = [];
    if (this.leftHand.visible) positions.push(this.leftHand);
    if (this.rightHand.visible) positions.push(this.rightHand);
    return positions;
  }
}
