/* === Control de UGAX - Panel de Moderación === */
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
  var _localAudio = null;
  var streamId = "sala-stream-demo";

  /* Current User Profile */
  var _currentUser = {
    uid: "guest-" + Math.floor(Math.random() * 8999 + 1000),
    name: localStorage.getItem("ugax_user") || "",
    photoURL: localStorage.getItem("ugax_user_photo") || ""
  };

  /* === DOM refs === */
  var canvas, listEl, emptyEl, countEl, editSec, edTitleType, edNameInput, dotEl, connTxt, obsBadge, pingBadge;

  /* === Init on DOM ready === */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLobby);
  } else {
    initLobby();
  }

  /* ============================================
     LOBBY / PIN GATEKEEPER & AUTH
     ============================================ */
  function initLobby() {
    var lobbyScreen = document.getElementById("lobby-screen");
    var appWrapper = document.getElementById("app-wrapper");
    var form = document.getElementById("lobby-form");
    var btnEnter = document.getElementById("btn-enter-room");
    var inUser = document.getElementById("lobby-user");
    var inPin = document.getElementById("lobby-pin");
    var digits = Array.from(document.querySelectorAll(".room-digit"));

    // Add error element
    var lobbyCard = document.querySelector(".lobby-card");
    var errEl = document.createElement("p");
    errEl.className = "lobby-error";
    if (lobbyCard && btnEnter) lobbyCard.appendChild(errEl);

    // Initialize Social Auth (Google / Discord) & Modals
    initSocialAuth();
    initModals();
    renderRecentRooms(digits);

    // === F5 Session Persistence Check ===
    var activeSessionStr = sessionStorage.getItem("ugax_active_session");
    if (activeSessionStr) {
      try {
        var sess = JSON.parse(activeSessionStr);
        if (sess && sess.room && sess.user) {
          _currentUser.name = sess.user;
          if (sess.photo) _currentUser.photoURL = sess.photo;
          streamId = sess.room;
          if (lobbyScreen) lobbyScreen.style.display = "none";
          if (appWrapper) appWrapper.style.display = "flex";
          initApp(sess.user);
          return;
        }
      } catch (e) {}
    }

    // Pre-fill nickname
    if (inUser) inUser.value = _currentUser.name;

    // Pre-fill room code from last session or URL
    var lastRoom = new URLSearchParams(window.location.search).get("room") || localStorage.getItem("ugax_last_room") || "";
    if (/^\d{6}$/.test(lastRoom) && digits.length === 6) {
      lastRoom.split("").forEach(function(d, i) { digits[i].value = d; });
    }

    // === Digit box keyboard navigation ===
    digits.forEach(function(box, idx) {
      box.addEventListener("keydown", function(e) {
        if (e.key === "Backspace") {
          if (box.value === "" && idx > 0) {
            digits[idx - 1].value = "";
            digits[idx - 1].focus();
          } else {
            box.value = "";
          }
          e.preventDefault();
        } else if (e.key === "ArrowLeft" && idx > 0) {
          digits[idx - 1].focus();
        } else if (e.key === "ArrowRight" && idx < 5) {
          digits[idx + 1].focus();
        } else if (e.key === "Enter") {
          attemptEnter();
        }
      });

      box.addEventListener("input", function() {
        var v = box.value.replace(/[^0-9]/g, "");
        if (v.length > 1) {
          var chars = v.split("");
          chars.forEach(function(c, offset) {
            if (digits[idx + offset]) digits[idx + offset].value = c;
          });
          var next = Math.min(idx + chars.length, 5);
          digits[next].focus();
        } else {
          box.value = v;
          if (v && idx < 5) digits[idx + 1].focus();
        }
      });

      box.addEventListener("paste", function(e) {
        e.preventDefault();
        var pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
        pasted.split("").forEach(function(c, offset) {
          if (digits[idx + offset]) digits[idx + offset].value = c;
        });
        var next = Math.min(idx + pasted.length, 5);
        digits[next].focus();
      });

      box.addEventListener("focus", function() { box.select(); });
    });

    // === Submit ===
    function attemptEnter() {
      var username = (inUser ? inUser.value.trim() : "").toLowerCase().replace(/[^a-z0-9_.-]/g, "") || _currentUser.name;
      var roomCode = digits.map(function(d) { return d.value; }).join("");
      var pin = (inPin ? inPin.value.trim() : "");

      if (!username || username.length < 2) { 
        errEl.textContent = "El username debe tener al menos 2 caracteres"; 
        if (inUser) inUser.focus(); 
        return; 
      }
      if (roomCode.length !== 6 || /[^0-9]/.test(roomCode)) { 
        errEl.textContent = "El código de sala son 6 dígitos exactos"; 
        digits[0].focus(); 
        return; 
      }
      if (!pin) { 
        errEl.textContent = "Pon el PIN de la sala"; 
        if (inPin) inPin.focus(); 
        return; 
      }

      var room = "sala-" + roomCode;

      btnEnter.textContent = "Verificando...";
      btnEnter.disabled = true;
      errEl.textContent = "";

      // Initialize Firebase if needed
      var fbApp;
      try { fbApp = firebase.app(); } catch(e) {
        if (typeof firebaseConfig !== "undefined") fbApp = firebase.initializeApp(firebaseConfig);
      }

      var fbDb = (typeof firebase !== "undefined" && firebase.database) ? firebase.database() : null;

      if (fbDb) {
        try {
          // 1. Check Unique Username across Firebase
          var userRegRef = fbDb.ref("users_registry/" + username);
          userRegRef.once("value", function(userSnap) {
            var regData = userSnap.val();
            if (regData && regData.uid && regData.uid !== _currentUser.uid) {
              errEl.textContent = "❌ El username @" + username + " ya está en uso por otro usuario. Elige otro.";
              btnEnter.textContent = "ENTRAR AL PANEL";
              btnEnter.disabled = false;
              if (inUser) inUser.focus();
              return;
            }

            // Claim / update username ownership for current user
            userRegRef.set({
              uid: _currentUser.uid,
              name: username,
              photoURL: _currentUser.photoURL,
              ts: Date.now()
            });

            // 2. Check Room PIN
            var pinRef = fbDb.ref("rooms/" + room + "/pin");
            pinRef.once("value", function(snap) {
              var storedPin = snap.val();
              if (!storedPin) {
                pinRef.set(pin, function(err) {
                  if (err) {
                    errEl.textContent = "Error guardando el PIN";
                    btnEnter.textContent = "ENTRAR AL PANEL"; btnEnter.disabled = false;
                    return;
                  }
                  saveThenLaunch(username, roomCode, room);
                });
              } else if (storedPin === pin) {
                saveThenLaunch(username, roomCode, room);
              } else {
                errEl.textContent = "❌ PIN incorrecto";
                btnEnter.textContent = "ENTRAR AL PANEL"; btnEnter.disabled = false;
                if (inPin) { inPin.value = ""; inPin.focus(); }
              }
            }, function(err) {
              localPinCheck(username, roomCode, room, pin);
            });
          }, function(err) {
            localPinCheck(username, roomCode, room, pin);
          });
        } catch(ex) {
          localPinCheck(username, roomCode, room, pin);
        }
      } else {
        localPinCheck(username, roomCode, room, pin);
      }
    }

    function localPinCheck(username, roomCode, room, pin) {
      var savedPin = localStorage.getItem("ugax_pin_" + room);
      if (!savedPin) {
        localStorage.setItem("ugax_pin_" + room, pin);
        saveThenLaunch(username, roomCode, room);
      } else if (savedPin === pin) {
        saveThenLaunch(username, roomCode, room);
      } else {
        errEl.textContent = "❌ PIN incorrecto";
        btnEnter.textContent = "ENTRAR AL PANEL"; btnEnter.disabled = false;
        if (inPin) { inPin.value = ""; inPin.focus(); }
      }
    }

    function saveThenLaunch(username, roomCode, room) {
      _currentUser.name = username;
      localStorage.setItem("ugax_user", username);
      localStorage.setItem("ugax_last_room", roomCode);
      saveRecentRoom(roomCode);

      // Save active session for F5 refresh
      sessionStorage.setItem("ugax_active_session", JSON.stringify({
        room: room,
        user: username,
        photo: _currentUser.photoURL
      }));

      launchApp(username, room);
    }

    if (btnEnter) btnEnter.addEventListener("click", attemptEnter);
    if (form) form.addEventListener("submit", attemptEnter);

    function launchApp(username, room) {
      streamId = room;
      if (lobbyScreen) lobbyScreen.style.display = "none";
      if (appWrapper) appWrapper.style.display = "flex";
      initApp(username);
    }
  }

  /* === Social Auth (Real Google / YouTube & Discord) === */
  function initSocialAuth() {
    var btnGoogle = document.getElementById("btn-google-login");
    var btnDiscord = document.getElementById("btn-discord-login");
    var authRow = document.getElementById("auth-buttons-row");
    var authReqMsg = document.getElementById("auth-required-msg");
    var profileBadge = document.getElementById("auth-profile-badge");
    var pfpImg = document.getElementById("lobby-user-pfp");
    var userNameTxt = document.getElementById("lobby-user-name");
    var userProviderTxt = document.getElementById("lobby-user-provider");
    var btnLogoutGoogle = document.getElementById("btn-logout-google");
    var inUser = document.getElementById("lobby-user");
    var btnEnter = document.getElementById("btn-enter-room");
    var inPin = document.getElementById("lobby-pin");
    var digits = Array.from(document.querySelectorAll(".room-digit"));

    function ensureFirebase() {
      if (!firebase.apps || !firebase.apps.length) {
        if (typeof firebaseConfig !== "undefined") firebase.initializeApp(firebaseConfig);
      }
    }

    function handleAuthSuccess(user, providerName) {
      if (!user) return;
      _currentUser.uid = user.uid;
      _currentUser.name = (user.displayName || user.email.split("@")[0] || "streamer").toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      _currentUser.photoURL = user.photoURL || ("https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(_currentUser.name));
      _currentUser.provider = providerName || "Social";

      localStorage.setItem("ugax_user", _currentUser.name);
      localStorage.setItem("ugax_user_photo", _currentUser.photoURL);
      localStorage.setItem("ugax_user_provider", _currentUser.provider);

      showProfile();
    }

    function setFormUnlocked(unlocked) {
      digits.forEach(function(d) { d.disabled = !unlocked; });
      if (inPin) inPin.disabled = !unlocked;
      if (btnEnter) btnEnter.disabled = !unlocked;
    }

    function showProfile() {
      var groupUserEdit = document.getElementById("group-username-edit");
      if (_currentUser.photoURL && _currentUser.name) {
        if (pfpImg) pfpImg.src = _currentUser.photoURL;
        if (userNameTxt) userNameTxt.textContent = "@" + _currentUser.name;
        if (userProviderTxt) userProviderTxt.textContent = "✓ " + (_currentUser.provider || "Verificado");
        if (authRow) authRow.style.display = "none";
        if (authReqMsg) authReqMsg.style.display = "none";
        if (profileBadge) profileBadge.style.display = "flex";
        if (groupUserEdit) groupUserEdit.style.display = "block";
        if (inUser) {
          inUser.value = _currentUser.name;
          inUser.disabled = false;
        }
        setFormUnlocked(true);
      } else {
        if (authRow) authRow.style.display = "grid";
        if (authReqMsg) authReqMsg.style.display = "block";
        if (profileBadge) profileBadge.style.display = "none";
        if (groupUserEdit) groupUserEdit.style.display = "none";
        if (inUser) inUser.disabled = true;
        setFormUnlocked(false);
      }
    }

    if (inUser) {
      inUser.addEventListener("input", function() {
        var clean = inUser.value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
        if (clean) {
          _currentUser.name = clean;
          if (userNameTxt) userNameTxt.textContent = "@" + clean;
        }
      });
    }

    // REAL Google Login Handler
    if (btnGoogle) {
      btnGoogle.addEventListener("click", function() {
        try {
          ensureFirebase();
          var provider = new firebase.auth.GoogleAuthProvider();
          provider.addScope('profile');
          provider.addScope('email');

          firebase.auth().signInWithPopup(provider).then(function(res) {
            handleAuthSuccess(res.user, "Google");
          }).catch(function(err) {
            console.warn("Google popup error, trying redirect...", err);
            if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
              firebase.auth().signInWithRedirect(provider);
            } else {
              alert("Error al iniciar sesión con Google (" + err.code + "): " + err.message + "\n\nAsegúrate de habilitar Google Auth en Firebase Console.");
            }
          });
        } catch (e) {
          console.error("Google Auth error:", e);
        }
      });
    }

    // REAL Discord Login Handler — OAuth2 Implicit Flow (sin backend, sin pagar)
    if (btnDiscord) {
      btnDiscord.addEventListener("click", function() {
        var DISCORD_CLIENT_ID = "1527797262250410076";
        var redirectUri = encodeURIComponent("https://obs.ugax.pro/");
        var scope = encodeURIComponent("identify");
        var discordUrl = "https://discord.com/oauth2/authorize" +
          "?client_id=" + DISCORD_CLIENT_ID +
          "&redirect_uri=" + redirectUri +
          "&response_type=token" +
          "&scope=" + scope;
        window.location.href = discordUrl;
      });
    }

    // Sign out button
    if (btnLogoutGoogle) {
      btnLogoutGoogle.addEventListener("click", function() {
        try {
          ensureFirebase();
          firebase.auth().signOut();
        } catch(e) {}
        localStorage.removeItem("ugax_user_photo");
        localStorage.removeItem("ugax_user_provider");
        localStorage.removeItem("ugax_discord_token");
        _currentUser.photoURL = "";
        _currentUser.name = "";
        showProfile();
      });
    }

    // Check Discord OAuth2 callback token in URL hash (#access_token=...)
    function checkDiscordCallback() {
      var hash = window.location.hash;
      if (!hash || !hash.includes("access_token=")) return false;
      var params = {};
      hash.replace("#", "").split("&").forEach(function(pair) {
        var kv = pair.split("=");
        params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
      });
      var token = params["access_token"];
      if (!token) return false;

      // Clean URL so token doesn't stay visible
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

      // Fetch real Discord user info
      fetch("https://discord.com/api/users/@me", {
        headers: { "Authorization": "Bearer " + token }
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data && data.id) {
          var avatarUrl = data.avatar
            ? "https://cdn.discordapp.com/avatars/" + data.id + "/" + data.avatar + ".png?size=128"
            : "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(data.username || "discord");
          _currentUser.uid = "discord-" + data.id;
          _currentUser.name = (data.global_name || data.username || "streamer").toLowerCase().replace(/[^a-z0-9_.-]/g, "");
          _currentUser.photoURL = avatarUrl;
          _currentUser.provider = "Discord";
          localStorage.setItem("ugax_user", _currentUser.name);
          localStorage.setItem("ugax_user_photo", _currentUser.photoURL);
          localStorage.setItem("ugax_user_provider", "Discord");
          localStorage.setItem("ugax_discord_token", token);
          showProfile();
        }
      }).catch(function(e) {
        console.warn("Discord API error:", e);
      });
      return true;
    }

    // Listen for Real Firebase Auth State changes (Google) + Discord callback
    var discordHandled = checkDiscordCallback();
    if (!discordHandled) {
      try {
        ensureFirebase();
        firebase.auth().onAuthStateChanged(function(user) {
          if (user) {
            handleAuthSuccess(user, "Google");
          } else if (localStorage.getItem("ugax_user_photo")) {
            _currentUser.name = localStorage.getItem("ugax_user") || "streamer";
            _currentUser.photoURL = localStorage.getItem("ugax_user_photo") || "";
            _currentUser.provider = localStorage.getItem("ugax_user_provider") || "Verificado";
            showProfile();
          } else {
            showProfile();
          }
        });
      } catch(e) {
        showProfile();
      }
    }
  }

  /* === Recent Rooms === */
  function renderRecentRooms(digits) {
    var box = document.getElementById("recent-rooms-box");
    var grid = document.getElementById("recent-rooms-grid");
    if (!box || !grid) return;

    var recentStr = localStorage.getItem("ugax_recent_rooms");
    var list = [];
    try { list = JSON.parse(recentStr) || []; } catch(e) {}

    if (!list.length) { box.style.display = "none"; return; }

    box.style.display = "block";
    grid.innerHTML = "";
    list.slice(0, 4).forEach(function(code) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "recent-room-pill";
      pill.textContent = "📡 " + code;
      pill.title = "Clic para cargar la sala " + code;
      pill.addEventListener("click", function() {
        if (/^\d{6}$/.test(code) && digits.length === 6) {
          code.split("").forEach(function(d, i) { digits[i].value = d; });
          var inPin = document.getElementById("lobby-pin");
          if (inPin) inPin.focus();
        }
      });
      grid.appendChild(pill);
    });
  }

  function saveRecentRoom(code) {
    if (!/^\d{6}$/.test(code)) return;
    var recentStr = localStorage.getItem("ugax_recent_rooms");
    var list = [];
    try { list = JSON.parse(recentStr) || []; } catch(e) {}
    list = list.filter(function(c) { return c !== code; });
    list.unshift(code);
    localStorage.setItem("ugax_recent_rooms", JSON.stringify(list.slice(0, 6)));
  }

  /* === Modals Handler (Help & Members) === */
  function initModals() {
    var helpModal = document.getElementById("help-modal");
    var btnOpenHelp = document.getElementById("btn-open-help");
    var btnCloseHelp = document.getElementById("btn-close-help");

    if (btnOpenHelp && helpModal) btnOpenHelp.onclick = function() { helpModal.style.display = "flex"; };
    if (btnCloseHelp && helpModal) btnCloseHelp.onclick = function() { helpModal.style.display = "none"; };
    if (helpModal) helpModal.onclick = function(e) { if (e.target === helpModal) helpModal.style.display = "none"; };

    var membersModal = document.getElementById("members-modal");
    var btnOpenMembers = document.getElementById("btn-members-modal");
    var btnCloseMembers = document.getElementById("btn-close-members");

    if (btnOpenMembers && membersModal) btnOpenMembers.onclick = function() { membersModal.style.display = "flex"; };
    if (btnCloseMembers && membersModal) btnCloseMembers.onclick = function() { membersModal.style.display = "none"; };
    if (membersModal) membersModal.onclick = function(e) { if (e.target === membersModal) membersModal.style.display = "none"; };
  }

  /* ============================================
     MAIN APP INIT
     ============================================ */
  function initApp(username) {
    var urlParams = new URLSearchParams(window.location.search);
    // streamId already set by lobby; keep URL in sync
    var base = window.location.href.split("?")[0];
    window.history.replaceState({}, "", base + "?room=" + encodeURIComponent(streamId));

    canvas = document.getElementById("canvas");
    listEl = document.getElementById("list");
    emptyEl = document.getElementById("empty-msg");
    countEl = document.getElementById("count");
    editSec = document.getElementById("edit-section");
    edTitleType = document.getElementById("ed-title-type");
    edNameInput = document.getElementById("ed-name-input");
    dotEl = document.getElementById("dot");
    connTxt = document.getElementById("conn-txt");
    obsBadge = document.getElementById("obs-badge");
    pingBadge = document.getElementById("ping-badge");

    var streamLbl = document.getElementById("stream-label");
    if (streamLbl) streamLbl.textContent = streamId;

    var userDisplay = document.getElementById("user-display");
    if (userDisplay) userDisplay.textContent = "@" + username;

    var headerAvatar = document.getElementById("header-user-avatar");
    if (headerAvatar && _currentUser.photoURL) headerAvatar.src = _currentUser.photoURL;

    var modalAvatar = document.getElementById("modal-user-avatar");
    if (modalAvatar && _currentUser.photoURL) modalAvatar.src = _currentUser.photoURL;

    var modalName = document.getElementById("modal-user-name");
    if (modalName) modalName.textContent = "@" + username;

    initPanicBtn();
    initUserSession();
    initSoundboard();
    initTabs();
    initAddUrl();
    initAddText();
    initFileUpload();
    initToolbar();
    initQuickActions();
    initHeaderTools();
    initCanvasEvents();
    initKeyboardEvents();
    initServices();
  }

  /* === Panic Button === */
  function initPanicBtn() {
    var btn = document.getElementById("btn-panic");
    if (!btn) return;
    btn.addEventListener("click", function() {
      if (!db) return;
      // Hide all elements instantly by setting visible=false on all
      db.ref("streams/" + streamId + "/elements").once("value", function(snap) {
        var updates = {};
        snap.forEach(function(child) {
          updates[child.key + "/v"] = false;
        });
        db.ref("streams/" + streamId + "/elements").update(updates);
      });
      // Visual feedback
      btn.textContent = "✓ Todo oculto";
      btn.style.background = "var(--danger)";
      btn.style.color = "#fff";
      setTimeout(function() {
        btn.textContent = "👁️‍🗨️ Pánico";
        btn.style.background = "";
        btn.style.color = "";
      }, 2000);
    });
  }

  /* === User Profile & Room Session (modal post-login) === */
  function initUserSession() {
    var storedUser = localStorage.getItem("ugax_user") || "itzugax";
    var userDisplay = document.getElementById("user-display");
    var btnUser = document.getElementById("btn-user-login");
    var modal = document.getElementById("login-modal");
    var btnClose = document.getElementById("btn-close-login");
    var btnSave = document.getElementById("btn-save-login");
    var userInput = document.getElementById("login-user-input");
    var roomInput = document.getElementById("login-room-input");

    if (userDisplay) userDisplay.textContent = "@" + storedUser;

    if (btnUser && modal) {
      btnUser.addEventListener("click", function() {
        if (userInput) userInput.value = storedUser;
        if (roomInput) roomInput.value = streamId;
        modal.style.display = "flex";
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener("click", function() {
        modal.style.display = "none";
      });
    }

    if (modal) {
      modal.addEventListener("click", function(e) {
        if (e.target === modal) modal.style.display = "none";
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", function() {
        var newUser = (userInput.value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "invitado";
        var newRoom = (roomInput.value || "").trim() || ("stream-" + newUser);
        localStorage.setItem("ugax_user", newUser);
        modal.style.display = "none";

        var base = window.location.href.split("?")[0];
        window.location.href = base + "?room=" + encodeURIComponent(newRoom);

      });
    }
  }

  /* === Soundboard Catalog & Engine === */
  var MEME_SOUNDS = [
    { id: "vine_boom", name: "Vine Boom", icon: "\uD83D\uDCA5", url: "https://www.myinstants.com/media/sounds/vine-boom.mp3" },
    { id: "bruh", name: "Bruh", icon: "\uD83C\uDFBA", url: "https://www.myinstants.com/media/sounds/movie_1.mp3" },
    { id: "taco_bell", name: "Taco Bell", icon: "\uD83D\uDCA3", url: "https://www.myinstants.com/media/sounds/taco-bell-bong-sfx.mp3" },
    { id: "sad_trombone", name: "Sad Trombone", icon: "\uD83D\uDCC9", url: "https://www.myinstants.com/media/sounds/sadtrombone.mp3" },
    { id: "metal_pipe", name: "Metal Pipe", icon: "\uD83E\uDD16", url: "https://www.myinstants.com/media/sounds/metal-pipe-clang.mp3" },
    { id: "discord", name: "Discord Ping", icon: "\uD83D\uDD14", url: "https://www.myinstants.com/media/sounds/discord-notification.mp3" },
    { id: "badum_tss", name: "Ba Dum Tss!", icon: "\uD83E\uDD41", url: "https://www.myinstants.com/media/sounds/ba-dum-tss.mp3" },
    { id: "aplausos", name: "Aplausos", icon: "\uD83D\uDC4F", url: "https://www.myinstants.com/media/sounds/applause_2.mp3" },
    { id: "airhorn", name: "Airhorn MLG", icon: "\uD83D\uDCE2", url: "https://www.myinstants.com/media/sounds/mlg-airhorn.mp3" },
    { id: "oof", name: "Oof Roblox", icon: "\uD83D\uDC80", url: "https://www.myinstants.com/media/sounds/roblox-death-sound_1.mp3" },
    { id: "fart", name: "Fart Reverb", icon: "\uD83D\uDCA8", url: "https://www.myinstants.com/media/sounds/fart-with-reverb.mp3" },
    { id: "win_error", name: "Windows Error", icon: "\uD83D\uDCBB", url: "https://www.myinstants.com/media/sounds/windows-xp-error.mp3" }
  ];

  var _activeSoundSearch = "";

  function initSoundboard() {
    var searchIn = document.getElementById("snd-search");

    if (searchIn) {
      searchIn.addEventListener("input", function() {
        _activeSoundSearch = searchIn.value.trim().toLowerCase();
        renderSoundboard();
      });
    }

    renderSoundboard();
  }

  function renderSoundboard() {
    var listCont = document.getElementById("soundboard-list");
    if (!listCont) return;
    listCont.innerHTML = "";

    var filtered = MEME_SOUNDS.filter(function(s) {
      return !_activeSoundSearch || s.name.toLowerCase().includes(_activeSoundSearch);
    });

    filtered.forEach(function(snd) {
      var card = document.createElement("div");
      card.className = "snd-card";
      card.title = "Clic pa disparar: " + snd.name;
      card.innerHTML =
        '<span class="snd-icon">' + snd.icon + '</span>' +
        '<span class="snd-name">' + esc2(snd.name) + '</span>';

      card.addEventListener("click", function() {
        fireSound(snd, card);
      });

      listCont.appendChild(card);
    });
  }

  function fireSound(snd, cardEl) {
    // 1. Animate button feedback
    if (cardEl) {
      cardEl.classList.add("firing");
      setTimeout(function() { cardEl.classList.remove("firing"); }, 600);
    }

    // 2. Broadcast to stream overlay (obs.html) via Firebase /sfx in real-time
    if (db) {
      db.ref("streams/" + streamId + "/sfx").set({
        url: snd.url,
        name: snd.name,
        ts: Date.now()
      });
    }
  }

  /* === Services (Firebase, Supabase, interact) === */
  function initServices() {
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

        // User Presence in Room
        var userPresRef = db.ref("rooms/" + streamId + "/presence/users/" + _currentUser.uid);
        userPresRef.set({
          name: _currentUser.name,
          photoURL: _currentUser.photoURL,
          ts: Date.now()
        });
        userPresRef.onDisconnect().remove();

        // Listen for active room members
        db.ref("rooms/" + streamId + "/presence/users").on("value", function(snap) {
          var users = snap.val() || {};
          var keys = Object.keys(users);
          var count = Math.max(1, keys.length);

          var countEl = document.getElementById("members-count");
          if (countEl) countEl.textContent = count;

          var membersListEl = document.getElementById("members-list");
          if (membersListEl) {
            membersListEl.innerHTML = "";
            keys.forEach(function(k) {
              var u = users[k];
              var row = document.createElement("div");
              row.className = "member-row";
              var pfp = u.photoURL || ("https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(u.name || "user"));
              row.innerHTML =
                '<img class="member-pfp" src="' + pfp + '">' +
                '<span class="member-name">@' + esc(u.name || "moderador") + '</span>' +
                '<span class="member-status-dot" title="Conectado en vivo"></span>';
              membersListEl.appendChild(row);
            });
          }
        });

        db.ref(".info/connected").on("value", function(snap) {
          var on = snap.val() === true;
          if (dotEl) dotEl.className = "dot" + (on ? " on" : "");
          if (connTxt) connTxt.textContent = on ? "Conectao papu" : "Se cayó el server F";
        });

        setInterval(function() {
          if (!db) return;
          var t0 = Date.now();
          db.ref(".info/serverTimeOffset").once("value", function() {
            var ping = Math.max(1, Math.round(Date.now() - t0));
            if (pingBadge) pingBadge.textContent = "⚡ " + ping + " ms";
          });
        }, 8000);

        db.ref("streams/" + streamId + "/presence/obs").on("value", function(snap) {
          var val = snap.val();
          var isLive = val && (Date.now() - val < 12000);
          if (obsBadge) {
            if (isLive) {
              obsBadge.className = "obs-badge online";
              obsBadge.innerHTML = "&#128225; OBS: Ta prend\u00EDo";
            } else {
              obsBadge.className = "obs-badge";
              obsBadge.innerHTML = "&#128225; OBS: Ta apagao mano";
            }
          }
        });

      } catch (e) {
        console.error("Firebase init error:", e);
        if (connTxt) connTxt.textContent = "Error Firebase";
      }
    } else {
      console.warn("Firebase SDK not loaded");
      if (connTxt) connTxt.textContent = "Sin Firebase";
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

  /* === Header Tools === */
  function initHeaderTools() {
    var btnCopy = document.getElementById("btn-copy-obs");
    if (btnCopy) {
      btnCopy.addEventListener("click", function() {
        var base = window.location.href.split("?")[0].replace("index.html", "");
        if (!base.endsWith("/")) base += "/";
        var roomClean = streamId.replace(/^sala-/, "");
        var obsUrl = base + "obs.html?room=" + encodeURIComponent(roomClean);

        navigator.clipboard.writeText(obsUrl).then(function() {
          btnCopy.textContent = "\u2705 \u00A1Link Copiado!";
          btnCopy.classList.add("copied");
          setTimeout(function() {
            btnCopy.innerHTML = "&#128203; Copiar Link Stream";
            btnCopy.classList.remove("copied");
          }, 2000);
        }).catch(function() {
          prompt("Copia este link para tu programa de streaming (Browser Source 1920x1080):", obsUrl);
        });
      });
    }

    var btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", function(e) {
        e.preventDefault();
        if (confirm("¿Seguro que quieres salir de esta sala mi rey?")) {
          sessionStorage.removeItem("ugax_active_session");
          localStorage.removeItem("ugax_last_room");
          if (db && _currentUser && _currentUser.uid) {
            db.ref("rooms/" + streamId + "/presence/users/" + _currentUser.uid).remove();
          }
          var base = window.location.origin + window.location.pathname;
          window.location.href = base;
        }
      });
    }

    var btnToggleAll = document.getElementById("btn-toggle-all");
    if (btnToggleAll) {
      btnToggleAll.addEventListener("click", function() {
        if (!roomRef) return;
        var keys = Object.keys(state);
        if (!keys.length) return;
        var hasVisible = keys.some(function(k) { return state[k].visible !== false; });
        var targetVis = !hasVisible;
        keys.forEach(function(k) {
          roomRef.child(k).update({ visible: targetVis });
        });
      });
    }

    var btnClearAll = document.getElementById("btn-clear-all");
    if (btnClearAll) {
      btnClearAll.addEventListener("click", function() {
        if (!confirm("¿Seguro que quieres mandar to a la verga y limpiar el stream?")) return;
        if (roomRef) roomRef.remove();
        closeEdit();
        selectedId = null;
      });
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

  function getNextZ() {
    var mx = 0;
    var keys = Object.keys(state);
    for (var i = 0; i < keys.length; i++) {
      var z = state[keys[i]].z || 0;
      if (z > mx) mx = z;
    }
    return mx + 10;
  }

  /* === Add URL === */
  function initAddUrl() {
    var btn = document.getElementById("addUrl");
    var inUrl = document.getElementById("urlIn");
    if (!btn || !inUrl) return;

    function doAddUrl() {
      var u = inUrl.value.trim();
      if (!u) { alert("Pega un link primero mano xD"); inUrl.focus(); return; }
      var t = detectType(u);
      if (!t) { alert("No se pudo detectar el formato. Pon JPG, PNG, GIF, MP4 o MP3 pe."); return; }
      if (!roomRef) { alert("Sin conexión a Firebase papu. F5 para revivir."); return; }
      var id = roomRef.push().key;
      var author = _currentUser.name || localStorage.getItem("ugax_user") || "streamer";
      var base = {
        type: t, url: u, x: 0.1, y: 0.1, w: 0.35, h: 0.25,
        z: getNextZ(), opacity: 100, visible: true,
        name: "@" + author,
        locked: false,
        addedBy: author,
        addedByPhoto: _currentUser.photoURL || localStorage.getItem("ugax_user_photo") || ""
      };
      if (t === "image") {
        base.objectFit = "contain";
        var img = new Image();
        img.onload = function() {
          var nw = img.naturalWidth || 400;
          var nh = img.naturalHeight || 300;
          var imgAspect = nw / nh;
          var normAspect = imgAspect / (16 / 9);
          var targetH = 0.30;
          var targetW = targetH * normAspect;
          if (targetW > 0.85) { targetW = 0.85; targetH = targetW / normAspect; }
          if (targetH > 0.65) { targetH = 0.65; targetW = targetH * normAspect; }
          roomRef.child(id).update({ w: parseFloat(targetW.toFixed(3)), h: parseFloat(targetH.toFixed(3)) });
        };
        img.src = u;
      }
      if (t === "audio") { base.volume = 100; base.loop = false; base.w = 0.20; base.h = 0.08; }
      if (t === "video") { base.volume = 100; base.loop = false; base.objectFit = "contain"; }
      roomRef.child(id).set(base);
      inUrl.value = "";
      selectRow(id);
      openEdit(id);
    }

    btn.addEventListener("click", doAddUrl);
    inUrl.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        doAddUrl();
      }
    });
  }

  /* === Add Text === */
  function initAddText() {
    var btn = document.getElementById("addTxt");
    var inTxt = document.getElementById("txtIn");
    if (!btn || !inTxt) return;

    function doAddText() {
      var txt = inTxt.value.trim();
      if (!txt) { alert("Escribe algo pe, no lo dejes vacío xD"); inTxt.focus(); return; }
      if (!roomRef) { alert("Sin conexión a Firebase papu. F5 para revivir."); return; }
      var id = roomRef.push().key;
      var bounds = calcTightTextBounds(txt);
      var author = _currentUser.name || localStorage.getItem("ugax_user") || "streamer";
      roomRef.child(id).set({
        type: "text",
        x: 0.1, y: 0.1, w: bounds.w, h: bounds.h,
        z: getNextZ(), opacity: 100, visible: true,
        name: "@" + author,
        locked: false,
        addedBy: author,
        addedByPhoto: _currentUser.photoURL || localStorage.getItem("ugax_user_photo") || "",
        text: txt, fontSize: 56,
        textColor: "#ffffff", strokeColor: "#000000", strokeWidth: 5,
        fontFamily: "'Comic Sans MS', 'Comic Sans', cursive",
        bgType: "none", bgColor: "#000000", bgOpacity: 0
      });
      inTxt.value = "";
      selectRow(id);
      openEdit(id);
    }

    btn.addEventListener("click", doAddText);
    inTxt.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        doAddText();
      }
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
              z: getNextZ(), url: pub, name: shortName(f.name),
              opacity: 100, visible: true, locked: false
            };
            if (t === "image") {
              base.objectFit = "contain";
              var img = new Image();
              img.onload = function() {
                var nw = img.naturalWidth || 16;
                var nh = img.naturalHeight || 9;
                var normAspect = (nw / nh) / (16 / 9);
                var targetW = 0.38;
                var targetH = targetW / normAspect;
                if (targetH > 0.65) { targetH = 0.65; targetW = targetH * normAspect; }
                roomRef.child(id).update({ w: targetW, h: targetH });
              };
              img.src = pub;
            }
            if (t === "audio") { base.volume = 100; base.loop = false; base.w = 0.20; base.h = 0.08; }
            if (t === "video") { base.volume = 100; base.loop = false; base.objectFit = "contain"; }
            roomRef.child(id).set(base);
            it.querySelector("span:last-child").className = "ok";
            it.querySelector("span:last-child").textContent = "Listo rey";
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

  /* === Quick Actions & Toolbar === */
  function initQuickActions() {
    var btnFit = document.getElementById("qa-fit");
    if (btnFit) {
      btnFit.addEventListener("click", function() {
        if (!editingId || !state[editingId]) return;
        fitElementToContent(editingId);
      });
    }

    var btnCenter = document.getElementById("qa-center");
    if (btnCenter) {
      btnCenter.addEventListener("click", function() {
        if (!editingId || !state[editingId] || !roomRef) return;
        var cur = POS_MAP[editingId] || state[editingId];
        var w = cur.w || 0.3;
        var h = cur.h || 0.08;
        var nx = Math.max(0, (1 - w) / 2);
        var ny = Math.max(0, (1 - h) / 2);
        POS_MAP[editingId].x = nx;
        POS_MAP[editingId].y = ny;
        var cel = canvas.querySelector('[data-id="' + editingId + '"]');
        if (cel) {
          cel.style.left = (nx * 100) + "%";
          cel.style.top = (ny * 100) + "%";
        }
        syncEdit();
        roomRef.child(editingId).update({ x: nx, y: ny });
      });
    }

    var btnFull = document.getElementById("qa-fullscreen");
    if (btnFull) {
      btnFull.addEventListener("click", function() {
        if (!editingId || !state[editingId] || !roomRef) return;
        POS_MAP[editingId] = { x: 0, y: 0, w: 1, h: 1 };
        var cel = canvas.querySelector('[data-id="' + editingId + '"]');
        if (cel) {
          cel.style.left = "0%";
          cel.style.top = "0%";
          cel.style.width = "100%";
          cel.style.height = "100%";
          if (state[editingId].type === "text") updateTextSize(cel, state[editingId], 1, 1);
        }
        syncEdit();
        roomRef.child(editingId).update({ x: 0, y: 0, w: 1, h: 1 });
      });
    }

    var btnClone = document.getElementById("qa-clone");
    if (btnClone) {
      btnClone.addEventListener("click", function() {
        if (!editingId || !state[editingId]) return;
        duplicateLayer(editingId);
      });
    }

    var btnLockToggle = document.getElementById("ed-lock-toggle");
    if (btnLockToggle) {
      btnLockToggle.addEventListener("click", function() {
        if (!editingId || !state[editingId] || !roomRef) return;
        var isLocked = state[editingId].locked === true;
        roomRef.child(editingId).update({ locked: !isLocked });
        btnLockToggle.innerHTML = isLocked ? "&#128274; Bloquear" : "&#128275; Desbloquear";
      });
    }
  }

  function fitElementToContent(id) {
    if (!state[id] || !roomRef) return;
    var el = state[id];

    if (el.type === "text") {
      var len = Math.max(1, (el.text || "").length);
      var newW = Math.max(0.15, Math.min(0.9, (len * 0.045) + 0.05));
      var newH = 0.09;
      POS_MAP[id] = { x: el.x || 0.1, y: el.y || 0.1, w: newW, h: newH };
      var cel = canvas.querySelector('[data-id="' + id + '"]');
      if (cel) {
        cel.style.width = (newW * 100) + "%";
        cel.style.height = (newH * 100) + "%";
        updateTextSize(cel, el, newH, newW);
      }
      if (editingId === id) syncEdit();
      roomRef.child(id).update({ w: newW, h: newH });

    } else if (el.type === "image" && el.url) {
      var img = new Image();
      img.onload = function() {
        var nw = img.naturalWidth || 16;
        var nh = img.naturalHeight || 9;
        var normAspect = (nw / nh) / (16 / 9);
        var targetW = 0.38;
        var targetH = targetW / normAspect;
        if (targetH > 0.65) { targetH = 0.65; targetW = targetH * normAspect; }
        targetW = Math.min(0.95, Math.max(0.05, targetW));
        targetH = Math.min(0.95, Math.max(0.05, targetH));
        POS_MAP[id] = { x: el.x || 0.1, y: el.y || 0.1, w: targetW, h: targetH };
        var cel = canvas.querySelector('[data-id="' + id + '"]');
        if (cel) {
          cel.style.width = (targetW * 100) + "%";
          cel.style.height = (targetH * 100) + "%";
        }
        if (editingId === id) syncEdit();
        roomRef.child(id).update({ w: targetW, h: targetH });
      };
      img.src = el.url;

    } else if (el.type === "video" && el.url) {
      var v = document.createElement("video");
      v.onloadedmetadata = function() {
        var nw = v.videoWidth || 16;
        var nh = v.videoHeight || 9;
        var normAspect = (nw / nh) / (16 / 9);
        var targetW = 0.38;
        var targetH = targetW / normAspect;
        if (targetH > 0.65) { targetH = 0.65; targetW = targetH * normAspect; }
        targetW = Math.min(0.95, Math.max(0.05, targetW));
        targetH = Math.min(0.95, Math.max(0.05, targetH));
        POS_MAP[id] = { x: el.x || 0.1, y: el.y || 0.1, w: targetW, h: targetH };
        var cel = canvas.querySelector('[data-id="' + id + '"]');
        if (cel) {
          cel.style.width = (targetW * 100) + "%";
          cel.style.height = (targetH * 100) + "%";
        }
        if (editingId === id) syncEdit();
        roomRef.child(id).update({ w: targetW, h: targetH });
      };
      v.src = el.url;
    }
  }

  function duplicateLayer(id) {
    if (!state[id] || !roomRef) return;
    var orig = state[id];
    var clone = JSON.parse(JSON.stringify(orig));
    var newId = roomRef.push().key;
    clone.x = Math.min(0.8, (clone.x || 0) + 0.04);
    clone.y = Math.min(0.8, (clone.y || 0) + 0.04);
    clone.z = getNextZ();
    clone.name = (clone.name || "Capa") + " (Copia)";
    roomRef.child(newId).set(clone);
    selectRow(newId);
    openEdit(newId);
  }

  function moveLayer(id, dir) {
    if (!roomRef) return;
    var keys = Object.keys(state);
    keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
    var idx = keys.indexOf(id);
    if (idx === -1) return;
    var targetIdx = idx + dir; // +1: move forward (higher z), -1: move backward (lower z)
    if (targetIdx < 0 || targetIdx >= keys.length) return;

    var temp = keys[idx];
    keys[idx] = keys[targetIdx];
    keys[targetIdx] = temp;

    var updates = {};
    for (var i = 0; i < keys.length; i++) {
      updates[keys[i] + "/z"] = (i + 1) * 10;
    }
    roomRef.update(updates);
  }

  function bringToFront(id) {
    if (!roomRef) return;
    var keys = Object.keys(state);
    keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
    var idx = keys.indexOf(id);
    if (idx === -1) return;
    keys.splice(idx, 1);
    keys.push(id);
    var updates = {};
    for (var i = 0; i < keys.length; i++) {
      updates[keys[i] + "/z"] = (i + 1) * 10;
    }
    roomRef.update(updates);
  }

  function sendToBack(id) {
    if (!roomRef) return;
    var keys = Object.keys(state);
    keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
    var idx = keys.indexOf(id);
    if (idx === -1) return;
    keys.splice(idx, 1);
    keys.unshift(id);
    var updates = {};
    for (var i = 0; i < keys.length; i++) {
      updates[keys[i] + "/z"] = (i + 1) * 10;
    }
    roomRef.update(updates);
  }

  function initToolbar() {
    var tbAdd = document.getElementById("tb-add");
    var tbDel = document.getElementById("tb-del");
    var tbUp = document.getElementById("tb-up");
    var tbDown = document.getElementById("tb-down");
    var tbClone = document.getElementById("tb-clone");

    if (tbAdd) tbAdd.addEventListener("click", function() {
      var tab = document.querySelector('[data-tab="tab-url"]');
      if (tab) tab.click();
      var inp = document.getElementById("urlIn");
      if (inp) inp.focus();
    });

    if (tbDel) tbDel.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero mano"); return; }
      if (confirm("\u00BFVas a borrar esta capa mi rey?")) {
        var toDel = selectedId;
        if (roomRef) roomRef.child(toDel).remove();
        if (editingId === toDel) closeEdit();
        selectedId = null;
      }
    });

    if (tbUp) tbUp.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero mano"); return; }
      moveLayer(selectedId, 1); // 1 paso adelante (sube en la lista)
    });

    if (tbDown) tbDown.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero mano"); return; }
      moveLayer(selectedId, -1); // 1 paso atrás (baja en la lista)
    });

    if (tbClone) tbClone.addEventListener("click", function() {
      if (!selectedId) { alert("Selecciona una capa primero mano"); return; }
      duplicateLayer(selectedId);
    });
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
        if (confirm("\u00BFVas a borrar esta capa mi rey?")) {
          var toDel = selectedId;
          if (roomRef) roomRef.child(toDel).remove();
          if (editingId === toDel) closeEdit();
          selectedId = null;
        }
      } else if (e.key === "Escape") {
        selectRow(null);
        closeEdit();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateLayer(selectedId);
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

  /* === interact.js Setup (Always Locked Aspect Ratio) === */
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
            var initW = cur.w || 0.3;
            var initH = cur.h || 0.08;
            _startState = {
              x: cur.x || 0,
              y: cur.y || 0,
              w: initW,
              h: initH,
              right: (cur.x || 0) + initW,
              bottom: (cur.y || 0) + initH,
              clientX: e.clientX,
              clientY: e.clientY,
              aspect: initW / Math.max(0.001, initH)
            };
            e.target.classList.add("resizing");
          },
          move: function(e) {
            var id = e.target.getAttribute("data-id");
            if (!id || !state[id] || state[id].locked || !_startState) return;
            var cr = canvas.getBoundingClientRect();
            if (cr.width <= 0 || cr.height <= 0) return;

            var initW = _startState.w;
            var initH = _startState.h;
            var dxPx = e.clientX - _startState.clientX;
            var dyPx = e.clientY - _startState.clientY;

            var scaleFactor = 1;
            var x = _startState.x;
            var y = _startState.y;

            // Compute scale factor based on handle pulled
            if (e.edges.right && e.edges.bottom) { // SE
              var sx = dxPx / (initW * cr.width);
              var sy = dyPx / (initH * cr.height);
              scaleFactor = 1 + (Math.abs(sx) > Math.abs(sy) ? sx : sy);
              scaleFactor = Math.max(0.05, scaleFactor);
              if (_startState.x + initW * scaleFactor > 1) scaleFactor = (1 - _startState.x) / initW;
              if (_startState.y + initH * scaleFactor > 1) scaleFactor = Math.min(scaleFactor, (1 - _startState.y) / initH);
              x = _startState.x;
              y = _startState.y;

            } else if (e.edges.left && e.edges.bottom) { // SW
              var sx = -dxPx / (initW * cr.width);
              var sy = dyPx / (initH * cr.height);
              scaleFactor = 1 + (Math.abs(sx) > Math.abs(sy) ? sx : sy);
              scaleFactor = Math.max(0.05, scaleFactor);
              if (_startState.right - initW * scaleFactor < 0) scaleFactor = _startState.right / initW;
              if (_startState.y + initH * scaleFactor > 1) scaleFactor = Math.min(scaleFactor, (1 - _startState.y) / initH);
              x = _startState.right - initW * scaleFactor;
              y = _startState.y;

            } else if (e.edges.right && e.edges.top) { // NE
              var sx = dxPx / (initW * cr.width);
              var sy = -dyPx / (initH * cr.height);
              scaleFactor = 1 + (Math.abs(sx) > Math.abs(sy) ? sx : sy);
              scaleFactor = Math.max(0.05, scaleFactor);
              if (_startState.x + initW * scaleFactor > 1) scaleFactor = (1 - _startState.x) / initW;
              if (_startState.bottom - initH * scaleFactor < 0) scaleFactor = Math.min(scaleFactor, _startState.bottom / initH);
              x = _startState.x;
              y = _startState.bottom - initH * scaleFactor;

            } else if (e.edges.left && e.edges.top) { // NW
              var sx = -dxPx / (initW * cr.width);
              var sy = -dyPx / (initH * cr.height);
              scaleFactor = 1 + (Math.abs(sx) > Math.abs(sy) ? sx : sy);
              scaleFactor = Math.max(0.05, scaleFactor);
              if (_startState.right - initW * scaleFactor < 0) scaleFactor = _startState.right / initW;
              if (_startState.bottom - initH * scaleFactor < 0) scaleFactor = Math.min(scaleFactor, _startState.bottom / initH);
              x = _startState.right - initW * scaleFactor;
              y = _startState.bottom - initH * scaleFactor;

            } else if (e.edges.right) { // E
              scaleFactor = Math.max(0.05, 1 + (dxPx / (initW * cr.width)));
              if (_startState.x + initW * scaleFactor > 1) scaleFactor = (1 - _startState.x) / initW;
              if (_startState.y + initH * scaleFactor > 1) scaleFactor = Math.min(scaleFactor, (1 - _startState.y) / initH);
              x = _startState.x;
              y = _startState.y;

            } else if (e.edges.left) { // W
              scaleFactor = Math.max(0.05, 1 - (dxPx / (initW * cr.width)));
              if (_startState.right - initW * scaleFactor < 0) scaleFactor = _startState.right / initW;
              if (_startState.y + initH * scaleFactor > 1) scaleFactor = Math.min(scaleFactor, (1 - _startState.y) / initH);
              x = _startState.right - initW * scaleFactor;
              y = _startState.y;

            } else if (e.edges.bottom) { // S
              scaleFactor = Math.max(0.05, 1 + (dyPx / (initH * cr.height)));
              if (_startState.y + initH * scaleFactor > 1) scaleFactor = (1 - _startState.y) / initH;
              if (_startState.x + initW * scaleFactor > 1) scaleFactor = Math.min(scaleFactor, (1 - _startState.x) / initH);
              x = _startState.x;
              y = _startState.y;

            } else if (e.edges.top) { // N
              scaleFactor = Math.max(0.05, 1 - (dyPx / (initH * cr.height)));
              if (_startState.bottom - initH * scaleFactor < 0) scaleFactor = _startState.bottom / initH;
              if (_startState.x + initW * scaleFactor > 1) scaleFactor = Math.min(scaleFactor, (1 - _startState.x) / initH);
              x = _startState.x;
              y = _startState.bottom - initH * scaleFactor;
            }

            var w = initW * scaleFactor;
            var h = initH * scaleFactor;

            POS_MAP[id] = { x: x, y: y, w: w, h: h };
            e.target.style.left = (x * 100) + "%";
            e.target.style.top = (y * 100) + "%";
            e.target.style.width = (w * 100) + "%";
            e.target.style.height = (h * 100) + "%";

            // If text element, auto-scale font size with box height & width immediately
            if (state[id] && state[id].type === "text") {
              updateTextSize(e.target, state[id], h, w);
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

  /* === Render Canvas Elements (DOM order strictly matches z-index) === */
  function render() {
    var keys = Object.keys(state);
    keys.sort(function(a, b) { return (state[a].z || 0) - (state[b].z || 0); });
    countEl.textContent = keys.length;
    emptyEl.style.display = keys.length ? "none" : "block";

    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      seen[id] = 1;
      upsertEl(id, state[id]);
      // Re-append in canvas so DOM order strictly matches z-index ascending
      var d = canvas.querySelector('[data-id="' + id + '"]');
      if (d) canvas.appendChild(d);
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
    if (el.locked === true) cls += " locked";
    if (selectedId === id) cls += " selected";
    d.className = cls;

    POS_MAP[id] = { x: el.x, y: el.y, w: el.w, h: el.h };
    d.style.left = (el.x * 100) + "%";
    d.style.top = (el.y * 100) + "%";
    d.style.width = (el.w * 100) + "%";
    d.style.height = (el.h * 100) + "%";
    d.style.opacity = (el.opacity != null ? el.opacity : 100) / 100;
    d.style.zIndex = el.z || 0;

    var tagEl = d.querySelector(".tag");
    if (tagEl) tagEl.textContent = el.name || "";

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
        bgVal = "rgba(" + hexToRgb(el.bgColor) + "," + ((el.bgOpacity != null ? el.bgOpacity : 100) / 100) + ")";
      }
      wrap.style.background = bgVal;
      wrap.style.color = el.textColor || "#ffffff";
      wrap.style.fontWeight = "bold";
      wrap.style.fontStyle = "normal";
      wrap.style.lineHeight = "1.1";
      wrap.style.textShadow = "2px 2px 6px rgba(0,0,0,0.9)";
      wrap.style.fontFamily = el.fontFamily || "'Comic Sans MS', 'Comic Sans', cursive";
      wrap.style.paintOrder = "stroke fill";
      updateTextSize(d, el, el.h || 0.08, el.w || 0.3);
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
        imgEl.style.objectFit = el.objectFit || "contain";

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

  function updateTextSize(elDom, elData, hVal, wVal) {
    var wrap = elDom.querySelector(".media-wrap");
    if (!wrap) return;
    var cw = canvas.clientWidth || 640;
    var ch = canvas.clientHeight || 360;
    var boxW = (wVal != null ? wVal : (elData.w || 0.3)) * cw;
    var boxH = (hVal != null ? hVal : (elData.h || 0.08)) * ch;
    var text = elData.text || "";
    var len = Math.max(1, text.length);

    var maxFsByH = boxH * 0.72;
    var maxFsByW = (boxW * 0.94) / (len * 0.62);
    var baseFs = Math.max(8, Math.min(maxFsByH, maxFsByW));
    var userScale = (elData.fontSize || 56) / 56;
    var dynFs = Math.max(8, Math.round(baseFs * userScale));

    wrap.style.fontSize = dynFs + "px";
    var strokeW = Math.max(1, Math.round(dynFs * 0.07));
    wrap.style.webkitTextStroke = strokeW + "px " + (elData.strokeColor || "#000000");
  }

  function mkDiv(el) {
    var d = document.createElement("div");
    var tagText = el.name || "";
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

  /* === Source List in Sidebar (Top row is FRONT, Bottom row is BACK) === */
  function renderList(keys) {
    var existing = {};
    var rows = listEl.querySelectorAll(".row");
    for (var i = 0; i < rows.length; i++) {
      existing[rows[i].getAttribute("data-id")] = rows[i];
    }

    var fragment = document.createDocumentFragment();
    // Reverse keys so highest z (front-most layer) is at the TOP of the sidebar list
    var listKeys = keys.slice().reverse();
    for (var i = 0; i < listKeys.length; i++) {
      var id = listKeys[i];
      var el = state[id];
      var r = existing[id];
      if (!r) r = mkRow(id, el);
      upRow(r, id, el, i, listKeys.length);
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
      '<button class="ibtn layer-up" title="Traer 1 paso adelante">&#9650;</button>' +
      '<button class="ibtn layer-down" title="Enviar 1 paso atrás">&#9660;</button>' +
      '<button class="ibtn eye-btn" title="Mostrar/Ocultar">&#128065;</button>' +
      '<button class="ibtn lock-btn" title="Bloquear/Desbloquear">&#128275;</button>' +
      '<button class="ibtn edit-btn" title="Editar">&#9998;</button>' +
      '<button class="ibtn danger del-btn" title="Borrar">&#10005;</button>';

    r.addEventListener("click", function(e) {
      if (e.target.closest(".ibtn")) return;
      selectRow(id);
      openEdit(id);
    });

    r.querySelector(".layer-up").addEventListener("click", function(e) {
      e.stopPropagation();
      moveLayer(id, 1);
    });

    r.querySelector(".layer-down").addEventListener("click", function(e) {
      e.stopPropagation();
      moveLayer(id, -1);
    });

    r.querySelector(".eye-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      var cur = state[id];
      if (cur && roomRef) {
        roomRef.child(id).update({ visible: cur.visible === false });
      }
    });

    r.querySelector(".lock-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      var cur = state[id];
      if (cur && roomRef) {
        var isLocked = cur.locked === true;
        roomRef.child(id).update({ locked: !isLocked });
      }
    });

    r.querySelector(".edit-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      selectRow(id);
      openEdit(id);
    });

    r.querySelector(".del-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      if (confirm("¿Vas a borrar esta capa mi rey?")) {
        if (roomRef) roomRef.child(id).remove();
        if (editingId === id) closeEdit();
        if (selectedId === id) selectedId = null;
      }
    });

    return r;
  }

  function upRow(r, id, el, rankIndex, totalCount) {
    var icons = { image: "🖼️ IMG", video: "🎥 VID", audio: "🎵 AUD", text: "✍️ TXT" };
    r.querySelector(".r-icon").textContent = icons[el.type] || "CAP";
    var displayName = el.name || (el.addedBy ? "@" + el.addedBy : "Capa " + id.slice(-4));
    r.querySelector(".r-name").textContent = displayName;
    r.querySelector(".r-badge").textContent = "#" + (totalCount - rankIndex);

    var eye = r.querySelector(".eye-btn");
    if (el.visible !== false) {
      eye.innerHTML = "&#128065;";
      eye.className = "ibtn eye-btn on";
    } else {
      eye.innerHTML = "&#128064;";
      eye.className = "ibtn eye-btn";
    }

    var lock = r.querySelector(".lock-btn");
    if (el.locked === true) {
      lock.innerHTML = "&#128274;";
      lock.className = "ibtn lock-btn locked";
      lock.title = "Desbloquear capa";
    } else {
      lock.innerHTML = "&#128275;";
      lock.className = "ibtn lock-btn";
      lock.title = "Bloquear capa";
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

    var typeNames = { image: "Imagen", video: "Video", audio: "Audio", text: "Texto" };
    edTitleType.textContent = (typeNames[el.type] || "Capa");
    edNameInput.value = el.name || "";
    edNameInput.oninput = function() {
      if (roomRef) roomRef.child(id).update({ name: edNameInput.value.trim() });
    };

    var btnLockToggle = document.getElementById("ed-lock-toggle");
    if (btnLockToggle) {
      btnLockToggle.innerHTML = el.locked === true ? "&#128275; Desbloquear" : "&#128274; Bloquear";
    }

    var mf = document.getElementById("edit-media-fields");
    var tf = document.getElementById("edit-text-fields");
    mf.innerHTML = "";
    tf.innerHTML = "";

    if (el.type === "text") {
      tf.innerHTML =
        '<div class="edit-group"><label>Texto</label>' +
        '<input type="text" id="ed-text" value="' + esc2(el.text || "") + '"></div>' +
        '<div class="grid2">' +
        '  <div class="edit-group"><label>Fuente</label>' +
        '    <select id="ed-font">' +
        '      <option value="\'Comic Sans MS\', \'Comic Sans\', cursive">Comic Sans</option>' +
        '      <option value="Impact, Charcoal, sans-serif">Impact</option>' +
        '      <option value="\'Arial Black\', Gadget, sans-serif">Arial Black</option>' +
        '      <option value="\'Montserrat\', sans-serif">Montserrat</option>' +
        '      <option value="\'Trebuchet MS\', sans-serif">Trebuchet MS</option>' +
        '      <option value="\'Courier New\', monospace">Courier New</option>' +
        '    </select>' +
        '  </div>' +
        '  <div class="edit-group"><label>Tamaño Relativo (' + (el.fontSize || 56) + ')</label>' +
        '    <input type="range" id="ed-fontsize" min="20" max="120" value="' + (el.fontSize || 56) + '">' +
        '  </div>' +
        '</div>' +
        '<div class="grid2">' +
        '  <div class="edit-group"><label>Color Letras</label>' +
        '    <input type="color" id="ed-textcolor" value="' + (el.textColor || "#ffffff") + '">' +
        '  </div>' +
        '  <div class="edit-group"><label>Color Borde</label>' +
        '    <input type="color" id="ed-strokecolor" value="' + (el.strokeColor || "#000000") + '">' +
        '  </div>' +
        '</div>' +
        '<div class="edit-group"><label>Fondo de Texto</label>' +
        '  <div style="display:flex;gap:8px;align-items:center">' +
        '    <select id="ed-bgtype" style="width:100px">' +
        '      <option value="none"' + (el.bgType === "none" || !el.bgType ? " selected" : "") + '>Ninguno</option>' +
        '      <option value="solid"' + (el.bgType === "solid" ? " selected" : "") + '>Sólido</option>' +
        '    </select>' +
        '    <input type="color" id="ed-bgcolor" value="' + (el.bgColor || "#000000") + '" style="flex:1">' +
        '  </div>' +
        '</div>';

      setTimeout(function() {
        bindInput("ed-text", "text");
        var fontEl = document.getElementById("ed-font");
        if (fontEl) {
          fontEl.value = el.fontFamily || "'Comic Sans MS', 'Comic Sans', cursive";
          fontEl.addEventListener("change", function() {
            if (roomRef) roomRef.child(id).update({ fontFamily: fontEl.value });
          });
        }
        var fsEl = document.getElementById("ed-fontsize");
        if (fsEl) {
          fsEl.addEventListener("input", function() {
            var v = parseInt(fsEl.value);
            if (roomRef) roomRef.child(id).update({ fontSize: v });
          });
        }
        var tcEl = document.getElementById("ed-textcolor");
        if (tcEl) {
          tcEl.addEventListener("input", function() {
            if (roomRef) roomRef.child(id).update({ textColor: tcEl.value });
          });
        }
        var scEl = document.getElementById("ed-strokecolor");
        if (scEl) {
          scEl.addEventListener("input", function() {
            if (roomRef) roomRef.child(id).update({ strokeColor: scEl.value });
          });
        }
        var bgTypeEl = document.getElementById("ed-bgtype");
        var bgColEl = document.getElementById("ed-bgcolor");
        if (bgTypeEl && bgColEl) {
          bgTypeEl.addEventListener("change", function() {
            if (roomRef) roomRef.child(id).update({ bgType: bgTypeEl.value });
          });
          bgColEl.addEventListener("input", function() {
            if (roomRef) roomRef.child(id).update({ bgColor: bgColEl.value, bgOpacity: 85 });
          });
        }
      }, 50);
    }

    if (el.type === "audio" || el.type === "video") {
      mf.innerHTML =
        '<button class="replay-btn" id="btn-replay-stream">&#9654; Tirar / Replay en el stream</button>' +
        (el.type === "audio" ? '<button class="btn" id="btn-local-preview" style="margin-bottom:8px">&#128266; Escuchar en aud\u00EDfonos</button>' : '') +
        '<div class="edit-group"><label>Volumen (' + (el.volume != null ? el.volume : 100) + '%)</label>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<input type="range" id="ed-volume" min="0" max="100" value="' + (el.volume != null ? el.volume : 100) + '" style="flex:1">' +
        '<span id="ed-volume-val" style="font-size:12px;width:32px;text-align:right;font-weight:600">' + (el.volume != null ? el.volume : 100) + '</span>' +
        '</div></div>' +
        '<div class="check-row"><label><input type="checkbox" id="ed-loop"' + (el.loop ? " checked" : "") + '> Bucle infinito</label></div>';

      setTimeout(function() {
        bindRange("ed-volume", "volume");
        var loopEl = document.getElementById("ed-loop");
        if (loopEl) loopEl.addEventListener("change", function() {
          if (roomRef) roomRef.child(id).update({ loop: loopEl.checked });
        });

        var replayBtn = document.getElementById("btn-replay-stream");
        if (replayBtn) {
          replayBtn.addEventListener("click", function() {
            if (roomRef) roomRef.child(id).update({ playTrigger: Date.now(), visible: true });
          });
        }

        var localBtn = document.getElementById("btn-local-preview");
        if (localBtn) {
          localBtn.addEventListener("click", function() {
            if (_localAudio) { _localAudio.pause(); _localAudio = null; localBtn.innerHTML = "&#128266; Escuchar en aud\u00EDfonos"; return; }
            if (!el.url) return;
            _localAudio = new Audio(el.url);
            _localAudio.volume = (el.volume != null ? el.volume : 100) / 100;
            _localAudio.play();
            localBtn.innerHTML = "&#9208; Pausar Audio";
            _localAudio.onended = function() {
              localBtn.innerHTML = "&#128266; Escuchar en aud\u00EDfonos";
              _localAudio = null;
            };
          });
        }
      }, 50);
    }

    document.getElementById("ed-opacity").value = el.opacity != null ? el.opacity : 100;
    document.getElementById("ed-opacity-val").textContent = (el.opacity != null ? el.opacity : 100) + "%";
    document.getElementById("ed-opacity").oninput = function() {
      var v = parseInt(document.getElementById("ed-opacity").value);
      if (roomRef) roomRef.child(id).update({ opacity: v });
      document.getElementById("ed-opacity-val").textContent = v + "%";
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
      if (confirm("\u00BFVas a borrar esta capa mi rey?")) {
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


