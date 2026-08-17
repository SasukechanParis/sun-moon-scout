// 座標・方位計算まわりのユーティリティ（外部ライブラリ非依存）

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// "48.8606, 2.3376" / Google Maps の "@48.8606,2.3376,17z" / OSM の "#map=17/48.8606/2.3376"
// のいずれからでも緯度経度を取り出す。右クリックでコピーした座標をそのまま貼れることを優先する。
function parseCoordinateInput(text) {
  if (!text) return null;
  const trimmed = text.trim();

  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  const osmMatch = trimmed.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
  if (osmMatch) {
    return { lat: parseFloat(osmMatch[1]), lng: parseFloat(osmMatch[2]) };
  }

  const plainMatch = trimmed.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
  if (plainMatch) {
    const lat = parseFloat(plainMatch[1]);
    const lng = parseFloat(plainMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

// 始点から方位角(度、北=0、時計回り)・距離(m)だけ進んだ地点を求める（球面三角法の順解）
function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return { lat: toDeg(φ2), lng: toDeg(λ2) };
}

// 2点間の初期方位角（度、北=0、時計回り）
function bearingBetween(from, to) {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

const COMPASS_16 = [
  "北", "北北東", "北東", "東北東",
  "東", "東南東", "南東", "南南東",
  "南", "南南西", "南西", "西南西",
  "西", "西北西", "北西", "北北西",
];

function bearingToLabel(deg) {
  const idx = Math.round(normalizeDeg(deg) / 22.5) % 16;
  return COMPASS_16[idx];
}
