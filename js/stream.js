/* === Control de UGAX - OBS Stream === */
(function() {
  var state = {};
  var _tid = null;
  var box = document.getElementById("stage") || document.getElementById("stream");
  if (!box) return;

  var streamId = (typeof STREAM_ID !== "undefined" && STREAM_ID) ? STREAM_ID : "sala-stream-demo";

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
    db.ref("streams/" + streamId + "/elements").on("value", function(snap) {
      state = snap.val() || {};
      clearTimeout(_tid);
      _tid = setTimeout(renderAll, 40);
    });
  } catch (e) {
    console.error("Firebase error:", e);
    box.innerHTML = '<div style="color:red;padding:20px;text-align:center">Error de conexion</div>';
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
        box.appendChild(d);
      }
      updLayer(d, el);
    }

    var els = box.querySelectorAll("[data-id]");
    for (var i = 0; i < els.length; i++) {
      if (!seen[els[i].getAttribute("data-id")]) els[i].remove();
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

  function updLayer(d, el) {
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
      var bgVal = "transparent";
      if (el.bgType === "solid" && el.bgColor) {
        bgVal = "rgba(" + hexToRgb(el.bgColor) + "," + ((el.bgOpacity || 0) / 100) + ")";
      }
      w.style.background = bgVal;
      w.style.color = "#ffffff";
      w.style.fontWeight = "bold";
      w.style.fontStyle = "normal";
      w.style.lineHeight = "1.2";
      w.style.textShadow = "3px 3px 8px rgba(0,0,0,0.9)";
      w.style.fontFamily = "'Comic Sans MS', 'Comic Sans', cursive";
      w.style.paintOrder = "stroke fill";
      var baseFs = el.fontSize || 56;
      var hRatio = (el.h || 0.08) / 0.08;
      var dynFs = Math.max(8, Math.min(Math.round(baseFs * hRatio), 600));
      w.style.fontSize = dynFs + "px";
      w.style.webkitTextStroke = "5px #000000";
      w.style.display = "flex";
      w.style.alignItems = "center";
      w.style.justifyContent = "center";
      w.style.textAlign = "center";
      w.style.wordWrap = "break-word";
      w.style.overflow = "hidden";
      w.style.padding = "4%";
      w.style.boxSizing = "border-box";
      if (!w.querySelector("span")) w.innerHTML = "<span></span>";
      w.querySelector("span").textContent = el.text || "";

    } else if (el.type === "audio") {
      w.style.display = "none"; // Audio is invisible in OBS overlay
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
      try {
        if (el.visible === false) {
          if (!aud.paused) aud.pause();
        } else if (aud.paused && aud.src) {
          aud.play().catch(function() {});
        }
      } catch (e) {}

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

  function hexToRgb(h) {
    if (!h || h.length < 7) return "0,0,0";
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    return r + "," + g + "," + b;
  }
})();
