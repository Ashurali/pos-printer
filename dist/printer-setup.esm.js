// ESM build of printer-setup — auto-generated from UMD source
// Import: import PrinterManager from 'ble-pos-printer/printer-setup';

/**
 * BLEPOS Printer Setup UI v2.0.0 — Detection wizard + device profiles
 * @license MIT
 */
(function(root,factory){
  if(typeof define==="function"&&define.amd)define(["./printer-manager"],factory);
  else if(typeof module==="object"&&module.exports)module.exports=factory(require("./printer-manager"));
  else root.PrinterSetup=factory(root.PrinterManager);
})(typeof self!=="undefined"?self:this,function(PrinterManager){"use strict";

class PrinterSetup{
  constructor(container,printerManager,options={}){
    this.el=typeof container==="string"?document.querySelector(container):container;
    if(!this.el)throw new Error("PrinterSetup: container not found");
    this.pm=printerManager||new PrinterManager();
    this.options={showTestPrint:true,showCashDrawer:true,showAdvanced:true,
      showDetectWizard:true,showDeviceProfiles:true,theme:"dark",locale:"id",
      onSave:null,onConnect:null,onDisconnect:null,onDetected:null,...options};
    this._logs=[];
    this._wizardResults={};
    this._render();this._bindEvents();this._bindPrinterEvents();this._loadConfigToForm();
  }

  _render(){
    const dk=this.options.theme==="dark"?"gpos-dark":"";
    this.el.innerHTML=`
    <div class="gpos-setup ${dk}" id="gpos-setup">
      <style>${this._css()}</style>
      <div class="gpos-status" id="gpos-status">
        <span class="gpos-dot gpos-dot--off" id="gpos-dot"></span>
        <span id="gpos-status-text">Tidak terhubung</span>
        <span class="gpos-status-mode" id="gpos-status-mode"></span>
      </div>

      <div class="gpos-card">
        <h3 class="gpos-card__title">🔌 Koneksi Printer</h3>
        <div class="gpos-row">
          <button class="gpos-btn gpos-btn--primary" id="gpos-btn-connect">🔗 Hubungkan Printer</button>
          <button class="gpos-btn gpos-btn--danger" id="gpos-btn-disconnect" disabled>✂️ Putuskan</button>
        </div>
        <div class="gpos-device-info" id="gpos-device-info" style="display:none">
          <span>Terhubung ke: <strong id="gpos-device-name"></strong></span>
          <span id="gpos-device-mode" class="gpos-badge"></span>
        </div>
      </div>

      ${this.options.showDeviceProfiles?`
      <div class="gpos-card" id="gpos-profiles-card">
        <h3 class="gpos-card__title">📱 Perangkat Tersimpan</h3>
        <div id="gpos-profiles-list"></div>
        <div id="gpos-profiles-empty" class="gpos-empty">Belum ada perangkat tersimpan.</div>
      </div>`:""}

      ${this.options.showDetectWizard?`
      <div class="gpos-card">
        <h3 class="gpos-card__title">🧪 Deteksi Printer</h3>
        <p class="gpos-desc">Kirim tes ke printer, tandai yang hasilnya tercetak benar.</p>
        <button class="gpos-btn gpos-btn--info gpos-btn--full" id="gpos-btn-wizard" disabled>▶️ Mulai Deteksi</button>
        <div id="gpos-wizard-panel" style="display:none">
          <div id="gpos-wizard-tests"></div>
          <div id="gpos-wizard-actions" style="display:none">
            <p class="gpos-desc">Centang tes yang tercetak <strong>dengan benar</strong>, lalu simpan.</p>
            <button class="gpos-btn gpos-btn--success gpos-btn--full" id="gpos-btn-wizard-save">💾 Simpan Hasil Deteksi</button>
          </div>
        </div>
      </div>`:""}

      <div class="gpos-card">
        <h3 class="gpos-card__title">🏪 Pengaturan Toko</h3>
        <div class="gpos-field"><label>Nama Toko</label><input type="text" id="gpos-store-name" placeholder="TOKO EMAS"/></div>
        <div class="gpos-field"><label>Alamat</label><input type="text" id="gpos-store-address" placeholder="Jl. Pasar Baru No. 1"/></div>
        <div class="gpos-row">
          <div class="gpos-field" style="flex:1"><label>Telepon</label><input type="text" id="gpos-store-phone" placeholder="021-1234567"/></div>
          <div class="gpos-field" style="flex:1"><label>NPWP</label><input type="text" id="gpos-store-npwp" placeholder="00.000.000.0-000.000"/></div>
        </div>
        <div class="gpos-field"><label>Teks Footer</label><input type="text" id="gpos-footer" placeholder="Terima Kasih atas Kunjungan Anda"/></div>
      </div>

      <div class="gpos-card">
        <h3 class="gpos-card__title">🖨️ Pengaturan Printer</h3>
        <div class="gpos-row">
          <div class="gpos-field" style="flex:1"><label>Mode Perintah</label>
            <select id="gpos-cmd-mode">
              <option value="auto">Auto (deteksi)</option>
              <option value="escpos">ESC/POS (receipt)</option>
              <option value="tspl">TSPL (label)</option>
            </select></div>
          <div class="gpos-field" style="flex:1"><label>Lebar Kertas</label>
            <select id="gpos-paper-width">
              <option value="58">58mm (32 chr)</option>
              <option value="72">72mm (42 chr)</option>
              <option value="76">76mm (44 chr)</option>
              <option value="80">80mm (48 chr)</option>
              <option value="100">100mm (56 chr)</option>
              <option value="104">104mm (60 chr)</option>
            </select></div>
        </div>
        <div class="gpos-row">
          <div class="gpos-field" style="flex:1"><label>Salinan</label><input type="number" id="gpos-copies" min="1" max="5" value="1"/></div>
          <div class="gpos-field" style="flex:1"><label>Cash Drawer Pin</label>
            <select id="gpos-drawer-pin"><option value="2">Pin 2</option><option value="5">Pin 5</option></select></div>
        </div>
        <div class="gpos-row">
          <label class="gpos-checkbox"><input type="checkbox" id="gpos-auto-cut" checked/> Auto-cut</label>
          <label class="gpos-checkbox"><input type="checkbox" id="gpos-auto-drawer"/> Buka laci saat print</label>
        </div>
        <div id="gpos-tspl-settings" style="display:none;margin-top:12px">
          <div class="gpos-row">
            <div class="gpos-field" style="flex:1"><label>Label W (mm)</label><input type="number" id="gpos-label-w" value="100"/></div>
            <div class="gpos-field" style="flex:1"><label>Label H (mm)</label><input type="number" id="gpos-label-h" value="150"/></div>
            <div class="gpos-field" style="flex:1"><label>Density</label><input type="number" id="gpos-density" min="1" max="15" value="8"/></div>
          </div>
        </div>
      </div>

      ${this.options.showAdvanced?`
      <details class="gpos-card">
        <summary class="gpos-card__title" style="cursor:pointer">⚙️ Lanjutan</summary>
        <div class="gpos-row" style="margin-top:12px">
          <label class="gpos-checkbox"><input type="checkbox" id="gpos-auto-reconn" checked/> Auto-reconnect</label>
          <label class="gpos-checkbox"><input type="checkbox" id="gpos-debug"/> Debug log</label>
        </div>
        <div class="gpos-row">
          <div class="gpos-field" style="flex:1"><label>Chunk (B)</label><input type="number" id="gpos-chunk-size" min="20" max="512" value="80"/></div>
          <div class="gpos-field" style="flex:1"><label>Delay (ms)</label><input type="number" id="gpos-chunk-delay" min="10" max="500" value="40"/></div>
        </div>
        <div class="gpos-field"><label>API Endpoint (opsional)</label><input type="text" id="gpos-api-endpoint" placeholder="/api/printer_profiles"/></div>
      </details>`:""}

      <div class="gpos-card">
        <h3 class="gpos-card__title">Aksi</h3>
        <div class="gpos-row gpos-row--wrap">
          <button class="gpos-btn gpos-btn--success" id="gpos-btn-save">💾 Simpan</button>
          ${this.options.showTestPrint?'<button class="gpos-btn gpos-btn--info" id="gpos-btn-test" disabled>🖨️ Test Print</button>':""}
          <button class="gpos-btn gpos-btn--info" id="gpos-btn-sample" disabled>📄 Sample Receipt</button>
          ${this.options.showCashDrawer?'<button class="gpos-btn gpos-btn--warning" id="gpos-btn-drawer" disabled>🗄️ Laci</button>':""}
          <button class="gpos-btn gpos-btn--info" id="gpos-btn-diag" disabled>🔍 Diag</button>
          <button class="gpos-btn" id="gpos-btn-reset">🔄 Reset</button>
        </div>
      </div>

      <div class="gpos-card">
        <h3 class="gpos-card__title">Log</h3>
        <div class="gpos-log" id="gpos-log"><div class="gpos-empty">Belum ada aktivitas</div></div>
      </div>
    </div>`;
  }

  _bindEvents(){
    const $=id=>this.el.querySelector(`#${id}`);
    $("gpos-btn-connect").addEventListener("click",()=>this._handleConnect());
    $("gpos-btn-disconnect").addEventListener("click",()=>this._handleDisconnect());
    $("gpos-btn-save").addEventListener("click",()=>this._handleSave());
    $("gpos-btn-reset").addEventListener("click",()=>this._handleReset());
    $("gpos-btn-diag").addEventListener("click",()=>this._handleDiag());
    $("gpos-btn-sample").addEventListener("click",()=>this._handleSample());
    if(this.options.showTestPrint)$("gpos-btn-test").addEventListener("click",()=>this._handleTest());
    if(this.options.showCashDrawer)$("gpos-btn-drawer").addEventListener("click",()=>this._handleDrawer());
    if(this.options.showDetectWizard){
      $("gpos-btn-wizard").addEventListener("click",()=>this._wizardStart());
      $("gpos-btn-wizard-save").addEventListener("click",()=>this._wizardSave());
    }
    $("gpos-cmd-mode").addEventListener("change",()=>this._toggleTspl());
    this._toggleTspl();
    if(this.options.showDeviceProfiles)this._renderProfiles();
  }

  _toggleTspl(){
    const m=this.el.querySelector("#gpos-cmd-mode").value;
    const p=this.el.querySelector("#gpos-tspl-settings");
    if(p)p.style.display=m==="tspl"?"block":"none";
  }

  _bindPrinterEvents(){
    this.pm.on("connected",d=>{
      this._setStatus(true,d.device);
      this._log("success",`Terhubung: ${d.device}`);
      this._log("info",`Mode: ${d.commandMode} | Profile: ${d.hasProfile?"loaded":"new"}`);
      if(d.hasProfile){this._loadConfigToForm();this._log("info","Profil perangkat dimuat");}
      if(this.options.onConnect)this.options.onConnect(d);
    });
    this.pm.on("disconnected",d=>{this._setStatus(false);this._log("warning",d.manual?"Diputuskan":"Koneksi terputus");if(this.options.onDisconnect)this.options.onDisconnect(d);});
    this.pm.on("reconnecting",d=>this._log("info",`Reconnect (${d.attempt}/${d.max})...`));
    this.pm.on("reconnected",d=>{this._setStatus(true,d.device);this._log("success",`Reconnected: ${d.device}`);});
    this.pm.on("error",d=>this._log("error",`${d.type}: ${d.error.message}`));
    this.pm.on("printEnd",d=>this._log("success",`Print ${d.type} OK`));
    this.pm.on("printError",d=>this._log("error",`Print ${d.type} gagal: ${d.error.message}`));
    this.pm.on("drawerOpened",()=>this._log("success","Laci dibuka"));
    this.pm.on("profileSaved",d=>{this._log("success",`Profil saved [${d.mode}]`);if(this.options.showDeviceProfiles)this._renderProfiles();});
  }

  async _handleConnect(){
    const b=this.el.querySelector("#gpos-btn-connect");
    b.disabled=true;b.textContent="⏳ Connecting...";
    try{await this.pm.connect();}catch(e){this._log("error",e.message);}
    finally{b.disabled=false;b.textContent="🔗 Hubungkan Printer";}
  }
  async _handleDisconnect(){await this.pm.disconnect();}
  async _handleTest(){
    const b=this.el.querySelector("#gpos-btn-test");
    b.disabled=true;b.textContent="⏳...";
    try{this._collect();await this.pm.printTest();}catch(e){this._log("error",e.message);}
    finally{b.disabled=!this.pm.isConnected;b.textContent="🖨️ Test Print";}
  }
  async _handleSample(){
    const b=this.el.querySelector("#gpos-btn-sample");
    b.disabled=true;b.textContent="⏳...";
    try{
      this._collect();
      await this.pm.printReceipt({
        invoiceNumber:PrinterManager.generateInvoiceNumber(),
        date:new Date(),cashier:"Admin",customer:"Pelanggan",
        items:[
          {name:"Cincin Emas 24K",qty:1,weight:5.00,karat:"24K",pricePerGram:1100000,discount:0},
          {name:"Gelang Emas 22K",qty:1,weight:12.50,karat:"22K",pricePerGram:950000,discount:50000},
        ],
        tax:0,discount:0,paymentMethod:"cash",amountPaid:18000000,
      });
    }catch(e){this._log("error",e.message);}
    finally{b.disabled=!this.pm.isConnected;b.textContent="📄 Sample Receipt";}
  }
  async _handleDrawer(){try{await this.pm.openCashDrawer();}catch(e){this._log("error",e.message);}}
  _handleSave(){this._collect();this.pm.saveConfig();this._log("success","Tersimpan");if(this.options.onSave)this.options.onSave(this.pm.config);}
  _handleReset(){if(!confirm("Reset ke default?"))return;this.pm.resetConfig();this._loadConfigToForm();this._log("info","Reset OK");}
  _handleDiag(){
    const d=this.pm.getDiagnostics();
    this._log("info","=== DIAGNOSTICS ===");
    for(const[k,v]of Object.entries(d))this._log("info",`${k}: ${JSON.stringify(v)}`);
    console.log("[BLEPOS]",d);
  }

  /* ─── Detection Wizard ──────────────────────────────────────────── */
  async _wizardStart(){
    if(!this.pm.isConnected){this._log("error","Connect printer first!");return;}
    const panel=this.el.querySelector("#gpos-wizard-panel");
    const testsEl=this.el.querySelector("#gpos-wizard-tests");
    const actionsEl=this.el.querySelector("#gpos-wizard-actions");
    const btn=this.el.querySelector("#gpos-btn-wizard");
    panel.style.display="block";actionsEl.style.display="none";
    btn.disabled=true;btn.textContent="⏳ Running...";
    this._wizardResults={};

    const tests=PrinterManager.getDetectionTests();
    testsEl.innerHTML=tests.map(t=>`
      <div class="gpos-wiz-test">
        <div class="gpos-wiz-test__hdr">
          <span id="gpos-ws-${t.id}">⏳</span> <strong>${t.label}</strong>
        </div>
        <p class="gpos-wiz-desc">${t.desc}</p>
        <div id="gpos-wr-${t.id}" style="display:none" class="gpos-wiz-result">
          <label class="gpos-checkbox"><input type="checkbox" id="gpos-wc-${t.id}"/> Tercetak benar</label>
        </div>
      </div>`).join("");

    for(const t of tests){
      const s=this.el.querySelector(`#gpos-ws-${t.id}`);
      const r=this.el.querySelector(`#gpos-wr-${t.id}`);
      s.textContent="🔄";
      try{
        const res=await this.pm.runDetectionTest(t.id);
        this._wizardResults[t.id]={sent:true,uid:res.uid};
        s.textContent="✅";r.style.display="block";
        this._log("success",`Sent: ${t.label} [${res.uid}]`);
      }catch(e){
        this._wizardResults[t.id]={sent:false};
        s.textContent="❌";
        this._log("error",`${t.label}: ${e.message}`);
      }
      await new Promise(r=>setTimeout(r,2000));
    }
    actionsEl.style.display="block";
    btn.disabled=false;btn.textContent="🔄 Ulang Deteksi";
  }

  _wizardSave(){
    const tests=PrinterManager.getDetectionTests();
    const passed=[];
    for(const t of tests){
      const c=this.el.querySelector(`#gpos-wc-${t.id}`);
      if(c&&c.checked)passed.push(t.id);
    }
    if(!passed.length){this._log("warning","Centang minimal satu tes!");return;}

    const priority=["escpos_full","escpos_size","escpos_fmt","escpos_basic","tspl","raw"];
    let best="raw";
    for(const p of priority){if(passed.includes(p)){best=p;break;}}

    const ov={};
    if(best==="tspl"){ov.autoCut=false;ov.paperWidth=100;}

    const result=this.pm.saveDetectionResult(best,ov);
    this._loadConfigToForm();
    this._log("success",`Deteksi: ${result.mode.toUpperCase()} via ${best}`);
    if(this.options.onDetected)this.options.onDetected(result);
    if(this.options.showDeviceProfiles)this._renderProfiles();
    this.el.querySelector("#gpos-wizard-panel").style.display="none";
  }

  /* ─── Device Profiles ───────────────────────────────────────────── */
  _renderProfiles(){
    const list=this.el.querySelector("#gpos-profiles-list");
    const empty=this.el.querySelector("#gpos-profiles-empty");
    if(!list)return;
    const profs=this.pm.getDeviceProfiles();
    const keys=Object.keys(profs);
    if(!keys.length){list.innerHTML="";empty.style.display="block";return;}
    empty.style.display="none";
    list.innerHTML=keys.map(id=>{
      const p=profs[id],cur=this.pm.deviceId===id;
      const dt=p.updatedAt?new Date(p.updatedAt).toLocaleDateString("id-ID"):"?";
      return`<div class="gpos-profile${cur?" gpos-profile--active":""}">
        <div class="gpos-profile__info">
          <strong>${p.deviceName||"?"}</strong>
          <span class="gpos-badge gpos-badge--${p.commandMode==="tspl"?"tspl":"escpos"}">${(p.commandMode||"?").toUpperCase()}</span>
          <span class="gpos-profile__meta">${p.paperWidth||"?"}mm | ${dt}</span>
        </div>
        <button class="gpos-btn gpos-btn--sm" data-del="${id}">🗑️</button>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-del]").forEach(b=>{
      b.addEventListener("click",()=>{
        if(confirm("Hapus profil?")){this.pm.deleteDeviceProfile(b.dataset.del);this._renderProfiles();}
      });
    });
  }

  /* ─── Config ↔ Form ────────────────────────────────────────────── */
  _collect(){
    const $=id=>this.el.querySelector(`#${id}`);
    const cfg={
      storeName:$("gpos-store-name").value||"TOKO EMAS",
      storeAddress:$("gpos-store-address").value,
      storePhone:$("gpos-store-phone").value,
      storeNPWP:$("gpos-store-npwp").value,
      footerText:$("gpos-footer").value,
      commandMode:$("gpos-cmd-mode").value,
      paperWidth:parseInt($("gpos-paper-width").value),
      copies:parseInt($("gpos-copies").value)||1,
      autoCut:$("gpos-auto-cut").checked,
      openDrawerOnPrint:$("gpos-auto-drawer").checked,
      cashDrawerPin:parseInt($("gpos-drawer-pin").value),
    };
    const lw=$("gpos-label-w");if(lw)cfg.labelWidth=parseInt(lw.value)||100;
    const lh=$("gpos-label-h");if(lh)cfg.labelHeight=parseInt(lh.value)||150;
    const dn=$("gpos-density");if(dn)cfg.labelDensity=parseInt(dn.value)||8;
    if(this.options.showAdvanced){
      cfg.autoReconnect=$("gpos-auto-reconn").checked;
      cfg.chunkSize=parseInt($("gpos-chunk-size").value)||80;
      cfg.chunkDelay=parseInt($("gpos-chunk-delay").value)||40;
      cfg.debug=$("gpos-debug").checked;
      const api=$("gpos-api-endpoint");if(api&&api.value)cfg.apiEndpoint=api.value;
    }
    this.pm.updateConfig(cfg,false);
  }

  _loadConfigToForm(){
    const $=id=>this.el.querySelector(`#${id}`);
    const c=this.pm.config;
    const s=(id,v)=>{const e=$(id);if(e)e.value=String(v||"");};
    const ch=(id,v)=>{const e=$(id);if(e)e.checked=!!v;};
    s("gpos-store-name",c.storeName);s("gpos-store-address",c.storeAddress);
    s("gpos-store-phone",c.storePhone);s("gpos-store-npwp",c.storeNPWP);
    s("gpos-footer",c.footerText);s("gpos-cmd-mode",c.commandMode||"auto");
    s("gpos-paper-width",c.paperWidth);s("gpos-copies",c.copies);
    ch("gpos-auto-cut",c.autoCut);ch("gpos-auto-drawer",c.openDrawerOnPrint);
    s("gpos-drawer-pin",c.cashDrawerPin);
    s("gpos-label-w",c.labelWidth||100);s("gpos-label-h",c.labelHeight||150);s("gpos-density",c.labelDensity||8);
    if(this.options.showAdvanced){
      ch("gpos-auto-reconn",c.autoReconnect);s("gpos-chunk-size",c.chunkSize);
      s("gpos-chunk-delay",c.chunkDelay);ch("gpos-debug",c.debug);
      s("gpos-api-endpoint",c.apiEndpoint||"");
    }
    this._toggleTspl();
  }

  _setStatus(on,name){
    const dot=this.el.querySelector("#gpos-dot");
    const txt=this.el.querySelector("#gpos-status-text");
    const modeEl=this.el.querySelector("#gpos-status-mode");
    const info=this.el.querySelector("#gpos-device-info");
    const nameEl=this.el.querySelector("#gpos-device-name");
    const badge=this.el.querySelector("#gpos-device-mode");
    const btnD=this.el.querySelector("#gpos-btn-disconnect");
    const ids=["gpos-btn-test","gpos-btn-sample","gpos-btn-drawer","gpos-btn-diag","gpos-btn-wizard"];
    if(on){
      dot.className="gpos-dot gpos-dot--on";txt.textContent="Terhubung";
      const m=this.pm.effectiveMode.toUpperCase();
      modeEl.textContent=`[${m}]`;info.style.display="flex";
      nameEl.textContent=name||"?";badge.textContent=m;
      badge.className=`gpos-badge gpos-badge--${this.pm.effectiveMode==="tspl"?"tspl":"escpos"}`;
      btnD.disabled=false;
      ids.forEach(id=>{const b=this.el.querySelector(`#${id}`);if(b)b.disabled=false;});
    }else{
      dot.className="gpos-dot gpos-dot--off";txt.textContent="Tidak terhubung";
      modeEl.textContent="";info.style.display="none";btnD.disabled=true;
      ids.forEach(id=>{const b=this.el.querySelector(`#${id}`);if(b)b.disabled=true;});
    }
  }

  _log(type,msg){
    const ts=new Date().toLocaleTimeString("id-ID",{hour12:false});
    this._logs.unshift({type,msg,ts});if(this._logs.length>80)this._logs.pop();
    const el=this.el.querySelector("#gpos-log");
    const ic={success:"✅",error:"❌",warning:"⚠️",info:"ℹ️"};
    el.innerHTML=this._logs.map(l=>
      `<div class="gpos-log__entry gpos-log--${l.type}"><span class="gpos-log__time">${l.ts}</span><span>${ic[l.type]||""} ${l.msg}</span></div>`
    ).join("");
  }

  _css(){return`
.gpos-setup{font-family:'Segoe UI',system-ui,sans-serif;max-width:640px;margin:0 auto;padding:16px;color:#1a1a2e}
.gpos-dark{background:#0f172a;color:#e2e8f0}
.gpos-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.gpos-dark .gpos-card{background:#1e293b;border-color:#334155}
.gpos-card__title{margin:0 0 16px;font-size:15px;font-weight:600;color:#4a4a6a}
.gpos-dark .gpos-card__title{color:#c9a84c}
.gpos-desc{font-size:13px;color:#64748b;margin-bottom:12px;line-height:1.5}
.gpos-dark .gpos-desc{color:#94a3b8}
.gpos-status{display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:10px;background:#f8fafc;margin-bottom:16px;font-weight:500}
.gpos-dark .gpos-status{background:#1e293b}
.gpos-status-mode{margin-left:auto;font-size:12px;font-weight:700;color:#6366f1}
.gpos-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.gpos-dot--on{background:#22c55e;box-shadow:0 0 6px #22c55e}
.gpos-dot--off{background:#94a3b8}
.gpos-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.gpos-row--wrap{flex-wrap:wrap}
.gpos-field{margin-bottom:12px}
.gpos-field label{display:block;font-size:13px;font-weight:500;margin-bottom:4px;color:#64748b}
.gpos-dark .gpos-field label{color:#8899bb}
.gpos-field input,.gpos-field select{width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#fff;color:#1a1a2e;box-sizing:border-box}
.gpos-dark .gpos-field input,.gpos-dark .gpos-field select{background:#0f172a;border-color:#334155;color:#e2e8f0}
.gpos-checkbox{display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;user-select:none}
.gpos-btn{padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;background:#e2e8f0;color:#475569}
.gpos-dark .gpos-btn{background:#334155;color:#e2e8f0}
.gpos-btn:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px)}
.gpos-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.gpos-btn--primary{background:#3b82f6;color:#fff}
.gpos-btn--danger{background:#ef4444;color:#fff}
.gpos-btn--success{background:#22c55e;color:#fff}
.gpos-btn--info{background:#6366f1;color:#fff}
.gpos-btn--warning{background:#f59e0b;color:#fff}
.gpos-btn--full{width:100%}
.gpos-btn--sm{padding:4px 8px;font-size:12px}
.gpos-device-info{margin-top:12px;padding:10px 14px;background:#f0fdf4;border-radius:8px;font-size:13px;color:#166534;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gpos-dark .gpos-device-info{background:#0d3320;color:#86efac}
.gpos-badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px}
.gpos-badge--escpos{background:#dbeafe;color:#1d4ed8}
.gpos-badge--tspl{background:#fef3c7;color:#92400e}
.gpos-dark .gpos-badge--escpos{background:#1e3a5f;color:#93c5fd}
.gpos-dark .gpos-badge--tspl{background:#451a03;color:#fcd34d}
.gpos-empty{text-align:center;color:#94a3b8;padding:16px;font-size:13px}
.gpos-profile{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px}
.gpos-dark .gpos-profile{border-color:#334155}
.gpos-profile--active{border-color:#22c55e;background:rgba(34,197,94,.05)}
.gpos-dark .gpos-profile--active{background:rgba(34,197,94,.1)}
.gpos-profile__info{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gpos-profile__meta{font-size:11px;color:#94a3b8}
.gpos-wiz-test{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-top:12px}
.gpos-dark .gpos-wiz-test{border-color:#334155}
.gpos-wiz-test__hdr{display:flex;align-items:center;gap:8px;font-size:14px}
.gpos-wiz-desc{font-size:12px;color:#94a3b8;margin:4px 0 0 28px}
.gpos-wiz-result{margin-top:8px;padding:8px 12px;background:#f8fafc;border-radius:6px}
.gpos-dark .gpos-wiz-result{background:#0f172a}
.gpos-log{max-height:200px;overflow-y:auto;font-size:12px;font-family:'Fira Code',monospace}
.gpos-log__entry{padding:4px 8px;border-bottom:1px solid #f1f5f9;display:flex;gap:8px;align-items:flex-start}
.gpos-dark .gpos-log__entry{border-color:#1e293b}
.gpos-log__time{color:#94a3b8;flex-shrink:0;font-size:11px;margin-top:1px}
.gpos-log--error{color:#ef4444}.gpos-log--success{color:#22c55e}.gpos-log--warning{color:#f59e0b}.gpos-log--info{color:#6366f1}
.gpos-dark .gpos-log--error{color:#fca5a5}.gpos-dark .gpos-log--success{color:#86efac}
`;}

  getPrinterManager(){return this.pm;}
  destroy(){this.el.innerHTML="";}
}
return PrinterSetup;
});


// ESM default export — works because UMD assigns to root (globalThis)
const _export = (typeof self !== 'undefined' ? self : globalThis).PrinterSetup;
export default _export;
