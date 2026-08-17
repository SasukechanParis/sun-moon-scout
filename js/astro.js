// 太陽・月の位置計算（SunCalcのラッパー）と、光の向き判定・逆算検索

// SunCalcの azimuth は「南=0、西方向がプラス」のラジアン。
// コンパス方位（北=0、時計回り、度）に変換する。
function azimuthRadToCompassDeg(azimuthRad) {
  return normalizeDeg(toDeg(azimuthRad) + 180);
}

function getSunInfo(date, lat, lng) {
  const pos = SunCalc.getPosition(date, lat, lng);
  const times = SunCalc.getTimes(date, lat, lng);
  return {
    azimuth: azimuthRadToCompassDeg(pos.azimuth),
    altitude: toDeg(pos.altitude),
    times,
  };
}

function getMoonInfo(date, lat, lng) {
  const pos = SunCalc.getMoonPosition(date, lat, lng);
  const illum = SunCalc.getMoonIllumination(date);
  const moonTimes = SunCalc.getMoonTimes(date, lat, lng);
  return {
    azimuth: azimuthRadToCompassDeg(pos.azimuth),
    altitude: toDeg(pos.altitude),
    fraction: illum.fraction,
    phase: illum.phase,
    moonTimes,
  };
}

const MOON_PHASE_LABELS = [
  { max: 0.033, label: "新月" },
  { max: 0.22, label: "三日月" },
  { max: 0.28, label: "上弦前" },
  { max: 0.35, label: "上弦" },
  { max: 0.47, label: "十三夜" },
  { max: 0.53, label: "満月" },
  { max: 0.72, label: "十六夜" },
  { max: 0.78, label: "下弦" },
  { max: 0.97, label: "有明月" },
  { max: 1.01, label: "新月" },
];

function moonPhaseLabel(phase) {
  for (const entry of MOON_PHASE_LABELS) {
    if (phase <= entry.max) return entry.label;
  }
  return "";
}

// カメラが向く方位(cameraBearing)と天体の方位(bodyAzimuth)・高度(altitude)から
// 順光/逆光/サイド光/トップライトを判定する。高度が高いときは真上からの光を優先する。
const TOP_LIGHT_ALTITUDE_DEG = 60;

function classifyLight(cameraBearing, bodyAzimuth, altitude) {
  let diff = Math.abs(normalizeDeg(cameraBearing - bodyAzimuth));
  if (diff > 180) diff = 360 - diff;

  if (altitude >= TOP_LIGHT_ALTITUDE_DEG) {
    return { label: "トップライト", diff, note: `高度${Math.round(altitude)}°と高いため真上寄りの光` };
  }
  if (diff <= 45) {
    return { label: "逆光", diff, note: "天体が被写体の向こう側" };
  }
  if (diff >= 135) {
    return { label: "順光", diff, note: "天体が撮影者の背中側" };
  }
  return { label: "サイド光", diff, note: "斜めから当たる" };
}

// 指定期間を刻み時間でスキャンし、方位(±許容誤差)と高度範囲に合致する日時を探す逆算検索。
// body: "sun" | "moon"
function reverseSearch({ lat, lng, body, targetAzimuth, azimuthTolerance = 3, altitudeMin = null, altitudeMax = null, fromDate, days = 60, stepMinutes = 5 }) {
  const matches = [];
  const stepMs = stepMinutes * 60 * 1000;
  const totalSteps = Math.floor((days * 24 * 60) / stepMinutes);
  let cursor = new Date(fromDate);
  let prevDiff = null;

  for (let i = 0; i <= totalSteps; i++) {
    const info = body === "moon" ? getMoonInfo(cursor, lat, lng) : getSunInfo(cursor, lat, lng);
    let diff = normalizeDeg(info.azimuth - targetAzimuth);
    if (diff > 180) diff -= 360;

    const altitudeOk =
      (altitudeMin === null || info.altitude >= altitudeMin) &&
      (altitudeMax === null || info.altitude <= altitudeMax);

    // 符号が反転した = ちょうど目標方位をまたいだ瞬間
    const crossed = prevDiff !== null && Math.sign(prevDiff) !== Math.sign(diff) && Math.abs(prevDiff - diff) < 180;

    if (altitudeOk && (Math.abs(diff) <= azimuthTolerance || crossed)) {
      const last = matches[matches.length - 1];
      const isNewCluster = !last || cursor - last.date > 60 * 60 * 1000;
      if (isNewCluster) {
        matches.push({ date: new Date(cursor), azimuth: info.azimuth, altitude: info.altitude });
      }
    }

    prevDiff = diff;
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return matches;
}

// その日1日分の太陽/月の軌道を刻み幅でサンプリングする（地図・ARの「移動線」表示に使う）。
// 地平線より十分下(-5°未満)の点は間引く。
function getBodyPathForDay(date, lat, lng, getInfo, stepMinutes = 15) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const points = [];

  for (let m = 0; m <= 24 * 60; m += stepMinutes) {
    const t = new Date(dayStart.getTime() + m * 60 * 1000);
    const info = getInfo(t, lat, lng);
    if (info.altitude >= -5) {
      points.push({ time: t, azimuth: info.azimuth, altitude: info.altitude });
    }
  }
  return points;
}

function getSunPathForDay(date, lat, lng, stepMinutes = 15) {
  return getBodyPathForDay(date, lat, lng, getSunInfo, stepMinutes);
}

function getMoonPathForDay(date, lat, lng, stepMinutes = 15) {
  return getBodyPathForDay(date, lat, lng, getMoonInfo, stepMinutes);
}

// その日1日を刻み幅でスキャンし、月が地平線付近(altitudeMin〜altitudeMax)にいる連続した時間帯を返す
function findLowMoonWindows(date, lat, lng, altitudeMin = 0, altitudeMax = 20, stepMinutes = 10) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const windows = [];
  let current = null;

  for (let m = 0; m <= 24 * 60; m += stepMinutes) {
    const t = new Date(dayStart.getTime() + m * 60 * 1000);
    const info = getMoonInfo(t, lat, lng);
    const inWindow = info.altitude >= altitudeMin && info.altitude <= altitudeMax;

    if (inWindow && !current) {
      current = { start: t, end: t };
    } else if (inWindow && current) {
      current.end = t;
    } else if (!inWindow && current) {
      windows.push(current);
      current = null;
    }
  }
  if (current) windows.push(current);
  return windows;
}
