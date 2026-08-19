// 保存したスポットの永続化。ブラウザのlocalStorageのみで完結し、どこにも送信しない。

const SAVED_SPOTS_KEY = "sms_saved_spots_v1";

function loadSavedSpots() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_SPOTS_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveSavedSpots(spots) {
  localStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(spots));
}

function addSavedSpot(spot) {
  const spots = loadSavedSpots();
  spots.unshift(spot);
  saveSavedSpots(spots);
}

function deleteSavedSpot(id) {
  saveSavedSpots(loadSavedSpots().filter((s) => s.id !== id));
}
