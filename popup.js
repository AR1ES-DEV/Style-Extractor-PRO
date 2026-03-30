//  ICONS 
const icons = {
  check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`,
  x:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>`,
  cursor:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 2l7 18 2-7 7-2L3 2z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.2" stroke-width="3"/><path d="M22 12a10 10 0 00-10-10" stroke-width="3" stroke-linecap="round"/></svg>`,
  trash:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
};

const VERSION = "1.0.0";

let lastData = null;
let allColors = [];
let allFonts  = [];
let allTech   = [];
let currentDomain = null;

//  RATE LIMIT 
let lastExtractTime = 0;
const EXTRACT_COOLDOWN = 2000;

//  HELPERS 
function hexToHue(hex) {
  if (!hex || hex.length < 7) return -1;
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  if (max===min) return -1;
  const d=max-min; let h;
  switch(max){
    case r: h=((g-b)/d+(g<b?6:0))/6; break;
    case g: h=((b-r)/d+2)/6; break;
    case b: h=((r-g)/d+4)/6; break;
  }
  return h*360;
}
function hexLightness(hex) {
  if (!hex||hex.length<7) return 0;
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  return (Math.max(r,g,b)+Math.min(r,g,b))/2;
}
function perceivedLuminance(hex) {
  if (!hex||hex.length<7) return 0;
  const lin=c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);
  return 0.2126*lin(parseInt(hex.slice(1,3),16)/255)
       + 0.7152*lin(parseInt(hex.slice(3,5),16)/255)
       + 0.0722*lin(parseInt(hex.slice(5,7),16)/255);
}
function getColorGroup(hex) {
  const hue=hexToHue(hex), l=hexLightness(hex);
  if (hue===-1){ if(l<0.15)return"Black"; if(l>0.85)return"White"; return"Gray"; }
  if (l<0.1) return "Black"; if (l>0.92) return "White";
  if (hue<15||hue>=345) return "Red";
  if (hue<45) return "Orange"; if (hue<70)  return "Yellow";
  if (hue<165) return "Green"; if (hue<195) return "Cyan";
  if (hue<255) return "Blue";  if (hue<290) return "Purple";
  if (hue<345) return "Pink";
  return "Other";
}
function copyToClipboard(t){ navigator.clipboard.writeText(t); }

//  STATUS 
function setStatus(type, msg, icon=""){
  const el=document.getElementById("status");
  el.className=type||"";
  el.innerHTML=`${icon}<span>${msg}</span>`;
}

//  STORAGE 
const save = (k,v) => new Promise(r=>chrome.storage.local.set({[k]:v},r));
const load = k     => new Promise(r=>chrome.storage.local.get(k,d=>r(d[k]||null)));
const remove = k   => new Promise(r=>chrome.storage.local.remove(k,r));

//  BADGE 
function setBadge(text, color){
  chrome.action.setBadgeText({text: text||""});
  if (color) chrome.action.setBadgeBackgroundColor({color});
}

//  CLEAR CACHE 
async function handleClear(){
  if (!currentDomain) return;
  await remove(`styles_${currentDomain}`);
  await remove(`tech_${currentDomain}`);
  lastData=null; allColors=[]; allFonts=[]; allTech=[];
  document.getElementById("colors").innerHTML=`<p class="empty-state">Click <strong style="color:#a78bfa">Extract Styles</strong> to get started</p>`;
  document.getElementById("fonts").innerHTML =`<p class="empty-state">Click <strong style="color:#a78bfa">Extract Styles</strong> to get started</p>`;
  document.getElementById("techList").innerHTML=`<p class="empty-state">No technologies detected</p>`;
  setBadge("","");
  setStatus("success","Cache cleared",icons.check);
}

//  FOOTER 
function injectFooter(){
  if (document.getElementById("se-footer")) return;
  const footer = document.createElement("div");
  footer.id = "se-footer";
  footer.style.cssText=`
    text-align:center;padding:10px 0 4px;margin-top:10px;
    border-top:1px solid rgba(255,255,255,0.06);
    font-size:12px;color:#2d3f55;
    font-family:'Space Grotesk',sans-serif;letter-spacing:0.02em;
  `;
  footer.innerHTML=`
    made with <span style="color:#e05c8a;font-size:11px">❤️</span> by
    <span style="background:linear-gradient(100deg,#a78bfa,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:600">AR1ES</span>
    &nbsp;·&nbsp; v${VERSION}
  `;
  document.querySelector(".container").appendChild(footer);
}

