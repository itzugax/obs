/* ================================================================
 *  stream.js — Lienzo de OBS (v2)
 *  Renderiza overlays en tiempo real con fondo transparente.
 *  Soporta: imagenes, videos, audios, textos.
 * ================================================================ */

firebase.initializeApp(firebaseConfig);
var db = firebase.database();
var roomRef = db.ref("overlays/" + STREAM_ID + "/elements");
var stage = document.getElementById("stage");
var nodes = {};

/* ── Render overlay ── */
function renderOverlay(el) {
  var node = nodes[el.id];

  if (!node) {
    node = document.createElement("div");
    node.className = "ov";
    node.dataset.id = el.id;

    if (el.type === "text") {
      node.classList.add("text-only");
      node.textContent = el.content || "";
    } else if (el.type === "image") {
      var img = document.createElement("img");
      img.src = el.url;
      img.draggable = false;
      node.appendChild(img);
    } else if (el.type === "video") {
      var vid = document.createElement("video");
      vid.src = el.url;
      vid.loop = el.loop !== false;
      vid.playsInline = true;
      vid.preload = "auto";
      vid.muted = false;
      vid.volume = el.volume != null ? el.volume : 1;
      if (el.playing !== false) vid.play().catch(function () {});
      node.appendChild(vid);
    } else if (el.type === "audio") {
      node.classList.add("audio-only");
      var aud = document.createElement("audio");
      aud.src = el.url;
      aud.preload = "auto";
      aud.volume = el.volume != null ? el.volume : 1;
      if (el.playing !== false) aud.play().catch(function () {});
      node.appendChild(aud);
    }

    stage.appendChild(node);
    nodes[el.id] = node;

    /* Sin transicion en el primer frame */
    node.classList.add("no-trans");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        node.classList.remove("no-trans");
      });
    });
  }

  /* Posicion y tamano */
  node.style.left = (el.x * 100) + "%";
  node.style.top = (el.y * 100) + "%";
  node.style.width = (el.w * 100) + "%";
  node.style.height = (el.h * 100) + "%";
  node.style.zIndex = el.z || 0;

  /* Visibilidad */
  node.classList.toggle("inactive", el.visible === false);

  /* Opacidad */
  node.style.opacity = el.opacity != null ? el.opacity / 100 : 1;

  /* Estilos de texto */
  if (el.type === "text") {
    node.textContent = el.content || "";
    var _fs = (el.fontSize || 48) * Math.sqrt((el.w * el.h) / (0.30 * 0.08));
    node.style.fontSize = _fs + "px";
    node.style.color = el.fontColor || "#fff";
    node.style.fontFamily = el.fontFamily || "Arial, sans-serif";
    node.style.fontWeight = el.bold ? "bold" : "normal";
    node.style.fontStyle = el.italic ? "italic" : "normal";
    var alpha = Math.round(((el.bgOpacity || 0) / 100) * 255);
    var aHex = alpha.toString(16).padStart(2, "0");
    node.style.backgroundColor = (el.bgColor || "#000000") + aHex;
  }

  /* Sincronizar multimedia — pausa si oculto o en pausa */
  var media = node.querySelector("video, audio");
  if (media) {
    media.volume = el.volume != null ? el.volume : 1;
    if (el.visible === false || el.playing === false) {
      media.pause();
    } else {
      media.play().catch(function () {});
    }
  }
}

/* ── Eliminar nodo ── */
function removeOverlay(id) {
  var node = nodes[id];
  if (node) {
    var media = node.querySelector("video, audio");
    if (media) { media.pause(); media.src = ""; }
    node.remove();
    delete nodes[id];
  }
}

/* ── Listener Firebase ── */
roomRef.on("value", function (snap) {
  var val = snap.val() || {};
  var ids = new Set(Object.keys(val));

  for (var rid in nodes) {
    if (!ids.has(rid)) removeOverlay(rid);
  }

  for (var id in val) {
    renderOverlay(val[id]);
  }
});

roomRef.on("child_removed", function (snap) {
  removeOverlay(snap.key);
});
