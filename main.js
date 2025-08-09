// ===== グローバル =====
let currentShadowPolygon = null;
let playing = false;
let playTimer = null;

// 高島平駅周辺の中心座標（概ね）
const centerLat = 35.7893;
const centerLng = 139.6607;

// 建物の中心（影計算の基点）
const lat = 35.78971;
const lng = 139.66107;

// ---- 初期ポリゴン（あなたが編集した座標）[lat,lng] ----
const DEFAULT_BUILDING_COORDS = [
  [35.788524, 139.659029],
  [35.788394, 139.65963],
  [35.787941, 139.65948],
  [35.788063, 139.65889]
];

// 日の出/日の入りの縁で影が消えないようにするマージン（ms）
const SUN_MARGIN_MS = 6 * 60 * 1000; // 6分（好みで調整可）

// ローカル保存キー（バージョン付き）
const STORAGE_KEY = 'buildingCoords_v2';

// 実体となる可変配列
const buildingCoords = [...DEFAULT_BUILDING_COORDS];

// ===== Leaflet 初期化 =====
const map = L.map('map').setView([centerLat, centerLng], 17);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 初期ポリゴン描画
const buildingPolygon = L.polygon(buildingCoords, {
  color: 'red',
  fillColor: '#f03',
  fillOpacity: 0.5
}).addTo(map);

buildingPolygon.bindPopup('新棟予定地（高さ110m）');

// ---- 保存済み座標があれば反映（v2優先、次にレガシーキー） ----
(function loadSavedPolygon() {
  let saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) saved = localStorage.getItem('buildingCoords'); // 旧キー互換
  if (!saved) return;

  try {
    const arr = JSON.parse(saved);
    if (Array.isArray(arr) && arr.length >= 3) {
      buildingCoords.splice(0, buildingCoords.length, ...arr);
      buildingPolygon.setLatLngs(buildingCoords);
    }
  } catch (e) {
    console.warn('saved polygon parse error:', e);
  }
})();

// ✅ 初期表示：ポリゴンの中心を地図の中心に合わせる
(function centerMapOnPolygon() {
  const bounds = buildingPolygon.getBounds();
  const center = bounds.getCenter();
  map.setView(center, 18); // ズームは好みで（18〜19がおすすめ）
})();

// Leaflet.draw の編集対象グループ
const editableGroup = L.featureGroup([buildingPolygon]).addTo(map);

// 編集ツールバー（描画は不要、編集だけ有効化）
const drawControl = new L.Control.Draw({
  draw: false,
  edit: {
    featureGroup: editableGroup,
    edit: true,
    remove: false
  }
});
map.addControl(drawControl);

// 編集セッションをプログラムからON/OFFするためのハンドル
let editSession = null;
function startEdit() {
  if (!editSession) {
    editSession = new L.EditToolbar.Edit(map, { featureGroup: editableGroup });
  }
  editSession.enable();  // 頂点ドラッグ＆全体移動が可能に
}
function stopEdit() {
  if (editSession) editSession.disable();
}

// 画面サイズ変化（スマホのアドレスバー等）に追従
window.addEventListener('resize', () => map.invalidateSize());

// ===== 編集UI ボタン =====
const editToggleBtn = document.getElementById('editToggleBtn');
const savePolyBtn   = document.getElementById('savePolyBtn');
const resetPolyBtn  = document.getElementById('resetPolyBtn');
const exportPolyBtn = document.getElementById('exportPolyBtn');

let editing = false;

if (editToggleBtn) {
  editToggleBtn.addEventListener('click', () => {
    editing = !editing;
    if (editing) {
      if (playing) togglePlay(); // 再生中なら止める
      startEdit();
      editToggleBtn.textContent = '✅ 編集終了';
    } else {
      stopEdit();
      editToggleBtn.textContent = '✏️ 編集開始';
      // 編集終了時に影も更新
      syncBuildingCoordsFromPolygon();
      updateShadow();
    }
  });
}

if (savePolyBtn) {
  savePolyBtn.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getPolygonLatLngs()));
  });
}

if (resetPolyBtn) {
  resetPolyBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    buildingCoords.splice(0, buildingCoords.length, ...DEFAULT_BUILDING_COORDS);
    buildingPolygon.setLatLngs(DEFAULT_BUILDING_COORDS);
    // 初期値に戻したら中心も合わせ直す
    const b = buildingPolygon.getBounds();
    map.setView(b.getCenter(), 18);
    updateShadow();
  });
}