//  INIT 
document.addEventListener("DOMContentLoaded", async ()=>{
  document.getElementById("extract").onclick        = handleExtract;
  document.getElementById("export").onclick         = handleExport;
  document.getElementById("exportCSS").onclick      = handleExportCSS;
  document.getElementById("exportTailwind").onclick = handleExportTailwind;
  document.getElementById("exportPng").onclick      = handleExportPng;
  document.getElementById("inspect").onclick        = handleInspect;
  document.getElementById("detectTech").onclick     = handleDetectTech;
  document.getElementById("colorSearch").oninput    = e=>filterColors(e.target.value);
  document.getElementById("fontSearch").oninput     = e=>filterFonts(e.target.value);

  const clearBtn = document.createElement("button");
  clearBtn.id = "clearCache";
  clearBtn.title = "Clear cached data for this site";
  clearBtn.style.cssText=`
    width:auto;padding:3px 8px;margin:0;
    background:transparent;border:1px solid rgba(255,255,255,0.07);
    border-radius:6px;color:#2d3f55;font-size:10px;
    display:inline-flex;align-items:center;gap:4px;
    cursor:pointer;transition:color 0.12s,border-color 0.12s;
    margin-left:auto;flex-shrink:0;
  `;
  clearBtn.innerHTML=`${icons.trash}<span>Clear</span>`;
  clearBtn.onmouseenter=()=>{ clearBtn.style.color="#f87171"; clearBtn.style.borderColor="rgba(248,113,113,0.3)"; };
  clearBtn.onmouseleave=()=>{ clearBtn.style.color="#2d3f55"; clearBtn.style.borderColor="rgba(255,255,255,0.07)"; };
  clearBtn.onclick = handleClear;

  const statusEl = document.getElementById("status");
  statusEl.style.justifyContent = "flex-start";
  statusEl.parentNode.insertBefore(clearBtn, statusEl.nextSibling);

  document.querySelectorAll(".tab").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    };
  });

  injectFooter();

  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});

  if (!tab?.url||!tab.url.startsWith("http")){
    setStatus("error","Navigate to a webpage to get started",icons.x);
    return;
  }

  try {
    currentDomain = new URL(tab.url).hostname;
    const cached=await load(`styles_${currentDomain}`);
    if (cached){
      lastData=cached; allColors=cached.colors; allFonts=cached.fonts;
      displayResults(cached);
      setStatus("success",`Restored — ${currentDomain}`,icons.check);
      setBadge("✓","#34d399");
    } else {
      document.getElementById("colors").innerHTML=`<p class="empty-state">Click <strong style="color:#a78bfa">Extract Styles</strong> to get started</p>`;
      document.getElementById("fonts").innerHTML =`<p class="empty-state">Click <strong style="color:#a78bfa">Extract Styles</strong> to get started</p>`;
    }
    const cachedTech=await load(`tech_${currentDomain}`);
    if (cachedTech){ allTech=cachedTech; displayTech(cachedTech); }
  } catch(_){}
});

//  EXTRACT 
async function handleExtract(){
  const now=Date.now();
  if (now-lastExtractTime<EXTRACT_COOLDOWN){
    const wait=Math.ceil((EXTRACT_COOLDOWN-(now-lastExtractTime))/1000);
    return setStatus("error",`Please wait ${wait}s before re-extracting`,icons.x);
  }

  setStatus(null,"Extracting styles…",icons.spinner);
  setBadge("…","#7c3aed");

  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url)          return setStatus("error","No active tab found",icons.x);
  if (!tab.url.startsWith("http")) return setStatus("error","Can't run on this page — navigate to a website",icons.x);

  lastExtractTime=Date.now();

  chrome.scripting.executeScript({target:{tabId:tab.id},func:extractStyles},async res=>{
    if (!res||!res[0]){
      setBadge("!","#f87171");
      return setStatus("error","Extraction failed — try refreshing the page",icons.x);
    }
    lastData=res[0].result; allColors=lastData.colors; allFonts=lastData.fonts;
    try{ await save(`styles_${currentDomain}`,lastData); }catch(_){}
    displayResults(lastData);
    const cap=lastData.colors.length>=80?" (capped at 80)":"";
    setStatus("success",`${lastData.colors.length} colors${cap} · ${lastData.fonts.length} fonts`,icons.check);
    setBadge("✓","#34d399");
  });
}

//  EXPORT 
function handleExport(){
  if (!lastData) return setStatus("error","Extract first",icons.x);
  dl(JSON.stringify(lastData,null,2),"application/json","styles.json");
  setStatus("success","Exported JSON",icons.check);
}
function handleExportCSS(){
  if (!lastData) return setStatus("error","Extract first",icons.x);
  let css=":root {\n";
  lastData.colors.forEach((c,i)=>{ css+=`  --color-${i+1}: ${c.hex};\n`; });
  lastData.fonts.forEach((f,i)=>{ css+=`  --font-${i+1}: '${f.family}', sans-serif;\n`; });
  css+="}\n";
  dl(css,"text/css","variables.css");
  setStatus("success","Exported CSS variables",icons.check);
}
function handleExportTailwind(){
  if (!lastData) return setStatus("error","Extract first",icons.x);
  const colors={}, fontFamily={};
  lastData.colors.forEach((c,i)=>{ colors[`brand-${i+1}`]=c.hex; });
  lastData.fonts.forEach((f,i)=>{ fontFamily[`brand-${i+1}`]=[f.family,"sans-serif"]; });
  const cfg=`/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify(colors,null,6)},\n      fontFamily: ${JSON.stringify(fontFamily,null,6)}\n    }\n  }\n}\n`;
  dl(cfg,"text/javascript","tailwind.config.js");
  setStatus("success","Exported Tailwind config",icons.check);
}
function dl(content,mime,filename){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=filename; a.click();
}

