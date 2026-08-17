// カメラ映像に太陽・月の方向を重ねるAR表示。
// 実機のコンパス(磁気センサー)精度に依存するため、方位ズレ補正スライダーで手動較正できるようにしてある。
// iPhone Safari 実機での検証が前提（Simulator/PCブラウザには本物の磁気センサーが無いため未検証）。

const arState = {
  active: false,
  stream: null,
  rafId: null,
  headingOffset: 0,
  fov: 60,
  lastHeading: null,
  lastPitch: null,
};

function normalizeSignedDeg(deg) {
  return (((deg + 180) % 360) + 360) % 360 - 180;
}

function onDeviceOrientation(e) {
  if (typeof e.webkitCompassHeading === "number") {
    // iOS Safari: 北=0、時計回り、磁北基準
    arState.lastHeading = e.webkitCompassHeading;
  } else if (typeof e.alpha === "number") {
    // その他ブラウザ向けの近似値（機種によりズレるため補正スライダー前提）
    arState.lastHeading = normalizeDeg(360 - e.alpha);
  }
  if (typeof e.beta === "number") {
    // 端末を縦に構えた状態(通常の撮影姿勢)を0とみなす近似
    arState.lastPitch = e.beta - 90;
  }
}

async function startAR() {
  const overlay = document.getElementById("ar-overlay");
  const statusEl = document.getElementById("ar-status");
  overlay.style.display = "block";
  statusEl.textContent = "起動中…";
  document.getElementById("ar-date").value = document.getElementById("input-date").value;

  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== "granted") {
        statusEl.textContent = "方位センサーの許可が必要です。設定 > Safari > モーションと方向 を確認してください。";
        return;
      }
    } catch (e) {
      statusEl.textContent = "方位センサーの許可取得に失敗しました。";
      return;
    }
  }

  try {
    arState.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (e) {
    statusEl.textContent = "カメラを使用できませんでした。設定でカメラへのアクセスを許可してください。";
    return;
  }

  const video = document.getElementById("ar-video");
  video.srcObject = arState.stream;
  try {
    await video.play();
  } catch (e) {
    // 自動再生がブロックされても overlay 上の操作で再開されることが多いため致命扱いにしない
  }

  window.addEventListener("deviceorientation", onDeviceOrientation);
  arState.active = true;
  arState.rafId = requestAnimationFrame(drawARFrame);
}

function stopAR() {
  arState.active = false;
  if (arState.rafId) cancelAnimationFrame(arState.rafId);
  window.removeEventListener("deviceorientation", onDeviceOrientation);
  if (arState.stream) {
    arState.stream.getTracks().forEach((track) => track.stop());
    arState.stream = null;
  }
  document.getElementById("ar-overlay").style.display = "none";
}

