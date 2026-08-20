// 共有リンクから場所を復元する。ローカルストレージは端末ごとに独立していて他人の端末には
// 書き込めないため、「この場所を記録しておいて」を実際に本人の端末に届けるにはURL経由で
// 撮影位置・対象物・条件を渡し、本人が自分の端末で①タップ記録するだけの状態にする。
// 例: ?clat=48.8656&clng=2.3212&tlat=48.8738&tlng=2.2950&body=sun&alt=golden&name=Paris+Henge
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has("clat")) return;

  const clat = parseFloat(params.get("clat"));
  const clng = parseFloat(params.get("clng"));
  if (!isNaN(clat) && !isNaN(clng)) {
    state.camera = { lat: clat, lng: clng };
    map.setView([clat, clng], 15);
  }

  const tlat = parseFloat(params.get("tlat"));
  const tlng = parseFloat(params.get("tlng"));
  if (!isNaN(tlat) && !isNaN(tlng)) {
    state.target = { lat: tlat, lng: tlng };
  }

  const body = params.get("body");
  if (body === "sun" || body === "moon") {
    document.getElementById("record-body").value = body;
  }

  const alt = params.get("alt");
  if (alt && ALTITUDE_PRESETS[alt]) {
    document.getElementById("record-altitude-preset").value = alt;
  }

  const name = params.get("name");
  if (name) window.suggestedSpotName = name;

  updateAll();
  document.getElementById("record-panel").scrollIntoView({ behavior: "smooth" });
})();
