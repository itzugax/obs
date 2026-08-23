/* === Firebase === */
var firebaseConfig = {
  apiKey: "AIzaSyDummyPlaceholder123",
  databaseURL: "https://obss-1a2ae-default-rtdb.firebaseio.com",
  projectId: "obss-1a2ae",
  storageBucket: "obss-1a2ae.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:000000000000"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.database();
var STREAM_ID = "sala-stream-demo";
var roomRef = db.ref("streams/" + STREAM_ID + "/elements");

/* === Supabase === */
var SB_URL = "https://esccrtvcfssykpmltroz.supabase.co";
var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzY3J0dmNmZnN5a3BtbHRyb3oiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1NDk5MTczNSwiZXhwIjoyMDcwNTY3NzM1fQ.8Ax1sNJ2D4pVFaTtT7x9ksW3Kn0h0y120kJvRfvxCY8";
var supabase = window.supabase.createClient(SB_URL, SB_KEY);
var BUCKET = "wasa";

/* === State === */
var state = {};
var editingId = null;
var selectedId = null;
var POS_MAP = {};

/* === DOM === */
var canvas = document.getElementById("canvas");
var listEl = document.getElementById("list");
var emptyEl = document.getElementById("empty-msg");
var countEl = document.getElementById("count");
var editSec = document.getElementById("edit-section");
var edName = document.getElementById("ed-name");
var dotEl = document.getElementById("dot");
var connTxt = document.getElementById("conn-txt");

/* === Tabs === */
document.querySelectorAll(".tab").forEach(function(t) {
  t.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(function(x) { x.classList.remove("active"); });
    document.querySelectorAll(".tab-body").forEach(function(x) { x.classList.remove("active"); });
    t.classList.add("active");
    document.getElementById(t.dataset.tab).classList.add("active");
  });
});

/* === Add URL === */
document.getElementById("addUrl").addEventListener("click", function() {
  var u = document.getElementById("urlIn").value.trim();
  if (!u) { alert("Pega una URL primero"); return; }
  var t = detectType(u);
  if (!t) { alert("No se pudo detectar el tipo. Usa una imagen, video o audio directo."); return; }
  var id = roomRef.push().key;
  var base = {
    type: t, x: 0.1, y: 0.1, w: 0.30, h: 0.08,
    z: Date.now(), opacity: 100, visible: true,
    name: shortName(u), locked: false
  };
  if (t === "image") base.objectFit = "fill";
  if (t === "audio") { base.volume = 100; base.loop = false; }
  if (t === "video") { base.volume = 100; base.loop = false; base.objectFit = "fill"; }
  roomRef.child(id).set(base);
  document.getElementById("urlIn").value = "";
});

/* === Add Text === */
document.getElementById("addTxt").addEventListener("click", function() {
  var txt = document.getElementById("txtIn").value.trim();
  if (!txt) { alert("Escribe algo primero"); return; }
  var id = roomRef.push().key;
  roomRef.child(id).set({
    type: "text",
    x: 0.1, y: 0.1, w: 0.30, h: 0.08,
    z: Date.now(), opacity: 100, visible: true,
    name: shortName(txt), locked: false,
    text: txt,
    fontSize: parseInt(document.getElementById("selSz").value) || 56,
    bold: document.getElementById("txtBold").checked,
    italic: document.getElementById("txtItalic").checked,
    txtColor: document.getElementById("txtCol").value,
    bgType: document.getElementById("selBg").value,
    bgColor: document.getElementById("txtBgCol").value,
    bgOpacity: parseInt(document.getElementById("txtBgOp").value) || 60
  });
  document.getElementById("txtIn").value = "";
});

/* === File Upload === */
var dropZone = document.getElementById("drop-zone");
var fileIn = document.getElementById("fileIn");