//  PNG EXPORT 
function handleExportPng(){
  if (!lastData?.colors?.length) return setStatus("error","Extract first",icons.x);
  const colors=lastData.colors;
  const COLS=6,SWATCH=72,LABEL_H=26,GAP=8,PAD=18,HEADER=52;
  const rows=Math.ceil(colors.length/COLS);
  const W=COLS*(SWATCH+GAP)-GAP+PAD*2;
  const H=HEADER+rows*(SWATCH+LABEL_H+GAP)-GAP+PAD*2;
  const canvas=document.createElement("canvas");
  canvas.width=W*2; canvas.height=H*2;
  const ctx=canvas.getContext("2d"); ctx.scale(2,2);

  ctx.fillStyle="#080b12"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle="rgba(255,255,255,0.025)";
  for(let x=PAD;x<W;x+=20) for(let y=PAD;y<H;y+=20){ ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill(); }

  ctx.font="bold 15px 'Space Grotesk',sans-serif"; ctx.fillStyle="#f1f5f9";
  ctx.fillText("Color Palette",PAD,PAD+14);
  ctx.font="10px 'Space Grotesk',sans-serif"; ctx.fillStyle="#475569";
  ctx.fillText(`${colors.length} unique colors found by Style Extractor PRO`,PAD,PAD+28);

  colors.forEach((c,i)=>{
    const col=i%COLS,row=Math.floor(i/COLS);
    const x=PAD+col*(SWATCH+GAP), y=HEADER+PAD/2+row*(SWATCH+LABEL_H+GAP);
    ctx.fillStyle=c.hex; ctx.beginPath(); ctx.roundRect(x,y,SWATCH,SWATCH,8); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(x,y,SWATCH,SWATCH,8); ctx.stroke();
    const lum=perceivedLuminance(c.hex);
    ctx.fillStyle=lum>0.35?"rgba(0,0,0,0.55)":"rgba(0,0,0,0.72)";
    ctx.beginPath(); ctx.roundRect(x+4,y+SWATCH-20,SWATCH-8,16,[0,0,4,4]); ctx.fill();
    ctx.font="bold 8px monospace"; ctx.fillStyle="#ffffff"; ctx.textAlign="center";
    ctx.fillText(c.hex,x+SWATCH/2,y+SWATCH-9);
    const hslShort=c.hsl.replace("hsl(","").replace(")","");
    ctx.font="7.5px monospace"; ctx.fillStyle="#64748b"; ctx.textAlign="center";
    ctx.fillText(hslShort,x+SWATCH/2,y+SWATCH+14);
  });

  ctx.textAlign="left"; ctx.font="8px monospace"; ctx.fillStyle="rgba(255,255,255,0.06)";
  ctx.fillText(`Style Extractor PRO v${VERSION} · made with ♥ by  AR1ES`,PAD,H-6);

  canvas.toBlob(blob=>{
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="palette.png"; a.click();
    setStatus("success","Exported palette PNG",icons.check);
  });
}

//  INSPECT 
async function handleInspect(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url||!tab.url.startsWith("http")) return setStatus("error","Can't inspect this page",icons.x);
  // close popup AFTER injection so the script is guaranteed to be injected
  chrome.scripting.executeScript({target:{tabId:tab.id},func:enableInspect},()=>window.close());
}

