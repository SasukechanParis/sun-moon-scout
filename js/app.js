// UIの結線。地図/フォームの操作を状態に反映し、太陽・月の情報を再計算して描画する。

const state = {
  camera: { lat: PARIS_DEFAULT.lat, lng: PARIS_DEFAULT.lng },
  target: null,
  mode: "camera", // "camera" | "target"
  manualBearing: 0,
};

const map = initMap("map");
const layers = new SceneLayers(map);
layers.setCameraMarker(state.camera);

function formatTime(date) {
  if (!date || isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// <input type="date"> / <input type="time"> はローカル時刻の文字列を要求するため、
// toISOString()（UTC基準）は使わずローカルの年月日時分から組み立てる。
function toLocalDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDeg(deg) {
  return `${Math.round(deg * 10) / 10}°`;
}

function currentTargetBearing() {
  if (state.target) return bearingBetween(state.camera, state.target);
  return state.manualBearing;
}

function getSelectedDateTime() {
  const dateStr = document.getElementById("input-date").value;
  const timeStr = document.getElementById("input-time").value;
  return new Date(`${dateStr}T${timeStr}`);
}

function syncTimeSliderFromInput() {
  const [h, m] = document.getElementById("input-time").value.split(":").map(Number);
  const minutes = h * 60 + m;
  document.getElementById("input-time-slider").value = minutes;
  document.getElementById("time-slider-label").textContent =
    document.getElementById("input-time").value;
}

function syncTimeInputFromSlider() {
  const minutes = Number(document.getElementById("input-time-slider").value);
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  document.getElementById("input-time").value = `${h}:${m}`;
  document.getElementById("time-slider-label").textContent = `${h}:${m}`;
}

function renderLowMoonWindows(date) {
  const list = document.getElementById("low-moon-windows");
  const windows = findLowMoonWindows(date, state.camera.lat, state.camera.lng);
  list.innerHTML = "";
  if (windows.length === 0) {
    list.innerHTML = "<li>この日は低い時間帯なし（一日中それより高い/沈んでいる）</li>";
    return;
  }
  for (const w of windows) {
    const li = document.createElement("li");
    li.textContent = `${formatTime(w.start)} 〜 ${formatTime(w.end)}`;
    list.appendChild(li);
  }
}

function updateAll() {
  const dt = getSelectedDateTime();
  if (isNaN(dt.getTime())) return;

  layers.setCameraMarker(state.camera);
  if (state.target) {
    layers.setTargetMarker(state.target);
    layers.drawTargetLine(state.camera, state.target);
  }

  const sun = getSunInfo(dt, state.camera.lat, state.camera.lng);
  const moon = getMoonInfo(dt, state.camera.lat, state.camera.lng);

  document.getElementById("sun-azimuth").textContent = `${formatDeg(sun.azimuth)} (${bearingToLabel(sun.azimuth)})`;
  document.getElementById("sun-altitude").textContent = formatDeg(sun.altitude);
  document.getElementById("sun-sunrise").textContent = formatTime(sun.times.sunrise);
  document.getElementById("sun-sunset").textContent = formatTime(sun.times.sunset);
  document.getElementById("sun-dawn").textContent = formatTime(sun.times.dawn);
  document.getElementById("sun-dusk").textContent = formatTime(sun.times.dusk);

  document.getElementById("moon-azimuth").textContent = `${formatDeg(moon.azimuth)} (${bearingToLabel(moon.azimuth)})`;
  document.getElementById("moon-altitude").textContent = formatDeg(moon.altitude);
  document.getElementById("moon-phase").textContent = moonPhaseLabel(moon.phase);
  document.getElementById("moon-fraction").textContent = `${Math.round(moon.fraction * 100)}%`;
  document.getElementById("moon-rise").textContent = formatTime(moon.moonTimes.rise);
  document.getElementById("moon-set").textContent = formatTime(moon.moonTimes.set);

  layers.drawBody("sun", state.camera, sun.azimuth, sun.altitude);
  layers.drawBody("moon", state.camera, moon.azimuth, moon.altitude);

  const bearing = currentTargetBearing();
  const primaryBody = sun.altitude > 0 ? sun : moon;
  const verdict = classifyLight(bearing, primaryBody.azimuth, primaryBody.altitude);
  const verdictEl = document.getElementById("light-verdict");
  verdictEl.className = `verdict ${verdict.label}`;
  const bodyLabel = sun.altitude > 0 ? "太陽" : "月";
  verdictEl.textContent = `${verdict.label}（${bodyLabel}基準・撮影方向との角度差 ${Math.round(verdict.diff)}°）`;

  renderLowMoonWindows(dt);
}

// --- ピン設置モード ---
document.getElementById("btn-mode-camera").addEventListener("click", () => {
  state.mode = "camera";
  document.getElementById("btn-mode-camera").classList.add("active");
  document.getElementById("btn-mode-target").classList.remove("active");
});
document.getElementById("btn-mode-target").addEventListener("click", () => {
  state.mode = "target";
  document.getElementById("btn-mode-target").classList.add("active");
  document.getElementById("btn-mode-camera").classList.remove("active");
});
document.getElementById("btn-clear-target").addEventListener("click", () => {
  state.target = null;
  layers.clearTargetMarker();
  if (layers.targetLine) { map.removeLayer(layers.targetLine); layers.targetLine = null; }
  updateAll();
});

map.on("click", (e) => {
  if (state.mode === "camera") {
    state.camera = { lat: e.latlng.lat, lng: e.latlng.lng };
  } else {
    state.target = { lat: e.latlng.lat, lng: e.latlng.lng };
  }
  updateAll();
});

// --- 現在地 ---
document.getElementById("btn-geolocate").addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("この端末では現在地を取得できません");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.camera = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setView([state.camera.lat, state.camera.lng], 16);
      updateAll();
    },
    () => alert("現在地を取得できませんでした。設定で位置情報を許可してください。")
  );
});

