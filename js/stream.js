/* === Firebase === */
var firebaseConfig={apiKey:"AIzaSyDummyPlaceholder123",databaseURL:"https://obss-1a2ae-default-rtdb.firebaseio.com",projectId:"obss-1a2ae",storageBucket:"obss-1a2ae.appspot.com",messagingSenderId:"000000000000",appId:"1:000000000000:web:000000000000"};
firebase.initializeApp(firebaseConfig);
var db=firebase.database();
var STREAM_ID="sala-stream-demo";
var roomRef=db.ref("streams/"+STREAM_ID+"/elements");
var box=document.getElementById("stream");
var state={};
var _tid=null;

/* === Listen === */
roomRef.on("value",function(snap){
  state=snap.val()||{};
  clearTimeout(_tid);
  _tid=setTimeout(renderAll,80);
});

/* === Render === */
function renderAll(){
  var keys=Object.keys(state);
  keys.sort(function(a,b){return(state[a].z||0)-(state[b].z||0)});
  var seen={};
  keys.forEach(function(id){
    seen[id]=1;
    var el=state[id];
    var d=box.querySelector('[data-id="'+id+'"]');
    if(!d){d=makeLayer(el);d.dataset.id=id;box.appendChild(d)}
    updLayer(d,el);
  });
  box.querySelectorAll("[data-id]").forEach(function(d){if(!seen[d.dataset.id]){d.remove()}});
}

function makeLayer(el){
  var d=document.createElement("div");
  d.className="layer"+(el.type==="audio"?" audio-layer":"");
  d.style.position="absolute";
  d.style.overflow="hidden";
  d.innerHTML='<div class="lw"></div>';
  return d;
}

function updLayer(d,el){
  d.style.left=(el.x*100)+"%";
  d.style.top=(el.y*100)+"%";
  d.style.width=(el.w*100)+"%";
  d.style.height=(el.h*100)+"%";
  d.style.opacity=(el.opacity!=null?el.opacity:100)/100;
  d.style.zIndex=el.z||0;
  d.style.display=(el.visible===false)?"none":"";
  var w=d.querySelector(".lw");

  if(el.type==="text"){
    w.style.background=el.bgType==="solid"?("rgba("+hexToRgb(el.bgColor)+","+(el.bgOpacity||0)/100+")"):"transparent";
    w.style.color=el.txtColor||"#fff";
    w.style.fontWeight=el.bold?"bold":"normal";
    w.style.fontStyle=el.italic?"italic":"normal";
    w.style.fontSize=(el.fontSize||48)+"px";
    w.style.lineHeight="1.1";
    w.style.webkitTextStroke="3px #000000";
    w.style.textShadow="2px 2px 4px #000";
    w.style.display="flex";
    w.style.alignItems="center";
    w.style.justifyContent="center";
    w.style.textAlign="center";
    w.style.wordWrap="break-word";
    w.style.overflow="hidden";
    w.style.padding="2%";
    w.innerHTML='<span>'+esc(el.text||"")+'</span>';
  } else if(el.type==="audio"){
    w.className="lw audio-lw";
    w.style.display="flex";
    w.style.alignItems="center";
    w.style.justifyContent="center";
    w.style.background="linear-gradient(135deg,#1a1e2e,#121520)";
    w.innerHTML='<div style="font-size:14px;opacity:.6">&#127925;</div>';
  } else {
    var src=el.url||"";
    if(el.type==="image"){
      var img=w.querySelector("img");
      if(!img){img=document.createElement("img");w.appendChild(img)}
      img.src=src;
      img.style.width="100%";
      img.style.height="100%";
      img.style.objectFit=el.objectFit||"fill";
      img.style.display="block";
    } else {
      var vid=w.querySelector("video");
      if(!vid){vid=document.createElement("video");vid.muted=false;w.appendChild(vid)}
      vid.src=src;
      vid.loop=!!el.loop;
      vid.volume=(el.volume||100)/100;
      vid.style.width="100%";
      vid.style.height="100%";
      vid.style.objectFit=el.objectFit||"fill";
      vid.style.display="block";
      try{
        if(el.visible===false){if(!vid.paused)vid.pause()}
        else if(vid.paused&&vid.src){vid.play().catch(function(){})}
      }catch(e){}
    }
  }
}

/* === Util === */
function esc(s){var d=document.createElement("span");d.textContent=s;return d.innerHTML}
function hexToRgb(h){var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return r+","+g+","+b}
