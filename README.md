# baby-balloon-game

Pop the Balloon! — 幼儿英语学习体感游戏

## 运行方式

需要本地 HTTP 服务器（摄像头权限要求 HTTPS 或 localhost）：

```bash
# 方式一：Python
cd baby-balloon-game
python3 -m http.server 8080

# 方式二：Node.js
npx serve .
```

然后浏览器打开 http://localhost:8080

## 玩法

1. 点击 START
2. 允许摄像头权限
3. 站在摄像头前，举手去戳对应颜色的气球
4. 语音会告诉你要戳哪个颜色！
