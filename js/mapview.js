// Leaflet地図の初期化・ピン設置・方位線の描画

const PARIS_DEFAULT = { lat: 48.8606, lng: 2.3376 };
const BEARING_LINE_LENGTH_M = 300;

function initMap(containerId) {
  // ページをスクロールしているときに地図上でホイールが暴発してズームしないようにする
  const map = L.map(containerId, { scrollWheelZoom: false }).setView(
    [PARIS_DEFAULT.lat, PARIS_DEFAULT.lng],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  return map;
}

function makeIcon(emoji, className) {
  return L.divIcon({
    className: `emoji-marker ${className}`,
    html: `<span>${emoji}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const ICON_CAMERA = makeIcon("📷", "icon-camera");
const ICON_TARGET = makeIcon("🎯", "icon-target");
const ICON_SUN = makeIcon("☀️", "icon-sun");
const ICON_MOON = makeIcon("🌙", "icon-moon");

class SceneLayers {
  constructor(map) {
    this.map = map;
    this.cameraMarker = null;
    this.targetMarker = null;
    this.sunLine = null;
    this.sunMarker = null;
    this.moonLine = null;
    this.moonMarker = null;
  }

  setCameraMarker(latlng) {
    if (this.cameraMarker) this.cameraMarker.setLatLng(latlng);
    else this.cameraMarker = L.marker(latlng, { icon: ICON_CAMERA, draggable: true }).addTo(this.map);
    return this.cameraMarker;
  }

  setTargetMarker(latlng) {
    if (this.targetMarker) this.targetMarker.setLatLng(latlng);
    else this.targetMarker = L.marker(latlng, { icon: ICON_TARGET, draggable: true }).addTo(this.map);
    return this.targetMarker;
  }

  clearTargetMarker() {
    if (this.targetMarker) {
      this.map.removeLayer(this.targetMarker);
      this.targetMarker = null;
    }
  }

  drawBody(kind, fromLatLng, bearingDeg, altitudeDeg) {
    const isSun = kind === "sun";
    const icon = isSun ? ICON_SUN : ICON_MOON;
    const color = isSun ? "#f5a623" : "#8ea3c4";
    // 高度が高いほど線を短く（頭上に近いイメージ）、低いほど長く伸ばす
    const length = BEARING_LINE_LENGTH_M * (1 - Math.min(Math.max(altitudeDeg, 0), 80) / 100);
    const dest = destinationPoint(fromLatLng.lat, fromLatLng.lng, bearingDeg, Math.max(length, 40));
    const destLatLng = [dest.lat, dest.lng];

    const lineKey = isSun ? "sunLine" : "moonLine";
    const markerKey = isSun ? "sunMarker" : "moonMarker";

    if (this[lineKey]) this.map.removeLayer(this[lineKey]);
    if (this[markerKey]) this.map.removeLayer(this[markerKey]);

    if (altitudeDeg < -2) return; // 地平線の下なら描かない

    this[lineKey] = L.polyline([[fromLatLng.lat, fromLatLng.lng], destLatLng], {
      color,
      weight: 3,
      dashArray: altitudeDeg < 0 ? "4 6" : null,
    }).addTo(this.map);
    this[markerKey] = L.marker(destLatLng, { icon }).addTo(this.map);
  }

  drawTargetLine(fromLatLng, toLatLng) {
    if (this.targetLine) this.map.removeLayer(this.targetLine);
    this.targetLine = L.polyline([[fromLatLng.lat, fromLatLng.lng], [toLatLng.lat, toLatLng.lng]], {
      color: "#555",
      weight: 2,
      dashArray: "2 6",
    }).addTo(this.map);
  }
}