dropZone.addEventListener("click", function() { fileIn.click(); });
dropZone.addEventListener("dragover", function(e) {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", function() {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", function(e) {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});
fileIn.addEventListener("change", function() {
  handleFiles(fileIn.files);
});

async function handleFiles(files) {
  var ul = document.getElementById("upload-list");
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var it = document.createElement("div");
    it.className = "upload-item";
    it.innerHTML = "<span>" + esc(f.name) + "</span><span class='ok'>Subiendo...</span>";
    ul.prepend(it);
    try {
      var ext = f.name.split(".").pop().toLowerCase();
      var path = STREAM_ID + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
      var up = await supabase.storage.from(BUCKET).upload(path, f, { cacheControl: "3600", upsert: false });
      if (up.error) throw up.error;
      var pub = SB_URL + "/storage/v1/object/public/" + BUCKET + "/" + path;
      var t = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
      var id = roomRef.push().key;
      var base = {
        type: t, x: 0.1, y: 0.1, w: 0.30, h: 0.08,
        z: Date.now(), url: pub, name: shortName(f.name),
        opacity: 100, visible: true, locked: false
      };
      if (t === "image") base.objectFit = "fill";
      if (t === "audio") { base.volume = 100; base.loop = false; }
      if (t === "video") { base.volume = 100; base.loop = false; base.objectFit = "fill"; }
      roomRef.child(id).set(base);
      it.querySelector("span:last-child").className = "ok";
      it.querySelector("span:last-child").textContent = "Listo";
    } catch (e) {
      it.querySelector("span:last-child").className = "fail";
      it.querySelector("span:last-child").textContent = "Error";
      console.error(e);
    }
  }
}

/* === Listen === */
roomRef.on("value", function(snap) {
  state = snap.val() || {};
  render();
});

function render() {
  var keys = Object.keys(state);
  keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
  countEl.textContent = keys.length;
  emptyEl.style.display = keys.length ? "none" : "block";

  var seen = {};
  keys.forEach(function(id) {
    seen[id] = 1;
    upsertEl(id, state[id]);
  });
  canvas.querySelectorAll(".el").forEach(function(d) {
    if (!seen[d.dataset.id]) d.remove();
  });

  renderList(keys);
}

function upsertEl(id, el) {
  var d = canvas.querySelector('[data-id="' + id + '"]');
  if (!d) {
    d = mkDiv(el);
    d.dataset.id = id;
    canvas.appendChild(d);
  }

  var classes = "el";
  if (el.visible === false) classes += " hidden-el";
  if (el.type === "audio") classes += " is-audio";
  if (el.type === "text") classes += " is-text";
  d.className = classes;

  if (el.locked) {
    d.style.pointerEvents = "none";
    var mw = d.querySelector(".media-wrap");
    if (mw) mw.style.cursor = "default";
  } else {
    d.style.pointerEvents = "";
    var mw2 = d.querySelector(".media-wrap");
    if (mw2) mw2.style.cursor = "move";
  }

  POS_MAP[id] = { x: el.x, y: el.y, w: el.w, h: el.h };
  d.style.left = (el.x * 100) + "%";
  d.style.top = (el.y * 100) + "%";
  d.style.width = (el.w * 100) + "%";
  d.style.height = (el.h * 100) + "%";
  d.style.opacity = (el.opacity != null ? el.opacity : 100) / 100;

  var wrap = d.querySelector(".media-wrap");

  if (el.type === "text") {
    var bgVal = "transparent";
    if (el.bgType === "solid" && el.bgColor) {
      var rgb = hexToRgb(el.bgColor);
      var alpha = (el.bgOpacity || 0) / 100;
      bgVal = "rgba(" + rgb + "," + alpha + ")";
    }
    wrap.style.background = bgVal;
    wrap.style.color = el.txtColor || "#fff";
    wrap.style.fontWeight = el.bold ? "bold" : "normal";
    wrap.style.fontStyle = el.italic ? "italic" : "normal";
    wrap.style.fontSize = (el.fontSize || 56) + "px";
    wrap.style.lineHeight = "1.2";
    wrap.style.webkitTextStroke = "3px #000000";
    wrap.style.textShadow = "2px 2px 6px rgba(0,0,0,0.8)";
    wrap.innerHTML = "<span>" + esc(el.text || "") + "</span>";
  } else if (el.type === "audio") {
    wrap.innerHTML = '<div class="audio-badge">&#127925;</div>';
  } else {
    var tag = d.querySelector(".tag");
    if (tag) tag.textContent = el.name || "";
    var src = el.url || "";

    if (el.type === "image") {
      var img = wrap.querySelector("img");
      if (!img) { img = document.createElement("img"); wrap.appendChild(img); }
      img.src = src;
    } else if (el.type === "video") {
      var vid = wrap.querySelector("video");
      if (!vid) { vid = document.createElement("video"); vid.muted = false; wrap.appendChild(vid); }
      vid.src = src;
      vid.loop = !!el.loop;
      vid.volume = (el.volume || 100) / 100;
      vid.objectFit = el.objectFit || "fill";
      try {
        if (el.visible === false) {
          if (!vid.paused) vid.pause();
        } else if (vid.paused && vid.src) {
          vid.play().catch(function() {});
        }
      } catch (e) {}
    }
  }
}

