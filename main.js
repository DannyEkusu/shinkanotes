/* ShinkaNotes main.js — one script shared by every page.
   1 Helpers  2 Auth guard  3 Shared layout  4 Library data  5 Page logic
   PROTOTYPE NOTE: login here is a front-end demo stored in localStorage.
   It is NOT secure authentication (see the notice on login.html). */
"use strict";

/* ---------- 1. Helpers ---------- */
// Every storage key lives here so pages never disagree about names.
const K = { user: "shinka.user", session: "shinka.session", theme: "shinka.theme",
  notes: "shinka.notes", saved: "shinka.saved", done: "shinka.done",
  activity: "shinka.activity", notif: "shinka.notifications", pending: "shinka.pending" };
const $ = (s, r = document) => r.querySelector(s);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch { return d; } };
const store = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = iso => new Date(iso).toLocaleString();
const body = document.body, PAGE = body.dataset.page, PRIVATE = body.dataset.access === "private";
const user = load(K.user, null);
const signedIn = !!(load(K.session, false) && user);
if (load(K.theme, "light") === "dark") body.classList.add("dark-mode");

// Record a real user action (only called when something actually happens).
function log(action, item, subject = "") {
  const a = load(K.activity, []);
  a.unshift({ action, item, subject, at: new Date().toISOString() });
  store(K.activity, a.slice(0, 300));
}
// Add id to a stored list, or remove it if already there. Returns true if added.
function toggleIn(key, id) {
  const list = load(key, []), i = list.indexOf(id);
  i < 0 ? list.push(id) : list.splice(i, 1);
  store(key, list);
  return i < 0;
}
const avatar = (extra = "") => `<span class="avatar a${esc(user?.avatar || 1)} ${extra}" aria-hidden="true">${esc((user?.name || "S")[0].toUpperCase())}</span>`;
const empty = (msg, href, label) => `<div class="empty"><p>${msg}</p>${href ? `<a class="btn" href="${href}">${label}</a>` : ""}</div>`;

/* ---------- 2. Auth guard ---------- */
function signOut() {
  if (!confirm("Are you sure you want to sign out?")) return;
  localStorage.removeItem(K.session);
  sessionStorage.clear();
  location.href = "logreg.html";
}

/* ---------- 3. Shared layout (topbar, sidebar, footer) ---------- */
const NAV = [["index.html", "Dashboard"], ["subjects.html", "Subjects"], ["library.html", "Textbook Library"],
  ["notes.html", "Notes"], ["saved.html", "Saved Materials"], ["activity.html", "Activity History"],
  ["progress.html", "Progress"], ["profile2.html", "Profile"], ["settings.html", "Settings"], ["about.html", "About ShinkaNotes"]];

function layout() {
  const here = location.pathname.split("/").pop() || "index.html";
  const links = list => list.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  const q = new URLSearchParams(location.search).get("q") || "";
  const main = $("#app");
  main.insertAdjacentHTML("beforebegin", `
  <header class="topbar">
    ${signedIn ? '<button id="menu-toggle" class="icon-btn" aria-label="Open navigation menu" aria-expanded="false">☰</button>' : ""}
    <a class="site-logo" href="${signedIn ? "index.html" : "about.html"}"><img src="assets/logo-notes.svg" alt="" width="32" height="32"><span>ShinkaNotes</span></a>
    ${signedIn ? `<nav class="desktop-nav" aria-label="Main">${links(NAV.slice(0, 4))}</nav>
      <form class="search" action="library.html" role="search"><label class="sr" for="site-search">Search the library</label>
      <input id="site-search" name="q" type="search" value="${esc(q)}" placeholder="Search library…"></form>
      <a href="profile2.html" class="profile-button" aria-label="Open profile">${avatar()}</a>`
      : `<nav class="desktop-nav" aria-label="Main">${links([["about.html", "About"], ["login.html", "Sign in"], ["registration.html", "Create account"]])}</nav>`}
  </header>
  ${signedIn ? `<aside class="sidebar" id="sidebar" aria-label="Navigation">
    <div class="sidebar-header"><strong>ShinkaNotes</strong><button id="close-sidebar" class="icon-btn" aria-label="Close navigation menu">✕</button></div>
    <nav class="sidebar-nav">${links(NAV)}</nav>
    <div class="sidebar-bottom"><button id="sign-out" class="btn ghost">Sign out</button></div></aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>` : ""}`);
  main.insertAdjacentHTML("afterend", `<footer class="footer"><strong>ShinkaNotes</strong><br>A product of Danny Ekusu</footer>`);

  const side = $("#sidebar"), over = $("#sidebar-overlay"), btn = $("#menu-toggle");
  if (!side) return;
  const set = open => { side.classList.toggle("open", open); over.classList.toggle("show", open); btn.setAttribute("aria-expanded", open); };
  btn.onclick = () => set(true);
  $("#close-sidebar").onclick = over.onclick = () => set(false);
  document.addEventListener("keydown", e => e.key === "Escape" && set(false));
  $("#sign-out").onclick = signOut;
}

