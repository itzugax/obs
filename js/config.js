/* ================================================================
 *  config.js — Configuración compartida Firebase + Sala
 * ----------------------------------------------------------------
 *  INSTRUCCIONES RÁPIDAS:
 *  1) Crea un proyecto en https://console.firebase.google.com
 *  2) Activa "Realtime Database" y ponla en MODO PRUEBA
 *  3) Ve a Configuración del proyecto → Tus apps → Añade app web
 *  4) Copia el objeto firebaseConfig que te dé y rellena abajo
 *  5) Elige un STREAM_ID único (solo caracteres alfanuméricos)
 *     y compártelo SOLO con tu amigo que tiene OBS
 * ================================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyCWePF8D8Bo9Y0C4Wlt2fH1Ne6rjtefP28",
  authDomain:        "obss-1a2ae.firebaseapp.com",
  databaseURL:       "https://obss-1a2ae-default-rtdb.firebaseio.com",
  projectId:         "obss-1a2ae",
  storageBucket:     "obss-1a2ae.firebasestorage.app",
  messagingSenderId: "273738937122",
  appId:             "1:273738937122:web:639ec775a5c1ea62bd6b7b"
};

/* ID de la sala — debe ser IDÉNTICO en index.html y obs.html */
const STREAM_ID = "sala-stream-demo";