function enableInspect(){
  ["__se_overlay__","__se_tip__","__se_rl_t__","__se_rl_b__","__se_rl_l__","__se_rl_r__",
   "__se_tag__","__se_toast__","__se_dim__"].forEach(id=>{ const e=document.getElementById(id); if(e) e.remove(); });

  const Z="2147483647", PURPLE="#7c3aed", CYAN="#06b6d4", BG="#0d1117";

  const overlay=mk("div","__se_overlay__",`position:fixed;z-index:${Z};pointer-events:none;background:rgba(124,58,237,0.08);border:2px solid ${PURPLE};border-radius:4px;box-shadow:0 0 0 1px rgba(124,58,237,0.25),inset 0 0 16px rgba(124,58,237,0.06);transition:left 60ms ease,top 60ms ease,width 60ms ease,height 60ms ease;`);
  const rs=`position:fixed;z-index:${Z};pointer-events:none;background:${CYAN};opacity:0.3;`;
  const rT=mk("div","__se_rl_t__",rs+"height:1px;width:100%;left:0;");
  const rB=mk("div","__se_rl_b__",rs+"height:1px;width:100%;left:0;");
  const rL=mk("div","__se_rl_l__",rs+"width:1px;height:100%;top:0;");
  const rR=mk("div","__se_rl_r__",rs+"width:1px;height:100%;top:0;");
  const dim=mk("div","__se_dim__",`position:fixed;z-index:${Z};pointer-events:none;background:${CYAN};color:#000;font:700 9px/1 'Space Grotesk',monospace;padding:2px 6px;border-radius:3px;display:none;`);
  const tag=mk("div","__se_tag__",`position:fixed;z-index:${Z};pointer-events:none;background:${BG};border:1px solid ${PURPLE};font:600 10px/1 'Space Grotesk',monospace;color:${CYAN};padding:3px 8px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,0.7);`);
  const tip=mk("div","__se_tip__",`position:fixed;z-index:${Z};pointer-events:auto;background:${BG};border:1px solid rgba(124,58,237,0.45);border-radius:12px;padding:12px 14px;font:400 11px/1.8 'Space Grotesk',monospace;color:#94a3b8;max-width:252px;min-width:200px;box-shadow:0 12px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(6,182,212,0.06);`);
  const toast=mk("div","__se_toast__",`position:fixed;z-index:${Z};pointer-events:none;bottom:28px;left:50%;transform:translateX(-50%) translateY(10px);background:${PURPLE};color:#fff;font:700 11px/1 'Space Grotesk',sans-serif;padding:8px 18px;border-radius:20px;box-shadow:0 4px 24px rgba(124,58,237,0.55);opacity:0;transition:opacity 0.15s ease,transform 0.15s ease;`);

  document.body.append(overlay,rT,rB,rL,rR,dim,tag,tip,toast);
  document.body.style.cursor="crosshair";

  let toastTimer=null;
  function showToast(msg){
    toast.textContent=msg;
    toast.style.opacity="1"; toast.style.transform="translateX(-50%) translateY(0)";
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{ toast.style.opacity="0"; toast.style.transform="translateX(-50%) translateY(10px)"; },1500);
  }

  function swatch(color){ return `<span style="display:inline-block;width:9px;height:9px;background:${color};border-radius:2px;vertical-align:middle;margin-right:4px;border:1px solid rgba(255,255,255,0.12)"></span>`; }
  function hexFrom(color){ const m=color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(!m)return color; return `#${((1<<24)|(+m[1]<<16)|(+m[2]<<8)|+m[3]).toString(16).slice(1).toUpperCase()}`; }
  function propRow(label,value,copy){ if(!value||value==="none"||value==="0px"||value==="normal")return""; const safe=(copy||value).slice(0,40); return `<div data-copy="${safe}" style="display:flex;justify-content:space-between;gap:10px;padding:1px 3px;border-radius:4px;cursor:pointer;"><span style="color:#475569;flex-shrink:0">${label}</span><span style="color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${value}</span></div>`; }
  function colorPropRow(label,color){ if(!color||color==="rgba(0, 0, 0, 0)"||color==="transparent")return""; const hex=hexFrom(color); return `<div data-copy="${hex}" style="display:flex;justify-content:space-between;gap:10px;padding:1px 3px;border-radius:4px;cursor:pointer;"><span style="color:#475569;flex-shrink:0">${label}</span><span style="color:#e2e8f0">${swatch(color)}${hex}</span></div>`; }
  function divider(){ return `<div style="height:1px;background:rgba(255,255,255,0.05);margin:5px 0"></div>`; }

  const onMove=(e)=>{
    const ignore=new Set([overlay,tip,tag,dim,rT,rB,rL,rR,toast]);
    const el=Array.from(document.elementsFromPoint(e.clientX,e.clientY)).find(x=>!ignore.has(x));
    if(!el||el===document.body||el===document.documentElement)return;
    const rect=el.getBoundingClientRect(); const s=getComputedStyle(el);
    overlay.style.left=rect.left+"px"; overlay.style.top=rect.top+"px";
    overlay.style.width=rect.width+"px"; overlay.style.height=rect.height+"px";
    rT.style.top=rect.top+"px"; rB.style.top=(rect.bottom-1)+"px";
    rL.style.left=rect.left+"px"; rR.style.left=(rect.right-1)+"px";
    const W=Math.round(rect.width),H=Math.round(rect.height);
    if(W>60&&H>20){ dim.style.display="block"; dim.textContent=`${W} × ${H}`; dim.style.left=(rect.left+W/2-dim.offsetWidth/2)+"px"; dim.style.top=(rect.top+H/2-dim.offsetHeight/2)+"px"; } else { dim.style.display="none"; }
    const tagStr=el.tagName.toLowerCase()+(el.id?`#${el.id}`:"")+( el.className&&typeof el.className==="string"?"."+el.className.trim().split(/\s+/).slice(0,2).join("."):"");
    tag.textContent=tagStr; tag.style.left=Math.min(rect.left,window.innerWidth-200)+"px"; tag.style.top=(rect.top>24?rect.top-22:rect.top+4)+"px";
    const fontFam=s.fontFamily.split(",")[0].replace(/['"]/g,"").trim();
    tip.innerHTML=`
      <div style="font-weight:700;color:${PURPLE};font-size:11px;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${tagStr}</div>
      <div style="display:grid;gap:1px;">
        ${propRow("size",`${W} × ${H}px`)}
        ${divider()}
        ${propRow("font",fontFam.length>22?fontFam.slice(0,22)+"…":fontFam,fontFam)}
        ${propRow("font-size",s.fontSize)}
        ${propRow("font-weight",s.fontWeight)}
        ${propRow("line-height",s.lineHeight)}
        ${divider()}
        ${colorPropRow("color",s.color)}
        ${colorPropRow("background",s.backgroundColor)}
        ${colorPropRow("border",s.borderColor)}
        ${divider()}
        ${propRow("padding",s.padding)}
        ${propRow("margin",s.margin)}
        ${propRow("border-radius",s.borderRadius)}
      </div>
      <div style="margin-top:8px;font-size:9px;color:#ffffff;text-transform:uppercase;letter-spacing:0.05em">click row to copy · esc or click to exit</div>
    `;
    tip.querySelectorAll("[data-copy]").forEach(r=>{ r.onmouseenter=()=>{ r.style.background="rgba(124,58,237,0.15)"; }; r.onmouseleave=()=>{ r.style.background=""; }; });
    const TW=256,TH=280; let tx=e.clientX+18,ty=e.clientY+18;
    if(tx+TW>window.innerWidth) tx=e.clientX-TW-12;
    if(ty+TH>window.innerHeight) ty=e.clientY-TH-12;
    if(tx<4)tx=4; if(ty<4)ty=4;
    tip.style.left=tx+"px"; tip.style.top=ty+"px";
  };

  // walk up from click target to find data-copy
  const onClick=(e)=>{
    let el=e.target;
    while(el&&el!==document.body){
      if(el.dataset&&el.dataset.copy!==undefined){
        e.preventDefault(); e.stopPropagation();
        navigator.clipboard.writeText(el.dataset.copy).catch(()=>{});
        showToast(`Copied ${el.dataset.copy}`);
        return;
      }
      el=el.parentElement;
    }
    e.preventDefault(); e.stopPropagation(); cleanup();
  };

  const onKeyDown=(e)=>{
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); cleanup(); }
  };

  function cleanup(){
    document.removeEventListener("mousemove",onMove,true);
    document.removeEventListener("click",onClick,true);
    document.removeEventListener("keydown",onKeyDown,true);
    document.body.style.cursor="default";
    [overlay,tip,rT,rB,rL,rR,dim,tag].forEach(el=>{ el.style.opacity="0"; el.style.transition="opacity 0.18s ease"; });
    setTimeout(()=>{ [overlay,tip,rT,rB,rL,rR,dim,tag,toast].forEach(el=>el.remove()); },220);
  }

  document.addEventListener("mousemove",onMove,true);
  document.addEventListener("click",onClick,true);
  document.addEventListener("keydown",onKeyDown,true);

  function mk(tagName,id,css){ const el=document.createElement(tagName); el.id=id; el.style.cssText=css; return el; }
}