function drawARFrame() {
  if (!arState.active) return;
  const canvas = document.getElementById("ar-canvas");
  const video = document.getElementById("ar-video");
  const statusEl = document.getElementById("ar-status");

  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  if (!canvas.width || !canvas.height) {
    arState.rafId = requestAnimationFrame(drawARFrame);
    return;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (arState.lastHeading === null) {
    statusEl.textContent = "方位を取得中…端末を8の字に動かすとコンパスが安定します";
    arState.rafId = requestAnimationFrame(drawARFrame);
    return;
  }

  const heading = normalizeDeg(arState.lastHeading + arState.headingOffset);
  const pitch = arState.lastPitch || 0;
  const fov = arState.fov;
  const vfov = fov * (canvas.height / canvas.width);

  const dt = getSelectedDateTime();
  const sun = getSunInfo(dt, state.camera.lat, state.camera.lng);
  const moon = getMoonInfo(dt, state.camera.lat, state.camera.lng);

  drawARPath(ctx, canvas, heading, pitch, fov, vfov, state.dayPaths.sun, "#f5a623");
  drawARPath(ctx, canvas, heading, pitch, fov, vfov, state.dayPaths.moon, "#8ea3c4");

  drawARBody(ctx, canvas, heading, pitch, fov, vfov, sun.azimuth, sun.altitude, "☀️", "#f5a623");
  drawARBody(ctx, canvas, heading, pitch, fov, vfov, moon.azimuth, moon.altitude, "🌙", "#8ea3c4");

  statusEl.textContent =
    `方位${Math.round(heading)}° 太陽:方位${Math.round(sun.azimuth)}°/高度${Math.round(sun.altitude)}° ` +
    `月:方位${Math.round(moon.azimuth)}°/高度${Math.round(moon.altitude)}°`;

  arState.rafId = requestAnimationFrame(drawARFrame);
}

function drawARBody(ctx, canvas, heading, pitch, fov, vfov, bodyAz, bodyAlt, emoji, color) {
  if (bodyAlt < -5) return;

  const diffAz = normalizeSignedDeg(bodyAz - heading);
  const diffAlt = bodyAlt - pitch;
  const onScreen = Math.abs(diffAz) <= fov / 2 && Math.abs(diffAlt) <= vfov / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (onScreen) {
    const x = canvas.width * (0.5 + diffAz / fov);
    const y = canvas.height * (0.5 - diffAlt / vfov);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "30px sans-serif";
    ctx.fillText(emoji, x, y);
  } else {
    // 画面外にある場合は端にどちら向きに回せばよいかを矢印で示す
    const y = Math.min(Math.max(canvas.height / 2 - diffAlt * 4, 30), canvas.height - 30);
    const x = diffAz > 0 ? canvas.width - 28 : 28;
    ctx.font = "26px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(diffAz > 0 ? "▶" : "◀", x, y);
    ctx.font = "18px sans-serif";
    ctx.fillText(emoji, x, y - 28);
  }
}

// その日1日分の軌道(points)をカメラ映像上に線として描く（Lumos風の「移動線」）。
// 画面内に収まる点だけを結び、毎正時には少し大きい点を打つ。
function drawARPath(ctx, canvas, heading, pitch, fov, vfov, points, color) {
  if (!points || points.length < 2) return;

  const projected = points.map((p) => {
    const diffAz = normalizeSignedDeg(p.azimuth - heading);
    const diffAlt = p.altitude - pitch;
    const onScreen = Math.abs(diffAz) <= fov / 2 && Math.abs(diffAlt) <= vfov / 2;
    return {
      x: canvas.width * (0.5 + diffAz / fov),
      y: canvas.height * (0.5 - diffAlt / vfov),
      onScreen,
      isHour: p.time.getMinutes() === 0,
    };
  });

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  for (let i = 0; i < projected.length - 1; i++) {
    const a = projected[i];
    const b = projected[i + 1];
    if (!a.onScreen || !b.onScreen) continue;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  for (const p of projected) {
    if (!p.onScreen || !p.isHour) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

document.getElementById("btn-open-ar").addEventListener("click", startAR);
document.getElementById("btn-close-ar").addEventListener("click", stopAR);

const headingOffsetSlider = document.getElementById("ar-heading-offset");
headingOffsetSlider.addEventListener("input", () => {
  arState.headingOffset = Number(headingOffsetSlider.value);
  document.getElementById("ar-heading-offset-label").textContent = `${arState.headingOffset}°`;
});

const fovSlider = document.getElementById("ar-fov");
fovSlider.addEventListener("input", () => {
  arState.fov = Number(fovSlider.value);
  document.getElementById("ar-fov-label").textContent = `${arState.fov}°`;
});

// ARを開いたまま日付だけ動かせるように、メイン側の日付入力とここを相互に同期する
document.getElementById("ar-date").addEventListener("change", (e) => {
  document.getElementById("input-date").value = e.target.value;
  updateAll();
});
document.querySelectorAll("[data-ar-shift-days]").forEach((btn) => {
  btn.addEventListener("click", () => {
    shiftSelectedDate(Number(btn.dataset.arShiftDays));
    document.getElementById("ar-date").value = document.getElementById("input-date").value;
  });
});
