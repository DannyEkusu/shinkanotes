/* ShinkaNotes main.js — one script shared by every page.
   1 Helpers  2 Auth guard  3 Shared layout  4 Library data  5 Page logic
   AUTH: Supabase Authentication (config in supabase-config.js). Notes, saved items,
   activity and progress are still stored in this browser (localStorage) until the
   database stage; only sign-in and the profile live in Supabase for now. */
"use strict";

/* ---------- 1. Helpers ---------- */
// Every storage key lives here so pages never disagree about names.
const K = { theme: "shinka.theme", notes: "shinka.notes", saved: "shinka.saved", done: "shinka.done",
  activity: "shinka.activity", notif: "shinka.notifications" };
const $ = (s, r = document) => r.querySelector(s);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch { return d; } };
const store = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = iso => new Date(iso).toLocaleString();
const body = document.body, PAGE = body.dataset.page, PRIVATE = body.dataset.access === "private";
// Filled in by boot() once Supabase has told us who (if anyone) is signed in.
let user = null, signedIn = false, sb = null;
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

/* ---------- 2. Supabase auth ---------- */
const loadJS = src => new Promise((ok, no) => { const t = document.createElement("script"); t.src = src; t.onload = ok; t.onerror = () => no(src); document.head.appendChild(t); });
const authMsg = (text, isErr = true) => { const m = $("#auth-msg"); if (m) { m.textContent = text; m.className = isErr ? "error" : "notice"; } };
// Where Supabase sends people after they click the confirmation link (works on GitHub Pages and Netlify).
const confirmUrl = () => new URL("profile.html", location.href).href;

// A message that must survive a redirect (e.g. sent back to the login page). Shown by showNotice().
const NOTICE = "shinka.notice";
const flash = msg => sessionStorage.setItem(NOTICE, msg);
let setupProblem = "";   // set by boot() if the Supabase library or config failed to load
let profileProblem = ""; // set by boot() if the profile row could not be read

// Turn a Supabase error into a message that says what actually went wrong.
function explainError(err) {
  const m = String(err?.message || err || "").toLowerCase(), c = String(err?.code || ""), st = err?.status;
  // Server-side failures are checked first: supabase-js labels every 5xx as "retryable", but those are not network problems.
  if (/database error (saving|creating)/.test(m)) return "Supabase couldn't create your profile record. Run supabase/01_auth_profiles.sql in the Supabase SQL Editor, then try again.";
  if (/error sending|smtp/.test(m)) return "Supabase couldn't send the confirmation email (email service problem). Try again later.";
  if (st === 0 || /failed to fetch|networkerror|load failed/.test(m)) return "Can't reach Supabase. Check your internet connection and try again.";
  if (/invalid api key|no api key/.test(m)) return "Supabase rejected the project key. Check the URL and publishable key in supabase-config.js.";
  if (st === 429 || /rate limit/.test(c + m)) return "Too many attempts or emails sent. Wait a few minutes, then try again.";
  if (c === "email_not_confirmed" || /not confirmed/.test(m)) return "Please confirm your email first. Check your inbox (and spam), or resend the link.";
  if (c === "invalid_credentials" || /invalid login/.test(m)) return "Incorrect email or password.";
  if (c === "user_already_exists" || /already registered/.test(m)) return "That email is already registered. Try signing in instead.";
  if (c === "weak_password" || /password should/.test(m)) return err.message;
  if (c === "42P01" || c === "PGRST205" || /could not find the table|does not exist/.test(m)) return "The profiles table doesn't exist yet. Run supabase/01_auth_profiles.sql in the Supabase SQL Editor.";
  if (c === "42501" || /permission denied|row-level security/.test(m)) return "The database refused this (permissions / Row Level Security). Check the policies from supabase/01_auth_profiles.sql are in place.";
  // supabase-js drops the error text of 5xx responses, so we can only point at the usual causes.
  if (st >= 500) return `Supabase had a server problem (${st}). For sign-up the usual causes are the confirmation-email service or the profile trigger (supabase/01_auth_profiles.sql). Check Logs > Auth in the Supabase dashboard.`;
  return (err?.message || "Something went wrong.") + (c ? ` (${c})` : "");
}

async function boot() {
  // 1) A confirmation link can come back with an error in the URL (expired, already used…).
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  const urlCode = h.get("error_code") || q.get("error_code"), urlDesc = h.get("error_description") || q.get("error_description") || "";
  if (urlCode) {
    flash(/expired|invalid|denied/.test(urlCode + urlDesc.toLowerCase())
      ? "That confirmation link is invalid or has expired. If you already confirmed, just sign in. Otherwise enter your email and tap “Resend confirmation email”."
      : "Confirmation failed: " + (urlDesc || urlCode));
    if (PAGE === "profile") return location.replace("login.html");
  }
  // 2) Load the library, THEN the config, and say exactly which step failed.
  let failed = "";
  try { await loadJS("vendor/supabase-js-2.110.1.umd.js"); } catch { failed = "vendor/supabase-js-2.110.1.umd.js"; }
  if (!failed) try { await loadJS("supabase-config.js"); } catch { failed = "supabase-config.js"; }
  const cfg = window.SHINKA_SUPABASE;
  if (failed) setupProblem = `Could not load ${failed}. Check that it is uploaded to GitHub at that exact path, then reload.`;
  else if (!window.supabase?.createClient) setupProblem = "The Supabase library loaded but did not start. Re-upload vendor/supabase-js-2.110.1.umd.js.";
  else if (!cfg?.url || !cfg?.publishableKey) setupProblem = "supabase-config.js is missing the url or publishableKey.";
  else sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  if (setupProblem) flash(setupProblem);
  // 3) Who is signed in?
  if (sb) {
    // getSession() also picks up the session from the confirmation-link URL.
    const { data, error } = await sb.auth.getSession(), s = data?.session;
    if (error && !urlCode) flash(explainError(error));
    if (s) {
      const { data: p, error: pe } = await sb.from("profiles").select("full_name, avatar").eq("id", s.user.id).maybeSingle();
      if (pe) { profileProblem = explainError(pe); flash(profileProblem); }
      user = { id: s.user.id, email: s.user.email, name: p?.full_name || s.user.user_metadata?.full_name || "", avatar: p?.avatar || 1 };
      signedIn = true;
    }
    // If you sign out in another tab, leave private pages here too.
    sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && PRIVATE) location.replace("logreg.html"); });
  }
  if (PRIVATE && !signedIn) return location.replace("logreg.html");
  if (signedIn && ["login", "registration", "logreg"].includes(PAGE)) return location.replace("index.html");
  init();
}

