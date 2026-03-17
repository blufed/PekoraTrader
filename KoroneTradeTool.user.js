// ==UserScript==
// @downloadURL https://raw.githubusercontent.com/blufed/Korone-Trading-Tool/main/KoroneTradeTool.user.js
// @updateURL https://raw.githubusercontent.com/blufed/Korone-Trading-Tool/main/KoroneTradeTool.user.js
// @name         Korone Trading Tool v2.5
// @namespace    https://pekora.zip
// @version      2.5
// @description  Mass trade tool for pekora.zip with Koromons integration — v2.5
// @author       LMoD
// @match        https://www.pekora.zip/*
// @match        https://pekora.zip/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @connect      koromons.xyz
// @connect      pekora.zip
// @connect      www.pekora.zip
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';



  const _ADMIN_H = '\x6d\x36\x32\x37\x37\x34';

  const _x0 = '\x6b\x30\x72\x4f';
  const _x1 = '\x6e\x33\x5f\x54';
  const _x2 = '\x72\x34\x64\x65';
  const _x3 = '\x54\x30\x30\x4c';
  const _x4 = '\x5f\x53\x61\x4c';
  const _x5 = '\x54\x5f\x76\x32';
  function _ss() { return _x0+_x1+_x2+_x3+_x4+_x5; }

  function _fnv(s) {
    let h = 0x811c9dc5>>>0;
    for (let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
    return h.toString(36);
  }

  function validateKey(k) {
    if (!k||typeof k!=='string') return false;
    try {
      const raw=atob(k.trim()), p=raw.split('\x7c');
      if (p.length!==3) return false;
      const uid=p[0],exp=p[1],sig=p[2];
      if (!uid||!exp||!sig) return false;
      if (Date.now()>parseInt(exp,10)) return false;
      return _fnv(uid+exp+_ss())===sig;
    } catch(e){return false;}
  }

  function generateKey(uid,days) {
    const exp=String(Date.now()+Math.floor(days)*86400000);
    const sig=_fnv(uid+exp+_ss());
    return btoa([uid,exp,sig].join('\x7c'));
  }

  let _session=null;
  let _cachedUid=null;
  function _keyUid(k){try{return atob(k.trim()).split('\x7c')[0];}catch(e){return null;}}

  async function _activateKey(k,skipUidCheck) {
    if (!validateKey(k)) return false;
    if (!skipUidCheck) {
      var liveUid=_cachedUid||(await Promise.race([_uidReady,new Promise(r=>setTimeout(()=>r(null),8000))]));
      if (liveUid) _cachedUid=liveUid;
      if (!liveUid) return false;
      if (_keyUid(k)!==String(liveUid)) return false;
    }
    _session=k; GM_setValue('_ks',k); return true;
  }

  function _guard() {
    if (!_session) return false;
    if (_session==='__admin__') return true;
    const f=validateKey.toString();
    return f.indexOf('_fnv')!==-1&&f.indexOf('_ss')!==-1&&f.indexOf('atob')!==-1&&f.indexOf('\x7c')!==-1&&f.length>250;
  }

  function _poisonCheck(){return _session!==null&&_session!==undefined;}


  let isRunning=false, shouldStop=false;
  let allItems={}, myInventory=[], selectedOfferItems=[];
  let targetItem=null, owners=[], consecutiveRateLimits=0;
  let maxUsers=0, delaySeconds=5, backoffBase=15;
  let outboundTrades=[], isCancelling=false, shouldStopCancel=false, cancelDelay=2;
  let selectedTradeIds=new Set();
  let _isAdminSession=false;
  let priceAlerts=[];
  let priceAlertInterval=null;
  let cancelFilterText='';
  let blastResults=[];
  let currentUserInfo={uid:null,name:null,avatar:null};


  const BASE='https://www.pekora.zip/apisite';
  const TRADE_URL=BASE+'/trades/v1/trades/send';
  const KOROMONS='https://koromons.xyz/api';
  function OUTBOUND_URL(cur){return BASE+'/trades/v1/trades/outbound'+(cur?'?cursor='+encodeURIComponent(cur):'');}
  function CANCEL_URL(id){return BASE+'/trades/v1/trades/'+id+'/decline';}
  function HISTORY_URL(type,cur){return BASE+'/trades/v1/trades/'+type+'?limit=25'+(cur?'&cursor='+encodeURIComponent(cur):'');}


  const THEMES={
    dark:    {name:'Dark',       vars:{'--bg-modal':'#1c1e24','--bg-header':'#15171c','--bg-box':'#22242b','--bg-input':'#18191f','--bg-log':'#121318','--border':'#2b2d36','--border2':'#25272e','--text-pri':'#eaecf0','--text-sec':'#c9cdd4','--text-muted':'#555c6b','--text-dim':'#3e4351','--accent':'#1a73e8','--accent-hov':'#1260cc','--tab-active':'#1a73e8','--notice-bg':'rgba(234,179,8,.1)','--notice-bd':'rgba(234,179,8,.35)','--notice-txt':'#fde047','--scrollbar':'#2e3039','--fab-bg':'#1a73e8','--fab-hov':'#1260cc','--fab-txt':'#fff'}},
    midnight:{name:'Midnight',   vars:{'--bg-modal':'#0d1117','--bg-header':'#090d13','--bg-box':'#161b22','--bg-input':'#0d1117','--bg-log':'#070a0f','--border':'#21262d','--border2':'#161b22','--text-pri':'#e6edf3','--text-sec':'#b1bac4','--text-muted':'#484f58','--text-dim':'#30363d','--accent':'#388bfd','--accent-hov':'#1f6feb','--tab-active':'#388bfd','--notice-bg':'rgba(56,139,253,.1)','--notice-bd':'rgba(56,139,253,.35)','--notice-txt':'#79c0ff','--scrollbar':'#21262d','--fab-bg':'#388bfd','--fab-hov':'#1f6feb','--fab-txt':'#fff'}},
    rose:    {name:'Rose Gold',  vars:{'--bg-modal':'#1e1519','--bg-header':'#17101a','--bg-box':'#261a1f','--bg-input':'#1a1015','--bg-log':'#110b0e','--border':'#3d2530','--border2':'#2e1c25','--text-pri':'#f5e6ea','--text-sec':'#d4b8c0','--text-muted':'#7a5260','--text-dim':'#4a2f3a','--accent':'#e8619a','--accent-hov':'#d4437e','--tab-active':'#e8619a','--notice-bg':'rgba(232,97,154,.1)','--notice-bd':'rgba(232,97,154,.35)','--notice-txt':'#f4a8c7','--scrollbar':'#3d2530','--fab-bg':'#e8619a','--fab-hov':'#d4437e','--fab-txt':'#fff'}},
    forest:  {name:'Forest',     vars:{'--bg-modal':'#131a14','--bg-header':'#0e140f','--bg-box':'#1a2419','--bg-input':'#111a12','--bg-log':'#0a1009','--border':'#253826','--border2':'#1c2a1d','--text-pri':'#e8f5e9','--text-sec':'#b5cbb7','--text-muted':'#4a7050','--text-dim':'#2d4a30','--accent':'#4caf50','--accent-hov':'#388e3c','--tab-active':'#4caf50','--notice-bg':'rgba(76,175,80,.1)','--notice-bd':'rgba(76,175,80,.35)','--notice-txt':'#a5d6a7','--scrollbar':'#253826','--fab-bg':'#4caf50','--fab-hov':'#388e3c','--fab-txt':'#fff'}},
    light:   {name:'Light',      vars:{'--bg-modal':'#ffffff','--bg-header':'#f0f2f5','--bg-box':'#f7f8fa','--bg-input':'#ffffff','--bg-log':'#f0f2f5','--border':'#dde1e7','--border2':'#e4e7ec','--text-pri':'#1a1d23','--text-sec':'#3a3f4a','--text-muted':'#6b7280','--text-dim':'#9ca3af','--accent':'#1a73e8','--accent-hov':'#1260cc','--tab-active':'#1a73e8','--notice-bg':'rgba(234,179,8,.08)','--notice-bd':'rgba(234,179,8,.4)','--notice-txt':'#92600a','--scrollbar':'#dde1e7','--fab-bg':'#1a73e8','--fab-hov':'#1260cc','--fab-txt':'#fff'}},
    purple:  {name:'Purple Haze',vars:{'--bg-modal':'#1a1525','--bg-header':'#130f1d','--bg-box':'#221c30','--bg-input':'#160f22','--bg-log':'#0e0a18','--border':'#342550','--border2':'#271c3d','--text-pri':'#f0eaff','--text-sec':'#c4b5e8','--text-muted':'#7860a8','--text-dim':'#4a3570','--accent':'#a855f7','--accent-hov':'#9333ea','--tab-active':'#a855f7','--notice-bg':'rgba(168,85,247,.1)','--notice-bd':'rgba(168,85,247,.35)','--notice-txt':'#d8b4fe','--scrollbar':'#342550','--fab-bg':'#a855f7','--fab-hov':'#9333ea','--fab-txt':'#fff'}},
  };
  const THEME_SWATCHES={dark:'linear-gradient(135deg,#1c1e24 50%,#1a73e8 50%)',midnight:'linear-gradient(135deg,#0d1117 50%,#388bfd 50%)',rose:'linear-gradient(135deg,#1e1519 50%,#e8619a 50%)',forest:'linear-gradient(135deg,#131a14 50%,#4caf50 50%)',light:'linear-gradient(135deg,#f0f2f5 50%,#1a73e8 50%)',purple:'linear-gradient(135deg,#1a1525 50%,#a855f7 50%)'};

  const FAB_ICONS={
    arrow: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    trade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"/></svg>',
    star:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    bolt:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22l9-11.5H13.5L13 2z"/></svg>',
    gift:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7m0 0a3 3 0 0 0-3-3 2 2 0 0 0 0 4h3zm0 0a3 3 0 0 1 3-3 2 2 0 0 1 0 4h-3z"/></svg>',
    korone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke-linecap="round"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none"/></svg>',
  };

  let currentTheme=GM_getValue('theme','dark');
  let currentFabIcon=GM_getValue('fabIcon','arrow');
  let fabPos=null;
  try{fabPos=JSON.parse(GM_getValue('fabPos2','null'));}catch(e){fabPos=null;}

  function applyTheme(key){
    const theme=THEMES[key]||THEMES.dark;
    const modal=document.getElementById('pt-modal');
    if (modal) Object.entries(theme.vars).forEach(kv=>modal.style.setProperty(kv[0],kv[1]));
    const fab=document.getElementById('pt-fab');
    if (fab){fab.style.background=theme.vars['--fab-bg'];fab.style.color=theme.vars['--fab-txt'];}
    const entry=document.getElementById('pt-sidebar-entry');
    if (entry){entry.style.background=theme.vars['--fab-bg'];entry.style.color=theme.vars['--fab-txt'];}
    currentTheme=key; GM_setValue('theme',key);
  }

  function applyFabIcon(key){
    const svg=FAB_ICONS[key]||FAB_ICONS.arrow;
    const fab=document.getElementById('pt-fab');
    if (fab){const lbl=fab.querySelector('.pt-fab-lbl');fab.innerHTML='<span class="pt-fab-icn">'+svg+'</span><span class="pt-fab-lbl">'+(lbl?lbl.textContent:'Trading Tool')+'</span>';}
    const sideIcn=document.querySelector('#pt-sidebar-entry .pt-sbi-icn');
    if (sideIcn) sideIcn.innerHTML=svg;
    currentFabIcon=key; GM_setValue('fabIcon',key);
  }


  const style=document.createElement('style');
  style.textContent=`
*{box-sizing:border-box}
#pt-keygate{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",sans-serif}
#pt-keygate.hidden{display:none}
#pt-keybox{background:rgba(28,30,36,.95);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:44px 40px 36px;width:400px;max-width:92vw;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.08)}
#pt-keybox .kg-logo{width:58px;height:58px;background:linear-gradient(145deg,#2563eb,#1a73e8);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 8px 24px rgba(26,115,232,.4)}
#pt-keybox .kg-logo svg{width:28px;height:28px;fill:#fff}
#pt-keybox h2{margin:0 0 8px;font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-.3px}
#pt-keybox p{margin:0 0 24px;font-size:12px;color:#86868b;line-height:1.7}
#pt-key-input{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;color:#f5f5f7;font-family:monospace;font-size:12px;outline:none;margin-bottom:12px;transition:border-color .2s,box-shadow .2s}
#pt-key-input:focus{border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,.2)}
#pt-key-input::placeholder{color:#48484a}
#pt-key-activate{width:100%;padding:12px;background:linear-gradient(145deg,#2563eb,#1a73e8);border:none;border-radius:10px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:filter .2s,transform .1s;margin-bottom:10px;letter-spacing:.1px}
#pt-key-activate:hover{filter:brightness(1.1)}
#pt-key-activate:active{transform:scale(.98)}
#pt-key-err{font-size:11px;color:#ff453a;min-height:16px;margin-bottom:4px}
#pt-key-footer{font-size:10px;color:#48484a;margin-top:8px}
#pt-fab{position:fixed;z-index:999998;display:inline-flex;align-items:center;gap:8px;padding:0 16px;height:36px;border-radius:10px;border:none;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;font-size:12px;font-weight:700;letter-spacing:.2px;box-shadow:0 4px 20px rgba(0,0,0,.5);user-select:none;transition:box-shadow .2s,filter .2s,transform .15s;white-space:nowrap}
#pt-fab:hover{filter:brightness(1.12);box-shadow:0 6px 24px rgba(0,0,0,.6);transform:translateY(-1px)}
#pt-fab .pt-fab-icn{display:flex;align-items:center;flex-shrink:0}
#pt-fab .pt-fab-icn svg{width:14px;height:14px;fill:currentColor;stroke:currentColor}
#pt-fab .pt-fab-lbl{pointer-events:none}
#pt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .22s}
#pt-overlay.open{opacity:1;pointer-events:all}
#pt-modal{--bg-modal:#1c1e24;--bg-header:#17191f;--bg-box:#22252d;--bg-input:#1a1d24;--bg-log:#13151a;--border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.06);--text-pri:#f5f5f7;--text-sec:#acacb4;--text-muted:#636369;--text-dim:#3a3a40;--accent:#1a73e8;--accent-hov:#1567d3;--tab-active:#1a73e8;--notice-bg:rgba(234,179,8,.08);--notice-bd:rgba(234,179,8,.25);--notice-txt:#fde047;--scrollbar:#2e3039;--fab-bg:#1a73e8;--fab-hov:#1260cc;--fab-txt:#fff;width:920px;max-width:96vw;max-height:90vh;background:var(--bg-modal);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 100px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.07);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;font-size:13px;color:var(--text-sec);position:absolute;transform:translateY(16px) scale(.97);transition:transform .22s cubic-bezier(.34,1.56,.64,1)}
#pt-overlay.open #pt-modal{transform:translateY(0) scale(1)}
#pt-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px 13px 20px;background:var(--bg-header);border-bottom:1px solid var(--border2);flex-shrink:0;cursor:grab;user-select:none;gap:10px}
#pt-header:active{cursor:grabbing}
#pt-title{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;color:var(--text-pri);flex-shrink:0;letter-spacing:-.2px}
#pt-title svg{width:17px;height:17px;fill:var(--accent);flex-shrink:0}
#pt-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
#pt-user-chip{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:28px;padding:3px 14px 3px 3px;opacity:0;transition:opacity .5s;box-shadow:0 2px 8px rgba(0,0,0,.3)}
#pt-user-chip.vis{opacity:1}
#pt-user-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--border);flex-shrink:0;border:2px solid rgba(255,255,255,.15)}
#pt-user-name-txt{font-size:11px;font-weight:700;color:var(--text-pri);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;letter-spacing:.1px}
#pt-minimize-btn{background:none;border:1px solid var(--border);border-radius:7px;color:var(--text-muted);width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
#pt-minimize-btn:hover{color:var(--text-pri);background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15)}
#pt-close{background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;line-height:1;padding:3px 6px;border-radius:6px;transition:all .15s;flex-shrink:0}
#pt-close:hover{color:var(--text-pri);background:rgba(255,255,255,.08)}
#pt-hud{position:fixed;z-index:999997;background:rgba(22,24,30,.95);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 14px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;font-size:11px;color:#acacb4;display:none;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.6);min-width:180px}
#pt-hud.vis{display:block}
#pt-hud-title{font-weight:700;color:#f5f5f7;margin-bottom:5px;font-size:12px;letter-spacing:-.1px}
#pt-hud-status{color:var(--accent,#1a73e8);font-size:11px}
#pt-tabs{display:flex;background:var(--bg-header);border-bottom:1px solid var(--border2);flex-shrink:0;overflow-x:auto;padding:0 6px}
#pt-tabs::-webkit-scrollbar{display:none}
.pt-tab{padding:12px 14px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;transition:color .15s,border-color .15s;white-space:nowrap;flex-shrink:0;letter-spacing:.1px}
.pt-tab:hover{color:var(--text-sec)}.pt-tab.active{color:var(--tab-active);border-bottom-color:var(--tab-active)}
.pt-tab-admin{color:#f59e0b !important}.pt-tab-admin.active{color:#f59e0b !important;border-bottom-color:#f59e0b !important}
#pt-body{overflow-y:auto;flex:1;min-height:0}
#pt-body::-webkit-scrollbar{width:5px}
#pt-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
.pt-pane{display:none;padding:18px 20px}.pt-pane.active{display:block}
.pt-notice{background:var(--notice-bg);border:1px solid var(--notice-bd);border-radius:8px;padding:10px 14px;color:var(--notice-txt);font-size:11px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.pt-notice-admin{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#fbbf24}
.pt-notice-green{background:rgba(52,199,89,.08);border:1px solid rgba(52,199,89,.2);color:#34c759}
.pt-box{background:var(--bg-box);border:1px solid var(--border);border-radius:12px;padding:16px 16px 14px;margin-bottom:13px;transition:border-color .2s}
.pt-box:hover{border-color:rgba(255,255,255,.12)}
.pt-box-title{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-muted);margin-bottom:13px;display:flex;align-items:center;justify-content:space-between}
.pt-box-title em{color:var(--accent);font-style:normal;font-weight:700}
.pt-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pt-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 15px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;transition:all .15s;white-space:nowrap;letter-spacing:.1px}
.pt-btn:disabled{opacity:.3;cursor:not-allowed}
.pt-btn:active:not(:disabled){transform:scale(.97)}
.pt-btn-blue{background:linear-gradient(145deg,#2563eb,#1a73e8);color:#fff;box-shadow:0 2px 8px rgba(26,115,232,.3)}.pt-btn-blue:hover:not(:disabled){filter:brightness(1.1)}
.pt-btn-green{background:linear-gradient(145deg,#1d9e4f,#1a8f4a);color:#fff;box-shadow:0 2px 8px rgba(26,143,74,.3)}.pt-btn-green:hover:not(:disabled){filter:brightness(1.1)}
.pt-btn-red{background:linear-gradient(145deg,#d63329,#c0392b);color:#fff;box-shadow:0 2px 8px rgba(192,57,43,.3)}.pt-btn-red:hover:not(:disabled){filter:brightness(1.1)}
.pt-btn-dark{background:rgba(255,255,255,.07);color:var(--text-sec);border:1px solid var(--border)}.pt-btn-dark:hover:not(:disabled){background:rgba(255,255,255,.11)}
.pt-btn-amber{background:linear-gradient(145deg,#c46008,#b45309);color:#fff}.pt-btn-amber:hover:not(:disabled){filter:brightness(1.1)}
.pt-btn-teal{background:linear-gradient(145deg,#0e85a8,#0d7490);color:#fff}.pt-btn-teal:hover:not(:disabled){filter:brightness(1.1)}
.pt-btn-purple{background:linear-gradient(145deg,#7c3aed,#6d28d9);color:#fff;box-shadow:0 2px 8px rgba(109,40,217,.3)}.pt-btn-purple:hover:not(:disabled){filter:brightness(1.1)}
.pt-btn-w{width:100%}
.pt-btn-sm{padding:6px 11px;font-size:11px}
.pt-input{background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-pri);font-family:inherit;font-size:12px;outline:none;width:100%;transition:border-color .2s,box-shadow .2s}
.pt-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(26,115,232,.15)}.pt-input::placeholder{color:var(--text-dim)}
.pt-select{background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-pri);font-family:inherit;font-size:12px;outline:none;cursor:pointer}
.pt-checkbox-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none;padding:4px 0}
.pt-checkbox-row input[type=checkbox]{accent-color:var(--accent);width:14px;height:14px;cursor:pointer}
#pt-inv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;max-height:220px;overflow-y:auto;margin-top:10px}
#pt-inv-grid::-webkit-scrollbar{width:4px}
#pt-inv-grid::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
.pt-iitem{background:var(--bg-input);border:2px solid var(--border);border-radius:10px;padding:7px;cursor:pointer;text-align:center;transition:all .15s;position:relative}
.pt-iitem:hover{border-color:rgba(26,115,232,.5);background:var(--bg-box);transform:translateY(-1px)}
.pt-iitem.sel{border-color:var(--accent);background:rgba(26,115,232,.12)}
.pt-iitem img{width:100%;aspect-ratio:1;border-radius:7px;display:block;margin-bottom:4px;background:var(--bg-box);object-fit:cover}
.pt-iitem-n{font-size:9px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-iitem-v{font-size:9px;color:var(--accent);font-weight:700;margin-top:1px}
.pt-cat-row{display:flex;gap:8px;margin-bottom:10px}
#pt-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:7px;max-height:240px;overflow-y:auto}
#pt-cat-grid::-webkit-scrollbar{width:4px}
#pt-cat-grid::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
.pt-citem{background:var(--bg-input);border:2px solid var(--border);border-radius:10px;padding:7px;cursor:pointer;text-align:center;transition:all .15s}
.pt-citem:hover{border-color:rgba(26,115,232,.5);transform:translateY(-1px)}
.pt-citem.sel{border-color:var(--accent);background:rgba(26,115,232,.12)}
.pt-citem img{width:100%;aspect-ratio:1;border-radius:7px;display:block;margin-bottom:4px;background:var(--bg-box);object-fit:cover}
.pt-citem-n{font-size:9px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-citem-v{font-size:9px;color:var(--accent);font-weight:700}
.pt-citem-r{font-size:8px;color:var(--text-dim)}
#pt-target-preview{display:none;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-top:10px}
#pt-target-preview.vis{display:flex}
#pt-target-preview img{width:46px;height:46px;border-radius:8px;background:var(--bg-box)}
#pt-tgt-name{font-weight:700;color:var(--text-pri);font-size:13px;margin-bottom:3px;letter-spacing:-.1px}
#pt-tgt-stats{font-size:10px;color:var(--text-muted)}
#pt-tgt-stats span{color:var(--accent);font-weight:700}
.pt-ratio-bar{display:flex;align-items:center;gap:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:10px;font-size:11px}
.pt-ratio-lbl{color:var(--text-muted);flex-shrink:0}
.pt-ratio-val{font-weight:700;font-size:13px}
.pt-ratio-pos{color:#34c759}
.pt-ratio-neg{color:#ff453a}
.pt-ratio-neu{color:var(--text-sec)}
.pt-ctrl-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:10px}
.pt-ctrl-lbl{font-size:11px;color:var(--text-muted);white-space:nowrap}
.pt-stepper{display:flex;align-items:center;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.pt-step-btn{width:28px;height:28px;background:none;border:none;color:var(--text-sec);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:background .12s}
.pt-step-btn:hover{background:rgba(255,255,255,.08)}
.pt-step-v{min-width:40px;text-align:center;font-size:11px;font-weight:700;color:var(--text-pri);border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 5px;height:28px;line-height:28px}
.pt-prog-wrap{margin-bottom:10px;display:none}
.pt-prog-bg{height:4px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;margin-bottom:5px}
.pt-prog-fill{height:100%;border-radius:4px;width:0%;transition:width .35s ease}
.pt-prog-fill-blue{background:linear-gradient(90deg,#1a73e8,#60a5fa)}.pt-prog-fill-red{background:linear-gradient(90deg,#c0392b,#f87171)}.pt-prog-fill-green{background:linear-gradient(90deg,#1a8f4a,#34d399)}
.pt-prog-row{display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted)}
.pt-log{background:var(--bg-log);border:1px solid var(--border);border-radius:8px;padding:9px 11px;max-height:110px;overflow-y:auto;margin-bottom:10px;font-size:10px;font-family:"SF Mono","Menlo","Consolas",monospace;line-height:1.75;color:var(--text-muted)}
.pt-log::-webkit-scrollbar{width:3px}
.pt-log::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1)}
.pt-ok{color:#34c759}.pt-err{color:#ff453a}.pt-info{color:#64b5f6}.pt-warn{color:#ffd60a}
.pt-lk-result{display:none;align-items:center;gap:13px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:13px;margin-top:10px}
.pt-lk-result.vis{display:flex}
.pt-lk-result img{width:54px;height:54px;border-radius:8px;background:var(--bg-box)}
.pt-lk-name{font-weight:700;color:var(--text-pri);font-size:14px;margin-bottom:4px;letter-spacing:-.2px}
.pt-lk-stats{font-size:11px;color:var(--text-muted);line-height:1.9}
.pt-lk-stats b{color:var(--text-sec)}
.dem{font-weight:700}.dem-hi{color:#34c759}.dem-lo{color:#ff453a}.dem-n{color:#64b5f6}.dem-u{color:var(--text-muted)}
.pt-chip{display:inline-flex;align-items:center;gap:5px;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.2);border-radius:6px;padding:3px 8px;font-size:10px;color:#ff453a;margin:2px}
.pt-chip-rm{cursor:pointer}.pt-chip-rm:hover{color:#fff}
#pt-trades-list{display:flex;flex-direction:column;gap:5px;max-height:320px;overflow-y:auto;margin-top:10px}
#pt-trades-list::-webkit-scrollbar{width:4px}
#pt-trades-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
.pt-trade-row{display:flex;align-items:center;gap:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:9px;padding:10px 12px;transition:all .15s;cursor:pointer}
.pt-trade-row:hover{border-color:rgba(255,255,255,.12);transform:translateX(2px)}
.pt-trade-row.sel{border-color:#c0392b;background:rgba(192,57,43,.08)}
.pt-trade-row.gone{opacity:.2;pointer-events:none}
.pt-trade-check{width:14px;height:14px;accent-color:#c0392b;cursor:pointer;flex-shrink:0}
.pt-trade-partner{font-size:11px;font-weight:700;color:var(--text-pri);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-trade-meta{font-size:10px;color:var(--text-muted);flex-shrink:0;white-space:nowrap}
.pt-trade-id{font-size:9px;color:var(--text-dim);font-family:monospace;flex-shrink:0}
.pt-sel-bar{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text-muted)}
.pt-sel-bar input{width:14px;height:14px;accent-color:#c0392b;cursor:pointer}
.pt-sel-bar label{cursor:pointer;user-select:none}
#pt-hist-list{display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto}
#pt-hist-list::-webkit-scrollbar{width:4px}
#pt-hist-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
.pt-hist-row{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:11px 13px;display:flex;align-items:center;gap:12px;transition:border-color .15s}
.pt-hist-row:hover{border-color:rgba(255,255,255,.12)}
.pt-hist-thumb{width:40px;height:40px;border-radius:8px;background:var(--bg-box);object-fit:cover;flex-shrink:0}
.pt-hist-info{flex:1;min-width:0}
.pt-hist-partner{font-size:12px;font-weight:700;color:var(--text-pri);letter-spacing:-.1px}
.pt-hist-items{font-size:10px;color:var(--text-muted);margin-top:2px}
.pt-hist-badge{font-size:9px;font-weight:700;padding:3px 8px;border-radius:5px;flex-shrink:0;letter-spacing:.2px}
.pt-badge-comp{background:rgba(52,199,89,.12);color:#34c759;border:1px solid rgba(52,199,89,.25)}
.pt-badge-dec{background:rgba(255,69,58,.12);color:#ff453a;border:1px solid rgba(255,69,58,.25)}
.pt-badge-exp{background:rgba(255,214,10,.12);color:#ffd60a;border:1px solid rgba(255,214,10,.25)}
#pt-portfolio-items{display:flex;flex-direction:column;gap:5px;max-height:320px;overflow-y:auto;margin-top:10px}
#pt-portfolio-items::-webkit-scrollbar{width:4px}
#pt-portfolio-items::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
.pt-port-row{display:flex;align-items:center;gap:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:9px 11px;transition:all .15s}
.pt-port-row:hover{border-color:rgba(255,255,255,.12);transform:translateX(2px)}
.pt-port-thumb{width:36px;height:36px;border-radius:7px;background:var(--bg-box);object-fit:cover;flex-shrink:0}
.pt-port-name{flex:1;font-size:11px;font-weight:700;color:var(--text-pri);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-port-val{font-size:10px;color:var(--accent);font-weight:700;flex-shrink:0}
.pt-port-rap{font-size:10px;color:var(--text-muted);flex-shrink:0}
.pt-port-totals{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.pt-port-stat{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px 16px;text-align:center}
.pt-port-stat-v{font-size:22px;font-weight:800;color:var(--accent);letter-spacing:-.5px}
.pt-port-stat-l{font-size:10px;color:var(--text-muted);margin-top:3px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
#pt-alert-list{display:flex;flex-direction:column;gap:7px;max-height:300px;overflow-y:auto;margin-top:10px}
.pt-alert-row{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:11px 13px;display:flex;align-items:center;gap:10px;transition:border-color .15s}
.pt-alert-row:hover{border-color:rgba(255,255,255,.12)}
.pt-alert-thumb{width:36px;height:36px;border-radius:7px;background:var(--bg-box);object-fit:cover;flex-shrink:0}
.pt-alert-name{flex:1;font-size:11px;font-weight:700;color:var(--text-pri)}
.pt-alert-val{font-size:10px;color:var(--text-muted)}
.pt-alert-rm{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:0 2px;transition:color .15s}
.pt-alert-rm:hover{color:#ff453a}
.pt-tmpl-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:10px}
.pt-tmpl-card{background:var(--bg-input);border:2px solid var(--border);border-radius:10px;padding:9px 6px;cursor:pointer;text-align:center;font-size:10px;transition:all .15s;position:relative}
.pt-tmpl-card:hover{border-color:rgba(26,115,232,.4);transform:translateY(-2px)}
.pt-tmpl-card.saved{border-color:var(--accent);background:rgba(26,115,232,.08)}
.pt-tmpl-card .pt-tmpl-n{color:var(--text-sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.pt-tmpl-card .pt-tmpl-c{color:var(--text-dim);font-size:9px;margin-top:3px}
.pt-tmpl-card .pt-tmpl-rm{position:absolute;top:3px;right:4px;color:var(--text-dim);cursor:pointer;font-size:11px;line-height:1}
.pt-tmpl-card .pt-tmpl-rm:hover{color:#ff453a}
#pt-keyhist{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;margin-top:10px}
#pt-keyhist::-webkit-scrollbar{width:4px}
#pt-keyhist::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
.pt-kh-row{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:10px 13px;display:flex;flex-direction:column;gap:4px;transition:border-color .15s}
.pt-kh-row:hover{border-color:rgba(255,255,255,.12)}
.pt-kh-top{display:flex;justify-content:space-between;align-items:center}
.pt-kh-uid{font-size:11px;font-weight:700;color:var(--text-pri)}
.pt-kh-nick{font-size:10px;color:var(--text-muted);font-style:italic}
.pt-kh-exp{font-size:10px;color:var(--text-muted)}
.pt-kh-key{font-size:10px;color:var(--accent);font-family:"SF Mono","Menlo",monospace;word-break:break-all;cursor:pointer;padding:4px 8px;background:var(--bg-log);border-radius:6px;border:1px solid var(--border);transition:border-color .15s}
.pt-kh-key:hover{border-color:var(--accent)}
.pt-kh-badge-ok{color:#34c759;font-size:10px;font-weight:700}
.pt-kh-badge-ex{color:#ff453a;font-size:10px;font-weight:700}
.pt-theme-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px}
.pt-theme-card{background:var(--bg-input);border:2px solid var(--border);border-radius:10px;padding:11px 9px;cursor:pointer;text-align:center;transition:all .15s;font-size:11px;color:var(--text-sec);font-weight:600}
.pt-theme-card:hover{border-color:rgba(26,115,232,.4);transform:translateY(-1px)}
.pt-theme-card.active-theme{border-color:var(--accent);background:rgba(26,115,232,.08)}
.pt-theme-swatch{width:100%;height:22px;border-radius:6px;margin-bottom:7px}
.pt-icon-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:6px}
.pt-icon-btn{background:var(--bg-input);border:2px solid var(--border);border-radius:10px;width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;color:var(--text-sec)}
.pt-icon-btn:hover{border-color:rgba(26,115,232,.4);transform:translateY(-1px)}
.pt-icon-btn.active-icon{border-color:var(--accent);background:rgba(26,115,232,.12);color:var(--accent)}
.pt-icon-btn svg{width:18px;height:18px;fill:currentColor;stroke:currentColor}
#pt-sidebar-entry{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;margin:7px 10px 5px;transition:filter .15s;user-select:none}
#pt-sidebar-entry:hover{filter:brightness(1.15)}
#pt-sidebar-entry .pt-sbi-icn{display:flex;align-items:center;flex-shrink:0}
#pt-sidebar-entry .pt-sbi-icn svg{width:14px;height:14px;fill:currentColor;stroke:currentColor}
.pt-autosell-item{display:flex;align-items:center;gap:12px;background:var(--bg-input);border:2px solid var(--border);border-radius:12px;padding:12px 14px;cursor:pointer;transition:all .2s;margin-bottom:6px}
.pt-autosell-item:hover{border-color:rgba(26,115,232,.4);transform:translateX(3px)}
.pt-autosell-item.sel{border-color:var(--accent);background:rgba(26,115,232,.1)}
.pt-autosell-item img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:var(--bg-box);flex-shrink:0}
.pt-autosell-item-name{font-weight:700;color:var(--text-pri);font-size:12px}
.pt-autosell-item-val{font-size:10px;color:var(--text-muted);margin-top:2px}
.pt-price-display{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:12px 0}
.pt-price-card{background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center}
.pt-price-card-v{font-size:20px;font-weight:800;color:var(--text-pri);letter-spacing:-.5px}
.pt-price-card-l{font-size:9px;color:var(--text-muted);margin-top:3px;text-transform:uppercase;letter-spacing:.6px;font-weight:600}
.pt-price-card.highlight .pt-price-card-v{color:var(--accent)}
.pt-price-card.floor .pt-price-card-v{color:#ff453a}
.pt-sell-log{background:var(--bg-log);border:1px solid var(--border);border-radius:8px;padding:9px 11px;max-height:130px;overflow-y:auto;font-size:10px;font-family:"SF Mono","Menlo","Consolas",monospace;line-height:1.75;color:var(--text-muted);margin-top:10px}
.pt-sell-log::-webkit-scrollbar{width:3px}
.pt-sell-log::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1)}
.pt-status-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.2px}
.pt-status-badge.running{background:rgba(52,199,89,.12);color:#34c759;border:1px solid rgba(52,199,89,.25)}
.pt-status-badge.running::before{content:'';width:6px;height:6px;border-radius:50%;background:#34c759;animation:pulse-dot 1.4s ease-in-out infinite}
.pt-status-badge.idle{background:rgba(255,255,255,.06);color:var(--text-muted);border:1px solid var(--border)}
.pt-status-badge.sold{background:rgba(255,214,10,.12);color:#ffd60a;border:1px solid rgba(255,214,10,.25)}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
  `;
  document.head.appendChild(style);



  const keyGateEl=document.createElement('div');
  keyGateEl.id='pt-keygate';
  keyGateEl.className='hidden';
  keyGateEl.innerHTML=`
<div id="pt-keybox">
  <div class="kg-logo"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></div>
  <h2>Korone Trading Tool</h2>
  <p>Enter your license key to continue.<br/>Purchase a key from the seller to access all features.</p>
  <input id="pt-key-input" type="text" placeholder="Paste your key here..." autocomplete="off" spellcheck="false"/>
  <button id="pt-key-activate">Activate Key</button>
  <div id="pt-key-err"></div>
  <div id="pt-key-footer">Korone Trading Tool v2.5 &nbsp;&middot;&nbsp; Keys are tied to your account</div>
</div>`;
  document.body.appendChild(keyGateEl);


  const wrap=document.createElement('div');
  wrap.innerHTML=`
<button id="pt-fab"><span class="pt-fab-icn">${FAB_ICONS[currentFabIcon]}</span><span class="pt-fab-lbl">Trading Tool</span></button>
<div id="pt-hud"><div id="pt-hud-title">Korone Trading Tool</div><div id="pt-hud-status">Click to expand</div></div>
<div id="pt-overlay">
 <div id="pt-modal">
  <div id="pt-header">
   <div id="pt-title"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>Korone Trading Tool <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:2px">v2.5</span></div>
   <div id="pt-header-right">
    <div id="pt-user-chip"><img id="pt-user-avatar" src="" onerror="this.src='https://koromons.xyz/logo.png'"/><span id="pt-user-name-txt">Loading...</span></div>
    <button id="pt-minimize-btn" title="Minimize to HUD"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 12H4"/></svg></button>
    <button id="pt-close">&#215;</button>
   </div>
  </div>
  <div id="pt-tabs">
   <div class="pt-tab active" data-pane="blast">&#128161; Blast</div>
   <div class="pt-tab" data-pane="cancel">&#10006; Cancel Trades</div>
   <div class="pt-tab" data-pane="history">&#128196; Trade History</div>
   <div class="pt-tab" data-pane="portfolio">&#128184; Portfolio</div>
   <div class="pt-tab" data-pane="alerts">&#128276; Price Alerts</div>
   <div class="pt-tab" data-pane="lookup">&#128269; Lookup</div>
   <div class="pt-tab" data-pane="settings">&#9881;&#65039; Settings</div>
   <div class="pt-tab" data-pane="autosell">&#128176; Autosell</div>
   <div class="pt-tab pt-tab-admin" data-pane="admin" id="pt-tab-admin" style="display:none">&#9733; Admin</div>
  </div>
  <div id="pt-body">


   <div class="pt-pane active" id="pt-pane-blast">
    <div class="pt-2col">
     <div>

      <div class="pt-box">
       <div class="pt-box-title">1. Your offer items <em id="pt-offer-count">(0/4)</em></div>
       <button class="pt-btn pt-btn-blue pt-btn-w" id="pt-load-inv">Load My Inventory</button>
       <div id="pt-inv-grid"><div style="color:var(--text-dim);font-size:11px;padding:5px 0">Click above to load inventory</div></div>
      </div>

      <div class="pt-box">
       <div class="pt-box-title">Templates <em style="font-size:9px;font-weight:400;color:var(--text-dim)">(save/load offer loadouts)</em></div>
       <div class="pt-tmpl-grid" id="pt-tmpl-grid"></div>
       <div style="display:flex;gap:6px;margin-top:8px">
        <input class="pt-input" id="pt-tmpl-name" placeholder="Template name..." style="flex:1;font-size:11px"/>
        <button class="pt-btn pt-btn-teal pt-btn-sm" id="pt-tmpl-save">Save</button>
       </div>
      </div>
     </div>
     <div>

      <div class="pt-box">
       <div class="pt-box-title">2. Target item <em id="pt-target-label"></em></div>
       <div class="pt-cat-row">
        <input class="pt-input" id="pt-cat-search" placeholder="Search by name..." style="flex:1"/>
        <select class="pt-select" id="pt-cat-sort"><option value="val-d">Value &#8595;</option><option value="val-a">Value &#8593;</option><option value="rap-d">RAP &#8595;</option><option value="rap-a">RAP &#8593;</option><option value="name">Name A–Z</option></select>
       </div>
       <div id="pt-cat-grid"><div style="color:var(--text-dim);font-size:11px">Loading catalog...</div></div>
       <div id="pt-target-preview">
        <img id="pt-tgt-img" src="" onerror="this.src='https://koromons.xyz/logo.png'"/>
        <div style="flex:1"><div id="pt-tgt-name"></div><div id="pt-tgt-stats"></div></div>
        <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-find-owners">Find Owners</button>
       </div>
      </div>

      <div class="pt-box">
       <div class="pt-box-title">Owner Filters</div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <div><div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Min owner value</div><input class="pt-input" id="pt-filter-minval" placeholder="0" type="number" min="0" style="font-size:11px"/></div>
        <div><div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Max owner value</div><input class="pt-input" id="pt-filter-maxval" placeholder="∞" type="number" min="0" style="font-size:11px"/></div>
       </div>
       <label class="pt-checkbox-row"><input type="checkbox" id="pt-filter-dedup" checked/> Skip duplicate UIDs</label>
       <label class="pt-checkbox-row"><input type="checkbox" id="pt-filter-pending"/> Skip owners with pending trade from me</label>
       <label class="pt-checkbox-row"><input type="checkbox" id="pt-opt-retry" checked/> Auto-retry failed trades once</label>
       <label class="pt-checkbox-row"><input type="checkbox" id="pt-opt-sound" checked/> Play sound on completion</label>
       <label class="pt-checkbox-row"><input type="checkbox" id="pt-opt-multiitem"/> Request multiple of their items (up to 4)</label>
      </div>
     </div>
    </div>


    <div class="pt-box">
     <div class="pt-box-title">3. Blast trades</div>
     <div id="pt-ratio-bar" class="pt-ratio-bar" style="display:none">
      <span class="pt-ratio-lbl">Offer:</span><span id="pt-ratio-offer" class="pt-ratio-val pt-ratio-neu">—</span>
      <span class="pt-ratio-lbl" style="margin-left:6px">Requesting:</span><span id="pt-ratio-req" class="pt-ratio-val pt-ratio-neu">—</span>
      <span class="pt-ratio-lbl" style="margin-left:6px">Ratio:</span><span id="pt-ratio-result" class="pt-ratio-val pt-ratio-neu">—</span>
     </div>
     <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
      Offer: <span id="pt-sel-rap" style="color:var(--accent);font-weight:600">0 RAP</span> / <span id="pt-sel-val" style="color:var(--accent);font-weight:600">0 Val</span>
      &nbsp;&middot;&nbsp; Owners: <span id="pt-owners-n" style="color:var(--text-pri);font-weight:600">0</span>
     </div>
     <div class="pt-ctrl-row">
      <span class="pt-ctrl-lbl">Max users:</span>
      <div class="pt-stepper"><button class="pt-step-btn" id="pt-maxu-m">&#8722;</button><div class="pt-step-v" id="pt-maxu-v">All</div><button class="pt-step-btn" id="pt-maxu-p">+</button></div>
      <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-maxcopy">Max</button>
      <span class="pt-ctrl-lbl" style="margin-left:auto">Delay:</span>
      <div class="pt-stepper"><button class="pt-step-btn" id="pt-delay-m">&#8722;</button><div class="pt-step-v" id="pt-delay-v">5s</div><button class="pt-step-btn" id="pt-delay-p">+</button></div>
      <button class="pt-btn pt-btn-teal pt-btn-sm" id="pt-export-btn" title="Export results to CSV">&#8595; CSV</button>
     </div>
     <div class="pt-prog-wrap" id="pt-prog-wrap"><div class="pt-prog-bg"><div class="pt-prog-fill pt-prog-fill-blue" id="pt-prog-fill"></div></div><div class="pt-prog-row"><span id="pt-prog-status">Sending...</span><span id="pt-prog-count">0/0</span></div></div>
     <div class="pt-log" id="pt-log"><span class="pt-info">// Ready.</span></div>
     <div style="display:flex;gap:7px"><button class="pt-btn pt-btn-green pt-btn-w" id="pt-send" disabled>Send All Trades</button><button class="pt-btn pt-btn-red" id="pt-stop" disabled style="min-width:70px">Stop</button><button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-minimize-hud-btn" title="Minimize while blasting">&#9633;</button></div>
    </div>
   </div>


   <div class="pt-pane" id="pt-pane-cancel">
    <div class="pt-box">
     <div class="pt-box-title">Outbound Trades <em id="pt-cancel-count">(none loaded)</em></div>
     <div style="display:flex;gap:7px;margin-bottom:10px">
      <button class="pt-btn pt-btn-blue" id="pt-load-trades">Load Trades</button>
      <input class="pt-input" id="pt-cancel-filter" placeholder="Filter by username..." style="flex:1;font-size:11px"/>
      <button class="pt-btn pt-btn-amber pt-btn-sm" id="pt-cancel-by-age">Cancel &gt; X days old</button>
      <div class="pt-stepper" title="Days threshold"><button class="pt-step-btn" id="pt-age-m">&#8722;</button><div class="pt-step-v" id="pt-age-v">7d</div><button class="pt-step-btn" id="pt-age-p">+</button></div>
     </div>
     <div class="pt-sel-bar"><input type="checkbox" id="pt-select-all"/><label for="pt-select-all">Select all</label><span style="margin-left:auto;color:var(--text-pri);font-weight:600;font-size:11px"><span id="pt-sel-trade-n">0</span> selected</span></div>
     <div id="pt-trades-list"><div style="color:var(--text-dim);font-size:11px;padding:3px 0">Load your outbound trades above.</div></div>
    </div>
    <div class="pt-box">
     <div class="pt-box-title">Cancel Selected</div>
     <div class="pt-ctrl-row" style="margin-bottom:10px"><span class="pt-ctrl-lbl">Delay between cancels:</span><div class="pt-stepper"><button class="pt-step-btn" id="pt-cdelay-m">&#8722;</button><div class="pt-step-v" id="pt-cdelay-v">2s</div><button class="pt-step-btn" id="pt-cdelay-p">+</button></div></div>
     <div class="pt-prog-wrap" id="pt-cprog-wrap"><div class="pt-prog-bg"><div class="pt-prog-fill pt-prog-fill-red" id="pt-cprog-fill"></div></div><div class="pt-prog-row"><span id="pt-cprog-status">Cancelling...</span><span id="pt-cprog-count">0/0</span></div></div>
     <div class="pt-log" id="pt-cancel-log"><span class="pt-info">// Select trades then hit Cancel Selected.</span></div>
     <div style="display:flex;gap:7px"><button class="pt-btn pt-btn-red pt-btn-w" id="pt-do-cancel" disabled>Cancel Selected</button><button class="pt-btn pt-btn-dark" id="pt-cancel-stop" disabled style="min-width:70px">Stop</button></div>
    </div>
   </div>


   <div class="pt-pane" id="pt-pane-history">
    <div class="pt-box">
     <div class="pt-box-title">Trade History</div>
     <div style="display:flex;gap:7px;margin-bottom:10px">
      <button class="pt-btn pt-btn-blue pt-btn-sm" id="pt-hist-load-comp">&#9989; Completed</button>
      <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-hist-load-dec">&#10060; Declined</button>
      <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-hist-load-exp">&#128336; Expired</button>
      <button class="pt-btn pt-btn-teal pt-btn-sm" id="pt-hist-export" style="margin-left:auto">&#8595; CSV</button>
     </div>
     <div class="pt-log" id="pt-hist-log" style="max-height:50px"><span class="pt-info">// Click a button above to load trade history.</span></div>
     <div id="pt-hist-list"><div style="color:var(--text-dim);font-size:11px">No trades loaded.</div></div>
    </div>
   </div>


   <div class="pt-pane" id="pt-pane-portfolio">
    <div class="pt-box">
     <div class="pt-box-title">My Portfolio</div>
     <button class="pt-btn pt-btn-blue pt-btn-w" id="pt-port-load" style="margin-bottom:10px">Calculate Portfolio</button>
     <div class="pt-port-totals" id="pt-port-totals" style="display:none">
      <div class="pt-port-stat"><div class="pt-port-stat-v" id="pt-port-total-val">—</div><div class="pt-port-stat-l">Total Value</div></div>
      <div class="pt-port-stat"><div class="pt-port-stat-v" id="pt-port-total-rap">—</div><div class="pt-port-stat-l">Total RAP</div></div>
     </div>
     <div id="pt-portfolio-items"></div>
    </div>
   </div>


   <div class="pt-pane" id="pt-pane-alerts">
    <div class="pt-box">
     <div class="pt-box-title">Watch an Item</div>
     <div style="display:flex;gap:7px;margin-bottom:8px">
      <input class="pt-input" id="pt-alert-item" placeholder="Item name or ID..." style="flex:1"/>
      <div class="pt-stepper" title="Alert if value changes by this %"><button class="pt-step-btn" id="pt-alert-pct-m">&#8722;</button><div class="pt-step-v" id="pt-alert-pct-v">5%</div><button class="pt-step-btn" id="pt-alert-pct-p">+</button></div>
      <button class="pt-btn pt-btn-green pt-btn-sm" id="pt-alert-add">Watch</button>
     </div>
     <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">Checks every 15 minutes. Notifies you when value changes by the set %.</div>
     <div id="pt-alert-feedback" style="font-size:11px;font-weight:600;min-height:16px;margin-top:2px"></div>
    </div>
    <div class="pt-box">
     <div class="pt-box-title">Watched Items <em id="pt-alert-count"></em></div>
     <div id="pt-alert-list"><div style="color:var(--text-dim);font-size:11px">No items being watched.</div></div>
    </div>
   </div>


   <div class="pt-pane" id="pt-pane-lookup">
    <div class="pt-box"><div class="pt-box-title">Item Lookup</div><div style="display:flex;gap:7px"><input class="pt-input" id="pt-lk-item-q" placeholder="Item name or asset ID..." style="flex:1"/><button class="pt-btn pt-btn-blue pt-btn-sm" id="pt-lk-item-go">Search</button></div><div class="pt-lk-result" id="pt-lk-item-r"><img id="pt-lk-item-img" src="" onerror="this.src='https://koromons.xyz/logo.png'"/><div><div class="pt-lk-name" id="pt-lk-item-name"></div><div class="pt-lk-stats" id="pt-lk-item-stats"></div></div></div></div>
    <div class="pt-box"><div class="pt-box-title">Player Lookup</div><div style="display:flex;gap:7px"><input class="pt-input" id="pt-lk-user-q" placeholder="User ID..." style="flex:1"/><button class="pt-btn pt-btn-blue pt-btn-sm" id="pt-lk-user-go">Search</button></div><div class="pt-lk-result" id="pt-lk-user-r"><img id="pt-lk-user-img" src="" style="border-radius:50%" onerror="this.src='https://koromons.xyz/logo.png'"/><div><div class="pt-lk-name" id="pt-lk-user-name"></div><div class="pt-lk-stats" id="pt-lk-user-stats"></div></div></div></div>
   </div>


   <div class="pt-pane" id="pt-pane-settings">
    <div class="pt-box"><div class="pt-box-title">Theme</div><div class="pt-theme-grid" id="pt-theme-grid"></div></div>
    <div class="pt-box"><div class="pt-box-title">Button Icon</div><div class="pt-icon-grid" id="pt-icon-grid"></div></div>
    <div class="pt-box"><div class="pt-box-title">Blacklisted Users</div><div style="display:flex;gap:7px;margin-bottom:9px"><input class="pt-input" id="pt-bl-q" placeholder="User ID or username..." style="flex:1"/><button class="pt-btn pt-btn-red pt-btn-sm" id="pt-bl-add">Block</button></div><div id="pt-bl-list" style="min-height:20px"></div></div>
    <div class="pt-box"><div class="pt-box-title">Rate Limit Backoff</div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="font-size:11px;color:var(--text-muted)">Base wait time</span><div class="pt-stepper"><button class="pt-step-btn" id="pt-bo-m">&#8722;</button><div class="pt-step-v" id="pt-bo-v">15s</div><button class="pt-step-btn" id="pt-bo-p">+</button></div></div><div style="font-size:10px;color:var(--text-dim);line-height:1.7">Waits <b style="color:var(--text-muted)">base &times; 2^n</b> on each rate limit hit. &nbsp;15s &rarr; 30s &rarr; 60s &rarr; ...</div></div>
    <div class="pt-box"><div class="pt-box-title">License</div>
     <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Active key: <span id="pt-key-display" style="font-family:monospace;color:var(--accent);font-size:10px">—</span></div>
     <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-key-reset">Deactivate &amp; Enter New Key</button>
    </div>
   </div>


   <div class="pt-pane" id="pt-pane-admin">
    <div class="pt-notice pt-notice-admin">&#9733; Admin Panel — Only visible to you.</div>
    <div class="pt-box">
     <div class="pt-box-title">Generate Key</div>
     <div style="display:flex;gap:7px;margin-bottom:8px">
      <input class="pt-input" id="pt-adm-uid" placeholder="Buyer's User ID" style="flex:1;font-size:11px"/>
      <input class="pt-input" id="pt-adm-nick" placeholder="Nickname (e.g. Discord)" style="flex:1;font-size:11px"/>
      <div class="pt-stepper" title="Days"><button class="pt-step-btn" id="pt-adm-days-m">&#8722;</button><div class="pt-step-v" id="pt-adm-days-v">30d</div><button class="pt-step-btn" id="pt-adm-days-p">+</button></div>
      <button class="pt-btn pt-btn-amber pt-btn-sm" id="pt-adm-gen">Generate</button>
     </div>
     <div id="pt-adm-result" style="display:none;background:var(--bg-log);border:1px solid var(--border);border-radius:5px;padding:9px;margin-bottom:7px">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Click to copy:</div>
      <div id="pt-adm-key-out" style="font-family:monospace;font-size:11px;color:#fbbf24;word-break:break-all;cursor:pointer;padding:5px;background:var(--bg-input);border-radius:4px;border:1px solid var(--border)"></div>
      <div id="pt-adm-copy-ok" style="font-size:10px;color:#4ade80;margin-top:3px;display:none">&#10003; Copied!</div>
     </div>
    </div>
    <div class="pt-box">
     <div class="pt-box-title">Issued Keys <em id="pt-adm-hist-count"></em></div>
     <div style="display:flex;gap:7px;margin-bottom:7px">
      <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-adm-hist-refresh">Refresh</button>
      <button class="pt-btn pt-btn-red pt-btn-sm" id="pt-adm-hist-clear">Clear History</button>
     </div>
     <div id="pt-keyhist"><div style="color:var(--text-dim);font-size:11px">No keys generated yet.</div></div>
    </div>
   </div>



   <div class="pt-pane" id="pt-pane-autosell">
    <div class="pt-2col">
     <div>
      <div class="pt-box">
       <div class="pt-box-title">Select Item to Sell <em id="pt-as-sel-label"></em></div>
       <button class="pt-btn pt-btn-blue pt-btn-w" id="pt-as-load-inv" style="margin-bottom:10px">Load My Inventory</button>
       <div id="pt-as-inv-list" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
        <div style="color:var(--text-dim);font-size:11px">Load inventory to pick an item.</div>
       </div>
      </div>
     </div>
     <div>
      <div class="pt-box">
       <div class="pt-box-title">Pricing Config</div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
         <div style="font-size:10px;color:var(--text-muted);margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Floor Price (R$)</div>
         <input class="pt-input" id="pt-as-floor" type="number" min="1" placeholder="e.g. 500" style="font-size:13px;font-weight:700"/>
        </div>
        <div>
         <div style="font-size:10px;color:var(--text-muted);margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Undercut By (R$)</div>
         <input class="pt-input" id="pt-as-undercut" type="number" min="1" value="1" style="font-size:13px;font-weight:700"/>
        </div>
       </div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
         <div style="font-size:10px;color:var(--text-muted);margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Check Every</div>
         <div class="pt-stepper"><button class="pt-step-btn" id="pt-as-int-m">&#8722;</button><div class="pt-step-v" id="pt-as-int-v">3m</div><button class="pt-step-btn" id="pt-as-int-p">+</button></div>
        </div>
        <div>
         <div style="font-size:10px;color:var(--text-muted);margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Max Listings</div>
         <input class="pt-input" id="pt-as-maxlist" type="number" min="1" max="10" value="1" style="font-size:13px;font-weight:700" title="How many copies to list"/>
        </div>
       </div>
       <label class="pt-checkbox-row" style="margin-bottom:6px"><input type="checkbox" id="pt-as-notify" checked/> Notify when item sells</label>
       <label class="pt-checkbox-row"><input type="checkbox" id="pt-as-toponly"/> Only undercut if I am NOT already cheapest</label>
      </div>
      <div class="pt-box">
       <div class="pt-box-title">Live Prices</div>
       <div class="pt-price-display">
        <div class="pt-price-card floor"><div class="pt-price-card-v" id="pt-as-floor-disp">—</div><div class="pt-price-card-l">Your Floor</div></div>
        <div class="pt-price-card"><div class="pt-price-card-v" id="pt-as-market-disp">—</div><div class="pt-price-card-l">Market Low</div></div>
        <div class="pt-price-card highlight"><div class="pt-price-card-v" id="pt-as-target-disp">—</div><div class="pt-price-card-l">Your Price</div></div>
       </div>
       <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span id="pt-as-status-badge" class="pt-status-badge idle">Idle</span>
        <span style="font-size:10px;color:var(--text-muted)">Next check: <span id="pt-as-next-check">—</span></span>
       </div>
       <div style="display:flex;gap:8px">
        <button class="pt-btn pt-btn-green pt-btn-w" id="pt-as-start">&#9654; Start Autosell</button>
        <button class="pt-btn pt-btn-red" id="pt-as-stop" disabled style="min-width:80px">Stop</button>
       </div>
      </div>
     </div>
    </div>
    <div class="pt-2col">
     <div class="pt-box">
      <div class="pt-box-title">Activity Log</div>
      <div class="pt-sell-log" id="pt-as-log"><span class="pt-info">// Select an item and set your floor price to begin.</span></div>
     </div>
     <div class="pt-box">
      <div class="pt-box-title">My Active Listings <em id="pt-as-list-count"></em></div>
      <button class="pt-btn pt-btn-dark pt-btn-sm" id="pt-as-refresh-listings" style="margin-bottom:10px">&#8635; Refresh</button>
      <div id="pt-as-listings" style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">
       <div style="color:var(--text-dim);font-size:11px">Select an item to see your listings.</div>
      </div>
     </div>
    </div>
   </div>
  </div>
 </div>
</div>`;
  document.body.appendChild(wrap);


  const overlay=document.getElementById('pt-overlay');
  const modal=document.getElementById('pt-modal');

  function openModal(){if(!_session){showKeyGate();return;}overlay.classList.add('open');modal.style.left=modal.style.top='';modal.style.position='absolute';modal.style.transform='';}

  document.getElementById('pt-fab').addEventListener('click',function(e){if(fabDragged)return;openModal();});
  document.getElementById('pt-close').addEventListener('click',function(){overlay.classList.remove('open');});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.classList.remove('open');});

  document.querySelectorAll('.pt-tab').forEach(function(t){
    t.addEventListener('click',function(){
      document.querySelectorAll('.pt-tab,.pt-pane').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('pt-pane-'+t.dataset.pane).classList.add('active');
    });
  });


  const hudEl=document.getElementById('pt-hud');
  hudEl.style.bottom='28px'; hudEl.style.right='28px';

  function minimizeToHud(){
    overlay.classList.remove('open');
    if (isRunning) hudEl.classList.add('vis');
  }
  function updateHud(){
    if (!isRunning){hudEl.classList.remove('vis');return;}
    const cnt=document.getElementById('pt-prog-count').textContent;
    const st=document.getElementById('pt-prog-status').textContent;
    document.getElementById('pt-hud-status').textContent=st+' ('+cnt+')';
    hudEl.classList.add('vis');
  }
  hudEl.addEventListener('click',function(){hudEl.classList.remove('vis');openModal();});
  document.getElementById('pt-minimize-btn').addEventListener('click',minimizeToHud);
  document.getElementById('pt-minimize-hud-btn').addEventListener('click',minimizeToHud);


  (function(){
    const header=document.getElementById('pt-header');
    let dragging=false,ox=0,oy=0;
    header.addEventListener('mousedown',function(e){
      if(e.target.closest('#pt-header-right'))return;
      dragging=true;const r=modal.getBoundingClientRect();
      ox=e.clientX-r.left;oy=e.clientY-r.top;
      modal.style.transition='none';e.preventDefault();
    });
    document.addEventListener('mousemove',function(e){
      if(!dragging)return;
      const x=Math.max(0,Math.min(window.innerWidth-modal.offsetWidth,e.clientX-ox));
      const y=Math.max(0,Math.min(window.innerHeight-modal.offsetHeight,e.clientY-oy));
      modal.style.left=x+'px';modal.style.top=y+'px';modal.style.transform='none';
    });
    document.addEventListener('mouseup',function(){if(dragging){dragging=false;modal.style.transition='';}});
  })();


  let fabDragged=false;
  (function(){
    const fab=document.getElementById('pt-fab');
    let dragging=false,ox=0,oy=0,startX=0,startY=0;
    if(fabPos&&fabPos.l!=null){fab.style.left=fabPos.l;fab.style.top=fabPos.t;fab.style.right='auto';fab.style.bottom='auto';}
    else{fab.style.bottom='28px';fab.style.right='28px';}
    fab.addEventListener('mousedown',function(e){
      dragging=true;fabDragged=false;
      const r=fab.getBoundingClientRect();ox=e.clientX-r.left;oy=e.clientY-r.top;
      startX=e.clientX;startY=e.clientY;fab.style.transition='none';e.preventDefault();
    });
    document.addEventListener('mousemove',function(e){
      if(!dragging)return;
      if(Math.abs(e.clientX-startX)>4||Math.abs(e.clientY-startY)>4)fabDragged=true;
      const x=Math.max(0,Math.min(window.innerWidth-fab.offsetWidth,e.clientX-ox));
      const y=Math.max(0,Math.min(window.innerHeight-fab.offsetHeight,e.clientY-oy));
      fab.style.left=x+'px';fab.style.top=y+'px';fab.style.right='auto';fab.style.bottom='auto';
    });
    document.addEventListener('mouseup',function(){
      if(!dragging)return;dragging=false;fab.style.transition='';
      if(fabDragged)GM_setValue('fabPos2',JSON.stringify({l:fab.style.left,t:fab.style.top}));
      setTimeout(()=>{fabDragged=false;},50);
    });
  })();


  function injectSidebar(){
    const card=document.querySelector('.card-0-2-80');if(!card)return false;
    const old=document.getElementById('pt-sidebar-entry');if(old)old.remove();
    const theme=THEMES[currentTheme]||THEMES.dark;
    const entry=document.createElement('div');
    entry.id='pt-sidebar-entry';
    entry.style.background=theme.vars['--fab-bg'];entry.style.color=theme.vars['--fab-txt'];
    entry.innerHTML='<span class="pt-sbi-icn">'+FAB_ICONS[currentFabIcon]+'</span><span>Trading Tool</span>';
    entry.addEventListener('click',openModal);card.appendChild(entry);return true;
  }
  function trySidebarInject(n){n=n||0;if(injectSidebar())return;if(n<30)setTimeout(()=>trySidebarInject(n+1),400);}
  new MutationObserver(function(){if(!document.getElementById('pt-sidebar-entry'))trySidebarInject();}).observe(document.body,{childList:true,subtree:true});


  let cachedCsrf='';

  function getCSRF(){
    if(!_poisonCheck())return '';
    try{const c=document.cookie.split(';').filter(x=>x.trim().startsWith('rbxcsrf4='))[0];if(c){const p=JSON.parse(atob(c.trim().slice('rbxcsrf4='.length).split('.')[1]));return atob(p.csrf);}}catch(e){}
    const m=document.querySelector('meta[name="csrf-token"]');return m?m.content:'';
  }

  async function getMyUid(){
    if(_cachedUid)return _cachedUid;
    let uid=null;

    const gmStored=GM_getValue('_uid','');
    if(gmStored){_cachedUid=gmStored;return gmStored;}

    if(window.Roblox&&window.Roblox.CurrentUser&&window.Roblox.CurrentUser.userId)
      uid=String(window.Roblox.CurrentUser.userId);

    if(!uid){
      const el=document.querySelector('[data-user-id],[data-userid]');
      if(el)uid=el.dataset.userid||el.dataset.userId||el.getAttribute('data-user-id');
    }

    if(!uid){
      const mc=document.cookie.match(/(?:^|;\s*)UserId=(\d+)/i);
      if(mc)uid=String(mc[1]);
    }

    if(!uid){
      try{
        const cookies=document.cookie.split(';');
        for(const c of cookies){
          const t=c.trim();
          if(t.startsWith('rbxcsrf4=')){
            const parts=t.slice('rbxcsrf4='.length).split('.');
            if(parts.length>=2){
              const payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
              if(payload&&payload.sub)uid=String(payload.sub);
              if(payload&&payload.uid)uid=String(payload.uid);
              if(payload&&payload.userId)uid=String(payload.userId);
            }
            break;
          }
        }
      }catch(e){}
    }

    if(!uid){
      try{
        const metaUid=document.querySelector('meta[name="user-data"]');
        if(metaUid){const d=JSON.parse(metaUid.content);if(d&&d.userId)uid=String(d.userId);}
      }catch(e){}
    }

    if(!uid){
      try{
        const r=await new Promise(function(resolve){
          GM_xmlhttpRequest({method:'GET',url:BASE+'/users/v1/users/authenticated',
            withCredentials:true,timeout:6000,
            headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},
            onload:r=>resolve({status:r.status,body:r.responseText}),
            onerror:()=>resolve({status:0,body:''}),
            ontimeout:()=>resolve({status:0,body:''})});
        });
        if(r.status===200){const d=JSON.parse(r.body);if(d&&d.id)uid=String(d.id);}
      }catch(e){}
    }

    if(uid){_cachedUid=uid;GM_setValue('_uid',uid);}
    return uid||null;
  }

  function _rawGet(url){
    return new Promise(function(resolve){
      GM_xmlhttpRequest({method:'GET',url,withCredentials:true,headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},
        onload:r=>resolve({status:r.status,body:r.responseText}),
        onerror:()=>resolve({status:0,body:''}),ontimeout:()=>resolve({status:0,body:''})});
    });
  }

  function getThumb(id){return 'https://www.pekora.zip/Thumbs/Asset.ashx?width=420&height=420&assetId='+id;}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

  function log(id,msg,cls){
    const el=document.getElementById(id);if(!el)return;
    const d=document.createElement('div');if(cls)d.className=cls;
    d.textContent='['+new Date().toLocaleTimeString('en-US',{hour12:false})+'] '+msg;
    el.appendChild(d);el.scrollTop=el.scrollHeight;
  }
  function blog(m,c){log('pt-log',m,c);}
  function clog(m,c){log('pt-cancel-log',m,c);}
  function hlog(m,c){log('pt-hist-log',m,c);}

  function setProgress(fillId,countId,statusId,done,total,status){
    document.getElementById(fillId).style.width=total>0?((done/total)*100)+'%':'0%';
    document.getElementById(countId).textContent=done+'/'+total;
    if(status&&statusId)document.getElementById(statusId).textContent=status;
    updateHud();
  }

  function demCls(d){
    if(!d)return 'dem-u';
    if(['high','amazing','great'].includes(d))return 'dem-hi';
    if(['low','terrible','awful'].includes(d))return 'dem-lo';
    return 'dem-n';
  }


  function playDone(){
    if(!document.getElementById('pt-opt-sound').checked)return;
    try{
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      [[523,0],[659,0.12],[784,0.24]].forEach(([freq,t])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='sine';o.frequency.value=freq;
        g.gain.setValueAtTime(0.18,ctx.currentTime+t);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.28);
        o.connect(g);g.connect(ctx.destination);
        o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.28);
      });
    }catch(e){}
  }


  function koroReq(path){
    return new Promise(function(resolve){
      GM_xmlhttpRequest({method:'GET',url:KOROMONS+path,headers:{'Accept':'application/json'},
        onload:r=>{try{resolve(JSON.parse(r.responseText));}catch(e){resolve(null);}},
        onerror:()=>resolve(null),ontimeout:()=>resolve(null)});
    });
  }

  function siteReq(method,url,data,isRetry){
    if(!cachedCsrf)cachedCsrf=getCSRF();
    const headers={'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'XMLHttpRequest'};
    if(cachedCsrf)headers['X-CSRF-TOKEN']=cachedCsrf;
    return new Promise(function(resolve){
      GM_xmlhttpRequest({method,url,withCredentials:true,headers,data:data?JSON.stringify(data):undefined,
        onload:async function(r){
          if(r.status===403&&!isRetry){
            const hdr=r.responseHeaders?r.responseHeaders.match(/x-csrf-token:\s*([^\r\n]+)/i):null;
            if(hdr){cachedCsrf=hdr[1].trim();return resolve(await siteReq(method,url,data,true));}
          }
          resolve({status:r.status,body:r.responseText});
        },
        onerror:()=>resolve({status:0,body:''}),ontimeout:()=>resolve({status:0,body:''})});
    });
  }


  async function loadUserChip(){
    const uid=await getMyUid();if(!uid)return;
    currentUserInfo.uid=uid;
    try{

      let name='User '+uid;
      try{
        const ur=await _rawGet(BASE+'/users/v1/users/authenticated');
        if(ur.status===200){const ud=JSON.parse(ur.body);name=ud.displayName||ud.name||name;}
      }catch(e){}


      if(name==='User '+uid){
        try{
          const ur2=await _rawGet(BASE+'/users/v1/users/'+uid);
          if(ur2.status===200){const ud2=JSON.parse(ur2.body);name=ud2.displayName||ud2.name||name;}
        }catch(e){}
      }

      currentUserInfo.name=name;


      let avatarUrl='';
      try{
        const av=await _rawGet(BASE+'/thumbnails/v1/users/avatar-headshot?userIds='+uid+'&size=150x150&format=png');
        if(av.status===200){
          const avd=JSON.parse(av.body);
          avatarUrl=(avd&&avd.data&&avd.data[0]&&avd.data[0].imageUrl)||'';
        }
      }catch(e){}


      if(!avatarUrl) avatarUrl='https://www.pekora.zip/Thumbs/Avatar.ashx?width=100&height=100&userId='+uid;

      currentUserInfo.avatar=avatarUrl;

      const chip=document.getElementById('pt-user-chip');
      const img=document.getElementById('pt-user-avatar');
      const txt=document.getElementById('pt-user-name-txt');
      img.src=avatarUrl;
      txt.textContent='Hi, '+name+'!';
      chip.classList.add('vis');
    }catch(e){}
  }


  let catSearch='',catSort='val-d';

  async function loadValues(){
    const data=await koroReq('/items');
    if(Array.isArray(data)&&data.length){
      allItems={};
      data.forEach(function(item){
        const id=String(item.itemId||item.ItemId||item.id||'');if(!id)return;
        allItems[id]={name:item.Name||item.name||'',value:item.Value||item.value||0,rap:0,demand:item.Demand||item.demand||'',rarity:item.Rarity||item.rarity||'',acronym:item.Acronym||item.acronym||''};
      });
      blog('Loaded '+Object.keys(allItems).length+' items from Koromons','pt-info');
      renderCatalog();
    }else{
      blog('Could not reach Koromons API','pt-err');
      document.getElementById('pt-cat-grid').innerHTML='<div style="color:#f87171;font-size:11px">Could not load items</div>';
    }
  }

  function getCatalogItems(){
    let items=Object.keys(allItems).map(id=>Object.assign({id},allItems[id]));
    const q=catSearch.toLowerCase();
    if(q)items=items.filter(i=>i.name&&i.name.toLowerCase().includes(q));
    if(catSort==='val-d')items.sort((a,b)=>(b.value||0)-(a.value||0));
    else if(catSort==='val-a')items.sort((a,b)=>(a.value||0)-(b.value||0));
    else if(catSort==='rap-d')items.sort((a,b)=>(b.rap||0)-(a.rap||0));
    else if(catSort==='rap-a')items.sort((a,b)=>(a.rap||0)-(b.rap||0));
    else if(catSort==='name')items.sort((a,b)=>{const na=(a.name||'').toLowerCase(),nb=(b.name||'').toLowerCase();return na<nb?-1:na>nb?1:0;});
    return items.slice(0,150);
  }

  function renderCatalog(){
    const grid=document.getElementById('pt-cat-grid');
    const items=getCatalogItems();
    if(!items.length){grid.innerHTML='<div style="color:var(--text-dim);font-size:11px">No items match</div>';return;}
    grid.innerHTML='';
    items.forEach(function(item){
      const div=document.createElement('div');
      div.className='pt-citem'+(targetItem&&targetItem.id===item.id?' sel':'');
      div.innerHTML='<img src="'+getThumb(item.id)+'" loading="lazy" onerror="this.src=\'https://koromons.xyz/logo.png\'"/><div class="pt-citem-n" title="'+(item.name||'')+'">'+(item.name||'?')+'</div><div class="pt-citem-v">'+(item.value?item.value.toLocaleString():'?')+'</div><div class="pt-citem-r">RAP '+(item.rap>0?item.rap.toLocaleString():'?')+'</div>';
      div.addEventListener('click',()=>pickTarget(item));
      grid.appendChild(div);
    });
  }

  async function pickTarget(item){
    targetItem=item;owners=[];
    document.getElementById('pt-owners-n').textContent='0';
    document.getElementById('pt-send').disabled=true;
    document.getElementById('pt-target-label').textContent='('+item.name+')';
    document.getElementById('pt-tgt-img').src=getThumb(item.id);
    document.getElementById('pt-tgt-name').textContent=item.name||('Item '+item.id);
    document.getElementById('pt-tgt-stats').innerHTML='Value: <span>'+(item.value?item.value.toLocaleString():'?')+'</span> &nbsp;&middot;&nbsp; RAP: <span id="pt-live-rap">'+(item.rap>0?item.rap.toLocaleString():'...')+'</span> &nbsp;&middot;&nbsp; Demand: <span class="dem '+demCls(item.demand)+'">'+(item.demand||'untracked')+'</span>';
    document.getElementById('pt-target-preview').classList.add('vis');
    renderCatalog();blog('Target: '+item.name+' (ID '+item.id+')','pt-info');
    const itemData=await koroReq('/items/'+item.id);
    const rap=(itemData&&(itemData.RAP||itemData.Rap||itemData.rap))||0;
    allItems[item.id]=Object.assign({},allItems[item.id],{rap});
    targetItem=Object.assign({},targetItem,{rap});
    const rapEl=document.getElementById('pt-live-rap');if(rapEl)rapEl.textContent=rap>0?rap.toLocaleString():'?';
    updateRatioBar();
  }

  document.getElementById('pt-cat-search').addEventListener('input',e=>{catSearch=e.target.value;renderCatalog();});
  document.getElementById('pt-cat-sort').addEventListener('change',e=>{catSort=e.target.value;renderCatalog();});


  function updateRatioBar(){
    let offerVal=0,offerRap=0;
    selectedOfferItems.forEach(function(uasId){
      const item=myInventory.find(i=>(i.userAssetId||i.UserAssetId||i.id)===uasId);
      if(item){const kor=allItems[String(item.assetId||item.AssetId||'')];if(kor){offerVal+=kor.value||0;offerRap+=kor.rap||0;}}
    });
    const reqVal=targetItem?targetItem.value||0:0;
    const bar=document.getElementById('pt-ratio-bar');
    if(!targetItem||!selectedOfferItems.length){bar.style.display='none';return;}
    bar.style.display='flex';
    document.getElementById('pt-ratio-offer').textContent=(offerVal||offerRap)?((offerVal||offerRap).toLocaleString()):'—';
    document.getElementById('pt-ratio-req').textContent=reqVal?reqVal.toLocaleString():'—';
    if(reqVal>0&&offerVal>0){
      const ratio=(offerVal/reqVal);
      const el=document.getElementById('pt-ratio-result');
      el.textContent=ratio.toFixed(2)+'x';
      el.className='pt-ratio-val '+(ratio>=0.9?'pt-ratio-pos':ratio>=0.6?'pt-ratio-neu':'pt-ratio-neg');
    }else{document.getElementById('pt-ratio-result').textContent='—';}
  }


  document.getElementById('pt-load-inv').addEventListener('click',async function(){
    if(!_guard()){blog('No active license.','pt-err');return;}
    const uid=await getMyUid();if(!uid){blog('Cannot detect your user ID','pt-err');return;}
    document.getElementById('pt-inv-grid').innerHTML='<div style="color:var(--text-dim);font-size:11px;padding:4px 0">Loading...</div>';
    blog('Fetching inventory...','pt-info');myInventory=[];let cursor='';
    while(true){
      const res=await siteReq('GET',BASE+'/inventory/v1/users/'+uid+'/assets/collectibles?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
      let data=null;try{data=JSON.parse(res.body);}catch(e){}
      const batch=(data&&data.data)||(Array.isArray(data)?data:[]);if(!batch.length)break;
      myInventory=myInventory.concat(batch);cursor=data&&data.nextPageCursor;if(!cursor)break;await sleep(200);
    }
    if(!myInventory.length){blog('No inventory items found','pt-err');document.getElementById('pt-inv-grid').innerHTML='<div style="color:#f87171;font-size:11px">No items found</div>';return;}
    blog('Loaded '+myInventory.length+' items','pt-ok');renderInventory();
  });

  function renderInventory(){
    const grid=document.getElementById('pt-inv-grid');grid.innerHTML='';
    myInventory.forEach(function(item){
      const assetId=String(item.assetId||item.AssetId||'');
      const uasId=item.userAssetId||item.UserAssetId||item.id;
      const name=item.name||item.Name||item.assetName||('#'+assetId);
      const kor=allItems[assetId];
      const div=document.createElement('div');
      div.className='pt-iitem'+(selectedOfferItems.includes(uasId)?' sel':'');
      div.innerHTML='<img src="'+getThumb(assetId)+'" loading="lazy" onerror="this.src=\'https://koromons.xyz/logo.png\'"/><div class="pt-iitem-n" title="'+name+'">'+name+'</div><div class="pt-iitem-v">'+(kor&&kor.value?kor.value.toLocaleString():'')+'</div>';
      div.addEventListener('click',()=>toggleOffer(uasId,assetId,div));
      grid.appendChild(div);
    });
    updateOfferStats();
  }

  function toggleOffer(uasId,assetId,el){
    const idx=selectedOfferItems.indexOf(uasId);
    if(idx===-1){if(selectedOfferItems.length>=4){blog('Max 4 offer items','pt-err');return;}selectedOfferItems.push(uasId);el.classList.add('sel');}
    else{selectedOfferItems.splice(idx,1);el.classList.remove('sel');}
    updateOfferStats();checkSendReady();updateRatioBar();
  }

  function updateOfferStats(){
    document.getElementById('pt-offer-count').textContent='('+selectedOfferItems.length+'/4)';
    let rap=0,val=0;
    selectedOfferItems.forEach(function(uasId){
      const item=myInventory.find(i=>(i.userAssetId||i.UserAssetId||i.id)===uasId);
      if(item){const kor=allItems[String(item.assetId||item.AssetId||'')];if(kor){rap+=kor.rap||0;val+=kor.value||0;}}
    });
    document.getElementById('pt-sel-rap').textContent=rap.toLocaleString()+' RAP';
    document.getElementById('pt-sel-val').textContent=val.toLocaleString()+' Val';
  }

  function checkSendReady(){document.getElementById('pt-send').disabled=!(selectedOfferItems.length>0&&owners.length>0&&!isRunning);}


  function loadTemplates(){return JSON.parse(GM_getValue('_tmpls','[]'));}
  function saveTemplates(t){GM_setValue('_tmpls',JSON.stringify(t.slice(0,5)));}

  function renderTemplates(){
    const grid=document.getElementById('pt-tmpl-grid');
    const tmpls=loadTemplates();
    grid.innerHTML='';
    for(let i=0;i<5;i++){
      const t=tmpls[i];
      const card=document.createElement('div');
      card.className='pt-tmpl-card'+(t?' saved':'');
      card.innerHTML=t?`<span class="pt-tmpl-rm" data-i="${i}">&times;</span><div class="pt-tmpl-n">${t.name}</div><div class="pt-tmpl-c">${t.items.length} item${t.items.length!==1?'s':''}</div>`:`<div class="pt-tmpl-n" style="color:var(--text-dim)">Slot ${i+1}</div><div class="pt-tmpl-c">empty</div>`;
      if(t){
        card.addEventListener('click',function(e){if(e.target.classList.contains('pt-tmpl-rm'))return;loadTemplate(t);});
        const rm=card.querySelector('.pt-tmpl-rm');
        if(rm)rm.addEventListener('click',function(e){e.stopPropagation();const arr=loadTemplates();arr.splice(i,1,null);const clean=arr.filter(Boolean);GM_setValue('_tmpls',JSON.stringify(clean));renderTemplates();});
      }
      grid.appendChild(card);
    }
  }

  function loadTemplate(t){
    selectedOfferItems=t.items.slice();
    renderInventory();updateOfferStats();checkSendReady();updateRatioBar();
    blog('Template "'+t.name+'" loaded ('+t.items.length+' items)','pt-ok');
  }

  document.getElementById('pt-tmpl-save').addEventListener('click',function(){
    if(!selectedOfferItems.length){blog('Select items to offer first','pt-err');return;}
    const name=document.getElementById('pt-tmpl-name').value.trim()||('Template '+(loadTemplates().length+1));
    const tmpls=loadTemplates();
    if(tmpls.length>=5){blog('Max 5 templates. Delete one first.','pt-err');return;}
    tmpls.push({name,items:selectedOfferItems.slice()});
    saveTemplates(tmpls);renderTemplates();
    document.getElementById('pt-tmpl-name').value='';
    blog('Template "'+name+'" saved','pt-ok');
  });


  document.getElementById('pt-find-owners').addEventListener('click',async function(){
    if(!_guard()){blog('No active license.','pt-err');return;}
    if(!targetItem)return;
    blog('Fetching owners of "'+targetItem.name+'"...','pt-info');
    owners=[];let cursor='',page=1,useV2=true;
    while(true){
      const url=useV2
        ?BASE+'/inventory/v2/assets/'+targetItem.id+'/owners?limit=100&sortOrder=Asc'+(cursor?'&cursor='+encodeURIComponent(cursor):'')
        :BASE+'/inventory/v1/assets/'+targetItem.id+'/owners?pageNumber='+page+'&limit=100';
      const res=await siteReq('GET',url);
      if(useV2&&res.status===404&&!cursor){useV2=false;continue;}
      let data=null;try{data=JSON.parse(res.body);}catch(e){}
      const batch=(data&&data.data)||(data&&data.owners)||(Array.isArray(data)?data:[]);
      if(!batch.length)break;
      owners=owners.concat(batch);
      if(useV2){cursor=data&&data.nextPageCursor;if(!cursor)break;}
      else{if(batch.length<100)break;page++;}
      await sleep(350);
    }
    document.getElementById('pt-owners-n').textContent=owners.length;
    blog(owners.length>0?'Found '+owners.length+' owners':'Found 0 owners',owners.length>0?'pt-ok':'pt-err');
    checkSendReady();updateRatioBar();
  });


  document.getElementById('pt-load-trades').addEventListener('click',async function(){
    if(!_guard()){clog('No active license.','pt-err');return;}
    clog('Loading all outbound trades...','pt-info');
    document.getElementById('pt-trades-list').innerHTML='<div style="color:var(--text-dim);font-size:11px;padding:3px 0">Loading...</div>';
    document.getElementById('pt-cancel-count').textContent='(loading...)';
    outboundTrades=[];selectedTradeIds.clear();
    let cursor=null,pages=0;
    while(true){
      const res=await siteReq('GET',OUTBOUND_URL(cursor));
      let data=null;try{data=JSON.parse(res.body);}catch(e){}
      const batch=(data&&data.data)||[];if(!batch.length)break;
      outboundTrades=outboundTrades.concat(batch);cursor=data&&data.nextPageCursor;pages++;
      if(outboundTrades.length>10)clog('Page '+pages+' — '+outboundTrades.length+' trades...','pt-info');
      if(!cursor)break;await sleep(300);
    }
    document.getElementById('pt-cancel-count').textContent='('+outboundTrades.length+' trades)';
    clog('Loaded '+outboundTrades.length+' outbound trades',outboundTrades.length>0?'pt-ok':'pt-err');
    renderTradesList();syncCancelBtn();
  });


  document.getElementById('pt-cancel-filter').addEventListener('input',function(e){
    cancelFilterText=e.target.value.toLowerCase();renderTradesList();
  });


  let cancelAgeDays=7;
  document.getElementById('pt-age-m').addEventListener('click',function(){cancelAgeDays=Math.max(1,cancelAgeDays-1);document.getElementById('pt-age-v').textContent=cancelAgeDays+'d';});
  document.getElementById('pt-age-p').addEventListener('click',function(){cancelAgeDays++;document.getElementById('pt-age-v').textContent=cancelAgeDays+'d';});
  document.getElementById('pt-cancel-by-age').addEventListener('click',function(){
    const cutoff=Date.now()-cancelAgeDays*86400000;
    outboundTrades.forEach(function(t){
      const created=t.created?new Date(t.created).getTime():0;
      if(created>0&&created<cutoff)selectedTradeIds.add(t.id);
    });
    renderTradesList();
    document.getElementById('pt-sel-trade-n').textContent=selectedTradeIds.size;
    syncCancelBtn();syncSelectAll();
    clog('Selected '+selectedTradeIds.size+' trades older than '+cancelAgeDays+' days','pt-info');
  });

  function renderTradesList(){
    const list=document.getElementById('pt-trades-list');
    let filtered=outboundTrades;
    if(cancelFilterText)filtered=filtered.filter(t=>{
      const partner=((t.user&&(t.user.name||t.user.displayName))||'').toLowerCase();
      return partner.includes(cancelFilterText);
    });
    if(!filtered.length){list.innerHTML='<div style="color:var(--text-muted);font-size:11px;padding:3px 0">No trades match.</div>';return;}
    list.innerHTML='';
    filtered.forEach(function(trade){
      const partner=(trade.user&&(trade.user.name||trade.user.displayName))||('User '+(trade.user&&trade.user.id||'?'));
      const expires=trade.expiration?new Date(trade.expiration).toLocaleDateString():'';
      const created=trade.created?new Date(trade.created).toLocaleDateString():'';
      const sel=selectedTradeIds.has(trade.id);
      const row=document.createElement('div');
      row.className='pt-trade-row'+(sel?' sel':'');row.dataset.id=trade.id;
      row.innerHTML='<input type="checkbox" class="pt-trade-check" data-id="'+trade.id+'" '+(sel?'checked':'')+'/><span class="pt-trade-partner">'+partner+'</span><span class="pt-trade-meta">sent '+created+'</span><span class="pt-trade-id">#'+trade.id+'</span>';
      const cb=row.querySelector('.pt-trade-check');
      const toggle=function(checked){
        if(checked){selectedTradeIds.add(trade.id);row.classList.add('sel');}
        else{selectedTradeIds.delete(trade.id);row.classList.remove('sel');}
        document.getElementById('pt-sel-trade-n').textContent=selectedTradeIds.size;
        syncCancelBtn();syncSelectAll();
      };
      cb.addEventListener('change',()=>toggle(cb.checked));
      row.addEventListener('click',function(e){if(e.target===cb)return;cb.checked=!cb.checked;toggle(cb.checked);});
      list.appendChild(row);
    });
    document.getElementById('pt-sel-trade-n').textContent=selectedTradeIds.size;
  }

  function syncSelectAll(){
    const sa=document.getElementById('pt-select-all');
    sa.checked=outboundTrades.length>0&&selectedTradeIds.size===outboundTrades.length;
    sa.indeterminate=selectedTradeIds.size>0&&selectedTradeIds.size<outboundTrades.length;
  }
  function syncCancelBtn(){document.getElementById('pt-do-cancel').disabled=selectedTradeIds.size===0||isCancelling;}

  document.getElementById('pt-select-all').addEventListener('change',function(e){
    outboundTrades.forEach(t=>{if(e.target.checked)selectedTradeIds.add(t.id);else selectedTradeIds.delete(t.id);});
    document.querySelectorAll('.pt-trade-check').forEach(cb=>{cb.checked=e.target.checked;cb.closest('.pt-trade-row').classList.toggle('sel',e.target.checked);});
    document.getElementById('pt-sel-trade-n').textContent=selectedTradeIds.size;syncCancelBtn();
  });

  document.getElementById('pt-cdelay-m').addEventListener('click',function(){cancelDelay=Math.max(1,cancelDelay-1);document.getElementById('pt-cdelay-v').textContent=cancelDelay+'s';});
  document.getElementById('pt-cdelay-p').addEventListener('click',function(){cancelDelay++;document.getElementById('pt-cdelay-v').textContent=cancelDelay+'s';});

  document.getElementById('pt-do-cancel').addEventListener('click',async function(){
    if(!_guard()){clog('No active license.','pt-err');return;}
    if(isCancelling||!selectedTradeIds.size)return;
    isCancelling=true;shouldStopCancel=false;
    document.getElementById('pt-do-cancel').disabled=true;document.getElementById('pt-cancel-stop').disabled=false;
    document.getElementById('pt-cprog-wrap').style.display='block';
    const toCancel=Array.from(selectedTradeIds);let done=0,failed=0;
    clog('Cancelling '+toCancel.length+' trades...','pt-info');
    for(let i=0;i<toCancel.length;i++){
      if(shouldStopCancel){clog('Stopped.','pt-err');break;}
      const id=toCancel[i];
      const trade=outboundTrades.find(t=>t.id===id);
      const partner=(trade&&trade.user&&trade.user.name)||('#'+id);
      const res=await siteReq('POST',CANCEL_URL(id));
      if(res.status===429){clog('Rate limited — 30s...','pt-err');setProgress('pt-cprog-fill','pt-cprog-count','pt-cprog-status',done+failed,toCancel.length,'Rate limited');await sleep(30000);i--;continue;}
      if(res.status===200){done++;clog('✓ Cancelled with '+partner,'pt-ok');selectedTradeIds.delete(id);outboundTrades=outboundTrades.filter(t=>t.id!==id);const row=document.querySelector('.pt-trade-row[data-id="'+id+'"]');if(row)row.classList.add('gone');}
      else{failed++;clog('✗ Failed #'+id+' (HTTP '+res.status+')','pt-err');}
      setProgress('pt-cprog-fill','pt-cprog-count','pt-cprog-status',done+failed,toCancel.length,'Cancelling...');
      if(i<toCancel.length-1&&!shouldStopCancel)await sleep(cancelDelay*1000);
    }
    clog('Done — Cancelled: '+done+'  Failed: '+failed,'pt-ok');
    document.getElementById('pt-cancel-count').textContent='('+outboundTrades.length+' remaining)';
    document.getElementById('pt-sel-trade-n').textContent=selectedTradeIds.size;
    isCancelling=false;document.getElementById('pt-cancel-stop').disabled=true;
    syncCancelBtn();syncSelectAll();
    setProgress('pt-cprog-fill','pt-cprog-count','pt-cprog-status',done+failed,toCancel.length,'Complete');
    if(done>0){playDone();GM_notification({title:'Korone Trading Tool',text:'Cancelled '+done+' trades.',timeout:4000});}
  });

  document.getElementById('pt-cancel-stop').addEventListener('click',function(){shouldStopCancel=true;clog('Stopping...','pt-err');});


  let historyTrades=[];

  async function loadHistory(type){
    hlog('Loading '+type+' trades...','pt-info');
    document.getElementById('pt-hist-list').innerHTML='<div style="color:var(--text-dim);font-size:11px">Loading...</div>';
    historyTrades=[];let cursor=null;

    const tradeList=[];
    while(true){
      const res=await siteReq('GET',HISTORY_URL(type,cursor));
      let data=null;try{data=JSON.parse(res.body);}catch(e){}
      const batch=(data&&data.data)||[];if(!batch.length)break;
      tradeList.push(...batch);
      cursor=data&&data.nextPageCursor;if(!cursor)break;await sleep(300);
    }
    hlog('Fetched '+tradeList.length+' trade IDs — loading details...','pt-info');

    for(let i=0;i<tradeList.length;i++){
      const t=tradeList[i];
      const det=await siteReq('GET',BASE+'/trades/v1/trades/'+t.id);
      let full=null;try{full=JSON.parse(det.body);}catch(e){}

      historyTrades.push(full&&full.offers?full:t);
      if((i+1)%5===0)hlog('Loaded '+(i+1)+'/'+tradeList.length+' details...','pt-info');
      await sleep(200);
    }
    hlog('Loaded '+historyTrades.length+' '+type+' trades',historyTrades.length>0?'pt-ok':'pt-info');
    renderHistory(type);
  }

  function renderHistory(type){
    const list=document.getElementById('pt-hist-list');
    if(!historyTrades.length){list.innerHTML='<div style="color:var(--text-muted);font-size:11px">No '+type+' trades found.</div>';return;}
    list.innerHTML='';
    const myUid=currentUserInfo.uid||'';
    historyTrades.forEach(function(trade){
      const partner=(trade.user&&(trade.user.name||trade.user.displayName))||('User '+(trade.user&&trade.user.id||'?'));
      const partnerUid=String((trade.user&&trade.user.id)||'');

      const offers=trade.offers||[];
      let myOffer=null,theirOffer=null;
      offers.forEach(function(o){
        const oUid=String((o.user&&o.user.id)||'');
        if(oUid&&myUid&&oUid===myUid)myOffer=o; else theirOffer=o;
      });
      if(!myOffer)myOffer=offers[0]||null;
      if(!theirOffer)theirOffer=offers[1]||null;

      const myAssets=(myOffer&&(myOffer.userAssets||myOffer.userAssetIds))||[];
      const theirAssets=(theirOffer&&(theirOffer.userAssets||theirOffer.userAssetIds))||[];
      const date=trade.created?new Date(trade.created).toLocaleDateString():
                 (trade.expiration?new Date(trade.expiration).toLocaleDateString():'');
      const badgeCls=type==='completed'?'pt-badge-comp':type==='declined'?'pt-badge-dec':'pt-badge-exp';
      const badgeTxt=type==='completed'?'Completed':type==='declined'?'Declined':'Expired';
      const row=document.createElement('div');row.className='pt-hist-row';
      row.innerHTML=
        '<img class="pt-hist-thumb" id="pt-hist-av-'+trade.id+'" src="https://koromons.xyz/logo.png" onerror="this.src=\'https://koromons.xyz/logo.png\'"/>'+
        '<div class="pt-hist-info">'+
          '<div class="pt-hist-partner">'+partner+'</div>'+
          '<div class="pt-hist-items">You gave: <b style="color:var(--text-pri)">'+myAssets.length+'</b> item(s) &middot; Received: <b style="color:var(--text-pri)">'+theirAssets.length+'</b> item(s) &middot; '+date+'</div>'+
        '</div>'+
        '<span class="pt-hist-badge '+badgeCls+'">'+badgeTxt+'</span>';
      list.appendChild(row);

      if(partnerUid){
        GM_xmlhttpRequest({
          method:'GET',
          url:BASE+'/thumbnails/v1/users/avatar-headshot?userIds='+partnerUid+'&size=150x150&format=png',
          withCredentials:true,
          headers:{'Accept':'application/json'},
          onload:function(r){
            try{
              const d=JSON.parse(r.responseText);
              const url=d&&d.data&&d.data[0]&&d.data[0].imageUrl;
              if(url){const el=document.getElementById('pt-hist-av-'+trade.id);if(el)el.src=url;}
            }catch(e){}
          }
        });
      }
    });
  }

  document.getElementById('pt-hist-load-comp').addEventListener('click',()=>{if(!_guard())return;loadHistory('completed');});
  document.getElementById('pt-hist-load-dec').addEventListener('click',()=>{if(!_guard())return;loadHistory('declined');});
  document.getElementById('pt-hist-load-exp').addEventListener('click',()=>loadHistory('expired'));
  document.getElementById('pt-hist-export').addEventListener('click',function(){
    if(!historyTrades.length){return;}
    const rows=[['Partner','Status','Date','My Items Count','Their Items Count']];
    historyTrades.forEach(function(t){
      const partner=(t.user&&(t.user.name||t.user.displayName))||('User '+(t.user&&t.user.id||'?'));
      const myI=(t.offers&&t.offers[0]&&t.offers[0].userAssets)||[];
      const thI=(t.offers&&t.offers[1]&&t.offers[1].userAssets)||[];
      const date=t.created?new Date(t.created).toLocaleDateString():'';
      rows.push([partner,'trade',date,myI.length,thI.length]);
    });
    copyCSV(rows,'Trade history exported to clipboard','pt-hist-log');
  });


  document.getElementById('pt-port-load').addEventListener('click',async function(){
    if(!_guard())return;
    const uid=await getMyUid();if(!uid){return;}
    const btn=document.getElementById('pt-port-load');btn.disabled=true;btn.textContent='Loading...';
    let inv=[];let cursor='';
    while(true){
      const res=await siteReq('GET',BASE+'/inventory/v1/users/'+uid+'/assets/collectibles?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
      let data=null;try{data=JSON.parse(res.body);}catch(e){}
      const batch=(data&&data.data)||(Array.isArray(data)?data:[]);if(!batch.length)break;
      inv=inv.concat(batch);cursor=data&&data.nextPageCursor;if(!cursor)break;await sleep(200);
    }
    btn.disabled=false;btn.textContent='Calculate Portfolio';
    if(!inv.length)return;
    let totalVal=0,totalRap=0;
    const rows=inv.map(function(item){
      const id=String(item.assetId||item.AssetId||'');
      const kor=allItems[id];
      const val=kor?kor.value||0:0;const rap=kor?kor.rap||0:0;
      totalVal+=val;totalRap+=rap;
      return{id,name:item.name||item.Name||item.assetName||('#'+id),val,rap};
    }).sort((a,b)=>b.val-a.val);
    document.getElementById('pt-port-total-val').textContent=totalVal.toLocaleString();
    document.getElementById('pt-port-total-rap').textContent=totalRap.toLocaleString();
    document.getElementById('pt-port-totals').style.display='grid';
    const list=document.getElementById('pt-portfolio-items');list.innerHTML='';
    rows.forEach(function(r){
      const row=document.createElement('div');row.className='pt-port-row';
      row.innerHTML='<img class="pt-port-thumb" src="'+getThumb(r.id)+'" loading="lazy" onerror="this.src=\'https://koromons.xyz/logo.png\'"/><div class="pt-port-name" title="'+r.name+'">'+r.name+'</div><span class="pt-port-val">'+(r.val?r.val.toLocaleString():'?')+'</span><span class="pt-port-rap">RAP '+(r.rap?r.rap.toLocaleString():'?')+'</span>';
      list.appendChild(row);
    });
  });


  let alertPct=5;
  document.getElementById('pt-alert-pct-m').addEventListener('click',function(){alertPct=Math.max(1,alertPct-1);document.getElementById('pt-alert-pct-v').textContent=alertPct+'%';});
  document.getElementById('pt-alert-pct-p').addEventListener('click',function(){alertPct=Math.min(99,alertPct+1);document.getElementById('pt-alert-pct-v').textContent=alertPct+'%';});

  function loadAlerts(){priceAlerts=JSON.parse(GM_getValue('_alerts','[]'));}
  function saveAlerts(){GM_setValue('_alerts',JSON.stringify(priceAlerts));}

  function alertLog(msg,cls){

    const el=document.getElementById('pt-alert-feedback');
    if(!el)return;
    el.textContent=msg;
    el.style.color=cls==='ok'?'#4ade80':cls==='warn'?'#fbbf24':'#f87171';
    clearTimeout(el._t);el._t=setTimeout(function(){el.textContent='';},3000);
  }

  document.getElementById('pt-alert-add').addEventListener('click',async function(){
    if(!_guard()){alertLog('No active license.','err');return;}
    const q=document.getElementById('pt-alert-item').value.trim();if(!q)return;
    const btn=document.getElementById('pt-alert-add');
    btn.disabled=true;btn.textContent='Searching...';
    const ql=q.toLowerCase();
    let foundId=null,foundName='',foundVal=0;


    if(/^\d+$/.test(q)&&allItems[q]){
      foundId=q;foundName=allItems[q].name;foundVal=allItems[q].value||0;
    } else {
      const id=Object.keys(allItems).find(k=>allItems[k].name&&allItems[k].name.toLowerCase().includes(ql));
      if(id){foundId=id;foundName=allItems[id].name;foundVal=allItems[id].value||0;}
    }


    if(!foundId){
      if(/^\d+$/.test(q)){

        const d=await koroReq('/items/'+q);
        if(d&&(d.Name||d.name)){
          foundId=q;foundName=d.Name||d.name;foundVal=d.Value||d.value||0;
        }
      } else {

        const d=await koroReq('/items/search?q='+encodeURIComponent(q));
        const results=Array.isArray(d)?d:(d&&d.data)||[];
        if(results.length){
          const first=results[0];
          foundId=String(first.itemId||first.ItemId||first.id||'');
          foundName=first.Name||first.name||foundId;
          foundVal=first.Value||first.value||0;
        }
      }
    }

    btn.disabled=false;btn.textContent='Watch';

    if(!foundId){alertLog('Item not found. Try the exact name or asset ID.','err');return;}
    if(priceAlerts.find(a=>a.id===foundId)){alertLog('Already watching "'+foundName+'"','warn');return;}

    priceAlerts.push({id:foundId,name:foundName,baseVal:foundVal,pct:alertPct,lastChecked:Date.now()});
    saveAlerts();renderAlerts();
    document.getElementById('pt-alert-item').value='';
    alertLog('Now watching "'+foundName+'" (±'+alertPct+'%)','ok');
  });

  function renderAlerts(){
    const list=document.getElementById('pt-alert-list');
    const countEl=document.getElementById('pt-alert-count');
    if(countEl)countEl.textContent='('+priceAlerts.length+')';
    if(!priceAlerts.length){list.innerHTML='<div style="color:var(--text-dim);font-size:11px">No items being watched.</div>';return;}
    list.innerHTML='';
    priceAlerts.forEach(function(a,i){
      const row=document.createElement('div');row.className='pt-alert-row';
      row.innerHTML='<img class="pt-alert-thumb" src="'+getThumb(a.id)+'" onerror="this.src=\'https://koromons.xyz/logo.png\'"/><div class="pt-alert-name">'+a.name+'</div><div class="pt-alert-val">Base: '+(a.baseVal?a.baseVal.toLocaleString():'?')+' &middot; Alert ±'+a.pct+'%</div><button class="pt-alert-rm" data-i="'+i+'">&times;</button>';
      row.querySelector('.pt-alert-rm').addEventListener('click',function(){priceAlerts.splice(i,1);saveAlerts();renderAlerts();});
      list.appendChild(row);
    });
  }

  function startPriceAlertLoop(){
    if(priceAlertInterval)clearInterval(priceAlertInterval);
    priceAlertInterval=setInterval(async function(){
      if(!priceAlerts.length)return;
      for(let i=0;i<priceAlerts.length;i++){
        const a=priceAlerts[i];
        const data=await koroReq('/items/'+a.id);
        const newVal=(data&&(data.Value||data.value))||0;
        if(!newVal||!a.baseVal)continue;
        const change=Math.abs((newVal-a.baseVal)/a.baseVal)*100;
        if(change>=a.pct){
          const dir=newVal>a.baseVal?'▲ UP':'▼ DOWN';
          GM_notification({title:'Price Alert: '+a.name,text:dir+' '+change.toFixed(1)+'% ('+a.baseVal.toLocaleString()+' → '+newVal.toLocaleString()+')',timeout:8000});
          priceAlerts[i].baseVal=newVal;
          saveAlerts();renderAlerts();
        }
        await sleep(2000);
      }
    },15*60*1000);
  }


  function stepper(mId,pId,vId,get,set,fmt){
    document.getElementById(mId).addEventListener('click',function(){set(get()-1);document.getElementById(vId).textContent=fmt(get());});
    document.getElementById(pId).addEventListener('click',function(){set(get()+1);document.getElementById(vId).textContent=fmt(get());});
  }
  stepper('pt-maxu-m','pt-maxu-p','pt-maxu-v',()=>maxUsers,v=>{maxUsers=Math.max(0,v);},v=>v===0?'All':v);
  stepper('pt-delay-m','pt-delay-p','pt-delay-v',()=>delaySeconds,v=>{delaySeconds=Math.max(1,v);},v=>v+'s');
  stepper('pt-bo-m','pt-bo-p','pt-bo-v',()=>backoffBase,v=>{backoffBase=Math.max(5,v);},v=>v+'s');
  document.getElementById('pt-maxcopy').addEventListener('click',function(){maxUsers=owners.length;document.getElementById('pt-maxu-v').textContent=maxUsers;});
  document.getElementById('pt-send').addEventListener('click',blast);
  document.getElementById('pt-stop').addEventListener('click',function(){shouldStop=true;blog('Stopping...','pt-err');});


  function copyCSV(rows,successMsg,logId){
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    navigator.clipboard.writeText(csv).catch(function(){const ta=document.createElement('textarea');ta.value=csv;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);});
    if(logId)log(logId,successMsg,'pt-ok');else blog(successMsg,'pt-ok');
  }

  document.getElementById('pt-export-btn').addEventListener('click',function(){
    if(!blastResults.length){blog('No blast results to export yet','pt-err');return;}
    const rows=[['Username','UID','Status','HTTP']];
    blastResults.forEach(r=>rows.push([r.name,r.uid,r.status,r.http]));
    copyCSV(rows,'Blast results copied to clipboard as CSV');
  });

  async function blast(){
    if(isRunning)return;
    if(!_guard()){blog('License error: session invalid or script tampered.','pt-err');return;}
    const myUid=await getMyUid();if(!myUid){blog('Cannot detect your user ID','pt-err');return;}
    const blacklist=GM_getValue('blacklistUsers','').split(',').map(s=>s.trim()).filter(Boolean);
    const blLower=blacklist.map(x=>x.toLowerCase());
    const dedup=document.getElementById('pt-filter-dedup').checked;
    const skipPending=document.getElementById('pt-filter-pending').checked;
    const autoRetry=document.getElementById('pt-opt-retry').checked;
    const multiItem=document.getElementById('pt-opt-multiitem').checked;
    const minVal=parseInt(document.getElementById('pt-filter-minval').value)||0;
    const maxVal=parseInt(document.getElementById('pt-filter-maxval').value)||0;


    let seenUids=new Set();
    let pendingSet=new Set();
    if(skipPending){outboundTrades.forEach(t=>{if(t.user&&t.user.id)pendingSet.add(String(t.user.id));});}

    const limit=maxUsers===0?owners.length:Math.min(maxUsers,owners.length);
    let queue=owners.slice(0,limit).filter(function(o){
      const uid=String((o.userId)||(o.owner&&(o.owner.userId||o.owner.id))||o.id||'');
      const uname=((o.username)||(o.owner&&o.owner.username)||o.name||'').toLowerCase();
      if(uid===myUid)return false;
      if(blacklist.includes(uid)||blLower.includes(uname))return false;
      if(dedup){if(seenUids.has(uid))return false;seenUids.add(uid);}
      if(skipPending&&pendingSet.has(uid))return false;
      return true;
    });


    if(minVal>0||maxVal>0){
      blog('Filtering owners by value (this may take a moment)...','pt-info');
      const filtered=[];
      for(const o of queue){
        const uid=String((o.userId)||(o.owner&&(o.owner.userId||o.owner.id))||o.id||'');
        const p=await koroReq('/users/'+uid);
        const val=(p&&p.Value)||0;
        if(minVal>0&&val<minVal)continue;
        if(maxVal>0&&val>maxVal)continue;
        filtered.push(o);
        await sleep(300);
      }
      queue=filtered;
      blog('After value filter: '+queue.length+' targets','pt-info');
    }

    if(!queue.length){blog('No valid targets after filters','pt-err');return;}
    isRunning=true;shouldStop=false;consecutiveRateLimits=0;blastResults=[];
    document.getElementById('pt-send').disabled=true;document.getElementById('pt-stop').disabled=false;
    document.getElementById('pt-prog-wrap').style.display='block';
    blog('Blasting '+queue.length+' targets at '+delaySeconds+'s delay','pt-info');
    let sent=0,failed=0,skipped=0;

    for(let i=0;i<queue.length;i++){
      if(shouldStop){blog('Stopped.','pt-err');break;}
      const o=queue[i];
      const theirUid=String((o.userId)||(o.owner&&(o.owner.userId||o.owner.id))||o.id);
      const theirName=(o.username)||(o.owner&&o.owner.username)||o.name||theirUid;
      const theirAssets=await getTheirAssets(theirUid,targetItem.id);
      if(!theirAssets.length){skipped++;setProgress('pt-prog-fill','pt-prog-count','pt-prog-status',sent+failed+skipped,queue.length,'Sending...');continue;}

      const theirAss=multiItem?theirAssets.slice(0,4):theirAssets.slice(0,1);
      let result=await doSendTrade(myUid,theirUid,selectedOfferItems,theirAss);


      if(!result.ok&&!result.rateLimited&&autoRetry){
        await sleep(3000);
        result=await doSendTrade(myUid,theirUid,selectedOfferItems,theirAss);
      }

      if(result.rateLimited){
        consecutiveRateLimits++;
        const wait=backoffBase*Math.pow(2,consecutiveRateLimits-1);
        blog('Rate limited — waiting '+wait+'s','pt-err');
        setProgress('pt-prog-fill','pt-prog-count','pt-prog-status',sent+failed+skipped,queue.length,'Rate limited '+wait+'s');
        await sleep(wait*1000);i--;continue;
      }
      consecutiveRateLimits=0;
      if(result.ok){sent++;blog('✓ '+theirName,'pt-ok');blastResults.push({name:theirName,uid:theirUid,status:'sent',http:result.status});}
      else{failed++;blog('✗ '+theirName+' (HTTP '+result.status+')','pt-err');blastResults.push({name:theirName,uid:theirUid,status:'failed',http:result.status});}
      setProgress('pt-prog-fill','pt-prog-count','pt-prog-status',sent+failed+skipped,queue.length,'Sending...');
      if(i<queue.length-1&&!shouldStop)await sleep(delaySeconds*1000);
    }

    blog('Complete — Sent: '+sent+'  Failed: '+failed+'  Skipped: '+skipped,'pt-ok');
    if(sent>0){playDone();GM_notification({title:'Korone Trading Tool',text:'Blast done! '+sent+' trades sent.',timeout:5000});}
    isRunning=false;document.getElementById('pt-stop').disabled=true;
    checkSendReady();hudEl.classList.remove('vis');
    setProgress('pt-prog-fill','pt-prog-count','pt-prog-status',sent+failed+skipped,queue.length,'Complete');
  }

  async function getTheirAssets(uid,targetAssetId){
    const res=await siteReq('GET',BASE+'/inventory/v1/users/'+uid+'/assets/collectibles?assetId='+targetAssetId);
    try{
      const data=JSON.parse(res.body);
      const items=(data&&data.data)||(Array.isArray(data)?data:[]);
      return items.filter(i=>String(i.assetId||i.AssetId)===String(targetAssetId)).map(i=>i.userAssetId||i.UserAssetId||i.id).filter(Boolean);
    }catch(e){return [];}
  }

  async function doSendTrade(myUid,theirUid,myUAIds,theirUAIds){
    if(!_session||typeof validateKey!=='function')return{ok:false,rateLimited:false,status:0};
    const res=await siteReq('POST',TRADE_URL,{offers:[{userId:myUid,userAssetIds:myUAIds,robux:null},{userId:String(theirUid),userAssetIds:theirUAIds,robux:null}]});
    return{ok:res.status===200,rateLimited:res.status===429,status:res.status};
  }


  async function itemLookup(){
    const q=document.getElementById('pt-lk-item-q').value.trim();if(!q)return;
    let item=null;
    if(/^\d+$/.test(q)){const d=await koroReq('/items/'+q);if(d&&(d.Name||d.name))item={found:true,assetId:q,name:d.Name||d.name,value:d.Value||d.value||0,rap:d.RAP||d.Rap||d.rap||0,demand:d.Demand||d.demand||'',rarity:d.Rarity||d.rarity||''};}
    if(!item){const ql=q.toLowerCase();const id=Object.keys(allItems).find(k=>allItems[k].name&&allItems[k].name.toLowerCase().includes(ql));if(id)item=Object.assign({found:true,assetId:id},allItems[id]);}
    const r=document.getElementById('pt-lk-item-r');
    if(item&&item.found){
      document.getElementById('pt-lk-item-img').src=getThumb(item.assetId);
      document.getElementById('pt-lk-item-name').textContent=item.name||('Item '+item.assetId);
      document.getElementById('pt-lk-item-stats').innerHTML='<b>Value:</b> '+(item.value?item.value.toLocaleString():'?')+'<br/><b>RAP:</b> '+(item.rap?item.rap.toLocaleString():'?')+'<br/><b>Demand:</b> <span class="dem '+demCls(item.demand)+'">'+(item.demand||'untracked')+'</span><br/><b>Rarity:</b> '+(item.rarity||'?');
      r.classList.add('vis');
    }else r.classList.remove('vis');
  }

  async function playerLookup(){
    const q=document.getElementById('pt-lk-user-q').value.trim();if(!q)return;
    const p=await koroReq('/users/'+q);
    const r=document.getElementById('pt-lk-user-r');
    if(p&&(p.id||p.name)){

      let avatarUrl='';
      const uid=String(p.id||q);
      await new Promise(function(resolve){
        GM_xmlhttpRequest({
          method:'GET',
          url:BASE+'/thumbnails/v1/users/avatar-headshot?userIds='+uid+'&size=150x150&format=png',
          withCredentials:true,
          headers:{'Accept':'application/json'},
          onload:function(av){
            try{const d=JSON.parse(av.responseText);const u=d&&d.data&&d.data[0]&&d.data[0].imageUrl;if(u)avatarUrl=u;}catch(e){}
            resolve();
          },
          onerror:resolve,ontimeout:resolve
        });
      });
      document.getElementById('pt-lk-user-img').src=avatarUrl||'https://koromons.xyz/logo.png';
      document.getElementById('pt-lk-user-name').textContent=p.displayName?(p.displayName+' (@'+p.name+')'):(p.name||('User '+q));
      document.getElementById('pt-lk-user-stats').innerHTML='<b>Value:</b> '+(p.Value?p.Value.toLocaleString():'?')+'<br/><b>Joined:</b> '+(p.created?new Date(p.created).toLocaleDateString():'?')+'<br/><b>Banned:</b> '+(p.isBanned?'Yes':'No');
      r.classList.add('vis');
    }else{
      document.getElementById('pt-lk-user-img').src='https://koromons.xyz/logo.png';
      document.getElementById('pt-lk-user-name').textContent='User not found';
      document.getElementById('pt-lk-user-stats').innerHTML='No data for user <b>'+q+'</b>.';
      r.classList.add('vis');
    }
  }

  document.getElementById('pt-lk-item-go').addEventListener('click',itemLookup);
  document.getElementById('pt-lk-user-go').addEventListener('click',playerLookup);
  document.getElementById('pt-lk-item-q').addEventListener('keydown',e=>{if(e.key==='Enter')itemLookup();});
  document.getElementById('pt-lk-user-q').addEventListener('keydown',e=>{if(e.key==='Enter')playerLookup();});


  function renderBlacklist(){
    const el=document.getElementById('pt-bl-list');
    const list=GM_getValue('blacklistUsers','').split(',').map(s=>s.trim()).filter(Boolean);
    if(!list.length){el.innerHTML='<span style="font-size:11px;color:var(--text-dim)">Nobody blocked</span>';return;}
    el.innerHTML=list.map((u,i)=>'<span class="pt-chip">🚫 '+u+' <span class="pt-chip-rm" data-i="'+i+'">&times;</span></span>').join('');
    el.querySelectorAll('.pt-chip-rm').forEach(function(btn){
      btn.addEventListener('click',function(){list.splice(Number(btn.dataset.i),1);GM_setValue('blacklistUsers',list.join(','));renderBlacklist();});
    });
  }

  document.getElementById('pt-bl-add').addEventListener('click',function(){
    const v=document.getElementById('pt-bl-q').value.trim();if(!v)return;
    const list=GM_getValue('blacklistUsers','').split(',').map(s=>s.trim()).filter(Boolean);
    if(!list.includes(v)){list.push(v);GM_setValue('blacklistUsers',list.join(','));}
    document.getElementById('pt-bl-q').value='';renderBlacklist();
  });


  function renderThemePicker(){
    const grid=document.getElementById('pt-theme-grid');if(!grid)return;grid.innerHTML='';
    Object.keys(THEMES).forEach(function(key){
      const card=document.createElement('div');
      card.className='pt-theme-card'+(currentTheme===key?' active-theme':'');
      card.innerHTML='<div class="pt-theme-swatch" style="background:'+THEME_SWATCHES[key]+'"></div>'+THEMES[key].name;
      card.addEventListener('click',function(){applyTheme(key);document.querySelectorAll('.pt-theme-card').forEach(c=>c.classList.remove('active-theme'));card.classList.add('active-theme');});
      grid.appendChild(card);
    });
  }

  function renderIconPicker(){
    const grid=document.getElementById('pt-icon-grid');if(!grid)return;grid.innerHTML='';
    Object.keys(FAB_ICONS).forEach(function(key){
      const btn=document.createElement('div');
      btn.className='pt-icon-btn'+(currentFabIcon===key?' active-icon':'');
      btn.innerHTML=FAB_ICONS[key];btn.title=key;
      btn.addEventListener('click',function(){applyFabIcon(key);document.querySelectorAll('.pt-icon-btn').forEach(b=>b.classList.remove('active-icon'));btn.classList.add('active-icon');});
      grid.appendChild(btn);
    });
  }


  function showKeyGate(){document.getElementById('pt-keygate').classList.remove('hidden');}
  function hideKeyGate(){document.getElementById('pt-keygate').classList.add('hidden');}

  document.getElementById('pt-key-activate').addEventListener('click',async function(){
    const k=document.getElementById('pt-key-input').value.trim();
    const errEl=document.getElementById('pt-key-err');
    const btn=document.getElementById('pt-key-activate');
    if(!k){errEl.textContent='Please enter a key.';return;}
    btn.disabled=true;btn.textContent='Verifying...';
    const ok=await _activateKey(k,false);
    btn.disabled=false;btn.textContent='Activate Key';
    if(ok){errEl.textContent='';hideKeyGate();showKeyDisplay();blog('License activated successfully.','pt-ok');loadUserChip();}
    else{errEl.textContent='Invalid, expired, or wrong-account key.';document.getElementById('pt-key-input').style.borderColor='#f87171';setTimeout(()=>{document.getElementById('pt-key-input').style.borderColor='';},1500);}
  });
  document.getElementById('pt-key-input').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('pt-key-activate').click();});

  function showKeyDisplay(){
    const k=_session||'';
    if(k==='__admin__'){const el=document.getElementById('pt-key-display');if(el)el.textContent='ADMIN SESSION';return;}
    const display=k.length>24?(k.slice(0,12)+'...'+k.slice(-8)):k;
    const el=document.getElementById('pt-key-display');if(el)el.textContent=display;
  }

  document.getElementById('pt-key-reset').addEventListener('click',function(){
    if(!confirm('Deactivate your current key?'))return;
    _session=null;GM_setValue('_ks','');showKeyGate();blog('Key deactivated.','pt-info');
  });


  let _admDays=30;
  stepper('pt-adm-days-m','pt-adm-days-p','pt-adm-days-v',()=>_admDays,v=>{_admDays=Math.max(1,Math.min(3650,v));},v=>v+'d');

  document.getElementById('pt-adm-gen').addEventListener('click',function(){
    const uid=document.getElementById('pt-adm-uid').value.trim();
    const nick=document.getElementById('pt-adm-nick').value.trim();
    if(!uid||!/^\d+$/.test(uid)){alert('Enter a valid numeric User ID.');return;}
    const key=generateKey(uid,_admDays);
    document.getElementById('pt-adm-key-out').textContent=key;
    document.getElementById('pt-adm-result').style.display='block';
    document.getElementById('pt-adm-copy-ok').style.display='none';
    let hist=[];try{hist=JSON.parse(GM_getValue('_admhist','[]'));}catch(e){hist=[];}
    hist.unshift({uid,nick:nick||'',days:_admDays,key,issued:Date.now(),exp:Date.now()+_admDays*86400000});
    GM_setValue('_admhist',JSON.stringify(hist.slice(0,200)));
    renderKeyHistory();document.getElementById('pt-adm-uid').value='';document.getElementById('pt-adm-nick').value='';
  });

  document.getElementById('pt-adm-key-out').addEventListener('click',function(){
    const key=this.textContent;
    navigator.clipboard.writeText(key).catch(function(){const ta=document.createElement('textarea');ta.value=key;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);});
    document.getElementById('pt-adm-copy-ok').style.display='block';
    setTimeout(()=>{document.getElementById('pt-adm-copy-ok').style.display='none';},2000);
  });

  document.getElementById('pt-adm-hist-refresh').addEventListener('click',renderKeyHistory);
  document.getElementById('pt-adm-hist-clear').addEventListener('click',function(){
    if(!confirm('Clear all key history? This does NOT revoke existing keys.'))return;
    GM_setValue('_admhist','[]');renderKeyHistory();
  });

  function renderKeyHistory(){
    let hist=[];try{hist=JSON.parse(GM_getValue('_admhist','[]'));}catch(e){hist=[];}
    const el=document.getElementById('pt-keyhist');
    const countEl=document.getElementById('pt-adm-hist-count');
    if(countEl)countEl.textContent='('+hist.length+')';
    if(!hist.length){el.innerHTML='<div style="color:var(--text-dim);font-size:11px">No keys generated yet.</div>';return;}
    el.innerHTML='';
    hist.forEach(function(entry){
      const expired=Date.now()>entry.exp;
      const row=document.createElement('div');row.className='pt-kh-row';
      row.innerHTML=[
        '<div class="pt-kh-top">',
        '<div><span class="pt-kh-uid">UID: '+entry.uid+'</span>'+(entry.nick?' <span class="pt-kh-nick">'+entry.nick+'</span>':'')+'</div>',
        '<span class="'+(expired?'pt-kh-badge-ex':'pt-kh-badge-ok')+'">'+(expired?'EXPIRED':'ACTIVE')+'</span>',
        '</div>',
        '<div class="pt-kh-exp">Issued: '+new Date(entry.issued).toLocaleDateString()+' &nbsp;&middot;&nbsp; Expires: '+new Date(entry.exp).toLocaleDateString()+' ('+entry.days+'d)</div>',
        '<div class="pt-kh-key" title="Click to copy">'+entry.key+'</div>',
      ].join('');
      const keyDiv=row.querySelector('.pt-kh-key');
      keyDiv.addEventListener('click',function(){
        navigator.clipboard.writeText(entry.key).catch(function(){const ta=document.createElement('textarea');ta.value=entry.key;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);});
        keyDiv.style.borderColor='#4ade80';setTimeout(()=>{keyDiv.style.borderColor='';},1200);
      });
      el.appendChild(row);
    });
  }


  let _uidReadyResolve=null;
  const _uidReady=new Promise(r=>{_uidReadyResolve=r;});

  async function initKeySystem(){
    const liveUid=await getMyUid();
    if(liveUid)_cachedUid=liveUid;
    _uidReadyResolve(liveUid);

    // Admin check first — bypasses key gate entirely
    if(liveUid&&_fnv(liveUid+_ss())===_ADMIN_H){
      _isAdminSession=true;hideKeyGate();_session='__admin__';
      const tab=document.getElementById('pt-tab-admin');if(tab)tab.style.display='';
      showKeyDisplay();renderKeyHistory();loadUserChip();return;
    }

    const stored=GM_getValue('_ks','');
    if(stored){
      const sig_ok=validateKey(stored);
      const keyUid=_keyUid(stored);
      const resolvedUid=liveUid||keyUid;
      const uid_ok=keyUid&&resolvedUid&&(keyUid===String(resolvedUid));
      if(sig_ok&&uid_ok){
        if(!_cachedUid&&keyUid){_cachedUid=keyUid;GM_setValue('_uid',keyUid);}
        _session=stored;hideKeyGate();showKeyDisplay();loadUserChip();return;
      }
    }

    _session=null;GM_setValue('_ks','');showKeyGate();
  }


  let asInventory=[], asSelectedItem=null, asRunning=false, asInterval=null, asIntervalMin=3, asNextTick=null;

  function asLog(msg,cls){
    const el=document.getElementById('pt-as-log');if(!el)return;
    const d=document.createElement('div');if(cls)d.className=cls;
    d.textContent='['+new Date().toLocaleTimeString('en-US',{hour12:false})+'] '+msg;
    el.appendChild(d);el.scrollTop=el.scrollHeight;
  }

  function asSetStatus(s){
    const el=document.getElementById('pt-as-status-badge');if(!el)return;
    el.className='pt-status-badge '+s;
    el.textContent=s==='running'?'Running':s==='sold'?'Sold!':'Idle';
  }

  function asSetPrices(floor,market,target){
    const fd=document.getElementById('pt-as-floor-disp');
    const md=document.getElementById('pt-as-market-disp');
    const td=document.getElementById('pt-as-target-disp');
    if(fd)fd.textContent=floor?'R$'+Number(floor).toLocaleString():'—';
    if(md)md.textContent=market?'R$'+Number(market).toLocaleString():'—';
    if(td)td.textContent=target?'R$'+Number(target).toLocaleString():'—';
  }

  document.getElementById('pt-as-load-inv').addEventListener('click',async function(){
    if(!_guard()){asLog('No active license.','pt-err');return;}
    const uid=await getMyUid();if(!uid){asLog('Cannot detect user ID.','pt-err');return;}
    const btn=document.getElementById('pt-as-load-inv');btn.disabled=true;btn.textContent='Loading...';
    asInventory=[];let cursor='';
    while(true){
      const res=await siteReq('GET',BASE+'/inventory/v1/users/'+uid+'/assets/collectibles?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
      let data=null;try{data=JSON.parse(res.body);}catch(e){}
      const batch=(data&&data.data)||(Array.isArray(data)?data:[]);if(!batch.length)break;
      asInventory=asInventory.concat(batch);cursor=data&&data.nextPageCursor;if(!cursor)break;await sleep(200);
    }
    btn.disabled=false;btn.textContent='Load My Inventory';
    if(!asInventory.length){asLog('No items found in inventory.','pt-err');return;}
    asLog('Loaded '+asInventory.length+' items.','pt-ok');
    asRenderInventory();
  });

  function asRenderInventory(){
    const list=document.getElementById('pt-as-inv-list');list.innerHTML='';

    const seen=new Set();
    asInventory.forEach(function(item){
      const assetId=String(item.assetId||item.AssetId||'');
      if(!assetId||seen.has(assetId))return;
      seen.add(assetId);
      const name=item.name||item.Name||item.assetName||('#'+assetId);
      const kor=allItems[assetId];
      const val=kor?kor.value||0:0;
      const copies=asInventory.filter(i=>String(i.assetId||i.AssetId)===assetId).length;
      const row=document.createElement('div');
      row.className='pt-autosell-item'+(asSelectedItem&&asSelectedItem.assetId===assetId?' sel':'');
      row.innerHTML='<img src="'+getThumb(assetId)+'" onerror="this.src=\'https://koromons.xyz/logo.png\'"/>'+
        '<div style="flex:1;min-width:0"><div class="pt-autosell-item-name">'+name+'</div>'+
        '<div class="pt-autosell-item-val">'+(val?'Value: '+val.toLocaleString()+' &nbsp;·&nbsp; ':'')+'Copies: '+copies+'</div></div>'+
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--text-dim);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>';
      row.addEventListener('click',function(){
        asSelectedItem={assetId,name,val,copies,userAssetIds:asInventory.filter(i=>String(i.assetId||i.AssetId)===assetId).map(i=>i.userAssetId||i.UserAssetId||i.id).filter(Boolean)};
        document.getElementById('pt-as-sel-label').textContent='('+name+')';
        asRenderInventory();
        const floorEl=document.getElementById('pt-as-floor');
        if(floorEl&&!floorEl.value&&val)floorEl.value=Math.floor(val*0.8);
        asSetPrices(floorEl&&floorEl.value,null,null);
        asLog('Selected: '+name+' ('+copies+' copies)','pt-info');
        asRenderMyListings();
      });
      list.appendChild(row);
    });
  }

  async function asGetLowestPrice(assetId){
    const res=await siteReq('GET',BASE+'/economy/v1/assets/'+assetId+'/resellers?limit=100&cursor=');
    try{
      const d=JSON.parse(res.body);
      const sellers=(d&&d.data)||[];
      if(!sellers.length)return null;
      return sellers[0].price||null;
    }catch(e){return null;}
  }

  async function asGetMyUserAssetId(assetId){
    const uid=await getMyUid();if(!uid)return null;
    const res=await siteReq('GET',BASE+'/economy/v1/assets/'+assetId+'/users/'+uid+'/resellable-copies');
    try{
      const d=JSON.parse(res.body);
      const copies=(d&&d.data)||[];
      if(!copies.length)return null;
      return copies[0].userAssetId||null;
    }catch(e){return null;}
  }

  async function asListItem(userAssetId,price){
    const res=await siteReq('PATCH',BASE+'/economy/v1/assets/'+asSelectedItem.assetId+'/resellable-copies/'+userAssetId,{price:price});
    return res.status===200||res.status===204;
  }

  async function asDelistItem(userAssetId){
    const res=await siteReq('PATCH',BASE+'/economy/v1/assets/'+asSelectedItem.assetId+'/resellable-copies/'+userAssetId,{price:0});
    return res.status===200||res.status===204;
  }

  async function asGetMyListings(assetId){
    const uid=await getMyUid();if(!uid)return[];
    const res=await siteReq('GET',BASE+'/economy/v1/assets/'+assetId+'/users/'+uid+'/resellable-copies');
    try{
      const d=JSON.parse(res.body);
      return (d&&d.data)||[];
    }catch(e){return[];}
  }

  let asCurrentListingPrice=null;
  let asLastListedUasId=null;

  async function asTick(){
    if(!asSelectedItem||!asRunning)return;
    const floor=parseInt(document.getElementById('pt-as-floor').value)||0;
    const undercut=parseInt(document.getElementById('pt-as-undercut').value)||1;
    const topOnly=document.getElementById('pt-as-toponly').checked;
    const notifyOnSell=document.getElementById('pt-as-notify').checked;
    const maxList=Math.min(parseInt(document.getElementById('pt-as-maxlist').value)||1,asSelectedItem.userAssetIds.length);

    if(!floor){asLog('Set a floor price first.','pt-err');return;}

    document.getElementById('pt-as-floor-disp').textContent='R$'+floor.toLocaleString();

    const marketLow=await asGetLowestPrice(asSelectedItem.assetId);
    let targetPrice=null;

    if(marketLow===null){
      asLog('Could not fetch market prices — will retry.','pt-warn');
      return;
    }

    document.getElementById('pt-as-market-disp').textContent='R$'+marketLow.toLocaleString();

    const wouldBe=marketLow-undercut;
    if(wouldBe<=floor){
      targetPrice=floor;
      asLog('Market low ('+marketLow+') minus undercut hits floor — listing at floor R$'+floor,'pt-warn');
    } else {
      targetPrice=wouldBe;
    }

    document.getElementById('pt-as-target-disp').textContent='R$'+targetPrice.toLocaleString();

    if(topOnly&&asCurrentListingPrice===targetPrice){
      asLog('Already cheapest at R$'+targetPrice+' — no change needed.','pt-info');
      return;
    }

    if(asCurrentListingPrice===targetPrice){
      asLog('Price unchanged (R$'+targetPrice+') — no relist needed.','pt-info');
      return;
    }


    if(asLastListedUasId&&asCurrentListingPrice!==null&&asCurrentListingPrice!==0){
      const delisted=await asDelistItem(asLastListedUasId);
      if(delisted)asLog('Delisted previous listing (price set to 0).','pt-info');
      else asLog('Delist failed — will relist anyway.','pt-warn');
    }


    const freshInv=await siteReq('GET',BASE+'/inventory/v1/users/'+(await getMyUid())+'/assets/collectibles?assetId='+asSelectedItem.assetId+'&limit=1');
    let freshCount=0;
    try{const fd=JSON.parse(freshInv.body);freshCount=((fd&&fd.data)||[]).length;}catch(e){}
    if(freshCount===0&&asCurrentListingPrice!==null){
      asLog('Item appears to have sold! 🎉','pt-ok');
      asSetStatus('sold');
      asClearState();
      if(notifyOnSell)GM_notification({title:'Korone Trading Tool',text:asSelectedItem.name+' sold for R$'+(asLastSellPrice||asCurrentListingPrice||'?')+'!',timeout:8000});
      asStop();return;
    }

    const uasId=await asGetMyUserAssetId(asSelectedItem.assetId);
    if(!uasId){asLog('Could not find your resellable copy — is this item in your inventory?','pt-err');return;}
    const listed=await asListItem(uasId,targetPrice);
    if(listed){
      asLog('Listed '+asSelectedItem.name+' at R$'+targetPrice+' (market was R$'+marketLow+')','pt-ok');
      asCurrentListingPrice=targetPrice;
      asLastListedUasId=uasId;
    } else {
      asLog('Listing failed — will retry next tick.','pt-err');
    }
  }

  let asLastSellPrice=null;

  function asStartCountdown(){
    const mins=asIntervalMin;let secs=mins*60;
    const tick=setInterval(function(){
      if(!asRunning){clearInterval(tick);return;}
      secs--;
      const el=document.getElementById('pt-as-next-check');
      if(el)el.textContent=Math.floor(secs/60)+'m '+String(secs%60).padStart(2,'0')+'s';
      if(secs<=0){clearInterval(tick);}
    },1000);
  }

  function asSaveState(){
    if(!asSelectedItem||!asRunning)return;
    GM_setValue('_autosell',JSON.stringify({
      assetId:asSelectedItem.assetId,
      name:asSelectedItem.name,
      val:asSelectedItem.val,
      floor:parseInt(document.getElementById('pt-as-floor').value)||0,
      undercut:parseInt(document.getElementById('pt-as-undercut').value)||1,
      intervalMin:asIntervalMin,
      maxList:parseInt(document.getElementById('pt-as-maxlist').value)||1,
      notify:document.getElementById('pt-as-notify').checked,
      topOnly:document.getElementById('pt-as-toponly').checked
    }));
  }

  function asClearState(){GM_setValue('_autosell','');}

  function asStop(){
    asRunning=false;
    if(asInterval)clearInterval(asInterval);
    asInterval=null;asNextTick=null;
    asClearState();
    document.getElementById('pt-as-start').disabled=false;
    document.getElementById('pt-as-stop').disabled=true;
    const el=document.getElementById('pt-as-next-check');if(el)el.textContent='—';
    if(document.getElementById('pt-as-status-badge').className.indexOf('sold')===-1)asSetStatus('idle');
  }

  async function asResumeFromStorage(){
    const raw=GM_getValue('_autosell','');
    if(!raw)return;
    let state=null;try{state=JSON.parse(raw);}catch(e){return;}
    if(!state||!state.assetId||!state.floor)return;
    asSelectedItem={assetId:String(state.assetId),name:state.name||('Item '+state.assetId),val:state.val||0,userAssetIds:[]};
    asIntervalMin=state.intervalMin||3;
    document.getElementById('pt-as-sel-label').textContent='('+asSelectedItem.name+')';
    document.getElementById('pt-as-floor').value=state.floor;
    document.getElementById('pt-as-undercut').value=state.undercut||1;
    document.getElementById('pt-as-int-v').textContent=asIntervalMin+'m';
    document.getElementById('pt-as-maxlist').value=state.maxList||1;
    document.getElementById('pt-as-notify').checked=state.notify!==false;
    document.getElementById('pt-as-toponly').checked=!!state.topOnly;
    asSetPrices(state.floor,null,null);
    asLog('Resuming autosell for "'+asSelectedItem.name+'" (floor R$'+state.floor+') from last session...','pt-ok');
    asRunning=true;asCurrentListingPrice=null;asLastListedUasId=null;
    document.getElementById('pt-as-start').disabled=true;
    document.getElementById('pt-as-stop').disabled=false;
    asSetStatus('running');
    await asTick();
    asStartCountdown();
    asInterval=setInterval(async function(){
      if(!asRunning)return;
      asSaveState();
      await asTick();
      asStartCountdown();
    },asIntervalMin*60*1000);
  }

  document.getElementById('pt-as-start').addEventListener('click',async function(){
    if(!_guard()){asLog('No active license.','pt-err');return;}
    if(!asSelectedItem){asLog('Select an item first.','pt-err');return;}
    const floor=parseInt(document.getElementById('pt-as-floor').value)||0;
    if(!floor){asLog('Set a floor price first.','pt-err');return;}
    if(asRunning)return;
    asRunning=true;asCurrentListingPrice=null;asLastListedUasId=null;
    document.getElementById('pt-as-start').disabled=true;
    document.getElementById('pt-as-stop').disabled=false;
    asSetStatus('running');
    asLog('Started autosell for "'+asSelectedItem.name+'" — floor R$'+floor,'pt-ok');
    await asTick();
    asStartCountdown();
    asInterval=setInterval(async function(){
      if(!asRunning)return;
      asSaveState();
      await asTick();
      asStartCountdown();
    },asIntervalMin*60*1000);
  });

  document.getElementById('pt-as-stop').addEventListener('click',function(){
    asStop();asLog('Autosell stopped.','pt-warn');
  });


  (function(){
    document.getElementById('pt-as-int-m').addEventListener('click',function(){
      asIntervalMin=Math.max(1,asIntervalMin-1);
      document.getElementById('pt-as-int-v').textContent=asIntervalMin+'m';
    });
    document.getElementById('pt-as-int-p').addEventListener('click',function(){
      asIntervalMin=Math.min(60,asIntervalMin+1);
      document.getElementById('pt-as-int-v').textContent=asIntervalMin+'m';
    });
  })();

  document.getElementById('pt-as-floor').addEventListener('input',function(){
    const v=parseInt(this.value)||0;
    asSetPrices(v||null,document.getElementById('pt-as-market-disp').textContent.replace(/[^\d]/g,'')||null,document.getElementById('pt-as-target-disp').textContent.replace(/[^\d]/g,'')||null);
  });



  async function asRenderMyListings(){
    if(!asSelectedItem)return;
    const listEl=document.getElementById('pt-as-listings');
    const countEl=document.getElementById('pt-as-list-count');
    if(listEl)listEl.innerHTML='<div style="color:var(--text-dim);font-size:11px">Loading...</div>';
    const listings=await asGetMyListings(asSelectedItem.assetId);
    if(countEl)countEl.textContent='('+listings.length+')';
    if(!listEl)return;
    if(!listings.length){listEl.innerHTML='<div style="color:var(--text-dim);font-size:11px">No active listings for this item.</div>';return;}
    listEl.innerHTML='';
    listings.forEach(function(s){
      const price=s.price||s.Price||'?';
      const uasId=s.userAssetId||s.UserAssetId||'';
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;justify-content:space-between;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:9px 12px;';
      row.innerHTML=
        '<div><div style="font-size:12px;font-weight:700;color:var(--text-pri)">R$'+Number(price).toLocaleString()+'</div>'+
        '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">uasId: '+uasId+'</div></div>'+
        '<button class="pt-btn pt-btn-red pt-btn-sm pt-as-delist-btn" data-uasid="'+uasId+'">Delist</button>';
      row.querySelector('.pt-as-delist-btn').addEventListener('click',async function(){
        this.disabled=true;this.textContent='...';
        const ok=await asDelistItem(uasId);
        if(ok){asLog('Delisted listing (R$'+price+')','pt-ok');row.remove();}
        else{this.disabled=false;this.textContent='Delist';asLog('Delist failed','pt-err');}
        asRenderMyListings();
      });
      listEl.appendChild(row);
    });
  }

  document.getElementById('pt-as-refresh-listings').addEventListener('click',asRenderMyListings);

  renderBlacklist();renderThemePicker();renderIconPicker();
  applyTheme(currentTheme);applyFabIcon(currentFabIcon);
  renderTemplates();
  loadAlerts();renderAlerts();
  trySidebarInject();
  loadValues();
  startPriceAlertLoop();
  showKeyGate();
  initKeySystem().then(function(){if(_session)asResumeFromStorage();});

})();
