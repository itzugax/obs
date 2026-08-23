/* ================================================================
 *  control.js — Panel del Moderador (v2)
 *  Firebase RTDB + Storage + interact.js
 *  Soporta: imagenes, videos, audios, textos, archivos del PC
 * ================================================================ */

firebase.initializeApp(firebaseConfig);
var db = firebase.database();
var storage = firebase.storage();
var roomRef = db.ref("overlays/" + STREAM_ID + "/elements");

/* ── DOM refs ── */
var canvas = document.getElementById("canvas");
var listEl = document.getElementById("list");
var emptyMsg = document.getElementById("empty-msg");
var urlInput = document.getElementById("url-input");
var typeHint = document.getElementById("type-hint");
var addUrlBtn = document.getElementById("add-url");
var addTextBtn = document.getElementById("add-text");
var hideAllBtn = document.getElementById("hide-all");
var showAllBtn = document.getElementById("show-all");
var clearAllBtn = document.getElementById("clear-all");
var countEl = document.getElementById("count");
var connDot = document.querySelector("#conn .dot");
var connText = document.getElementById("conn-text");
var streamLabel = document.getElementById("stream-label");
var dropZone = document.getElementById("drop-zone");
var fileInput = document.getElementById("file-input");
var uploadList = document.getElementById("upload-list");
var textInput = document.getElementById("text-input");

streamLabel.textContent = "Sala: " + STREAM_ID;

/* ── Estado local ── */
var state = new Map();
var nodes = new Map();
var rows = new Map();
var dragging = new Set();
var writeTimers = new Map();
var zTop = 0;
var editingId = null;

/* ── Utilidades ── */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function r4(n) { return Math.round(n * 10000) / 10000; }

function detectType(url) {
  var u = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogv|mov)$/.test(u)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(u)) return "audio";
  return "image";
}

function nameFromUrl(url) {
  try {
    var parts = new URL(url).pathname.split("/");
    var name = decodeURIComponent(parts.pop() || "");
    return name.length > 24 ? name.slice(0, 21) + "..." : name || "sin nombre";
  } catch (e) {
    return url.length > 24 ? url.slice(0, 21) + "..." : url;
  }
}

function typeIcon(t) {
  if (t === "video") return "Video";
  if (t === "audio") return "Audio";
  if (t === "text") return "Txt";
  return "Img";
}

/* ── Throttled Firebase writes ── */
function scheduleWrite(id) {
  if (writeTimers.has(id)) return;
  writeTimers.set(id, setTimeout(function () {
    writeTimers.delete(id);
    pushTransform(id);
  }, 80));
}

function flushWrite(id) {
  var t = writeTimers.get(id);
  if (t) { clearTimeout(t); writeTimers.delete(id); }
  pushTransform(id);
}

function pushTransform(id) {
  var el = state.get(id);
  if (!el) return;
  roomRef.child(id).update({
    x: r4(el.x), y: r4(el.y),
    w: r4(el.w), h: r4(el.h)
  });
}

/* ── Clamping ── */
function clampEl(el) {
  el.w = clamp(el.w, 0.02, 1);
  el.h = clamp(el.h, 0.02, 1);
  el.x = clamp(el.x, 0, 1 - el.w);
  el.y = clamp(el.y, 0, 1 - el.h);
}

/* ── Paint position ── */
function paintPos(node, el) {
  node.style.left = (el.x * 100) + "%";
  node.style.top = (el.y * 100) + "%";
  node.style.width = (el.w * 100) + "%";
  node.style.height = (el.h * 100) + "%";
  node.style.zIndex = el.z || 0;
}

function cw() { return canvas.clientWidth || 1; }
function ch() { return canvas.clientHeight || 1; }

/* ================================================================
 *  Render: crear / actualizar nodo en el lienzo
 * ================================================================ */
