/* UBTS-Link front end: plain JavaScript, no build step. All data comes from the /api routes. */
(() => {
  "use strict";

  const ACTIONS = {
    RECEIVE:  { label: "Intake", hint: "Scan the unit at the hospital or hub on arrival. A unit not yet known is registered from its full label (DIN + product code + expiry)." },
    DISPATCH: { label: "Dispatch", hint: "Hub only. Scan the DIN and pick the hospital it is going to. The unit is in transit until that hospital scans it in." },
    DISPENSE: { label: "Dispense", hint: "Scan the DIN when the unit is issued to a patient. Stock falls, and a requisition is raised automatically if the hospital drops below minimum." },
    EXPIRE:   { label: "Expired", hint: "Scan a unit that has passed its expiry date. It is removed from usable stock and kept in the audit trail." },
    DISCARD:  { label: "Discard", hint: "Scan a unit that is unusable for any other reason, such as a damaged bag. Expiry does not apply." },
  };

  const state = { sites: [], site: null, action: "RECEIVE", hospitals: [] };
  const $ = (sel) => document.querySelector(sel);

  // ---------- helpers ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Audit timestamps carry a UTC offset; expiry times are local blood-bank times without one.
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  const pill = (s) => `<span class="status ${esc(s)}">${esc(String(s).replace(/_/g, " ").toLowerCase())}</span>`;

  let toastTimer = null;
  function toast(msg, isErr = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (isErr ? " err" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }

  async function api(path, opts = {}) {
    const init = { headers: { "Content-Type": "application/json" }, ...opts };
    if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) {
      let msg = data && data.detail;
      if (Array.isArray(msg)) msg = msg.map((d) => d.msg).join("; ");
      const err = new Error(msg || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const siteByCode = (code) => state.sites.find((s) => s.code === code);

  // ---------- site & tabs ----------
  async function loadSites() {
    state.sites = await api("/api/sites");
    const sel = $("#site");
    const hubs = state.sites.filter((s) => s.kind === "HUB");
    const hosps = state.sites.filter((s) => s.kind === "HOSPITAL");
    sel.innerHTML =
      `<optgroup label="Regional hubs">${hubs.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} — ${esc(s.name)}</option>`).join("")}</optgroup>` +
      `<optgroup label="Hospitals">${hosps.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} — ${esc(s.name)} (${esc(s.hub_code)})</option>`).join("")}</optgroup>`;
    const saved = localStorage.getItem("ubts.site");
    state.site = siteByCode(saved) ? saved : (hubs[0] && hubs[0].code);
    sel.value = state.site;
    onSiteChanged();
  }

  function onSiteChanged() {
    state.site = $("#site").value;
    localStorage.setItem("ubts.site", state.site);
    const site = siteByCode(state.site);
    $("#site-kind").textContent = site.kind === "HUB" ? "Regional hub" : `Hospital · ${site.hub_code}`;
    state.hospitals = state.sites.filter((s) => s.kind === "HOSPITAL" && s.hub_code === state.site);
    const dest = $("#dest");
    dest.innerHTML = state.hospitals.map((h) => `<option value="${esc(h.code)}">${esc(h.code)} — ${esc(h.name)}</option>`).join("")
      || `<option value="">No hospitals supplied by this hub</option>`;
    $("#rules-card").hidden = site.kind !== "HOSPITAL";
    $("#new-req-card").hidden = site.kind !== "HOSPITAL";
    $("#req-title").textContent = site.kind === "HUB" ? "Requisitions from hospitals" : "My requisitions";
    refreshAll();
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
    refreshTab(name);
  }

  function refreshTab(name) {
    if (name === "scan") loadStockMini();
    if (name === "inventory") { loadStockTable(); loadRules(); }
    if (name === "units") loadUnits();
    if (name === "requisitions") loadRequisitions();
    if (name === "alerts") loadAlerts();
  }

  function refreshAll() {
    refreshTab(document.querySelector(".tab.active").dataset.tab);
    loadAlertCount();
  }

  // ---------- scanning ----------
  function setAction(action) {
    state.action = action;
    document.querySelectorAll(".act").forEach((b) => b.classList.toggle("active", b.dataset.action === action));
    $("#action-hint").textContent = ACTIONS[action].hint;
    $("#dest-wrap").hidden = action !== "DISPATCH";
    $("#barcode").placeholder = action === "RECEIVE"
      ? "Intake: DIN + product code + expiry labels, e.g. =W12340412345600=<E0150V00&>0123661300"
      : "DIN label, e.g. =W12340412345600";
    $("#barcode").focus();
  }

  function addFeed(ok, title, meta, detail) {
    const li = document.createElement("li");
    li.className = ok ? "ok" : "err";
    li.innerHTML = `<div class="msg">${esc(title)}</div><div class="meta">${esc(meta)}</div>${detail ? `<div class="detail">${detail}</div>` : ""}`;
    const feed = $("#feed");
    feed.prepend(li);
    while (feed.children.length > 25) feed.lastChild.remove();
  }

  async function submitScan(ev) {
    ev.preventDefault();
    const barcode = $("#barcode").value.trim();
    if (!barcode) return;
    const body = { site_code: state.site, barcode, action: state.action };
    const ref = $("#reference").value.trim();
    if (ref) body.reference = ref;
    if (state.action === "DISPATCH") {
      if (!$("#dest").value) return toast("Choose a hospital to dispatch to", true);
      body.destination_code = $("#dest").value;
    }
    $("#scan-status").textContent = "Saving…";
    try {
      const r = await api("/api/scan", { method: "POST", body });
      const u = r.unit;
      const extra = [];
      if (r.requisitions_created.length) extra.push(`<strong>Requisition raised:</strong> ${r.requisitions_created.map((q) => `#${q.id} ${q.quantity} × ${esc(q.product_family)} to ${esc(q.hub_code)}`).join(", ")}`);
      if (r.requisitions_fulfilled.length) extra.push(`<strong>Requisition fulfilled:</strong> #${r.requisitions_fulfilled.map((q) => q.id).join(", #")}`);
      addFeed(true, r.message, `${u.din} · ${u.product_code} · expires ${fmtDate(u.expiry_at)} · ${u.status.replace(/_/g, " ").toLowerCase()}`, extra.join("<br>"));
      $("#scan-status").textContent = `Last: ${u.din}`;
      $("#barcode").value = "";
      refreshAll();
    } catch (err) {
      addFeed(false, "Not accepted", err.message, "");
      $("#scan-status").textContent = "";
      toast(err.message, true);
    }
    $("#barcode").focus();
  }

  async function checkLabel() {
    const barcode = $("#barcode").value.trim();
    if (!barcode) return;
    try {
      const p = await api("/api/parse", { method: "POST", body: { barcode } });
      addFeed(true, "Label decoded (no stock change)", barcode,
        `DIN <code>${esc(p.din)}</code> · product <code>${esc(p.product_code || "—")}</code> · expiry ${esc(p.expiry_at ? fmtDate(p.expiry_at) : "—")}`);
    } catch (err) {
      addFeed(false, "Label not recognised", err.message, "");
    }
  }

  async function loadStockMini() {
    try {
      const data = await api(`/api/sites/${encodeURIComponent(state.site)}/stock`);
      $("#stock-note").textContent = `Expiry warning window: ${data.warning_days} day(s).`;
      if (!data.families.length) { $("#stock-mini").innerHTML = `<div class="empty">Nothing held here yet.</div>`; return; }
      $("#stock-mini").innerHTML = `<div class="mini">${data.families.map((f) => `
        <div class="fam">
          <div class="top"><span>${esc(f.product_family)}</span>${f.min_level !== null ? pill(f.status) : ""}</div>
          <div class="big">${f.on_hand}<span class="small"> usable</span></div>
          <div class="small">${f.expiring_soon} expiring soon · ${f.expired_on_shelf} past expiry · ${f.incoming} in transit${f.min_level !== null ? ` · min ${f.min_level} / par ${f.par_level}` : ""}</div>
        </div>`).join("")}</div>`;
    } catch (err) { toast(err.message, true); }
  }

  // ---------- inventory & rules ----------
  async function loadStockTable() {
    const data = await api(`/api/sites/${encodeURIComponent(state.site)}/stock`);
    if (!data.families.length) { $("#stock-table").innerHTML = `<div class="empty">No stock recorded at this site.</div>`; return; }
    $("#stock-table").innerHTML = `<table>
      <thead><tr><th>Product family</th><th class="num">Usable</th><th class="num">Expiring soon</th><th class="num">Past expiry (awaiting disposal)</th><th class="num">In transit in</th><th class="num">Still requested</th><th class="num">Min</th><th class="num">Par</th><th>Status</th></tr></thead>
      <tbody>${data.families.map((f) => `<tr>
        <td><strong>${esc(f.product_family)}</strong></td>
        <td class="num">${f.on_hand}</td><td class="num">${f.expiring_soon}</td><td class="num">${f.expired_on_shelf}</td>
        <td class="num">${f.incoming}</td><td class="num">${f.open_requisitions}</td>
        <td class="num">${f.min_level ?? "—"}</td><td class="num">${f.par_level ?? "—"}</td>
        <td>${pill(f.status)}</td></tr>`).join("")}</tbody></table>`;
  }

  async function loadRules() {
    if (siteByCode(state.site).kind !== "HOSPITAL") return;
    const rules = await api(`/api/rules?site_code=${encodeURIComponent(state.site)}`);
    $("#rules-table").innerHTML = rules.length
      ? `<table><thead><tr><th>Product family</th><th class="num">Minimum</th><th class="num">Par</th><th></th></tr></thead><tbody>${rules.map((r) => `
          <tr><td>${esc(r.product_family)}</td><td class="num">${r.min_level}</td><td class="num">${r.par_level}</td>
          <td><button class="link" data-edit-rule="${esc(r.product_family)}" data-min="${r.min_level}" data-par="${r.par_level}">Edit</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No reorder rules yet.</div>`;
  }

  // ---------- units ----------
  async function loadUnits() {
    const status = $("#unit-status").value;
    const qs = new URLSearchParams({ site_code: state.site, limit: "300" });
    if (status) qs.set("status", status);
    const units = await api(`/api/units?${qs}`);
    $("#units-table").innerHTML = units.length
      ? `<table><thead><tr><th>DIN</th><th>Product</th><th>Expiry</th><th>Status</th><th>Location</th></tr></thead><tbody>${units.map((u) => `
          <tr><td><button class="link" data-din="${esc(u.din)}">${esc(u.din)}</button></td><td>${esc(u.product_code)}</td>
          <td>${esc(fmtDate(u.expiry_at))}</td><td>${pill(u.status)}</td>
          <td>${u.transit_to_code ? `${esc(u.site_code)} → ${esc(u.transit_to_code)}` : esc(u.site_code)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No units match.</div>`;
  }

  async function showHistory(din) {
    try {
      const h = await api(`/api/units/${encodeURIComponent(din)}`);
      $("#history-card").hidden = false;
      $("#history-title").textContent = `History of ${h.unit.din}`;
      $("#history").innerHTML = `<p class="muted">${esc(h.unit.product_code)} · expires ${esc(fmtDate(h.unit.expiry_at))} · ${pill(h.unit.status)} · at ${esc(h.unit.site_code)}</p>
        <table><thead><tr><th>When</th><th>Action</th><th>Where</th><th>Movement</th><th>Reference</th><th>Requisition</th></tr></thead><tbody>
        ${h.movements.map((m) => `<tr><td>${esc(fmtDate(m.created_at))}</td><td>${esc(m.action)}</td><td>${esc(m.site_code)}</td>
          <td>${m.from_site_code || m.to_site_code ? `${esc(m.from_site_code || "—")} → ${esc(m.to_site_code || "—")}` : "—"}</td>
          <td>${esc(m.reference || "")}</td><td>${m.requisition_id ? "#" + m.requisition_id : ""}</td></tr>`).join("")}</tbody></table>`;
      $("#history-card").scrollIntoView({ behavior: "smooth" });
    } catch (err) { toast(err.message, true); }
  }

  // ---------- requisitions ----------
  async function loadRequisitions() {
    const site = siteByCode(state.site);
    const qs = new URLSearchParams({ site_code: state.site });
    const status = $("#req-filter").value;
    if (status) qs.set("status", status);
    const reqs = await api(`/api/requisitions?${qs}`);
    $("#req-table").innerHTML = reqs.length
      ? `<table><thead><tr><th>#</th><th>Hospital</th><th>Hub</th><th>Product</th><th class="num">Requested</th><th class="num">Dispatch progress</th><th class="num">Received</th><th>Status</th><th>Raised</th><th>Reason</th><th></th></tr></thead><tbody>
        ${reqs.map((q) => `<tr><td>${q.id}</td><td>${esc(q.hospital_code)}</td><td>${esc(q.hub_code)}</td><td>${esc(q.product_family)}</td>
          <td class="num">${q.quantity}</td><td class="num">${q.dispatched_qty ?? ""}</td><td class="num">${q.received_qty}</td>
          <td>${pill(q.status)}${q.trigger === "AUTO" ? ` <span class="muted">auto</span>` : ""}</td>
          <td>${esc(fmtDate(q.created_at))}</td><td>${esc(q.reason || "")}</td>
          <td>${q.status === "OPEN" && site.kind === "HOSPITAL" ? `<button class="link" data-cancel="${q.id}">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No requisitions.</div>`;
  }

  // ---------- alerts ----------
  async function loadAlerts() {
    const notes = await api(`/api/notifications?site_code=${encodeURIComponent(state.site)}&limit=100`);
    $("#alerts-list").innerHTML = notes.length
      ? notes.map((n) => `<div class="notif"><span class="when">${esc(fmtDate(n.created_at))}</span><div class="kind">${esc(n.kind)}</div>${esc(n.message)}</div>`).join("")
      : `<div class="empty">No notifications.</div>`;
  }

  async function loadAlertCount() {
    try {
      const notes = await api(`/api/notifications?site_code=${encodeURIComponent(state.site)}&limit=100`);
      const open = notes.filter((n) => ["REQUISITION", "LOW_STOCK", "EXPIRY"].includes(n.kind)).length; // recent alerts
      const badge = $("#alert-count");
      badge.hidden = open === 0;
      badge.textContent = String(open);
    } catch (_) { /* ignore */ }
  }

  // ---------- wiring ----------
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  document.querySelectorAll(".act").forEach((b) => b.addEventListener("click", () => setAction(b.dataset.action)));
  $("#site").addEventListener("change", onSiteChanged);
  $("#scan-form").addEventListener("submit", submitScan);
  $("#barcode").addEventListener("keydown", (e) => {
    // Scanners send Enter after the data; plain Enter submits, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#scan-form").requestSubmit(); }
  });
  $("#parse-btn").addEventListener("click", checkLabel);
  $("#refresh-stock").addEventListener("click", loadStockTable);
  $("#unit-status").addEventListener("change", loadUnits);
  $("#unit-lookup-btn").addEventListener("click", () => {
    const din = $("#unit-lookup").value.trim().toUpperCase();
    if (din) showHistory(din);
  });
  $("#units-table").addEventListener("click", (e) => {
    const b = e.target.closest("[data-din]");
    if (b) showHistory(b.dataset.din);
  });
  $("#rule-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/rules", { method: "PUT", body: {
        site_code: state.site,
        product_family: $("#rule-family").value.trim().toUpperCase(),
        min_level: Number($("#rule-min").value),
        par_level: Number($("#rule-par").value),
      } });
      toast("Rule saved");
      loadRules(); loadStockTable();
    } catch (err) { toast(err.message, true); }
  });
  $("#rules-table").addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit-rule]");
    if (!b) return;
    $("#rule-family").value = b.dataset.editRule;
    $("#rule-min").value = b.dataset.min;
    $("#rule-par").value = b.dataset.par;
  });
  $("#req-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const q = await api("/api/requisitions", { method: "POST", body: {
        hospital_code: state.site,
        product_family: $("#req-family").value.trim().toUpperCase(),
        quantity: Number($("#req-qty").value),
        reason: $("#req-reason").value.trim() || null,
      } });
      toast(`Requisition #${q.id} sent to ${q.hub_code}`);
      e.target.reset(); $("#req-qty").value = "2";
      loadRequisitions(); loadAlertCount();
    } catch (err) { toast(err.message, true); }
  });
  $("#req-filter").addEventListener("change", loadRequisitions);
  $("#req-table").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cancel]");
    if (!b) return;
    try {
      await api(`/api/requisitions/${b.dataset.cancel}/cancel`, { method: "POST" });
      toast("Requisition cancelled");
      loadRequisitions();
    } catch (err) { toast(err.message, true); }
  });
  $("#run-sweep").addEventListener("click", async () => {
    try {
      const r = await api("/api/sweep", { method: "POST" });
      toast(`Checks run: ${r.expiry_alerts} expiry digest(s), ${r.requisitions_created.length} new requisition(s)`);
      loadAlerts(); loadAlertCount();
    } catch (err) { toast(err.message, true); }
  });

  // Periodic refresh so a station sees hub dispatches and expiry changes without reloading.
  setInterval(() => { if (state.site) refreshAll(); }, 30000);

  setAction("RECEIVE");
  loadSites().catch((err) => toast(`Could not load sites: ${err.message}`, true));
})();