/* ---------- 4. Library data (data/library.json) ---------- */
let LIB = { subjects: [], resources: [], ok: false };
async function getLib() {
  try { const r = await fetch("data/library.json"); if (!r.ok) throw 0; LIB = { ...(await r.json()), ok: true }; }
  catch { LIB = { subjects: [], resources: [], ok: false }; }
  return LIB;
}
const libWarn = () => LIB.ok ? "" : `<p class="notice">Could not load data/library.json. If you opened the file directly, use a local server (e.g. VS Code Live Server) — browsers block fetch() on file:// pages.</p>`;

function resCard(r) {
  const saved = load(K.saved, []).includes(r.id), done = load(K.done, []).includes(r.id), link = r.file || r.url;
  const meta = [r.author, r.subject, r.topic, r.year].filter(Boolean).map(esc).join(" · ");
  const info = [r.access && "Access: " + r.access, r.license && "License: " + r.license, r.status].filter(Boolean).map(esc).join(" · ");
  return `<article class="card"><span class="tag">${esc(r.type || "Resource")}</span><h3>${esc(r.title)}</h3>
    <p class="muted">${meta}</p>${r.description ? `<p>${esc(r.description)}</p>` : ""}
    ${r.chapters?.length ? `<details><summary>Chapters (${r.chapters.length})</summary><ul>${r.chapters.map(c => `<li>${esc(c)}</li>`).join("")}</ul></details>` : ""}
    ${info ? `<p class="muted small">${info}</p>` : ""}
    <div class="row">${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener" data-act="open" data-id="${esc(r.id)}">Open</a>` : ""}
    <button class="btn ghost" data-act="save" data-id="${esc(r.id)}">${saved ? "Unsave" : "Save"}</button>
    <button class="btn ghost" data-act="done" data-id="${esc(r.id)}">${done ? "Completed ✓" : "Mark complete"}</button></div></article>`;
}
// One click handler for Open / Save / Mark complete on every page.
let rerender = null;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const r = LIB.resources.find(x => x.id === b.dataset.id);
  if (!r) return;
  if (b.dataset.act === "open") log("Opened", r.title, r.subject);
  if (b.dataset.act === "save") { log(toggleIn(K.saved, r.id) ? "Saved" : "Unsaved", r.title, r.subject); rerender?.(); }
  if (b.dataset.act === "done") { if (toggleIn(K.done, r.id)) log("Completed", r.title, r.subject); rerender?.(); }
});

function subjectCards(subjects) {
  if (!subjects.length) return empty("No subjects yet.");
  return subjects.map(s => {
    const items = LIB.resources.filter(r => r.subject === s.name);
    const topics = [...new Set(items.map(r => r.topic).filter(Boolean))];
    return `<a class="card subject" href="library.html?subject=${encodeURIComponent(s.name)}"><h3>${esc(s.name)}</h3>
      <p class="muted">${esc(s.description || "")}</p><p class="small">${items.length} material${items.length === 1 ? "" : "s"}${topics.length ? " · " + esc(topics.slice(0, 3).join(", ")) : ""}</p></a>`;
  }).join("");
}
const stat = (n, label) => `<div class="card stat"><strong>${n}</strong><span>${label}</span></div>`;

/* ---------- 5. Page logic ---------- */
const PAGES = {
  async index() {
    const lib = await getLib(), act = load(K.activity, []);
    const last = act.find(a => a.action === "Opened");
    $("#app").innerHTML = `<h1>Welcome back, ${esc((user.name || "Student").split(" ")[0])}</h1><p class="muted">Learn. Improve. Repeat.</p>
      <form action="library.html" class="card row" role="search"><label class="sr" for="q">Search</label><input id="q" name="q" type="search" placeholder="Search textbooks, topics, authors…"><button class="btn">Search</button></form>
      ${libWarn()}<section class="stats">${stat(lib.resources.length, "Library resources")}${stat(load(K.saved, []).length, "Saved")}${stat(load(K.done, []).length, "Completed")}${stat(load(K.notes, []).length, "Notes")}</section>
      ${last ? `<p class="card">Continue learning: <strong>${esc(last.item)}</strong></p>` : ""}
      <h2>Subjects</h2><div class="grid">${subjectCards(lib.subjects.slice(0, 4))}</div><p><a href="subjects.html">All subjects →</a></p>
      <h2>Textbook Library</h2>${lib.resources.length ? `<div class="grid">${lib.resources.slice(-3).reverse().map(resCard).join("")}</div>` : empty("No textbooks added yet. Send Claude a PDF to start the library.")}
      <h2>Recent activity</h2><div class="card">${act.length ? act.slice(0, 5).map(a => `<p>${esc(a.action)}: ${esc(a.item)} <span class="muted small">${when(a.at)}</span></p>`).join("") : "<p class='muted'>Nothing yet.</p>"}<a href="activity.html">Full history →</a></div>`;
  },

  async subjects() {
    const lib = await getLib();
    $("#app").innerHTML = `<h1>Subjects</h1>${libWarn()}<label class="sr" for="sf">Filter subjects</label><input id="sf" type="search" placeholder="Filter subjects…"><div class="grid" id="sg"></div>`;
    const draw = () => { const t = $("#sf").value.toLowerCase(); const list = lib.subjects.filter(s => (s.name + " " + s.description).toLowerCase().includes(t));
      $("#sg").innerHTML = list.length ? subjectCards(list) : empty("No subjects match your search."); };
    $("#sf").oninput = draw; draw();
  },

  async library() {
    const lib = await getLib(), p = new URLSearchParams(location.search);
    const types = [...new Set(lib.resources.map(r => r.type).filter(Boolean))];
    $("#app").innerHTML = `<h1>Textbook Library</h1>${libWarn()}<div class="row filters">
      <input id="lq" type="search" aria-label="Search library" placeholder="Title, author, topic, keyword…" value="${esc(p.get("q") || "")}">
      <select id="ls" aria-label="Subject"><option value="">All subjects</option>${lib.subjects.map(s => `<option ${s.name === p.get("subject") ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
      <select id="lt" aria-label="Resource type"><option value="">All types</option>${types.map(t => `<option>${esc(t)}</option>`).join("")}</select></div><div class="grid" id="lg"></div>`;
    rerender = () => {
      const q = $("#lq").value.toLowerCase().trim(), s = $("#ls").value, t = $("#lt").value;
      const list = lib.resources.filter(r => (!s || r.subject === s) && (!t || r.type === t) &&
        (!q || [r.title, r.author, r.topic, r.description, ...(r.keywords || [])].join(" ").toLowerCase().includes(q)));
      $("#lg").innerHTML = list.length ? list.map(resCard).join("") : empty(lib.resources.length ? "No resources match these filters." : "This library is empty. Resources appear here once PDFs are added to data/library.json.");
    };
    ["lq", "ls", "lt"].forEach(id => $("#" + id).addEventListener("input", rerender)); rerender();
  },

  async saved() {
    const lib = await getLib();
    $("#app").innerHTML = `<h1>Saved Materials</h1>${libWarn()}<div class="row filters"><input id="sq" type="search" aria-label="Search saved" placeholder="Search saved…">
      <select id="ss" aria-label="Subject"><option value="">All subjects</option>${lib.subjects.map(s => `<option>${esc(s.name)}</option>`).join("")}</select></div><div class="grid" id="sg"></div>`;
    rerender = () => {
      const ids = load(K.saved, []), q = $("#sq").value.toLowerCase(), s = $("#ss").value;
      const list = lib.resources.filter(r => ids.includes(r.id) && (!s || r.subject === s) && (r.title + " " + (r.author || "")).toLowerCase().includes(q));
      $("#sg").innerHTML = list.length ? list.map(resCard).join("") : empty(ids.length ? "No saved items match." : "You haven't saved anything yet.", "library.html", "Browse the library");
    };
    $("#sq").oninput = $("#ss").onchange = rerender; rerender();
  },

  notes() {
    const FIELDS = [["keyPoints", "Key points"], ["cues", "Memory cues"], ["formulas", "Important formulas"], ["explanation", "Personal explanation"], ["questions", "Questions to review"]];
    getLib().then(lib => {
      $("#app").innerHTML = `<h1>Notes</h1><div class="split"><form id="nf" class="card"><h2 id="nh">New note</h2><input type="hidden" id="nid">
        <label>Title<input id="ntitle" required maxlength="120"></label>
        <label>Subject<select id="nsub"><option value="">—</option>${lib.subjects.map(s => `<option>${esc(s.name)}</option>`).join("")}</select></label>
        <label>Related topic or textbook<input id="ntopic" maxlength="120"></label>
        ${FIELDS.map(([k, l]) => `<label>${l}<textarea id="n-${k}" rows="3"></textarea></label>`).join("")}
        <div class="row"><button class="btn">Save note</button><button type="button" id="ncancel" class="btn ghost">Clear</button></div></form>
        <section><input id="nq" type="search" aria-label="Search notes" placeholder="Search your notes…"><div id="nl"></div></section></div>`;
      const reset = () => { $("#nf").reset(); $("#nid").value = ""; $("#nh").textContent = "New note"; };
      const draw = () => {
        const q = $("#nq").value.toLowerCase(), all = load(K.notes, []);
        const list = all.filter(n => JSON.stringify(n).toLowerCase().includes(q));
        $("#nl").innerHTML = list.length ? list.map(n => `<article class="card"><h3>${esc(n.title)}</h3><p class="muted small">${esc([n.subject, n.topic].filter(Boolean).join(" · "))} — updated ${when(n.updated)}</p>
          ${FIELDS.filter(([k]) => n[k]).map(([k, l]) => `<p><strong>${l}:</strong> ${esc(n[k])}</p>`).join("")}
          <div class="row"><button class="btn ghost" data-edit="${n.id}">Edit</button><button class="btn ghost" data-del="${n.id}">Delete</button></div></article>`).join("")
          : empty(all.length ? "No notes match your search." : "No notes yet. Write your first one.");
      };
      $("#nf").onsubmit = e => {
        e.preventDefault();
        const all = load(K.notes, []), id = $("#nid").value || String(Date.now());
        const n = { id, title: $("#ntitle").value.trim(), subject: $("#nsub").value, topic: $("#ntopic").value.trim(), updated: new Date().toISOString() };
        FIELDS.forEach(([k]) => n[k] = $("#n-" + k).value.trim());
        const i = all.findIndex(x => x.id === id);
        i < 0 ? (all.unshift(n), log("Created note", n.title, n.subject)) : (all[i] = n, log("Updated note", n.title, n.subject));
        store(K.notes, all); reset(); draw();
      };
      $("#ncancel").onclick = reset; $("#nq").oninput = draw;
      $("#nl").onclick = e => {
        const all = load(K.notes, []), ed = e.target.dataset.edit, del = e.target.dataset.del;
        if (ed) { const n = all.find(x => x.id === ed); $("#nid").value = n.id; $("#ntitle").value = n.title; $("#nsub").value = n.subject; $("#ntopic").value = n.topic;
          FIELDS.forEach(([k]) => $("#n-" + k).value = n[k] || ""); $("#nh").textContent = "Edit note"; $("#ntitle").focus(); }
        if (del && confirm("Delete this note?")) { store(K.notes, all.filter(x => x.id !== del)); draw(); }
      };
      draw();
    });
  },

  activity() {
    const draw = () => { const a = load(K.activity, []);
      $("#app").innerHTML = `<h1>Activity History</h1>${a.length ? `<div class="card">${a.map(x => `<p>${esc(x.action)}: <strong>${esc(x.item)}</strong> <span class="muted small">${when(x.at)}</span></p>`).join("")}</div><button id="clr" class="btn ghost">Clear history</button>`
        : empty("No activity yet. Opening, saving or completing materials and writing notes will show up here.", "library.html", "Browse the library")}`;
      $("#clr")?.addEventListener("click", () => { if (confirm("Clear all activity?")) { store(K.activity, []); draw(); } }); };
    draw();
  },

  async progress() {
    const lib = await getLib(), act = load(K.activity, []), done = load(K.done, []);
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
    const counts = days.map(d => act.filter(a => new Date(a.at).toDateString() === d.toDateString()).length), max = Math.max(...counts, 1);
    $("#app").innerHTML = `<h1>Progress</h1>${libWarn()}<section class="stats">
      ${stat(new Set(act.map(a => a.subject).filter(Boolean)).size, "Subjects studied")}${stat(done.length, "Materials completed")}
      ${stat(act.filter(a => a.action === "Opened").length, "Study sessions (opens)")}${stat(load(K.notes, []).length, "Notes written")}</section>
      <h2>This week</h2><div class="card chart" role="img" aria-label="Actions per day this week">${counts.map((c, i) => `<div><div class="bar" style="height:${c / max * 100}%" title="${c}"></div><small>${days[i].toLocaleDateString(undefined, { weekday: "short" })}</small></div>`).join("")}</div>
      <h2>By subject</h2><div class="card">${lib.subjects.map(s => { const t = lib.resources.filter(r => r.subject === s.name), d = t.filter(r => done.includes(r.id)).length;
        return `<p>${esc(s.name)}: ${t.length ? `${d} of ${t.length} completed <progress value="${d}" max="${t.length}"></progress>` : '<span class="muted">no materials yet</span>'}</p>`; }).join("") || "<p class='muted'>No subjects.</p>"}</div>`;
  },

  async profile2() {
    await getLib();
    $("#app").innerHTML = `<h1>Profile</h1><div class="card row">${avatar("big")}<div><h2 id="profile-name">${esc(user.name)}</h2><p id="profile-email" class="muted">${esc(user.email)}</p></div></div>
      <section class="stats">${stat(load(K.saved, []).length, "Saved")}${stat(load(K.done, []).length, "Completed")}${stat(load(K.notes, []).length, "Notes")}</section><p><a class="btn ghost" href="settings.html">Settings</a></p>`;
  },

  settings() {
    const draw = () => {
      const on = load(K.notif, false) && "Notification" in window && Notification.permission === "granted";
      $("#app").innerHTML = `<h1>Settings</h1><section class="card"><h2>Theme</h2><label>Appearance<select id="theme"><option value="light">Light</option><option value="dark">Dark</option></select></label></section>
        <section class="card"><h2>Notifications</h2><button id="notification-toggle" class="btn ghost">${on ? "Notifications enabled — turn off" : "Enable notifications"}</button></section>
        <section class="card"><h2>Account &amp; privacy</h2><p class="muted">Your notes, saved items and activity are stored in this browser only (localStorage). Clearing browser data removes them.</p>
        <div class="row"><button id="wipe" class="btn ghost">Delete all my data</button><button id="so" class="btn ghost">Sign out</button></div></section>`;
      $("#theme").value = load(K.theme, "light");
      $("#theme").onchange = e => { store(K.theme, e.target.value); body.classList.toggle("dark-mode", e.target.value === "dark"); };
      $("#so").onclick = signOut;
      $("#wipe").onclick = () => { if (confirm("Delete your account data from this browser?")) { Object.values(K).forEach(k => localStorage.removeItem(k)); location.href = "logreg.html"; } };
      $("#notification-toggle").onclick = async () => {
        if (!("Notification" in window)) return alert("Notifications are not supported by this browser.");
        if (on) { store(K.notif, false); return draw(); }
        let p = Notification.permission;
        if (p === "default") p = await Notification.requestPermission();
        if (p === "granted") { store(K.notif, true); new Notification("ShinkaNotes", { body: "Notifications are now enabled!" }); }
        else alert("Notifications are blocked. Enable them in your browser's site settings.");
        draw();
      };
    };
    draw();
  },

  registration() {
    $("#registration-form").onsubmit = e => {
      e.preventDefault();
      const f = e.target; if (!f.checkValidity()) return f.reportValidity();
      if ($("#password").value !== $("#confirm-password").value) return alert("Passwords do not match.");
      // The password is deliberately NOT saved anywhere.
      sessionStorage.setItem(K.pending, JSON.stringify({ name: $("#fullname").value.trim(), email: $("#email").value.trim().toLowerCase() }));
      location.href = "profile.html";
    };
  },

  profile() {
    const pend = JSON.parse(sessionStorage.getItem(K.pending) || "null");
    if (!pend) return location.replace("registration.html");
    document.querySelectorAll(".avatar").forEach(a => a.textContent = pend.name[0].toUpperCase());
    $("#finish-registration").onclick = () => {
      const pick = $('input[name="avatar"]:checked');
      if (!pick) return alert("Please choose a profile picture.");
      store(K.user, { ...pend, avatar: pick.value });
      store(K.session, true); sessionStorage.removeItem(K.pending);
      log("Joined", "ShinkaNotes");
      location.href = "index.html";
    };
  },

  login() {
    $("#login-form").onsubmit = e => {
      e.preventDefault();
      const email = $("#login-email").value.trim().toLowerCase(), saved = load(K.user, null);
      if (!saved || saved.email !== email) return $("#login-error").textContent = "No account for that email on this device. Create one first.";
      store(K.session, true); location.href = "index.html";
    };
  }
};

function init() { layout(); PAGES[PAGE]?.(); }
// Start only after everything above is defined. Private pages need a session.
if (PRIVATE && !signedIn) location.replace("logreg.html");
else init();