function renderNode(el) {
  var node = nodes.get(el.id);

  if (!node) {
    node = document.createElement("div");
    node.className = "el type-" + el.type;
    node.dataset.id = el.id;

    var wrap = document.createElement("div");
    wrap.className = "media-wrap";

    if (el.type === "text") {
      node.classList.add("is-text");
      wrap.textContent = el.content || "";
      wrap.style.fontSize = (el.fontSize || 48) / 10.8 + "vh";
      wrap.style.color = el.fontColor || "#fff";
      wrap.style.fontFamily = el.fontFamily || "Arial, sans-serif";
      wrap.style.fontWeight = el.bold ? "bold" : "normal";
      wrap.style.fontStyle = el.italic ? "italic" : "normal";
      var alpha = Math.round(((el.bgOpacity || 0) / 100) * 255);
      var aHex = alpha.toString(16).padStart(2, "0");
      wrap.style.backgroundColor = (el.bgColor || "#000000") + aHex;
    } else if (el.type === "image") {
      var img = document.createElement("img");
      img.src = el.url;
      img.draggable = false;
      img.onerror = function () { wrap.style.outline = "2px solid #f85149"; };
      wrap.appendChild(img);
    } else if (el.type === "video") {
      var vid = document.createElement("video");
      vid.src = el.url;
      vid.loop = true;
      vid.playsInline = true;
      vid.preload = "auto";
      vid.muted = false;
      vid.volume = el.volume != null ? el.volume : 1;
      vid.onerror = function () { wrap.style.outline = "2px solid #f85149"; };
      if (el.playing !== false) vid.play().catch(function () {});
      wrap.appendChild(vid);
    } else if (el.type === "audio") {
      node.classList.add("is-audio");
      var badge = document.createElement("div");
      badge.className = "audio-badge";
      badge.textContent = "Audio";
      wrap.appendChild(badge);
      var aud = document.createElement("audio");
      aud.src = el.url;
      aud.preload = "auto";
      aud.volume = el.volume != null ? el.volume : 1;
      aud.onerror = function () { wrap.style.outline = "2px solid #f85149"; };
      if (el.playing !== false) aud.play().catch(function () {});
      wrap.appendChild(aud);
    }

    var tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = el.type === "text" ? (el.content || "texto").slice(0, 20) : nameFromUrl(el.url || "");
    wrap.appendChild(tag);

    node.appendChild(wrap);
    canvas.appendChild(node);
    nodes.set(el.id, node);
    makeInteractive(node, el.id);
  }

  /* Sincronizar multimedia */
  if (el.type !== "image" && el.type !== "text") {
    var media = node.querySelector("video, audio");
    if (media) {
      media.volume = el.volume != null ? el.volume : 1;
      if (el.playing === false) { media.pause(); }
      else { media.play().catch(function () {}); }
    }
  }

  /* Actualizar contenido de texto */
  if (el.type === "text") {
    var wrap2 = node.querySelector(".media-wrap");
    if (wrap2) {
      wrap2.textContent = el.content || "";
      wrap2.style.fontSize = (el.fontSize || 48) / 10.8 + "vh";
      wrap2.style.color = el.fontColor || "#fff";
      wrap2.style.fontFamily = el.fontFamily || "Arial, sans-serif";
      wrap2.style.fontWeight = el.bold ? "bold" : "normal";
      wrap2.style.fontStyle = el.italic ? "italic" : "normal";
      var a2 = Math.round(((el.bgOpacity || 0) / 100) * 255);
      wrap2.style.backgroundColor = (el.bgColor || "#000000") + a2.toString(16).padStart(2, "0");
    }
  }

  if (!dragging.has(el.id)) {
    node.classList.toggle("hidden-el", el.visible === false);
    paintPos(node, el);
  }
}

function removeNode(id) {
  var node = nodes.get(id);
  if (node) { node.remove(); nodes.delete(id); }
  var row = rows.get(id);
  if (row) { row.remove(); rows.delete(id); }
  state.delete(id);
  updateCount();
}

/* ================================================================
 *  interact.js
 * ================================================================ */
