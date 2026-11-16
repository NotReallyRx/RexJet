(function(){
  const DEFAULT_WISP_URL="wss://wisp.freewisp.org/";
  const BASE=new URL("./", location.href);
  const css=`*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{font-family:"Noto Sans",system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#101010;color:#fff}
#content{position:relative;width:100%;height:100%;display:none}#content.active{display:block}
#browserFrame{width:100%;height:100%;border:0;display:block;background:#101010}
#loading{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(16,16,16,.92);color:#eee;padding:16px;z-index:5}
#loadingText{font-size:14px;white-space:pre-wrap;text-align:center;font-family:"JetBrains Mono",monospace}
.menu{position:fixed;top:12px;right:12px;display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid #555;background:#111;z-index:20;min-width:320px;font-family:"JetBrains Mono",monospace;color:#eee}
.menu.hidden{display:none}.menu label,.menu div{font-size:14px}.menu input,.menu button{font:inherit;font-size:14px;padding:4px 6px;border:1px solid #555;border-radius:0;background:#1a1a1a;color:#eee}.menu button{cursor:pointer}
#serverPicker{position:fixed;inset:0;display:flex;flex-direction:column;background:#101010;z-index:10}
#serverPicker.hidden{display:none}
.pageContainer{flex:1;display:flex;align-items:center;justify-content:center;padding:1.5em;overflow:auto}
.addServerForm{width:100%;max-width:28em;margin:0 auto}
.addServerForm h1{font-size:2em;font-weight:400;margin:0 0 1.2em}
.inputContainer{margin-bottom:1.2em}
.inputLabel{display:block;margin-bottom:.3em;font-size:1em;color:rgba(255,255,255,.8)}
.emby-input{width:100%;padding:.6em .7em;font-size:1em;font-family:inherit;color:#fff;background:rgba(0,0,0,.3);border:.07em solid rgba(255,255,255,.3);border-radius:.15em;outline:none}
.emby-input:focus{border-color:#00a4dc}
.fieldDescription{margin-top:.35em;font-size:.85em;color:rgba(255,255,255,.6)}
.raised{display:block;width:100%;margin:.7em 0;padding:.8em 1em;font-size:1em;font-family:inherit;border:0;border-radius:.2em;cursor:pointer}
.button-submit{background:#00a4dc;color:#fff;font-weight:500}
.button-submit:hover{background:#00b4f0}
.button-cancel{background:rgba(255,255,255,.14);color:#fff}
.button-cancel:hover{background:rgba(255,255,255,.2)}`;
  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
  document.body.innerHTML=`<div id="serverPicker"><div class="pageContainer"><form id="addServerForm" class="addServerForm" novalidate><h1>Connect to Server</h1><div class="inputContainer"><label class="inputLabel" for="serverInput">Host</label><input id="serverInput" class="emby-input" type="url" required><div class="fieldDescription">192.168.1.100:8096 or https://myserver.com</div></div><button type="submit" class="raised button-submit"><span>Connect</span></button><button id="cancelButton" type="button" class="raised button-cancel"><span>Cancel</span></button></form></div></div><div id="content"><iframe id="browserFrame" title="Browser"></iframe><div id="loading"><div id="loadingText">Loading...</div></div></div><div id="wispMenu" class="menu hidden"><label for="wispInput">Wisp server</label><input id="wispInput" type="text" spellcheck="false" autocomplete="off"><button id="saveWispButton" type="button">Save</button></div><div id="keybindsMenu" class="menu hidden"><div>Shift+Alt+K: Wisp server</div><div>Shift+Alt+R: Reload page</div><div>Shift+Alt+/: Keybinds</div></div>`;

  let controller=null,frame=null;
  const browserFrame=document.getElementById("browserFrame");
  const loading=document.getElementById("loading");
  const loadingText=document.getElementById("loadingText");
  const wispMenu=document.getElementById("wispMenu");
  const wispInput=document.getElementById("wispInput");
  const saveWispButton=document.getElementById("saveWispButton");
  const keybindsMenu=document.getElementById("keybindsMenu");
  const serverPicker=document.getElementById("serverPicker");
  const serverInput=document.getElementById("serverInput");
  const addServerForm=document.getElementById("addServerForm");
  const cancelButton=document.getElementById("cancelButton");
  const content=document.getElementById("content");

  const WISP_URL=localStorage.getItem("wispUrl")||DEFAULT_WISP_URL;
  wispInput.value=WISP_URL;
  serverInput.value=localStorage.getItem("serverUrl")||"";

  const hints=["Shift+Alt+K: Wisp server","Shift+Alt+R: Reload page","Shift+Alt+/ : Keybinds"];
  let hintTimer=null,hintIndex=0,loadingBase="";
  function renderLoading(){loadingText.textContent=loadingBase+"\n"+hints[hintIndex%hints.length];}
  function startHints(){if(hintTimer)clearInterval(hintTimer);hintIndex=0;renderLoading();hintTimer=setInterval(()=>{hintIndex++;renderLoading();},2000);}
  function stopHints(){if(hintTimer){clearInterval(hintTimer);hintTimer=null;}}
  function showLoading(t){loadingBase=t;loading.style.display="flex";startHints();}
  function hideLoading(){stopHints();loading.style.display="none";}
  function showError(msg){stopHints();loadingText.textContent=msg+"\nPress Shift+Alt+K to change Wisp server";loading.style.display="flex";wispMenu.classList.remove("hidden");wispInput.focus();}
  function normalizeInput(v){v=(v||"").trim();if(!v)return null;if(/^https?:\/\//i.test(v))return v;return `https://${v}`;}

  async function waitForServiceWorker(){
    const reg=await navigator.serviceWorker.register(new URL("sw.js",BASE).href,{scope:new URL("./",BASE).href,updateViaCache:"none"});
    await navigator.serviceWorker.ready;
    if(navigator.serviceWorker.controller)return navigator.serviceWorker.controller;
    if(!reg.active) throw new Error("Service worker is not active.");
    await new Promise((resolve,reject)=>{const to=setTimeout(()=>reject(new Error("Service worker did not take control.")),10000);navigator.serviceWorker.addEventListener("controllerchange",()=>{clearTimeout(to);resolve();},{once:true});});
    return navigator.serviceWorker.controller;
  }
  async function init(){
    if(controller)return controller;
    showLoading("Starting...");
    const serviceworker=await waitForServiceWorker();
    const transport=new LibcurlTransport.LibcurlClient({websocket:WISP_URL});
    controller=new $rexjetController.Controller({serviceworker,transport,config:{prefix:new URL("edu/",BASE).pathname,rexjetPath:new URL("rj/main.runtime.bundle.js",BASE).pathname,injectPath:new URL("rj/app.bundle.js",BASE).pathname,wasmPath:new URL("rj/studying.wasm",BASE).pathname}});
    await controller.wait();
    return controller;
  }
  function checkFrameError(){
    try{
      const doc=browserFrame.contentDocument;
      const text=(doc&&(doc.body?doc.body.innerText:doc.documentElement&&doc.documentElement.innerText)||"");
      if(/Internal Service Worker Error|Request failed with error code 7|Could not connect to server/i.test(text)){
        showError("Proxy connection failed.\nRecommended: change the Wisp server (Shift+Alt+K)");
      }
    }catch{}
  }
  async function start(url){
    try{
      serverPicker.classList.add("hidden");
      content.classList.add("active");
      const api=await init();
      frame=api.createFrame(browserFrame);
      browserFrame.addEventListener("load",()=>{hideLoading();checkFrameError();});
      showLoading("Loading...");
      frame.go(url);
    }catch(e){console.error(e);content.classList.add("active");serverPicker.classList.add("hidden");showError(`Failed: ${e.message}`);}
  }

  function connect(){
    const url=normalizeInput(serverInput.value);
    if(!url) return;
    localStorage.setItem("serverUrl",url);
    start(url);
  }

  addServerForm.addEventListener("submit",(e)=>{e.preventDefault();connect();});
  cancelButton.addEventListener("click",()=>{serverInput.value="";serverInput.focus();});
  saveWispButton.addEventListener("click",()=>{const v=wispInput.value.trim();if(!v)return;localStorage.setItem("wispUrl",v);location.reload();});
  document.addEventListener("keydown",(e)=>{
    if(!e.shiftKey||!e.altKey) return;
    const k=e.key.toLowerCase();
    if(k==="k"){e.preventDefault();wispMenu.classList.toggle("hidden");if(!wispMenu.classList.contains("hidden"))wispInput.focus();}
    else if(k==="r"){e.preventDefault();location.reload();}
    else if(k==="/"||k==="?"||e.code==="Slash"){e.preventDefault();keybindsMenu.classList.toggle("hidden");}
  });

  if(!serverInput.value) serverInput.focus();
})();