function mkDiv(el) {
  var d = document.createElement("div");
  var tag = el.type === "image" ? (el.name || "") : "";
  d.innerHTML = '<div class="media-wrap"><span class="tag">' + esc(tag) + '</span></div>';
  return d;
}

/* === interact.js === */
interact("#canvas .el").draggable({
  listeners: {
    move: function(e) {
      var id = e.target.dataset.id;
      if (!id || !state[id] || state[id].locked) return;
      var r = canvas.getBoundingClientRect();
      var dx = e.dx / r.width;
      var dy = e.dy / r.height;
      var nx = (POS_MAP[id].x || 0) + dx;
      var ny = (POS_MAP[id].y || 0) + dy;
      var nw = POS_MAP[id].w || 0.3;
      var nh = POS_MAP[id].h || 0.08;
      nx = Math.max(0, Math.min(1 - nw, nx));
      ny = Math.max(0, Math.min(1 - nh, ny));
      POS_MAP[id].x = nx;
      POS_MAP[id].y = ny;
      e.target.style.left = (nx * 100) + "%";
      e.target.style.top = (ny * 100) + "%";
    },
    end: function(e) {
      var id = e.target.dataset.id;
      if (id && POS_MAP[id]) {
        roomRef.child(id).update({ x: POS_MAP[id].x, y: POS_MAP[id].y });
      }
    }
  }
}).resizable({
  edges: { left: true, right: true, bottom: true, top: true },
  listeners: {
    move: function(e) {
      var id = e.target.dataset.id;
      if (!id || !state[id] || state[id].locked) return;
      var r = canvas.getBoundingClientRect();
      var nw = Math.max(0.03, e.rect.width / r.width);
      var nh = Math.max(0.03, e.rect.height / r.height);
      var nx = (POS_MAP[id].x || 0) + (e.dx / r.width);
      var ny = (POS_MAP[id].y || 0) + (e.dy / r.height);
      nx = Math.max(0, Math.min(1 - nw, nx));
      ny = Math.max(0, Math.min(1 - nh, ny));
      POS_MAP[id].x = nx;
      POS_MAP[id].y = ny;
      POS_MAP[id].w = nw;
      POS_MAP[id].h = nh;
      e.target.style.left = (nx * 100) + "%";
      e.target.style.top = (ny * 100) + "%";
      e.target.style.width = (nw * 100) + "%";
      e.target.style.height = (nh * 100) + "%";
      e.target.classList.add("resizing");
      if (editingId === id) syncEdit();
    },
    end: function(e) {
      var id = e.target.dataset.id;
      e.target.classList.remove("resizing");
      if (id && POS_MAP[id]) {
        roomRef.child(id).update({
          x: POS_MAP[id].x, y: POS_MAP[id].y,
          w: POS_MAP[id].w, h: POS_MAP[id].h
        });
      }
    }
  }
});