// Show a pending message in a bar above the page content (outside #app so page code can't wipe it).
function showNotice() {
  const msg = sessionStorage.getItem(NOTICE);
  if (!msg) return;
  sessionStorage.removeItem(NOTICE);
  $("#app").insertAdjacentHTML("beforebegin", `<div class="notice-bar"><p class="notice" role="alert">${esc(msg)}</p></div>`);
  if (/Resend confirmation/.test(msg)) $("#resend")?.removeAttribute("hidden");
}
async function resendLink(btn) {
  const email = btn.dataset.email || $("#login-email")?.value.trim().toLowerCase();
  if (!email) return authMsg("Type your email in the form first.");
  if (!sb) return authMsg(setupProblem || "The sign-in service did not load.");
  const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmUrl() } });
  authMsg(error ? explainError(error) : "Confirmation email sent. Check your inbox (and spam).", !!error);
}

async function signOut() {
  if (!confirm("Are you sure you want to sign out?")) return;
  await sb?.auth.signOut();
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
        <section class="card"><h2>Account &amp; privacy</h2><p class="muted">Signed in as ${esc(user.email)}. Notes, saved items and activity are still stored in this browser only; clearing browser data removes them.</p>
        <div class="row"><button id="wipe" class="btn ghost">Clear study data on this device</button><button id="so" class="btn ghost">Sign out</button></div></section>`;
      $("#theme").value = load(K.theme, "light");
      $("#theme").onchange = e => { store(K.theme, e.target.value); body.classList.toggle("dark-mode", e.target.value === "dark"); };
      $("#so").onclick = signOut;
      $("#wipe").onclick = () => { if (confirm("Clear notes, saved items and activity stored on this device?")) { Object.values(K).forEach(k => localStorage.removeItem(k)); location.reload(); } };
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
    const form = $("#registration-form"), resend = $("#resend");
    form.onsubmit = async e => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      if (!sb) return authMsg(setupProblem || "The sign-up service did not load.");
      if ($("#password").value !== $("#confirm-password").value) return authMsg("Passwords do not match.");
      const email = $("#email").value.trim().toLowerCase(), btn = form.querySelector("button[type=submit]");
      btn.disabled = true; authMsg("Creating your account…", false);
      const { data, error } = await sb.auth.signUp({ email, password: $("#password").value,
        options: { data: { full_name: $("#fullname").value.trim() }, emailRedirectTo: confirmUrl() } });
      btn.disabled = false;
      if (error) return authMsg(explainError(error));
      if (data.session) return location.href = "profile.html";           // only if email confirmation is off
      // With confirmation on, an already-registered email returns a user with no identities.
      if (data.user && data.user.identities && data.user.identities.length === 0) return authMsg("That email may already be registered. Try signing in instead.");
      form.hidden = true; resend.hidden = false; resend.dataset.email = email;
      authMsg(`Almost there! We sent a confirmation link to ${email}. Open it to finish setting up your profile.`, false);
    };
    resend.onclick = () => resendLink(resend);
  },

  profile() {
    // Reached from the confirmation email link, so a session must exist.
    if (!signedIn) return location.replace("login.html");
    document.querySelectorAll(".avatar").forEach(a => a.textContent = (user.name || "S")[0].toUpperCase());
    $("#finish-registration").onclick = async () => {
      authMsg("", false);   // clear any old message
      const pick = $('input[name="avatar"]:checked');
      if (!pick) return authMsg("Please choose a profile picture.");
      // .select() returns the updated row, so we can tell "saved" from "no row matched".
      const { data: rows, error } = await sb.from("profiles").update({ avatar: Number(pick.value) }).eq("id", user.id).select("id");
      if (error) return authMsg("Could not save your picture. " + explainError(error));
      if (!rows?.length) return authMsg("Your profile record was not found, so the picture was not saved. Ask the site owner to run supabase/02_backfill_profiles.sql.");
      log("Joined", "ShinkaNotes");
      location.href = "index.html";
    };
  },

  login() {
    const resend = $("#resend");
    $("#login-form").onsubmit = async e => {
      e.preventDefault();
      if (!sb) return authMsg(setupProblem || "The sign-in service did not load.");
      const email = $("#login-email").value.trim().toLowerCase();
      const { error } = await sb.auth.signInWithPassword({ email, password: $("#login-password").value });
      if (!error) return location.href = "index.html";
      if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) { resend.hidden = false; resend.dataset.email = email; }
      authMsg(explainError(error));
    };
    resend.onclick = () => resendLink(resend);
  }
};

function init() { layout(); PAGES[PAGE]?.(); showNotice(); }
// Start only after everything above is defined. boot() checks Supabase for a session first.
boot();