function makeInteractive(node, id) {
  interact(node)
    .draggable({
      listeners: {
        start: function () { dragging.add(id); node.style.zIndex = 9999; },
        move: function (ev) {
          var el = state.get(id); if (!el) return;
          el.x += ev.dx / cw(); el.y += ev.dy / ch();
          clampEl(el); paintPos(node, el); scheduleWrite(id);
        },
        end: function () {
          var el = state.get(id);
          if (el) { node.style.zIndex = el.z || 0; clampEl(el); paintPos(node, el); }
          dragging.delete(id); flushWrite(id);
        }
      }
    })
    .resizable({
      edges: { left: true, right: true, top: true, bottom: true },
      listeners: {
        start: function () { dragging.add(id); node.classList.add("resizing"); },
        move: function (ev) {
          var el = state.get(id); if (!el) return;
          var d = ev.deltaRect;
          el.w += d.width / cw(); el.h += d.height / ch();
          el.x += d.left / cw(); el.y += d.top / ch();
          clampEl(el); paintPos(node, el); scheduleWrite(id);
        },
        end: function () {
          var el = state.get(id);
          if (el) { clampEl(el); paintPos(node, el); }
          dragging.delete(id); node.classList.remove("resizing"); flushWrite(id);
        }
      }
    })
    .on("doubletap", function () { bringToFront(id); });
}

function bringToFront(id) {
  zTop++;
  roomRef.child(id).update({ z: zTop });
}

/* ================================================================
 *  Lista lateral
 * ================================================================ */
function renderRow(el) {
  var row = rows.get(el.id);
  if (!row) {
    row = document.createElement("div");
    row.className = "row";
    row.dataset.id = el.id;

    var volVal = el.volume != null ? Math.round(el.volume * 100) : 80;
    var playIcon = el.playing !== false ? "Pausa" : "Play";
    var eyeIcon = el.visible !== false ? "Ojo" : "OjoX";

    row.innerHTML =
      '<span class="icon">' + typeIcon(el.type) + '</span>' +
      '<span class="name">' + (el.type === "text" ? (el.content || "").slice(0, 14) : nameFromUrl(el.url || "")) + '</span>' +
      (el.type !== "text" ? '<input class="vol" type="range" min="0" max="100" value="' + volVal + '" title="Volumen">' : '') +
      '<button class="ibtn edit" title="Editar">Edit</button>' +
      '<button class="ibtn eye" title="Visibilidad">' + eyeIcon + '</button>' +
      '<button class="ibtn play" title="Play/Pause">' + playIcon + '</button>' +
      '<button class="ibtn front" title="Traer al frente">Top</button>' +
      '<button class="ibtn danger" title="Eliminar">X</button>';

    /* Volumen */
    var vol = row.querySelector(".vol");
    if (vol) {
      vol.addEventListener("input", function () {
        var v = parseInt(this.value) / 100;
        roomRef.child(el.id).update({ volume: r4(v) });
      });
    }

    row.querySelector(".eye").addEventListener("click", function () {
      var cur = state.get(el.id);
      roomRef.child(el.id).update({ visible: cur && cur.visible === false });
    });

    row.querySelector(".play").addEventListener("click", function () {
      var cur = state.get(el.id);
      roomRef.child(el.id).update({ playing: cur && cur.playing === false });
    });

    row.querySelector(".front").addEventListener("click", function () { bringToFront(el.id); });

    row.querySelector(".edit").addEventListener("click", function () { startEditing(el.id); });

    row.querySelector(".danger").addEventListener("click", function () {
      roomRef.child(el.id).remove();
    });

    listEl.appendChild(row);
    rows.set(el.id, row);
  }

  row.classList.toggle("off", el.visible === false);
}

function updateCount() {
  countEl.textContent = state.size;
  emptyMsg.style.display = state.size === 0 ? "block" : "none";
}

/* ================================================================
 *  Tabs
 * ================================================================ */
document.querySelectorAll(".tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-body").forEach(function (b) { b.classList.remove("active"); });
    this.classList.add("active");
    document.getElementById("tab-" + this.dataset.tab).classList.add("active");
  });
});

/* ================================================================
 *  Agregar por URL
 * ================================================================ */
addUrlBtn.addEventListener("click", function () {
  var url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }
  pushElement(detectType(url), { url: url });
  urlInput.value = ""; typeHint.textContent = "---"; urlInput.focus();
});