/* === Source List === */
function renderList(keys) {
  var existing = {};
  listEl.querySelectorAll(".row").forEach(function(r) {
    existing[r.dataset.id] = r;
  });

  var fragment = document.createDocumentFragment();
  keys.forEach(function(id) {
    var el = state[id];
    var r = existing[id];
    if (!r) {
      r = mkRow(id, el);
    }
    upRow(r, id, el);
    fragment.appendChild(r);
  });

  Object.keys(existing).forEach(function(id) {
    if (!state[id]) existing[id].remove();
  });

  listEl.appendChild(fragment);
}

function mkRow(id, el) {
  var r = document.createElement("div");
  r.className = "row";
  r.dataset.id = id;
  r.innerHTML =
    '<span class="r-icon"></span>' +
    '<span class="r-name"></span>' +
    '<span class="r-badge"></span>' +
    '<button class="ibtn eye-btn" title="Mostrar/Ocultar">&#128065;</button>' +
    '<button class="ibtn edit-btn" title="Editar">&#9998;</button>' +
    '<button class="ibtn danger del-btn" title="Eliminar">&#10005;</button>';

  r.addEventListener("click", function(e) {
    if (e.target.closest(".ibtn")) return;
    selectRow(id);
    openEdit(id);
  });

  r.querySelector(".eye-btn").addEventListener("click", function(e) {
    e.stopPropagation();
    var cur = state[id];
    if (cur) {
      roomRef.child(id).update({ visible: cur.visible === false });
    }
  });

  r.querySelector(".edit-btn").addEventListener("click", function(e) {
    e.stopPropagation();
    openEdit(id);
  });

  r.querySelector(".del-btn").addEventListener("click", function(e) {
    e.stopPropagation();
    if (confirm("Eliminar esta capa?")) {
      roomRef.child(id).remove();
      if (editingId === id) closeEdit();
      if (selectedId === id) selectedId = null;
    }
  });

  return r;
}

function upRow(r, id, el) {
  var icons = { image: "IMG", video: "VID", audio: "AUD", text: "TXT" };
  r.querySelector(".r-icon").textContent = icons[el.type] || "???";
  r.querySelector(".r-name").textContent = el.name || id.slice(-6);
  r.querySelector(".r-badge").textContent = "#" + (el.z || 0);

  var eye = r.querySelector(".eye-btn");
  if (el.visible !== false) {
    eye.innerHTML = "&#128065;";
    eye.className = "ibtn eye-btn on";
  } else {
    eye.innerHTML = "&#128064;";
    eye.className = "ibtn eye-btn";
  }

  r.classList.toggle("off", el.visible === false);
  r.classList.toggle("selected", selectedId === id);
}

function selectRow(id) {
  selectedId = id;
  listEl.querySelectorAll(".row.selected").forEach(function(r) {
    r.classList.remove("selected");
  });
  var row = listEl.querySelector('[data-id="' + id + '"]');
  if (row) row.classList.add("selected");
}

/* === Toolbar === */
document.getElementById("tb-add").addEventListener("click", function() {
  document.querySelector('[data-tab="tab-url"]').click();
  document.getElementById("urlIn").focus();
});

document.getElementById("tb-del").addEventListener("click", function() {
  if (selectedId) {
    if (confirm("Eliminar capa seleccionada?")) {
      roomRef.child(selectedId).remove();
      if (editingId === selectedId) closeEdit();
      selectedId = null;
    }
  } else {
    alert("Selecciona una capa primero");
  }
});

document.getElementById("tb-up").addEventListener("click", function() {
  if (selectedId) bringToFront(selectedId);
  else alert("Selecciona una capa primero");
});

document.getElementById("tb-down").addEventListener("click", function() {
  if (selectedId) sendToBack(selectedId);
  else alert("Selecciona una capa primero");
});

function bringToFront(id) {
  var mx = 0;
  Object.keys(state).forEach(function(k) {
    var z = state[k].z || 0;
    if (z > mx) mx = z;
  });
  roomRef.child(id).update({ z: mx + 1 });
}

