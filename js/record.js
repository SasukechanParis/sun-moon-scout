// 「この場所を記録する」機能。撮影位置と対象物ピン(GPS二点)から方位を確定し、コンパスを使わずに
// 逆算検索→精密化した日時を名前付きで端末に保存する。約束の根拠にする記録なのでここが精度の要。

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function recordCurrentSpot() {
  const body = document.getElementById("record-body").value;
  const preset = document.getElementById("record-altitude-preset").value;
  const [altitudeMin, altitudeMax] = ALTITUDE_PRESETS[preset];
  const bearing = currentTargetBearing();
  const bearingSource = state.target ? "target-pin" : "manual";

  const coarseMatches = reverseSearch({
    lat: state.camera.lat,
    lng: state.camera.lng,
    body,
    targetAzimuth: bearing,
    azimuthTolerance: 3,
    altitudeMin,
    altitudeMax,
    fromDate: new Date(),
    days: 365,
    stepMinutes: 5,
  });

  if (coarseMatches.length === 0) {
    alert("今後1年以内にこの方角へ来る日時が見つかりませんでした。対象物の位置や高度条件を見直してください。");
    return;
  }

  // 精密化は方位だけを合わせにいくため、粗い一致(5分刻み)の時点では高度条件を満たしていても、
  // 精密な瞬間ではそこからわずかにずれて条件を外れることがある（例: 高度0°付近を狙ったのに
  // 精密化後は日没後で条件外、など）。候補を順に精密化し、条件を満たす最初の一つを採用する。
  const altitudeOk = (alt) =>
    (altitudeMin === null || alt >= altitudeMin) && (altitudeMax === null || alt <= altitudeMax);

  let refined = null;
  for (const match of coarseMatches) {
    const candidate = refineAzimuthCrossing(body, state.camera.lat, state.camera.lng, match.date, bearing);
    if (altitudeOk(candidate.altitude)) {
      refined = candidate;
      break;
    }
  }
  if (!refined) {
    // どれも精密化後は条件を外れる場合は、それでも一番近い候補を採用する（無回答よりまし）
    refined = refineAzimuthCrossing(body, state.camera.lat, state.camera.lng, coarseMatches[0].date, bearing);
  }

  const name = prompt("この記録の名前・メモを入力してください（例: ポンヌフ北側、凱旋門バック）", window.suggestedSpotName || "");
  if (name === null) return; // キャンセル

  addSavedSpot({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "名称未設定",
    createdAt: new Date().toISOString(),
    camera: { ...state.camera },
    target: state.target ? { ...state.target } : null,
    bearing,
    bearingSource,
    body,
    predictedAt: refined.time.toISOString(),
    azimuth: refined.azimuth,
    altitude: refined.altitude,
  });

  renderSavedSpots();
}

function loadSpotOntoMap(spot) {
  state.camera = { ...spot.camera };
  if (spot.target) {
    state.target = { ...spot.target };
  } else {
    state.target = null;
    layers.clearTargetMarker();
  }
  map.setView([state.camera.lat, state.camera.lng], 16);

  const predictedDate = new Date(spot.predictedAt);
  document.getElementById("input-date").value = toLocalDateInputValue(predictedDate);
  document.getElementById("input-time").value = toLocalTimeInputValue(predictedDate);
  syncTimeSliderFromInput();
  updateAll();
  document.getElementById("results-panel").scrollIntoView({ behavior: "smooth" });
}

function renderSavedSpots() {
  const list = document.getElementById("saved-spots-list");
  const spots = loadSavedSpots();
  list.innerHTML = "";

  if (spots.length === 0) {
    list.innerHTML = "<li>まだ記録がありません</li>";
    return;
  }

  for (const spot of spots) {
    const predictedDate = new Date(spot.predictedAt);
    const bodyLabel = spot.body === "moon" ? "🌙 月" : "☀️ 太陽";
    const sourceLabel = spot.bearingSource === "target-pin" ? "GPS二点(高精度)" : "手動方位(参考程度・要確認)";
    const dateLabel = predictedDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

    const li = document.createElement("li");
    li.className = "spot-item";
    li.innerHTML = `
      <div class="spot-header">
        <strong>${escapeHtml(spot.name)}</strong>
        <button class="ghost-btn spot-delete" type="button">削除</button>
      </div>
      <p>${bodyLabel}　${dateLabel} ${formatTime(predictedDate)}　方位${formatDeg(spot.azimuth)}／高度${formatDeg(spot.altitude)}</p>
      <p class="hint">精度: ${sourceLabel}／天候まではわからないので前後15分は幅を見てください</p>
      <button class="ghost-btn spot-load" type="button">この場所と日時を読み込む</button>
    `;
    li.querySelector(".spot-delete").addEventListener("click", () => {
      deleteSavedSpot(spot.id);
      renderSavedSpots();
    });
    li.querySelector(".spot-load").addEventListener("click", () => loadSpotOntoMap(spot));
    list.appendChild(li);
  }
}

document.getElementById("btn-record-spot").addEventListener("click", recordCurrentSpot);
renderSavedSpots();