urlInput.addEventListener("input", function () {
  var v = this.value.trim();
  typeHint.textContent = v ? detectType(v).charAt(0).toUpperCase() + detectType(v).slice(1) : "---";
});
urlInput.addEventListener("keydown", function (e) { if (e.key === "Enter") addUrlBtn.click(); });

/* ================================================================
 *  Subir archivo desde PC → Firebase Storage
 * ================================================================ */
dropZone.addEventListener("click", function () { fileInput.click(); });
dropZone.addEventListener("dragover", function (e) { e.preventDefault(); this.classList.add("dragover"); });
dropZone.addEventListener("dragleave", function () { this.classList.remove("dragover"); });
dropZone.addEventListener("drop", function (e) {
  e.preventDefault(); this.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", function () { handleFiles(this.files); this.value = ""; });

function handleFiles(files) {
  Array.from(files).forEach(function (file) {
    var item = document.createElement("div");
    item.className = "upload-item";
    item.innerHTML = '<span>' + file.name.slice(0, 20) + '</span><span>Subiendo...</span>';
    uploadList.prepend(item);

    var path = "streams/" + STREAM_ID + "/" + Date.now() + "_" + file.name;
    var ref = storage.ref().child(path);
    var upload = ref.put(file);

    upload.on("state_changed", null, function (err) {
      item.querySelector("span:last-child").className = "fail";
      item.querySelector("span:last-child").textContent = "Error";
    }, function () {
      upload.snapshot.ref.getDownloadURL().then(function (url) {
        var type = detectType(file.name);
        pushElement(type, { url: url });
        item.querySelector("span:last-child").className = "ok";
        item.querySelector("span:last-child").textContent = "Listo";
      });
    });
  });
}

/* ================================================================
 *  Agregar texto
 * ================================================================ */
addTextBtn.addEventListener("click", function () {
  var content = textInput.value.trim();
  if (!content) { textInput.focus(); return; }

  pushElement("text", {
    content: content,
    fontSize: parseInt(document.getElementById("text-size").value) || 48,
    fontColor: document.getElementById("text-color").value || "#ffffff",
    fontFamily: document.getElementById("text-font").value || "Arial, sans-serif",
    bgColor: document.getElementById("text-bg").value || "#000000",
    bgOpacity: parseInt(document.getElementById("text-bg-opacity").value) || 0,
    bold: document.getElementById("text-bold").checked,
    italic: document.getElementById("text-italic").checked
  });

  textInput.value = "";
});

textInput.addEventListener("keydown", function (e) { if (e.key === "Enter") addTextBtn.click(); });

/* ================================================================
 *  Pegar imagen del portapapeles (Ctrl+V)
 * ================================================================ */
document.addEventListener("paste", function (e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      var file = items[i].getAsFile();
      if (file) handleFiles([file]);
      break;
    }
  }
});

/* ================================================================
 *  Helper: crear elemento en Firebase
 * ================================================================ */
function pushElement(type, extra) {
  var id = roomRef.push().key;
  var defaults = { image: { w: 0.25, h: 0.25 }, video: { w: 0.35, h: 0.35 }, audio: { w: 0.15, h: 0.06 }, text: { w: 0.30, h: 0.08 } };
  var sz = defaults[type] || defaults.image;

  var data = {
    id: id,
    type: type,
    url: extra.url || "",
    x: r4(0.5 - sz.w / 2),
    y: r4(0.5 - sz.h / 2),
    w: r4(sz.w),
    h: r4(sz.h),
    visible: true,
    playing: true,
    volume: 0.8,
    z: ++zTop,
    createdAt: Date.now()
  };

  if (type === "text") {
    data.content = extra.content || "";
    data.fontSize = extra.fontSize || 48;
    data.fontColor = extra.fontColor || "#ffffff";
    data.fontFamily = extra.fontFamily || "Arial, sans-serif";
    data.bgColor = extra.bgColor || "#000000";
    data.bgOpacity = extra.bgOpacity || 0;
    data.bold = extra.bold || false;
    data.italic = extra.italic || false;
  }

  roomRef.child(id).set(data);
}