// --- 座標貼り付け ---
document.getElementById("btn-apply-coord").addEventListener("click", () => {
  const text = document.getElementById("input-coord").value;
  const parsed = parseCoordinateInput(text);
  if (!parsed) {
    alert("座標を読み取れませんでした。「48.8606, 2.3376」やGoogleマップの@座標つきURLで試してください。");
    return;
  }
  state.camera = parsed;
  map.setView([parsed.lat, parsed.lng], 16);
  updateAll();
});

// --- 手動方位 ---
const manualSlider = document.getElementById("input-manual-bearing");
manualSlider.addEventListener("input", () => {
  state.manualBearing = Number(manualSlider.value);
  document.getElementById("manual-bearing-label").textContent =
    `${bearingToLabel(state.manualBearing)} (${state.manualBearing}°)`;
  updateAll();
});

// --- 日時 ---
document.getElementById("input-date").addEventListener("change", updateAll);
document.getElementById("input-time").addEventListener("change", () => {
  syncTimeSliderFromInput();
  updateAll();
});
document.getElementById("input-time-slider").addEventListener("input", () => {
  syncTimeInputFromSlider();
  updateAll();
});

// --- 逆算検索 ---
const ALTITUDE_PRESETS = {
  any: [null, null],
  low: [0, 15],
  golden: [0, 6],
  high: [45, null],
};

document.getElementById("btn-reverse-search").addEventListener("click", () => {
  const body = document.getElementById("select-body").value;
  const preset = document.getElementById("select-altitude-preset").value;
  const [altitudeMin, altitudeMax] = ALTITUDE_PRESETS[preset];
  const days = Number(document.getElementById("input-search-days").value) || 60;
  const targetAzimuth = currentTargetBearing();
  const fromDate = getSelectedDateTime();

  const results = reverseSearch({
    lat: state.camera.lat,
    lng: state.camera.lng,
    body,
    targetAzimuth,
    azimuthTolerance: 3,
    altitudeMin,
    altitudeMax,
    fromDate: isNaN(fromDate.getTime()) ? new Date() : fromDate,
    days,
  });

  const list = document.getElementById("reverse-results");
  list.innerHTML = "";
  if (results.length === 0) {
    list.innerHTML = "<li>条件に合う日時が見つかりませんでした。期間や高度条件を広げてみてください。</li>";
    return;
  }
  for (const r of results) {
    const li = document.createElement("li");
    const dateLabel = r.date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
    li.textContent = `${dateLabel} ${formatTime(r.date)}　方位${formatDeg(r.azimuth)}／高度${formatDeg(r.altitude)}`;
    li.addEventListener("click", () => {
      document.getElementById("input-date").value = toLocalDateInputValue(r.date);
      document.getElementById("input-time").value = toLocalTimeInputValue(r.date);
      syncTimeSliderFromInput();
      updateAll();
      document.getElementById("results-panel").scrollIntoView({ behavior: "smooth" });
    });
    list.appendChild(li);
  }
});

// --- 初期化 ---
function initDefaults() {
  const now = new Date();
  document.getElementById("input-date").value = toLocalDateInputValue(now);
  document.getElementById("input-time").value = toLocalTimeInputValue(now);
  syncTimeSliderFromInput();
}

initDefaults();
updateAll();