if (exportPolyBtn) {
  exportPolyBtn.addEventListener('click', () => {
    const gj = buildingPolygon.toGeoJSON();
    const blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'building.geojson' });
    a.click();
    URL.revokeObjectURL(url);
  });
}

// polygon → 配列[[lat,lng],...]に吸い上げ
function getPolygonLatLngs() {
  const ll = buildingPolygon.getLatLngs();
  const ring = Array.isArray(ll[0]) ? ll[0] : ll; // [[LatLng,...]] or [LatLng,...]
  return ring.map(pt => [pt.lat, pt.lng]);
}

// buildingCoordsへ同期
function syncBuildingCoordsFromPolygon() {
  const arr = getPolygonLatLngs();
  buildingCoords.splice(0, buildingCoords.length, ...arr);
}

// Leaflet.drawの「編集完了」イベントでも同期＆影更新
map.on(L.Draw.Event.EDITED, (e) => {
  e.layers.eachLayer((layer) => {
    if (layer === buildingPolygon) {
      syncBuildingCoordsFromPolygon();
      // 編集確定後は中心に合わせ直すと親切
      const b = buildingPolygon.getBounds();
      map.setView(b.getCenter(), map.getZoom());
      updateShadow();
    }
  });
});

// 日の出時刻セット
const sunriseBtn = document.getElementById('sunriseBtn');
if (sunriseBtn) {
  sunriseBtn.addEventListener('click', () => {
    if (playing) togglePlay();
    const inputEl = document.getElementById('datetime');
    const base = inputEl.value ? new Date(inputEl.value) : new Date();
    const { sunrise } = getSunTimesFor(base);
    const sr = new Date(sunrise.getTime() + 5 * 60 * 1000); // +5分の安全マージン
    inputEl.value = toInputValue(sr);
    updateShadow();
  });
}

// ✅ 今日ボタン
const todayBtn = document.getElementById('todayBtn');
if (todayBtn) {
  todayBtn.addEventListener('click', () => {
    if (playing) togglePlay();
    const now = new Date();
    document.getElementById('datetime').value = toInputValue(now);
    updateShadow();
  });
}

// 夏至・冬至セット
const summerSolBtn = document.getElementById('summerSolBtn');
const winterSolBtn = document.getElementById('winterSolBtn');

function setDateKeepingTime(targetMonth /*0-based*/, targetDay) {
  const inputEl = document.getElementById('datetime');
  const base = inputEl.value ? new Date(inputEl.value) : new Date();
  const year = base.getFullYear();
  const hours = base.getHours();
  const mins  = base.getMinutes();
  const d = new Date(year, targetMonth, targetDay, hours, mins, 0, 0);
  if (playing) togglePlay();
  inputEl.value = toInputValue(d);
  updateShadow();
}
if (summerSolBtn) summerSolBtn.addEventListener('click', () => setDateKeepingTime(5, 21));
if (winterSolBtn) winterSolBtn.addEventListener('click', () => setDateKeepingTime(11, 21));

// ===== ユーティリティ =====
const pad2 = n => String(n).padStart(2, '0');
const toDeg = rad => rad * 180 / Math.PI;

function toInputValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function addHours(d, h) {
  return new Date(d.getTime() + h * 3600 * 1000);
}

// m <-> 度 変換
const metersToLat = m => m / 111320;
const metersToLng = (m, lat0) => m / (111320 * Math.cos(lat0 * Math.PI / 180));

// その日の「日の出/日の入り」
function getSunTimesFor(dateLike) {
  const d = new Date(dateLike);
  d.setHours(12, 0, 0, 0); // 安定のため正午固定
  const t = SunCalc.getTimes(d, lat, lng);
  return { sunrise: t.sunrise, sunset: t.sunset };
}