/* ================================================================
 *  Acciones globales
 * ================================================================ */
hideAllBtn.addEventListener("click", function () {
  var u = {}; state.forEach(function (el, id) { u[id + "/visible"] = false; });
  if (Object.keys(u).length) roomRef.update(u);
});

showAllBtn.addEventListener("click", function () {
  var u = {}; state.forEach(function (el, id) { u[id + "/visible"] = true; });
  if (Object.keys(u).length) roomRef.update(u);
});

clearAllBtn.addEventListener("click", function () {
  if (confirm("Eliminar TODOS los elementos?")) roomRef.remove();
});

/* ================================================================
 *  Editar elemento existente
 * ================================================================ */
var addSection = document.getElementById("add-section");
var editSection = document.getElementById("edit-section");

function startEditing(id) {
  var el = state.get(id);
  if (!el) return;
  editingId = id;
  addSection.style.display = "none";
  editSection.style.display = "";

  if (el.type === "text") {
    document.getElementById("edit-url-fields").style.display = "none";
    document.getElementById("edit-text-fields").style.display = "";
    document.getElementById("edit-text-input").value = el.content || "";
    document.getElementById("edit-text-size").value = el.fontSize || 48;
    document.getElementById("edit-text-color").value = el.fontColor || "#ffffff";
    document.getElementById("edit-text-font").value = el.fontFamily || "Arial, sans-serif";
    document.getElementById("edit-text-bg").value = el.bgColor || "#000000";
    document.getElementById("edit-text-bg-opacity").value = el.bgOpacity || 0;
    document.getElementById("edit-text-bold").checked = el.bold || false;
    document.getElementById("edit-text-italic").checked = el.italic || false;
  } else {
    document.getElementById("edit-text-fields").style.display = "none";
    document.getElementById("edit-url-fields").style.display = "";
    document.getElementById("edit-url-input").value = el.url || "";
  }
}

function stopEditing() {
  editingId = null;
  editSection.style.display = "none";
  addSection.style.display = "";
}

document.getElementById("edit-save").addEventListener("click", function () {
  if (!editingId) return;
  var el = state.get(editingId);
  if (!el) { stopEditing(); return; }

  if (el.type === "text") {
    roomRef.child(editingId).update({
      content: document.getElementById("edit-text-input").value,
      fontSize: parseInt(document.getElementById("edit-text-size").value) || 48,
      fontColor: document.getElementById("edit-text-color").value,
      fontFamily: document.getElementById("edit-text-font").value,
      bgColor: document.getElementById("edit-text-bg").value,
      bgOpacity: parseInt(document.getElementById("edit-text-bg-opacity").value) || 0,
      bold: document.getElementById("edit-text-bold").checked,
      italic: document.getElementById("edit-text-italic").checked
    });
  } else {
    var newUrl = document.getElementById("edit-url-input").value.trim();
    if (newUrl) {
      roomRef.child(editingId).update({ url: newUrl, type: detectType(newUrl) });
    }
  }
  stopEditing();
});

document.getElementById("edit-cancel").addEventListener("click", stopEditing);

/* ================================================================
 *  Listener Firebase
 * ================================================================ */
roomRef.on("value", function (snap) {
  var val = snap.val() || {};
  var ids = new Set(Object.keys(val));

  var toRemove = [];
  nodes.forEach(function (_, id) { if (!ids.has(id)) toRemove.push(id); });
  toRemove.forEach(removeNode);

  var maxZ = 0;
  for (var id in val) {
    var el = val[id];
    state.set(id, el);
    renderNode(el);
    renderRow(el);
    if ((el.z || 0) > maxZ) maxZ = el.z || 0;
  }
  zTop = maxZ;
  updateCount();
});

roomRef.on("child_removed", function (snap) { removeNode(snap.key); });

/* ── Conexion ── */
db.ref(".info/connected").on("value", function (snap) {
  var on = snap.val() === true;
  connDot.classList.toggle("on", on);
  connText.textContent = on ? "Conectado" : "Sin conexion";
});
