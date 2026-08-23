/* === Control de UGAX - Panel === */
(function() {

  /* === State === */
  var state = {};
  var editingId = null;
  var selectedId = null;
  var POS_MAP = {};
  var roomRef = null;
  var db = null;
  var _interactingId = null;
  var _startState = null;

  /* === DOM refs === */
  var canvas, listEl, emptyEl, countEl, editSec, edName, dotEl, connTxt;

  /* === Init on DOM ready === */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    canvas = document.getElementById("canvas");
    listEl = document.getElementById("list");
    emptyEl = document.getElementById("empty-msg");
    countEl = document.getElementById("count");
    editSec = document.getElementById("edit-section");
    edName = document.getElementById("ed-name");
    dotEl = document.getElementById("dot");
    connTxt = document.getElementById("conn-txt");

    initTabs();
    initAddUrl();
    initAddText();
    initFileUpload();
    initToolbar();
    initCanvasEvents();
    initKeyboardEvents();
    initServices();
  }

  /* === Services (Firebase, Supabase, interact) === */
  function initServices() {
    var streamId = (typeof STREAM_ID !== "undefined" && STREAM_ID) ? STREAM_ID : "sala-stream-demo";
    var streamLbl = document.getElementById("stream-label");
    if (streamLbl) streamLbl.textContent = streamId;

    /* Firebase */
    if (typeof firebase !== "undefined") {
      try {
        var fbCfg = (typeof firebaseConfig !== "undefined" && firebaseConfig.apiKey) ? firebaseConfig : {
          apiKey: "AIzaSyCWePF8D8Bo9Y0C4Wlt2fH1Ne6rjtefP28",
          authDomain: "obss-1a2ae.firebaseapp.com",
          databaseURL: "https://obss-1a2ae-default-rtdb.firebaseio.com",
          projectId: "obss-1a2ae",
          storageBucket: "obss-1a2ae.firebasestorage.app",
          messagingSenderId: "273738937122",
          appId: "1:273738937122:web:639ec775a5c1ea62bd6b7b"
        };

        if (!firebase.apps || !firebase.apps.length) {
          firebase.initializeApp(fbCfg);
        }
        db = firebase.database();
        roomRef = db.ref("streams/" + streamId + "/elements");

        roomRef.on("value", function(snap) {
          state = snap.val() || {};
          render();
        });

        db.ref(".info/connected").on("value", function(snap) {
          var on = snap.val() === true;
          if (dotEl) dotEl.className = "dot" + (on ? " on" : "");
          if (connTxt) connTxt.textContent = on ? "Conectado papu" : "Desconectado :(";
        });
      } catch (e) {
        console.error("Firebase init error:", e);
        if (connTxt) connTxt.textContent = "Error Firebase";
      }
    } else {
      console.warn("Firebase SDK not loaded");
      if (connTxt) connTxt.textContent = "Sin Firebase — solo interfaz";
    }

    /* Supabase */
    if (typeof window.supabase !== "undefined" && window.supabase.createClient) {
      try {
        var suUrl = (typeof supabaseConfig !== "undefined" && supabaseConfig.url) ? supabaseConfig.url : "https://esccrtvcfssykpmltroz.supabase.co";
        var suKey = (typeof supabaseConfig !== "undefined" && supabaseConfig.anonKey) ? supabaseConfig.anonKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzY2NydHZjZnNzeWtwbWx0cm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDgzMzAsImV4cCI6MjA5NDUyNDMzMH0.3XonC_eNeaSsVC6_EHEPcPvtskt1PV3Gp8VMs_oR5wM";
        window._supabase = window.supabase.createClient(suUrl, suKey);
      } catch (e) {
        console.warn("Supabase init error:", e);
      }
    }

    /* interact.js */
    if (typeof interact !== "undefined") {
      try {
        initInteract();
      } catch (e) {
        console.warn("Interact init error:", e);
      }
    }
  }

  /* === Tabs === */
  function initTabs() {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      (function(t) {
        t.addEventListener("click", function() {
          for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove("active");
          var bodies = document.querySelectorAll(".tab-body");
          for (var j = 0; j < bodies.length; j++) bodies[j].classList.remove("active");
          t.classList.add("active");
          var target = document.getElementById(t.getAttribute("data-tab"));
          if (target) target.classList.add("active");
        });
      })(tabs[i]);
    }
  }

  /* === Add URL === */
  function initAddUrl() {
    var btn = document.getElementById("addUrl");
    if (!btn) return;
    btn.addEventListener("click", function() {
      var u = document.getElementById("urlIn").value.trim();
      if (!u) { alert("Pega una URL primero"); return; }
      var t = detectType(u);
      if (!t) { alert("No se pudo detectar tipo. Usa JPG, PNG, GIF, MP4, WEBM o MP3."); return; }
      if (!roomRef) { alert("Sin conexión a Firebase. Recarga la página."); return; }
      var id = roomRef.push().key;
      var base = {
        type: t, url: u, x: 0.1, y: 0.1, w: 0.35, h: 0.25,
        z: Date.now(), opacity: 100, visible: true,
        name: shortName(u), locked: false
      };
      if (t === "image") base.objectFit = "contain";
      if (t === "audio") { base.volume = 100; base.loop = false; base.w = 0.20; base.h = 0.08; }
      if (t === "video") { base.volume = 100; base.loop = false; base.objectFit = "contain"; }
      roomRef.child(id).set(base);
      document.getElementById("urlIn").value = "";
      selectRow(id);
      openEdit(id);
    });
  }

  /* === Add Text === */
  function initAddText() {
    var btn = document.getElementById("addTxt");
    if (!btn) return;
    btn.addEventListener("click", function() {
      var txt = document.getElementById("txtIn").value.trim();
      if (!txt) { alert("Escribe algo primero"); return; }
      if (!roomRef) { alert("Sin conexión a Firebase. Recarga la página."); return; }
      var id = roomRef.push().key;
      roomRef.child(id).set({
        type: "text",
        x: 0.1, y: 0.1, w: 0.40, h: 0.10,
        z: Date.now(), opacity: 100, visible: true,
        name: shortName(txt), locked: false,
        text: txt, fontSize: 56
      });
      document.getElementById("txtIn").value = "";
      selectRow(id);
      openEdit(id);
    });
  }

  /* === File Upload === */
  function initFileUpload() {
    var dropZone = document.getElementById("drop-zone");
    var fileIn = document.getElementById("fileIn");
    if (!dropZone || !fileIn) return;

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
  }

  function handleFiles(files) {
    var ul = document.getElementById("upload-list");
    var streamId = (typeof STREAM_ID !== "undefined" && STREAM_ID) ? STREAM_ID : "sala-stream-demo";

    for (var i = 0; i < files.length; i++) {
      (function(f) {
        var it = document.createElement("div");
        it.className = "upload-item";
        it.innerHTML = "<span>" + esc(f.name) + "</span><span class='ok'>Subiendo...</span>";
        ul.prepend(it);

        if (!window._supabase) {
          it.querySelector("span:last-child").className = "fail";
          it.querySelector("span:last-child").textContent = "Sin Supabase";
          return;
        }

        var ext = f.name.split(".").pop().toLowerCase();
        var path = streamId + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;

        window._supabase.storage.from("wasa").upload(path, f, { cacheControl: "3600", upsert: false })
          .then(function(up) {
            if (up.error) throw up.error;
            var pub = "https://esccrtvcfssykpmltroz.supabase.co/storage/v1/object/public/wasa/" + path;
            var t = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
            if (!roomRef) return;
            var id = roomRef.push().key;
            var base = {
              type: t, x: 0.1, y: 0.1, w: 0.35, h: 0.25,
              z: Date.now(), url: pub, name: shortName(f.name),
              opacity: 100, visible: true, locked: false
            };
            if (t === "image") base.objectFit = "contain";
            if (t === "audio") { base.volume = 100; base.loop = false; base.w = 0.20; base.h = 0.08; }
            if (t === "video") { base.volume = 100; base.loop = false; base.objectFit = "contain"; }
            roomRef.child(id).set(base);
            it.querySelector("span:last-child").className = "ok";
            it.querySelector("span:last-child").textContent = "Listo";
            selectRow(id);
            openEdit(id);
          })
          .catch(function(e) {
            it.querySelector("span:last-child").className = "fail";
            it.querySelector("span:last-child").textContent = "Error: " + (e.message || e);
            console.error("Upload error:", e);
          });
      })(files[i]);
    }
  }

  /* === Toolbar === */
  function initToolbar() {
    var tbAdd = document.getElementById("tb-add");
    var tbDel = document.getElementById("tb-del");
    var tbUp = document.getElementById("tb-up");
    var tbDown = document.getElementById("tb-down");

    if (tbAdd) tbAdd.addEventListener("click", function() {
      var tab = document.querySelector('[data-tab="tab-url"]');
      if (tab) tab.click();
      var inp = document.getElementById("urlIn");
      if (inp) inp.focus();
    });

    if (tbDel) tbDel.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero"); return; }
      if (confirm("¿Eliminar capa seleccionada?")) {
        if (roomRef) roomRef.child(selectedId).remove();
        if (editingId === selectedId) closeEdit();
        selectedId = null;
      }
    });

    if (tbUp) tbUp.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero"); return; }
      bringToFront(selectedId);
    });

    if (tbDown) tbDown.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero"); return; }
      sendToBack(selectedId);
    });
  }

  function bringToFront(id) {
    if (!roomRef) return;
    var mx = 0;
    var keys = Object.keys(state);
    for (var i = 0; i < keys.length; i++) {
      var z = state[keys[i]].z || 0;
      if (z > mx) mx = z;
    }
    roomRef.child(id).update({ z: mx + 1 });
  }

  function sendToBack(id) {
    if (!roomRef) return;
    var mn = Infinity;
    var keys = Object.keys(state);
    for (var i = 0; i < keys.length; i++) {
      var z = state[keys[i]].z || 0;
      if (z < mn) mn = z;
    }
    roomRef.child(id).update({ z: mn - 1 });
  }

  /* === Canvas & Keyboard Events === */
  function initCanvasEvents() {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", function(e) {
      var elNode = e.target.closest(".el");
      if (elNode) {
        var id = elNode.getAttribute("data-id");
        if (id && id !== selectedId) {
          selectRow(id);
          openEdit(id);
        }
      } else {
        // Clicked outside elements
        selectRow(null);
        closeEdit();
      }
    });
  }

  function initKeyboardEvents() {
    document.addEventListener("keydown", function(e) {
      if (e.target.matches("input, textarea, select")) return;
      if (!selectedId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (confirm("¿Eliminar capa seleccionada?")) {
          var toDel = selectedId;
          if (roomRef) roomRef.child(toDel).remove();
          if (editingId === toDel) closeEdit();
          selectedId = null;
        }
      } else if (e.key === "Escape") {
        selectRow(null);
        closeEdit();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        var step = e.shiftKey ? 0.02 : 0.005;
        var cur = POS_MAP[selectedId];
        if (!cur || !state[selectedId] || state[selectedId].locked) return;
        var nx = cur.x || 0;
        var ny = cur.y || 0;
        var nw = cur.w || 0.3;
        var nh = cur.h || 0.08;

        if (e.key === "ArrowLeft") nx = Math.max(0, nx - step);
        if (e.key === "ArrowRight") nx = Math.min(1 - nw, nx + step);
        if (e.key === "ArrowUp") ny = Math.max(0, ny - step);
        if (e.key === "ArrowDown") ny = Math.min(1 - nh, ny + step);

        POS_MAP[selectedId].x = nx;
        POS_MAP[selectedId].y = ny;
        var cel = canvas.querySelector('[data-id="' + selectedId + '"]');
        if (cel) {
          cel.style.left = (nx * 100) + "%";
          cel.style.top = (ny * 100) + "%";
        }
        if (editingId === selectedId) syncEdit();
        if (roomRef) roomRef.child(selectedId).update({ x: nx, y: ny });
      }
    });
  }

  /* === Firebase Throttled Update === */
  var _wTimers = {};
  function fbUpdate(id, data) {
    if (!roomRef) return;
    clearTimeout(_wTimers[id]);
    _wTimers[id] = setTimeout(function() {
      roomRef.child(id).update(data);
    }, 25);
  }

  /* === interact.js Setup with Anchor-based Resizing === */
  function initInteract() {
    interact("#canvas .el")
      .draggable({
        ignoreFrom: ".resize-handle",
        listeners: {
          start: function(e) {
            var id = e.target.getAttribute("data-id");
            _interactingId = id;
            if (id && id !== selectedId) {
              selectRow(id);
              openEdit(id);
            }
          },
          move: function(e) {
            var id = e.target.getAttribute("data-id");
            if (!id || !state[id] || state[id].locked) return;
            var r = canvas.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;

            var dx = e.dx / r.width;
            var dy = e.dy / r.height;
            var nw = (POS_MAP[id] && POS_MAP[id].w) || 0.3;
            var nh = (POS_MAP[id] && POS_MAP[id].h) || 0.08;
            var nx = ((POS_MAP[id] && POS_MAP[id].x) || 0) + dx;
            var ny = ((POS_MAP[id] && POS_MAP[id].y) || 0) + dy;

            nx = Math.max(0, Math.min(1 - nw, nx));
            ny = Math.max(0, Math.min(1 - nh, ny));

            if (!POS_MAP[id]) POS_MAP[id] = {};
            POS_MAP[id].x = nx;
            POS_MAP[id].y = ny;

            e.target.style.left = (nx * 100) + "%";
            e.target.style.top = (ny * 100) + "%";
            if (editingId === id) syncEdit();
            fbUpdate(id, { x: nx, y: ny });
          },
          end: function(e) {
            var id = e.target.getAttribute("data-id");
            _interactingId = null;
            clearTimeout(_wTimers[id]);
            if (id && POS_MAP[id] && roomRef) {
              roomRef.child(id).update({ x: POS_MAP[id].x, y: POS_MAP[id].y });
            }
          }
        }
      })
      .resizable({
        edges: {
          top: ".resize-n, .resize-nw, .resize-ne",
          bottom: ".resize-s, .resize-sw, .resize-se",
          left: ".resize-w, .resize-nw, .resize-sw",
          right: ".resize-e, .resize-ne, .resize-se"
        },
        listeners: {
          start: function(e) {
            var id = e.target.getAttribute("data-id");
            _interactingId = id;
            if (id && id !== selectedId) {
              selectRow(id);
              openEdit(id);
            }
            var cur = POS_MAP[id] || { x: 0.1, y: 0.1, w: 0.3, h: 0.08 };
            _startState = {
              x: cur.x || 0,
              y: cur.y || 0,
              w: cur.w || 0.3,
              h: cur.h || 0.08,
              right: (cur.x || 0) + (cur.w || 0.3),
              bottom: (cur.y || 0) + (cur.h || 0.08),
              clientX: e.clientX,
              clientY: e.clientY,
              aspect: (cur.w || 0.3) / Math.max(0.001, cur.h || 0.08)
            };
            e.target.classList.add("resizing");
          },
          move: function(e) {
            var id = e.target.getAttribute("data-id");
            if (!id || !state[id] || state[id].locked || !_startState) return;
            var cr = canvas.getBoundingClientRect();
            if (cr.width <= 0 || cr.height <= 0) return;

            var dx = (e.clientX - _startState.clientX) / cr.width;
            var dy = (e.clientY - _startState.clientY) / cr.height;

            var minW = 0.02;
            var minH = 0.02;

            var x = _startState.x;
            var y = _startState.y;
            var w = _startState.w;
            var h = _startState.h;

            /* X & Width calculation */
            if (e.edges.right) {
              w = Math.max(minW, Math.min(1 - _startState.x, _startState.w + dx));
            } else if (e.edges.left) {
              var newX = Math.max(0, Math.min(_startState.right - minW, _startState.x + dx));
              w = _startState.right - newX;
              x = newX;
            }

            /* Y & Height calculation */
            if (e.edges.bottom) {
              h = Math.max(minH, Math.min(1 - _startState.y, _startState.h + dy));
            } else if (e.edges.top) {
              var newY = Math.max(0, Math.min(_startState.bottom - minH, _startState.y + dy));
              h = _startState.bottom - newY;
              y = newY;
            }

            /* Proportional Aspect Ratio when Shift is held on corners */
            var isCorner = (e.edges.left || e.edges.right) && (e.edges.top || e.edges.bottom);
            if (e.shiftKey && isCorner && _startState.aspect > 0) {
              var candidateH = w / _startState.aspect;
              if (e.edges.top && _startState.bottom - candidateH < 0) {
                candidateH = _startState.bottom;
                w = candidateH * _startState.aspect;
              } else if (e.edges.bottom && _startState.y + candidateH > 1) {
                candidateH = 1 - _startState.y;
                w = candidateH * _startState.aspect;
              }
              h = candidateH;
              if (e.edges.left) x = _startState.right - w;
              if (e.edges.top) y = _startState.bottom - h;
            }

            POS_MAP[id] = { x: x, y: y, w: w, h: h };
            e.target.style.left = (x * 100) + "%";
            e.target.style.top = (y * 100) + "%";
            e.target.style.width = (w * 100) + "%";
            e.target.style.height = (h * 100) + "%";

            // If text element, update font size immediately during resize
            if (state[id] && state[id].type === "text") {
              updateTextSize(e.target, state[id], h);
            }

            if (editingId === id) syncEdit();
            fbUpdate(id, { x: x, y: y, w: w, h: h });
          },
          end: function(e) {
            var id = e.target.getAttribute("data-id");
            _interactingId = null;
            _startState = null;
            e.target.classList.remove("resizing");
            clearTimeout(_wTimers[id]);
            if (id && POS_MAP[id] && roomRef) {
              roomRef.child(id).update({
                x: POS_MAP[id].x, y: POS_MAP[id].y,
                w: POS_MAP[id].w, h: POS_MAP[id].h
              });
            }
          }
        }
      });
  }

  /* === Render Canvas Elements === */
  function render() {
    var keys = Object.keys(state);
    keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
    countEl.textContent = keys.length;
    emptyEl.style.display = keys.length ? "none" : "block";

    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      seen[keys[i]] = 1;
      upsertEl(keys[i], state[keys[i]]);
    }
    var els = canvas.querySelectorAll(".el");
    for (var i = 0; i < els.length; i++) {
      if (!seen[els[i].getAttribute("data-id")]) els[i].remove();
    }

    renderList(keys);
  }

  function upsertEl(id, el) {
    if (id === _interactingId) return;
    var d = canvas.querySelector('[data-id="' + id + '"]');
    if (!d) {
      d = mkDiv(el);
      d.setAttribute("data-id", id);
      canvas.appendChild(d);
    }

    var cls = "el";
    if (el.visible === false) cls += " hidden-el";
    if (el.type === "audio") cls += " is-audio";
    if (el.type === "text") cls += " is-text";
    if (selectedId === id) cls += " selected";
    d.className = cls;

    d.style.pointerEvents = el.locked ? "none" : "";
    POS_MAP[id] = { x: el.x, y: el.y, w: el.w, h: el.h };
    d.style.left = (el.x * 100) + "%";
    d.style.top = (el.y * 100) + "%";
    d.style.width = (el.w * 100) + "%";
    d.style.height = (el.h * 100) + "%";
    d.style.opacity = (el.opacity != null ? el.opacity : 100) / 100;
    d.style.zIndex = el.z || 0;

    var tagEl = d.querySelector(".tag");
    if (tagEl) tagEl.textContent = (el.type === "image" || el.type === "video") ? (el.name || "") : "";

    var wrap = d.querySelector(".media-wrap");
    var txtEl = wrap.querySelector(".txt-content");
    var audEl = wrap.querySelector(".audio-badge");
    var imgEl = wrap.querySelector("img");
    var vidEl = wrap.querySelector("video");

    if (el.type === "text") {
      if (txtEl) txtEl.style.display = "";
      if (audEl) audEl.style.display = "none";
      if (imgEl) imgEl.style.display = "none";
      if (vidEl) vidEl.style.display = "none";

      var bgVal = "transparent";
      if (el.bgType === "solid" && el.bgColor) {
        bgVal = "rgba(" + hexToRgb(el.bgColor) + "," + ((el.bgOpacity || 0) / 100) + ")";
      }
      wrap.style.background = bgVal;
      wrap.style.color = "#ffffff";
      wrap.style.fontWeight = "bold";
      wrap.style.fontStyle = "normal";
      wrap.style.lineHeight = "1.2";
      wrap.style.textShadow = "2px 2px 6px rgba(0,0,0,0.9)";
      wrap.style.fontFamily = "'Comic Sans MS', 'Comic Sans', cursive";
      wrap.style.paintOrder = "stroke fill";
      updateTextSize(d, el, el.h || 0.08);
      if (txtEl) txtEl.textContent = el.text || "";

    } else if (el.type === "audio") {
      if (txtEl) txtEl.style.display = "none";
      if (audEl) audEl.style.display = "";
      if (imgEl) imgEl.style.display = "none";
      if (vidEl) vidEl.style.display = "none";
      wrap.style.background = "linear-gradient(135deg, #1e293b, #0f172a)";

    } else {
      if (txtEl) txtEl.style.display = "none";
      if (audEl) audEl.style.display = "none";
      wrap.style.background = "";
      var src = el.url || "";

      if (el.type === "image") {
        if (vidEl) vidEl.style.display = "none";
        if (!imgEl) {
          imgEl = document.createElement("img");
          imgEl.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;pointer-events:none";
          wrap.appendChild(imgEl);
        }
        imgEl.style.display = "";
        if (imgEl.src !== src) imgEl.src = src;

      } else if (el.type === "video") {
        if (imgEl) imgEl.style.display = "none";
        if (!vidEl) {
          vidEl = document.createElement("video");
          vidEl.muted = true;
          vidEl.autoplay = true;
          vidEl.playsInline = true;
          vidEl.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;pointer-events:none";
          wrap.appendChild(vidEl);
        }
        vidEl.style.display = "";
        if (vidEl.src !== src) vidEl.src = src;
        vidEl.loop = !!el.loop;
        vidEl.style.objectFit = el.objectFit || "contain";
        try {
          if (el.visible === false) { if (!vidEl.paused) vidEl.pause(); }
          else if (vidEl.paused && vidEl.src) { vidEl.play().catch(function() {}); }
        } catch (e) {}
      }
    }
  }

  function updateTextSize(elDom, elData, hVal) {
    var wrap = elDom.querySelector(".media-wrap");
    if (!wrap) return;
    var ch = canvas.clientHeight || 360;
    var baseFs = elData.fontSize || 56;
    // Scale proportional to preview canvas height vs 1080p stream
    var scaledFs = (baseFs / 1080) * ch * ((hVal || 0.08) / 0.08);
    var dynFs = Math.max(8, Math.min(Math.round(scaledFs), 300));
    wrap.style.fontSize = dynFs + "px";
    var strokeW = Math.max(1, Math.round(5 * (ch / 1080)));
    wrap.style.webkitTextStroke = strokeW + "px #000000";
  }

  function mkDiv(el) {
    var d = document.createElement("div");
    var tagText = (el.type === "image" || el.type === "video") ? (el.name || "") : "";
    d.innerHTML =
      '<div class="resize-handle resize-nw" title="Redimensionar esquina"></div>' +
      '<div class="resize-handle resize-n" title="Redimensionar arriba"></div>' +
      '<div class="resize-handle resize-ne" title="Redimensionar esquina"></div>' +
      '<div class="resize-handle resize-e" title="Redimensionar derecha"></div>' +
      '<div class="resize-handle resize-se" title="Redimensionar esquina"></div>' +
      '<div class="resize-handle resize-s" title="Redimensionar abajo"></div>' +
      '<div class="resize-handle resize-sw" title="Redimensionar esquina"></div>' +
      '<div class="resize-handle resize-w" title="Redimensionar izquierda"></div>' +
      '<div class="media-wrap">' +
      '<span class="tag">' + esc(tagText) + '</span>' +
      '<span class="txt-content" style="display:none"></span>' +
      '<div class="audio-badge" style="display:none">&#127925;</div>' +
      '</div>';
    return d;
  }

  /* === Source List in Sidebar === */
  function renderList(keys) {
    var existing = {};
    var rows = listEl.querySelectorAll(".row");
    for (var i = 0; i < rows.length; i++) {
      existing[rows[i].getAttribute("data-id")] = rows[i];
    }

    var fragment = document.createDocumentFragment();
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var el = state[id];
      var r = existing[id];
      if (!r) r = mkRow(id, el);
      upRow(r, id, el);
      fragment.appendChild(r);
    }

    var eids = Object.keys(existing);
    for (var i = 0; i < eids.length; i++) {
      if (!state[eids[i]]) existing[eids[i]].remove();
    }

    listEl.appendChild(fragment);
  }

  function mkRow(id, el) {
    var r = document.createElement("div");
    r.className = "row";
    r.setAttribute("data-id", id);
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
      if (cur && roomRef) {
        roomRef.child(id).update({ visible: cur.visible === false });
      }
    });

    r.querySelector(".edit-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      selectRow(id);
      openEdit(id);
    });

    r.querySelector(".del-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      if (confirm("¿Eliminar esta capa?")) {
        if (roomRef) roomRef.child(id).remove();
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

    if (el.visible === false) r.classList.add("off");
    else r.classList.remove("off");

    if (selectedId === id) r.classList.add("selected");
    else r.classList.remove("selected");
  }

  function selectRow(id) {
    selectedId = id;
    var rows = listEl.querySelectorAll(".row");
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove("selected");
    if (id) {
      var row = listEl.querySelector('[data-id="' + id + '"]');
      if (row) row.classList.add("selected");
    }
    var allEl = canvas.querySelectorAll(".el");
    for (var i = 0; i < allEl.length; i++) allEl[i].classList.remove("selected");
    if (id) {
      var cel = canvas.querySelector('[data-id="' + id + '"]');
      if (cel) cel.classList.add("selected");
    }
  }

  /* === Edit Panel === */
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
        '<div class="edit-group"><label>Texto</label>' +
        '<input type="text" id="ed-text" value="' + esc2(el.text || "") + '"></div>';

      setTimeout(function() {
        bindInput("ed-text", "text");
      }, 50);
    }

    if (el.type === "audio" || el.type === "video") {
      mf.innerHTML =
        '<div class="edit-group"><label>Volumen</label>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<input type="range" id="ed-volume" min="0" max="100" value="' + (el.volume != null ? el.volume : 100) + '" style="flex:1">' +
        '<span id="ed-volume-val" style="font-size:12px;width:32px;text-align:right;font-weight:600">' + (el.volume != null ? el.volume : 100) + '</span>' +
        '</div></div>' +
        '<div class="check-row"><label><input type="checkbox" id="ed-loop"' + (el.loop ? " checked" : "") + '> Repetir en bucle</label></div>';

      setTimeout(function() {
        bindRange("ed-volume", "volume");
        var loopEl = document.getElementById("ed-loop");
        if (loopEl) loopEl.addEventListener("change", function() {
          if (roomRef) roomRef.child(id).update({ loop: loopEl.checked });
        });
      }, 50);
    }

    document.getElementById("ed-opacity").value = el.opacity != null ? el.opacity : 100;
    document.getElementById("ed-opacity-val").textContent = el.opacity != null ? el.opacity : 100;
    document.getElementById("ed-opacity").oninput = function() {
      var v = parseInt(document.getElementById("ed-opacity").value);
      if (roomRef) roomRef.child(id).update({ opacity: v });
      document.getElementById("ed-opacity-val").textContent = v;
    };

    document.getElementById("ed-x").value = (el.x || 0).toFixed(3);
    document.getElementById("ed-y").value = (el.y || 0).toFixed(3);
    document.getElementById("ed-w").value = (el.w || 0.3).toFixed(3);
    document.getElementById("ed-h").value = (el.h || 0.08).toFixed(3);

    var edIds = ["ed-x", "ed-y", "ed-w", "ed-h"];
    for (var i = 0; i < edIds.length; i++) {
      (function(k) {
        var inp = document.getElementById(k);
        inp.oninput = function() {
          var key = k.replace("ed-", "");
          var val = parseFloat(inp.value);
          if (isNaN(val)) return;
          var obj = {};
          obj[key] = val;
          if (!POS_MAP[id]) POS_MAP[id] = {};
          POS_MAP[id][key] = val;
          var cel = canvas.querySelector('[data-id="' + id + '"]');
          if (cel) {
            if (key === "x") cel.style.left = (val * 100) + "%";
            if (key === "y") cel.style.top = (val * 100) + "%";
            if (key === "w") cel.style.width = (val * 100) + "%";
            if (key === "h") {
              cel.style.height = (val * 100) + "%";
              if (el.type === "text") updateTextSize(cel, el, val);
            }
          }
          if (roomRef) roomRef.child(id).update(obj);
        };
      })(edIds[i]);
    }

    document.getElementById("ed-del").onclick = function() {
      if (confirm("¿Eliminar esta capa?")) {
        if (roomRef) roomRef.child(id).remove();
        closeEdit();
        if (selectedId === id) selectedId = null;
      }
    };

    selectRow(id);
  }

  function closeEdit() {
    editingId = null;
    editSec.style.display = "none";
  }

  function syncEdit() {
    if (!editingId) return;
    var pos = POS_MAP[editingId];
    if (!pos) return;
    document.getElementById("ed-x").value = (pos.x || 0).toFixed(3);
    document.getElementById("ed-y").value = (pos.y || 0).toFixed(3);
    document.getElementById("ed-w").value = (pos.w || 0.3).toFixed(3);
    document.getElementById("ed-h").value = (pos.h || 0.08).toFixed(3);
  }

  function bindInput(eid, key, isNum) {
    var e = document.getElementById(eid);
    if (!e) return;
    e.addEventListener("input", function() {
      if (!editingId || !roomRef) return;
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
      if (!editingId || !roomRef) return;
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
    if (/\.(mp4|webm|mov|mkv|avi|m4v)($|\?)/.test(s)) return "video";
    if (/\.(mp3|ogg|wav|flac|aac|opus|m4a)($|\?)/.test(s)) return "audio";
    if (s.includes("imgur.com") || s.includes("images.") || s.includes("giphy.com") || s.includes("tenor.com")) return "image";
    if (s.includes("youtube.com") || s.includes("youtu.be") || s.includes("vimeo.com")) return "video";
    return null;
  }

  function shortName(n) {
    return (n || "").split("/").pop().split("?")[0].substring(0, 30);
  }

  function esc(s) {
    var d = document.createElement("span");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function esc2(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function hexToRgb(h) {
    if (!h || h.length < 7) return "0,0,0";
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    return r + "," + g + "," + b;
  }

})();