//  DETECT TECH 
async function handleDetectTech(){
  setStatus(null,"Detecting stack…",icons.spinner);
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url||!tab.url.startsWith("http")) return setStatus("error","Can't detect on this page",icons.x);
  chrome.scripting.executeScript({target:{tabId:tab.id},func:detectTech},async res=>{
    if(!res||!res[0]) return setStatus("error","Detection failed",icons.x);
    allTech=res[0].result;
    try{ await save(`tech_${currentDomain}`,allTech); }catch(_){}
    displayTech(allTech);
    setStatus("success",`${allTech.length} technologies detected`,icons.check);
  });
}

function extractStyles(){
  let raw=[]; const fontData=new Map();
  document.querySelectorAll("*").forEach(el=>{
    const s=getComputedStyle(el);
    const add=v=>{ if(v&&v.includes("rgb"))raw.push(v); };
    add(s.color); add(s.backgroundColor); add(s.borderColor); add(s.outlineColor);
    const shadow=s.boxShadow; if(shadow){ const m=shadow.match(/rgba?\([^)]+\)/); if(m)add(m[0]); }
    const fam=s.fontFamily.split(",")[0].replace(/['"]/g,"").trim();
    if(fam){ const e=fontData.get(fam)||{family:fam,sizes:new Set(),weights:new Set()}; e.sizes.add(s.fontSize); e.weights.add(s.fontWeight); fontData.set(fam,e); }
  });
  const loaded=new Set(Array.from(document.fonts||[]).map(f=>f.family.replace(/['"]/g,"").trim()));
  const system=new Set(["Arial","Helvetica","Times New Roman","Times","Courier New","Courier","Georgia","Palatino","Garamond","Verdana","Comic Sans MS","Trebuchet MS","Impact","system-ui","-apple-system","BlinkMacSystemFont","Segoe UI","Roboto","sans-serif","serif","monospace"]);
  const fonts=Array.from(fontData.values()).map(f=>({family:f.family,sizes:[...f.sizes].slice(0,5),weights:[...f.weights],isWeb:loaded.has(f.family)||!system.has(f.family)}));
  const hexArr=[]; const seen=new Set();
  raw.forEach(r=>{ const m=r.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(!m)return; const h=`#${((1<<24)|(+m[1]<<16)|(+m[2]<<8)|+m[3]).toString(16).slice(1).toUpperCase()}`; if(!seen.has(h)){seen.add(h);hexArr.push(h);} });
  const deduped=[];
  hexArr.forEach(h=>{ const[r1,g1,b1]=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; if(!deduped.some(u=>{ const[r2,g2,b2]=[parseInt(u.slice(1,3),16),parseInt(u.slice(3,5),16),parseInt(u.slice(5,7),16)]; return Math.sqrt((r1-r2)**2+(g1-g2)**2+(b1-b2)**2)<20; }))deduped.push(h); });
  const colors=deduped.slice(0,80).map(hex=>{ const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255; const max=Math.max(r,g,b),min=Math.min(r,g,b); let h,s,l=(max+min)/2; if(max===min){h=s=0;}else{const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}} return{hex,hsl:`hsl(${Math.round(h*360)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`}; });
  return{colors,fonts};
}

function detectTech(){
  const scripts=Array.from(document.scripts).map(s=>s.src).join(" ");
  const links=Array.from(document.querySelectorAll("link")).map(l=>l.href).join(" ");
  const metas=Array.from(document.querySelectorAll("meta")).map(m=>`${m.name} ${m.content}`).join(" ");
  const html=document.documentElement.outerHTML+scripts+links+metas;
  const globals=Object.keys(window).join(" ");
  const generator=(document.querySelector('meta[name="generator"]')?.content||"").toLowerCase();

  const RULES=[
    {name:"React",cat:"Framework",patterns:[/react-dom/i],global:"__REACT_DEVTOOLS_GLOBAL_HOOK__"},
    {name:"Next.js",cat:"Framework",patterns:[/__NEXT_DATA__/,/_next\//]},
    {name:"Vue.js",cat:"Framework",patterns:[/vue\.runtime/i],global:"__VUE__"},
    {name:"Angular",cat:"Framework",patterns:[/ng-version=/,/angular\.min\.js/]},
    {name:"Svelte",cat:"Framework",patterns:[/svelte/i,/__svelte/]},
    {name:"Nuxt.js",cat:"Framework",patterns:[/__NUXT__/,/_nuxt\//]},
    {name:"Remix",cat:"Framework",patterns:[/__remixContext/,/remix\.run/]},
    {name:"Astro",cat:"Framework",patterns:[/astro:page-load/,/astro-island/]},
    {name:"Gatsby",cat:"Framework",patterns:[/___gatsby/,/gatsby-/]},
    {name:"Tailwind CSS",cat:"CSS",patterns:[/tailwind/i,/cdn\.tailwindcss/]},
    {name:"Bootstrap",cat:"CSS",patterns:[/bootstrap\.min\.css/,/bootstrap\.bundle/]},
    {name:"Bulma",cat:"CSS",patterns:[/bulma/i]},
    {name:"Material UI",cat:"CSS",patterns:[/mui\/material/,/@mui\/core/]},
    {name:"jQuery",cat:"Library",patterns:[/jquery\.min\.js/,/jquery-\d/],global:"jQuery"},
    {name:"Three.js",cat:"Library",patterns:[/three\.min\.js/,/three\.module/],global:"THREE"},
    {name:"GSAP",cat:"Library",patterns:[/gsap\.min\.js/,/ScrollTrigger/],global:"gsap"},
    {name:"Framer Motion",cat:"Library",patterns:[/framer-motion/]},
    {name:"D3.js",cat:"Library",patterns:[/d3\.min\.js/,/d3-selection/],global:"d3"},
    {name:"Alpine.js",cat:"Library",patterns:[/alpinejs/,/x-data=/],global:"Alpine"},
    {name:"Chart.js",cat:"Library",patterns:[/chart\.min\.js/,/chart\.umd/],global:"Chart"},
    {name:"Lottie",cat:"Library",patterns:[/lottie-web/,/lottie\.min/]},
    {name:"WordPress",cat:"Platform",patterns:[/wp-content\/themes/,/wp-includes/],generator:"wordpress"},
    {name:"WooCommerce",cat:"Platform",patterns:[/woocommerce/i,/wc-block/,/\/wc-api\//]},
    {name:"Shopify",cat:"Platform",patterns:[/cdn\.shopify\.com/,/Shopify\.theme/]},
    {name:"Webflow",cat:"Platform",patterns:[/webflow\.com\/css/,/data-wf-/]},
    {name:"Wix",cat:"Platform",patterns:[/static\.wixstatic\.com/,/wix-warmup-data/]},
    {name:"Squarespace",cat:"Platform",patterns:[/squarespace-cdn\.com/],generator:"squarespace"},
    {name:"Ghost",cat:"Platform",patterns:[/ghost\.org\/js/,/ghost-url/],generator:"ghost"},
    {name:"Framer",cat:"Platform",patterns:[/framer-sites/,/framer\.com\/m\//]},
    {name:"Magento",cat:"Platform",patterns:[/mage\/cookies/,/Magento_Ui/],generator:"magento"},
    {name:"BigCommerce",cat:"Platform",patterns:[/cdn\.bcapp\.dev/,/bigcommerce\.com\/s-/]},
    {name:"PrestaShop",cat:"Platform",patterns:[/prestashop/i,/\/modules\/ps_/],generator:"prestashop"},
    {name:"OpenCart",cat:"Platform",patterns:[/route=common\/home/,/opencart/i]},
    {name:"Drupal",cat:"Platform",patterns:[/drupal\.js/,/Drupal\.settings/,/sites\/default\/files/],generator:"drupal"},
    {name:"Joomla",cat:"Platform",patterns:[/\/media\/jui\//,/joomla/i],generator:"joomla"},
    {name:"Contentful",cat:"Platform",patterns:[/ctfassets\.net/,/contentful/i]},
    {name:"Sanity",cat:"Platform",patterns:[/sanity\.io/,/sanityClient/]},
    {name:"Prismic",cat:"Platform",patterns:[/prismic\.io/,/prismicio/]},
    {name:"Craft CMS",cat:"Platform",patterns:[/craftcms/i,/craft\.app/],generator:"craft"},
    {name:"Bubble",cat:"Platform",patterns:[/bubble\.io/,/bubble-r/]},
    {name:"Google Analytics",cat:"Analytics",patterns:[/googletagmanager\.com/,/gtag\(/]},
    {name:"Google Tag Manager",cat:"Analytics",patterns:[/googletagmanager\.com\/gtm\.js/]},
    {name:"Hotjar",cat:"Analytics",patterns:[/hotjar\.com\/c\/hotjar-/,/hjSiteSettings/]},
    {name:"Segment",cat:"Analytics",patterns:[/cdn\.segment\.com/]},
    {name:"Mixpanel",cat:"Analytics",patterns:[/cdn\.mxpnl\.com/,/mixpanel\.com\/libs/]},
    {name:"PostHog",cat:"Analytics",patterns:[/posthog\.com\/static/],global:"posthog"},
    {name:"Plausible",cat:"Analytics",patterns:[/plausible\.io\/js/]},
    {name:"Clarity",cat:"Analytics",patterns:[/clarity\.ms\/tag/]},
    {name:"Intercom",cat:"Support",patterns:[/widget\.intercom\.io/,/intercomSettings/]},
    {name:"HubSpot",cat:"Marketing",patterns:[/js\.hs-scripts\.com/]},
    {name:"Klaviyo",cat:"Marketing",patterns:[/static\.klaviyo\.com/]},
    {name:"Mailchimp",cat:"Marketing",patterns:[/chimpstatic\.com/,/mc\.us\d+\.list-manage/]},
    {name:"Stripe",cat:"Payments",patterns:[/js\.stripe\.com/],global:"Stripe"},
    {name:"Cloudflare",cat:"CDN",patterns:[/cloudflare\.com\/ajax/,/data-cf-beacon/]},
    {name:"Vercel",cat:"Hosting",patterns:[/vercel\.app/,/_vercel\/insights/]},
    {name:"Netlify",cat:"Hosting",patterns:[/netlify\.app/,/netlify\.com\/v1/]},
    {name:"Google Fonts",cat:"Fonts",patterns:[/fonts\.googleapis\.com/]},
    {name:"Adobe Fonts",cat:"Fonts",patterns:[/use\.typekit\.net/,/typekit/]},
    {name:"Font Awesome",cat:"Icons",patterns:[/fontawesome\.com/,/font-awesome/]},
  ];

  const found=[],seen2=new Set();
  RULES.forEach(rule=>{
    if(seen2.has(rule.name))return;
    let m=rule.global&&typeof window[rule.global]!=="undefined";
    if(!m&&rule.generator) m=generator.includes(rule.generator);
    if(!m) for(const p of rule.patterns){ if(p.test(html)||p.test(globals)){m=true;break;} }
    if(m){seen2.add(rule.name);found.push({name:rule.name,cat:rule.cat});}
  });
  return found;
}

//  FILTER 
function filterColors(q){
  q=q.toLowerCase();
  const f=q?allColors.filter(c=>c.hex.toLowerCase().includes(q)||c.hsl.toLowerCase().includes(q)||getColorGroup(c.hex).toLowerCase().includes(q)):allColors;
  renderColorGrid(f);
}
function filterFonts(q){
  q=q.toLowerCase();
  renderFontList(q?allFonts.filter(f=>f.family.toLowerCase().includes(q)):allFonts);
}

//  COLOR UI 
function renderColorGrid(colors){
  const div=document.getElementById("colors"); div.innerHTML="";
  if(!colors.length){div.innerHTML=`<p class="empty-state">No colors found</p>`;return;}
  const groups={},order=["Red","Orange","Yellow","Green","Cyan","Blue","Purple","Pink","Gray","Black","White","Other"];
  colors.forEach(c=>{const g=getColorGroup(c.hex);if(!groups[g])groups[g]=[];groups[g].push(c);});
  order.forEach(name=>{
    if(!groups[name]?.length)return;
    const sec=document.createElement("div"); sec.className="color-group";
    sec.innerHTML=`<div class="color-group-label">${name}</div>`;
    const grid=document.createElement("div"); grid.className="grid";
    groups[name].forEach(color=>{
      const box=document.createElement("div"); box.className="color-box";
      box.title=`${color.hex}\n${color.hsl}`;
      box.innerHTML=`<div class="color-preview" style="background:${color.hex}"></div><div class="color-label">${color.hex}</div>`;
      let fmt=0; const fmts=[color.hex,color.hsl];
      box.onclick=()=>{copyToClipboard(fmts[fmt%2]);setStatus("success",`Copied ${fmts[fmt%2]}`,icons.check);fmt++;};
      grid.appendChild(box);
    });
    sec.appendChild(grid); div.appendChild(sec);
  });
}

function displayResults(data){renderColorGrid(data.colors);renderFontList(data.fonts);}

//  FONT UI 
function renderFontList(fonts){
  const div=document.getElementById("fonts"); div.innerHTML="";
  if(!fonts.length){div.innerHTML=`<p class="empty-state">No fonts found</p>`;return;}
  fonts.forEach(font=>{
    const link=`https://fonts.google.com/specimen/${font.family.replace(/ /g,"+")}`;
    const card=document.createElement("div"); card.className="font-card";
    card.innerHTML=`
      <div class="font-header">
        <div class="font-name" style="font-family:'${font.family}',sans-serif">${font.family}</div>
        <div class="font-meta">
          ${font.isWeb?`<span class="badge badge-web">Web</span>`:`<span class="badge badge-system">System</span>`}
          <span class="font-detail">${font.weights.slice(0,4).join(" · ")}</span>
        </div>
      </div>
      <div class="font-preview-row">
        <span style="font-family:'${font.family}',sans-serif;font-weight:400">Aa </span>
        <span style="font-family:'${font.family}',sans-serif;font-weight:600">Bb </span>
        <span style="font-family:'${font.family}',sans-serif;font-weight:700">Cc</span>
      </div>
      <div class="font-actions">
        <span class="copy-font btn-small">Name</span>
        <span class="copy-css btn-small">CSS</span>
        <a href="${link}" target="_blank" class="btn-small">Google ↗</a>
      </div>
    `;
    card.querySelector(".copy-font").onclick=()=>{
      copyToClipboard(font.family);
      const btn=card.querySelector(".copy-font");
      btn.textContent="Copied!"; btn.style.color="var(--success)";
      setTimeout(()=>{ btn.textContent="Name"; btn.style.color=""; },1500);
      setStatus("success",`Copied "${font.family}"`,icons.check);
    };
    card.querySelector(".copy-css").onclick=()=>{
      copyToClipboard(`font-family: '${font.family}', sans-serif;`);
      const btn=card.querySelector(".copy-css");
      btn.textContent="Copied!"; btn.style.color="var(--success)";
      setTimeout(()=>{ btn.textContent="CSS"; btn.style.color=""; },1500);
      setStatus("success","Copied CSS",icons.check);
    };
    div.appendChild(card);
  });
}

//  TECH UI 
const LOGO_MAP={
  "React":"react","Next.js":"nextdotjs","Vue.js":"vuedotjs","Angular":"angular",
  "Svelte":"svelte","Nuxt.js":"nuxtdotjs","Gatsby":"gatsby","Remix":"remix","Astro":"astro",
  "Tailwind CSS":"tailwindcss","Bootstrap":"bootstrap","Bulma":"bulma","Material UI":"mui",
  "jQuery":"jquery","Three.js":"threedotjs","GSAP":"greensock","Framer Motion":"framer",
  "D3.js":"d3dotjs","Alpine.js":"alpinedotjs","Chart.js":"chartdotjs","Lottie":"lottiefiles",
  "WordPress":"wordpress","Shopify":"shopify","Webflow":"webflow","Wix":"wix",
  "Squarespace":"squarespace","Ghost":"ghost","Framer":"framer",
  "Google Analytics":"googleanalytics","Google Tag Manager":"googletagmanager",
  "Hotjar":"hotjar","Segment":"segment","Mixpanel":"mixpanel",
  "Intercom":"intercom","HubSpot":"hubspot","Stripe":"stripe",
  "Cloudflare":"cloudflare","Vercel":"vercel","Netlify":"netlify",
  "Google Fonts":"googlefonts","Adobe Fonts":"adobe","Font Awesome":"fontawesome",
  "WooCommerce":"woocommerce","Magento":"magento","BigCommerce":"bigcommerce",
  "PrestaShop":"prestashop","OpenCart":"opencart","Drupal":"drupal","Joomla":"joomla",
  "Contentful":"contentful","Sanity":"sanity","Prismic":"prismic",
  "Craft CMS":"craftcms","Bubble":"bubble","PostHog":"posthog",
  "Plausible":"plausible","Clarity":"microsoftclarity","Klaviyo":"klaviyo","Mailchimp":"mailchimp",
};

function displayTech(detections){
  const cont=document.getElementById("techList"); cont.innerHTML="";
  if(!detections.length){cont.innerHTML=`<p class="empty-state">No technologies detected</p>`;return;}
  const p=document.createElement("p"); p.className="tech-count"; p.textContent=`${detections.length} technologies detected`; cont.appendChild(p);
  const cats={},order=["Framework","CSS","Library","Platform","Analytics","Marketing","Support","Payments","CDN","Hosting","Fonts","Icons"];
  detections.forEach(d=>{if(!cats[d.cat])cats[d.cat]=[];cats[d.cat].push(d);});
  order.forEach(cat=>{
    if(!cats[cat])return;
    const sec=document.createElement("div"); sec.className="tech-section";
    const h3=document.createElement("h3"); h3.textContent=cat; sec.appendChild(h3);
    const grid=document.createElement("div"); grid.className="tech-grid";
    cats[cat].forEach(d=>{
      const key=LOGO_MAP[d.name];
      const logo=key?`<img src="https://cdn.simpleicons.org/${key}/ffffff" width="18" height="18" onerror="this.style.display='none'"/>`:`<div style="width:18px;height:18px;background:#1e293b;border-radius:4px"></div>`;
      const card=document.createElement("div"); card.className="tech-card";
      card.innerHTML=`<div class="tech-card-inner">${logo}<div><div class="tech-name">${d.name}</div><div class="tech-cat">${d.cat}</div></div></div>`;
      grid.appendChild(card);
    });
    sec.appendChild(grid); cont.appendChild(sec);
  });
}