function sendToBack(id) {
  var mn = Infinity;
  Object.keys(state).forEach(function(k) {
    var z = state[k].z || 0;
    if (z < mn) mn = z;
  });
  roomRef.child(id).update({ z: mn - 1 });
}

/* === Edit === */
function openEdit(id) {
  editingId = id;
  var el = state[id];
  if (!el) return;
  editSec.style.display = "";
  edName.textContent = el.name || id.slice(-6);

  var mf = document.getElementById("edit-media-fields");
  var tf = document.getElementById("edit-text-fields");
  mf.innerHTML = "";
  tf.innerHTML = "";

  if (el.type === "text") {
    tf.innerHTML =
      '<div class="edit-group">' +
        '<label>Texto</label>' +
        '<input type="text" id="ed-text" value="' + esc2(el.text || "") + '">' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="edit-group"><label>Tamano fuente</label>' +
          '<input type="number" id="ed-fontSize" value="' + (el.fontSize || 56) + '" min="8" max="400">' +
        '</div>' +
        '<div class="edit-group"><label>Color texto</label>' +
          '<input type="color" id="ed-txtColor" value="' + (el.txtColor || "#ffffff") + '">' +
        '</div>' +
      '</div>' +
      '<div class="edit-group">' +
        '<label>Fondo</label>' +
        '<select id="ed-bgType">' +
          '<option value="none"' + (el.bgType !== "solid" ? " selected" : "") + '>Sin fondo</option>' +
          '<option value="solid"' + (el.bgType === "solid" ? " selected" : "") + '>Con fondo</option>' +
        '</select>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="edit-group"><label>Color fondo</label>' +
          '<input type="color" id="ed-bgColor" value="' + (el.bgColor || "#000000") + '">' +
        '</div>' +
        '<div class="edit-group"><label>Opacidad fondo</label>' +
          '<input type="number" id="ed-bgOpacity" value="' + (el.bgOpacity || 60) + '" min="0" max="100">' +
        '</div>' +
      '</div>' +
      '<div class="check-row">' +
        '<label><input type="checkbox" id="ed-bold"' + (el.bold ? " checked" : "") + '> Negrita</label>' +
        '<label><input type="checkbox" id="ed-italic"' + (el.italic ? " checked" : "") + '> Cursiva</label>' +
      '</div>';

    setTimeout(function() {
      bindInput("ed-text", "text");
      bindInput("ed-fontSize", "fontSize", true);
      bindInput("ed-txtColor", "txtColor");
      bindInput("ed-bgType", "bgType");
      bindInput("ed-bgColor", "bgColor");
      bindInput("ed-bgOpacity", "bgOpacity", true);

      var boldEl = document.getElementById("ed-bold");
      if (boldEl) boldEl.addEventListener("change", function() {
        roomRef.child(id).update({ bold: boldEl.checked });
      });

      var italicEl = document.getElementById("ed-italic");
      if (italicEl) italicEl.addEventListener("change", function() {
        roomRef.child(id).update({ italic: italicEl.checked });
      });
    }, 0);
  }

  if (el.type === "audio" || el.type === "video") {
    mf.innerHTML =
      '<div class="edit-group">' +
        '<label>Volumen</label>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<input type="range" id="ed-volume" min="0" max="100" value="' + (el.volume != null ? el.volume : 100) + '" style="flex:1">' +
          '<span id="ed-volume-val" style="font-size:12px;width:32px;text-align:right;font-weight:600">' + (el.volume != null ? el.volume : 100) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="check-row">' +
        '<label><input type="checkbox" id="ed-loop"' + (el.loop ? " checked" : "") + '> Repetir en bucle</label>' +
      '</div>';

    setTimeout(function() {
      bindRange("ed-volume", "volume");
      var loopEl = document.getElementById("ed-loop");
      if (loopEl) loopEl.addEventListener("change", function() {
        roomRef.child(id).update({ loop: loopEl.checked });
      });
    }, 0);
  }

  // Opacity
  document.getElementById("ed-opacity").value = el.opacity != null ? el.opacity : 100;
  document.getElementById("ed-opacity-val").textContent = el.opacity != null ? el.opacity : 100;
  document.getElementById("ed-opacity").onchange = function() {
    var v = parseInt(document.getElementById("ed-opacity").value);
    roomRef.child(id).update({ opacity: v });
    document.getElementById("ed-opacity-val").textContent = v;
  };

  // Position/size
  document.getElementById("ed-x").value = (el.x || 0).toFixed(3);
  document.getElementById("ed-y").value = (el.y || 0).toFixed(3);
  document.getElementById("ed-w").value = (el.w || 0.3).toFixed(3);
  document.getElementById("ed-h").value = (el.h || 0.08).toFixed(3);

  ["ed-x", "ed-y", "ed-w", "ed-h"].forEach(function(k) {
    document.getElementById(k).onchange = function() {
      var key = k.replace("ed-", "");
      var obj = {};
      obj[key] = parseFloat(document.getElementById(k).value);
      roomRef.child(id).update(obj);
    };
  });

  document.getElementById("ed-del").onclick = function() {
    if (confirm("Eliminar esta capa?")) {
      roomRef.child(id).remove();
      closeEdit();
    }
  };

  // Highlight row
  selectRow(id);
}