// ===== 影の更新（ねじれ防止の凸包方式）=====
function updateShadow() {
  const inputEl = document.getElementById('datetime');
  const date = new Date(inputEl.value);

  const sunPos = SunCalc.getPosition(date, lat, lng);
  console.log('🌞 方位角:', toDeg(sunPos.azimuth).toFixed(2), '度');
  console.log('🌞 高度角:', toDeg(sunPos.altitude).toFixed(2), '度');

  // 既存の影を消す
  if (currentShadowPolygon) {
    map.removeLayer(currentShadowPolygon);
    currentShadowPolygon = null;
  }

  // 日没後は描画しない
  if (sunPos.altitude <= 0) return;

  // 影の長さ（m）
  const H = 110; // 建物高さ m
  const shadowLen = H / Math.tan(sunPos.altitude);

  // 影の方向ベクトル（東=+x, 北=+y）
  const dirX = Math.sin(sunPos.azimuth); // east 成分
  const dirY = Math.cos(sunPos.azimuth); // north 成分

  // 各隅を平行移動して影終点を得る
  const dLat = metersToLat(shadowLen * dirY);
  const dLng = metersToLng(shadowLen * dirX, lat);
  const shadowCoords = buildingCoords.map(([blat, blng]) => [blat + dLat, blng + dLng]);

  // ---- ねじれ防止：8点の凸包で境界を作る ----
  const refLat = lat, refLng = lng;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(refLat * Math.PI / 180);
  const toXY = ([plat, plng]) => ({
    x: (plng - refLng) * mPerDegLng,
    y: (plat - refLat) * mPerDegLat,
    ll: [plat, plng]
  });

  const pts = [...buildingCoords, ...shadowCoords]
    .map(toXY)
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const hullLatLng = hull.map(p => p.ll);

  // 影ポリゴン描画
  currentShadowPolygon = L.polygon(hullLatLng, {
    color: 'gray',
    fillColor: 'black',
    fillOpacity: 0.4,
    weight: 1
  }).addTo(map);
}

// ===== 自動再生（1時間ステップ、日の出〜日の入りのみ）=====
function togglePlay() {
  const playBtn = document.getElementById('playBtn');
  const inputEl = document.getElementById('datetime');

  if (playing) {
    playing = false;
    clearInterval(playTimer);
    playTimer = null;
    if (playBtn) playBtn.textContent = '▶ 再生';
    return;
  }

  // 再生開始
  let now = new Date(inputEl.value);
  const { sunrise, sunset } = getSunTimesFor(now);

  // 日の出前なら、日の出＋マージンから開始
  if (now < sunrise) {
    now = new Date(sunrise.getTime() + SUN_MARGIN_MS);
    inputEl.value = toInputValue(now);
    updateShadow();
  }
  // 日の入り後は再生できない
  if (now >= sunset) {
    alert('選択時刻は日の入り後です。別の日時を選ぶか、当日の日の出以降に設定してください。');
    return;
  }

  playing = true;
  if (playBtn) playBtn.textContent = '■ 停止';

  playTimer = setInterval(() => {
    const cur = new Date(inputEl.value);
    const { sunrise: sr, sunset: ss } = getSunTimesFor(cur);
    const next = addHours(cur, 1);

    // 次のステップが日の入りを超えるなら、「日の入り直前」に合わせて停止
    if (next > ss) {
      const justBeforeSunset = new Date(ss.getTime() - SUN_MARGIN_MS);
      inputEl.value = toInputValue(justBeforeSunset);
      updateShadow();    // ← 影が残った状態で描画
      togglePlay();      // 自動停止
      return;
    }

    inputEl.value = toInputValue(next);
    updateShadow();

    // 念のための保険（マージンが極端に小さい場合など）
    const sp = SunCalc.getPosition(new Date(inputEl.value), lat, lng);
    if (sp.altitude <= 0) {
      const fallback = new Date(new Date(inputEl.value).getTime() - SUN_MARGIN_MS);
      inputEl.value = toInputValue(fallback);
      updateShadow();
      togglePlay();
    }
  }, 600); // 再生速度はお好みで
}


// ===== イベント結線 =====
const updateBtn = document.getElementById('updateBtn');
if (updateBtn) {
  updateBtn.addEventListener('click', () => {
    if (playing) togglePlay(); // 再生中なら一旦停止
    updateShadow();
  });
}

const playBtn = document.getElementById('playBtn');
if (playBtn) playBtn.addEventListener('click', togglePlay);

const datetimeEl = document.getElementById('datetime');
if (datetimeEl) {
  datetimeEl.addEventListener('change', () => {
    if (playing) togglePlay();
    updateShadow();
  });
}

// 初期描画
updateShadow();
