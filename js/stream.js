(function() {
  document.addEventListener("contextmenu", function(e) { e.preventDefault(); return false; });
  document.addEventListener("keydown", function(e) {
    if (e.key === "F12" || e.keyCode === 123) { e.preventDefault(); return false; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) { e.preventDefault(); return false; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U" || e.key === "s" || e.key === "S")) { e.preventDefault(); return false; }
  });

  var state = {};
  var _tid = null;
  var _lastTriggers = {};
  var box = document.getElementById("stage") || document.getElementById("stream");
  if (!box) return;

  var urlParams = new URLSearchParams(window.location.search);
  var rawRoom = urlParams.get("room") || (typeof STREAM_ID !== "undefined" && STREAM_ID) || "sala-stream-demo";
  var streamId = rawRoom.startsWith("sala-") ? rawRoom : ("sala-" + rawRoom);

  /* Firebase */
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
    var db = firebase.database();
    
    // Enable offline persistence/cache for real-time updates
    try {
      db.ref("streams/" + streamId + "/elements").keepSynced(true);
      db.ref("streams/" + streamId + "/sfx").keepSynced(true);
    } catch(e) {}

    // Elements listener (Instant 8ms render response)
    db.ref("streams/" + streamId + "/elements").on("value", function(snap) {
      state = snap.val() || {};
      clearTimeout(_tid);
      _tid = setTimeout(renderAll, 8);
    });

    // Stream Presence Heartbeat
    var presenceRef = db.ref("streams/" + streamId + "/presence/obs");
    presenceRef.set(Date.now());
    presenceRef.onDisconnect().remove();
    setInterval(function() {
      presenceRef.set(Date.now());
    }, 4000);

    // Instant Meme / Reaction Soundboard Player (No layers created)
    var _lastSfxTs = Date.now();
    db.ref("streams/" + streamId + "/sfx").on("value", function(snap) {
      var data = snap.val();
      if (!data || !data.url || !data.ts) return;
      if (data.ts <= _lastSfxTs || (Date.now() - data.ts) > 15000) return;
      _lastSfxTs = data.ts;

      try {
        var a = new Audio(data.url);
        a.volume = 1.0;
        a.play().catch(function(err) {
          console.warn("SFX play error:", err);
        });
      } catch (e) {
        console.error("SFX error:", e);
      }
    });

    // Instant TTS (Text-to-Speech) Stream Voice Output
    var _lastTtsTs = Date.now();
    db.ref("streams/" + streamId + "/tts").on("value", function(snap) {
      var data = snap.val();
      if (!data || !data.text || !data.ts) return;
      if (data.ts <= _lastTtsTs || (Date.now() - data.ts) > 15000) return;
      _lastTtsTs = data.ts;

      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          var utt = new SpeechSynthesisUtterance(data.text);
          utt.lang = 'es-ES';
          utt.rate = 1.0;
          utt.pitch = 1.0;
          var voices = window.speechSynthesis.getVoices();
          var esVoice = voices.find(function(v) { return v.lang && v.lang.startsWith('es'); });
          if (esVoice) utt.voice = esVoice;
          window.speechSynthesis.speak(utt);
        }
      } catch (e) {
        console.warn("TTS stream error:", e);
      }
    });

  } catch (e) {
    console.error("Firebase error:", e);
    box.innerHTML = '<div style="color:red;padding:20px;text-align:center">Error de conexión al servidor de streaming</div>';
    return;
  }

  function renderAll() {
    var keys = Object.keys(state);
    keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
    var seen = {};

    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      seen[id] = 1;
      var el = state[id];
      var d = box.querySelector('[data-id="' + id + '"]');
      if (!d) {
        d = makeLayer();
        d.setAttribute("data-id", id);
      }
      updLayer(d, id, el);
      box.appendChild(d); // Strictly re-append in z-index ascending order
    }

    var els = box.querySelectorAll("[data-id]");
    for (var i = 0; i < els.length; i++) {
      var eid = els[i].getAttribute("data-id");
      if (!seen[eid]) {
        els[i].remove();
        delete _lastTriggers[eid];
      }
    }
  }

  function makeLayer() {
    var d = document.createElement("div");
    d.style.position = "absolute";
    d.style.overflow = "hidden";
    d.style.left = "0%";
    d.style.top = "0%";
    d.style.width = "30%";
    d.style.height = "8%";
    var inner = document.createElement("div");
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.position = "relative";
    d.appendChild(inner);
    return d;
  }

  function updLayer(d, id, el) {
    d.style.left = (el.x * 100) + "%";
    d.style.top = (el.y * 100) + "%";
    d.style.width = (el.w * 100) + "%";
    d.style.height = (el.h * 100) + "%";
    d.style.opacity = (el.opacity != null ? el.opacity : 100) / 100;
    d.style.zIndex = el.z || 0;
    d.style.display = (el.visible === false) ? "none" : "";

    var w = d.children[0];
    if (!w) return;

    if (el.type === "text") {
      d.style.overflow = "visible";
      w.style.overflow = "visible";
      w.style.whiteSpace = "nowrap";
      w.style.wordWrap = "normal";
      w.style.padding = "0";
      w.style.margin = "0";
      w.style.boxSizing = "border-box";

      var bgVal = "transparent";
      if (el.bgType === "solid" && el.bgColor) {
        bgVal = "rgba(" + hexToRgb(el.bgColor) + "," + ((el.bgOpacity != null ? el.bgOpacity : 100) / 100) + ")";
      }
      w.style.background = bgVal;
      w.style.color = el.textColor || "#ffffff";
      w.style.fontWeight = "bold";
      w.style.fontStyle = "normal";
      w.style.lineHeight = "1";
      w.style.textShadow = "3px 3px 8px rgba(0,0,0,0.9)";
      w.style.fontFamily = el.fontFamily || "'Comic Sans MS', 'Comic Sans', cursive";
      w.style.paintOrder = "stroke fill";
      var boxW = (el.w || 0.3) * 1920;
      var boxH = (el.h || 0.08) * 1080;
      var text = el.text || "";
      var len = Math.max(1, text.length);

      var maxFsByH = boxH * 0.90;
      var maxFsByW = (boxW * 0.98) / (len * 0.58);
      var baseFs = Math.max(10, Math.min(maxFsByH, maxFsByW));
      var userScale = (el.fontSize || 56) / 56;
      var dynFs = Math.max(10, Math.round(baseFs * userScale));

      w.style.fontSize = dynFs + "px";
      var strokeW = Math.max(2, Math.round(dynFs * 0.07));
      w.style.webkitTextStroke = strokeW + "px " + (el.strokeColor || "#000000");
      w.style.display = "flex";
      w.style.alignItems = "center";
      w.style.justifyContent = "center";
      w.style.textAlign = "center";
      if (!w.querySelector("span")) w.innerHTML = "<span></span>";
      w.querySelector("span").textContent = el.text || "";

    } else if (el.type === "audio") {
      w.style.display = "none";
      var aud = w.querySelector("audio");
      if (!aud) {
        aud = document.createElement("audio");
        aud.style.display = "none";
        w.appendChild(aud);
      }
      var src = el.url || "";
      if (aud.src !== src) aud.src = src;
      aud.loop = !!el.loop;
      aud.volume = (el.volume != null ? el.volume : 100) / 100;

      // Handle Replay Trigger
      if (el.playTrigger && el.playTrigger !== _lastTriggers[id]) {
        _lastTriggers[id] = el.playTrigger;
        try {
          aud.currentTime = 0;
          aud.play().catch(function() {});
        } catch (e) {}
      } else {
        try {
          if (el.visible === false) {
            if (!aud.paused) aud.pause();
          } else if (aud.paused && aud.src && !aud.ended) {
            aud.play().catch(function() {});
          }
        } catch (e) {}
      }

    } else {
      var src = el.url || "";
      if (el.type === "image") {
        var img = w.querySelector("img");
        if (!img) {
          img = document.createElement("img");
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = el.objectFit || "contain";
          img.style.display = "block";
          w.appendChild(img);
        }
        if (img.src !== src) img.src = src;
        img.style.objectFit = el.objectFit || "contain";

      } else if (el.type === "video") {
        var vid = w.querySelector("video");
        if (!vid) {
          vid = document.createElement("video");
          vid.muted = false;
          vid.autoplay = true;
          vid.playsInline = true;
          vid.style.width = "100%";
          vid.style.height = "100%";
          vid.style.objectFit = el.objectFit || "contain";
          vid.style.display = "block";
          w.appendChild(vid);
        }
        if (vid.src !== src) vid.src = src;
        vid.loop = !!el.loop;
        vid.volume = (el.volume != null ? el.volume : 100) / 100;
        vid.style.objectFit = el.objectFit || "contain";

        // Handle Replay Trigger
        if (el.playTrigger && el.playTrigger !== _lastTriggers[id]) {
          _lastTriggers[id] = el.playTrigger;
          try {
            vid.currentTime = 0;
            vid.play().catch(function() {});
          } catch (e) {}
        } else {
          try {
            if (el.visible === false) {
              if (!vid.paused) vid.pause();
            } else if (vid.paused && vid.src && !vid.ended) {
              vid.play().catch(function() {});
            }
          } catch (e) {}
        }
      }
    }
  }

  function hexToRgb(h) {
    if (!h || h.length < 7) return "0,0,0";
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    return r + "," + g + "," + b;
  }
})();