function closeEdit() {
  editingId = null;
  editSec.style.display = "none";
}

function syncEdit() {
  if (!editingId || !state[editingId]) return;
  var el = state[editingId];
  document.getElementById("ed-x").value = (el.x || 0).toFixed(3);
  document.getElementById("ed-y").value = (el.y || 0).toFixed(3);
  document.getElementById("ed-w").value = (el.w || 0.3).toFixed(3);
  document.getElementById("ed-h").value = (el.h || 0.08).toFixed(3);
}

function bindInput(eid, key, isNum) {
  var e = document.getElementById(eid);
  if (!e) return;
  e.addEventListener("input", function() {
    if (!editingId) return;
    var obj = {};
    obj[key] = isNum ? parseFloat(e.value) : e.value;
    roomRef.child(editingId).update(obj);
  });
}

function bindRange(eid, key) {
  var e = document.getElementById(eid);
  if (!e) return;
  var sv = document.getElementById(eid + "-val");
  e.addEventListener("input", function() {
    if (!editingId) return;
    var v = parseInt(e.value);
    if (sv) sv.textContent = v;
    var obj = {};
    obj[key] = v;
    roomRef.child(editingId).update(obj);
  });
}

/* === Util === */
function detectType(u) {
  var s = u.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)($|\?)/.test(s)) return "image";
  if (/\.(mp4|webm|mov|mkv|avi)($|\?)/.test(s)) return "video";
  if (/\.(mp3|ogg|wav|flac|aac|opus)($|\?)/.test(s)) return "audio";
  if (s.includes("imgur.com") || s.includes("images.")) return "image";
  if (s.includes("youtube.com") || s.includes("vimeo.com")) return "video";
  return null;
}

function shortName(n) {
  return (n || "").split("/").pop().split("?")[0].substring(0, 30);
}

function esc(s) {
  var d = document.createElement("span");
  d.textContent = s;
  return d.innerHTML;
}

function esc2(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hexToRgb(h) {
  if (!h || h.length < 7) return "0,0,0";
  var r = parseInt(h.slice(1, 3), 16);
  var g = parseInt(h.slice(3, 5), 16);
  var b = parseInt(h.slice(5, 7), 16);
  return r + "," + g + "," + b;
}

/* === Connection Status === */
var connRef = db.ref(".info/connected");
connRef.on("value", function(snap) {
  var on = snap.val() === true;
  dotEl.className = "dot" + (on ? " on" : "");
  connTxt.textContent = on ? "Conectado papu" : "Desconectado :(";
});
