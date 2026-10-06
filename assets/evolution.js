/* ============================================================
   evolution.js — la page Évolution.
   Deux sources :
   - window.EVOLUTION (data/historique/stats.js, écrit chaque matin par scripts/alternance.mjs) : une ligne par jour,
     toutes sources, avec nouvelles et retirées. Elle grandit à partir du jour où l'archive a été activée.
   - window.ALTERNANCE.serie (data/alternance.js) : la série France Travail par métier, depuis le premier jour de collecte.
   ============================================================ */
"use strict";
const D = window.ALTERNANCE;
if (!D) { document.querySelector(".page").innerHTML = "<p>Données absentes : lancez <code>mettre-a-jour-alternance.cmd</code>.</p>"; throw new Error("données absentes"); }
const { esc, nb, dateFr } = Site;
const JOURS = ((window.EVOLUTION || {}).jours || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
const SERIE = (D.serie || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
const METIER = Object.fromEntries(D.metiers.map(m => [m.code, m]));
const BLEU = "#1f5eff", PALE = "#9db6ff", ORANGE = "#ff6a00", VERT = "#0f7b3f", ROUGE = "#c5221f", GRIS = "#aab1bf";
const court = d => dateFr(d).slice(0, 5);
const somme = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
const $ = id => document.getElementById(id);

Chart.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 13;
Chart.defaults.color = "#4a4f59";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
const G = {};
function graph(id, type, data, options = {}) {
  const opts = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false } }, options);
  if (G[id]) { G[id].data = data; G[id].options = opts; G[id].update(); } else G[id] = new Chart($(id), { type, data, options: opts });
  $(id).setAttribute("role", "img");
  $(id).setAttribute("aria-label", (($(id).closest(".carte").querySelector("h3") || {}).textContent || "Graphique") + " : " + data.labels.length + " points");
}
const axes = (extra = {}) => ({ x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, grid: { color: "#eef0f4" }, border: { display: false }, ...extra } });
const ligne = (label, data, couleur, extra = {}) => ({ label, data, borderColor: couleur, backgroundColor: couleur, tension: .25, pointRadius: data.length > 40 ? 0 : 3, borderWidth: 2.5, spanGaps: true, ...extra });
const vide = (id, texte) => { const c = $(id).closest(".carte"); if (!c.querySelector(".vide")) { const p = document.createElement("p"); p.className = "note vide"; p.style.cssText = "margin:0;padding:8px 0"; c.appendChild(p); } c.querySelector(".vide").textContent = texte; $(id).closest(".zone").style.display = "none"; };
const plein = id => { const c = $(id).closest(".carte"), v = c.querySelector(".vide"); if (v) v.remove(); $(id).closest(".zone").style.display = ""; };

/* ---- En-tête : chapeau, avertissement, chiffres-clés ---- */
const dernier = JOURS.at(-1), debut = JOURS[0];
const depuisSuivi = SERIE.length ? SERIE[0].date : null;
$("e-chapo").textContent = JOURS.length
  ? `Suivi complet (toutes sources) depuis le ${dateFr(debut.date)} : ${JOURS.length} jour${JOURS.length > 1 ? "s" : ""} de données${depuisSuivi ? `. La série France Travail remonte au ${dateFr(depuisSuivi)}.` : "."}`
  : `Le suivi complet se remplit chaque matin${depuisSuivi ? ` ; la série France Travail remonte déjà au ${dateFr(depuisSuivi)}` : ""}.`;
if (JOURS.length < 2) $("e-avis").innerHTML = `<p class="avis"><b>L'historique démarre.</b> ${JOURS.length ? "Une seule journée est enregistrée pour l'instant" : "Aucune journée n'est encore enregistrée dans l'archive"} : les courbes des parties 1, 2, 4, 5 et 6 se tracent à partir de deux jours, et se complètent chaque matin. La partie 3 (France Travail par métier) est déjà complète.</p>`;
else if (dernier.sources_ko && dernier.sources_ko.length) $("e-avis").innerHTML = `<p class="avis"><b>Source en baisse ce matin :</b> ${dernier.sources_ko.map(s => esc(Site.SOURCES[s] || s)).join(", ")}. Les retraits du jour ne sont pas comptés pour éviter de fausses sorties.</p>`;

function chiffres() {
  const c = [];
  const tuile = (valeur, libelle, note = "", cls = "") => c.push(`<div class="chiffre ${cls}"><b>${valeur}</b><span>${libelle}</span>${note ? `<small>${note}</small>` : ""}</div>`);
  if (!dernier) { tuile("—", "Offres en ligne ce matin", "l'archive se remplit"); $("e-chiffres").innerHTML = c.join(""); return; }
  tuile(nb(dernier.total), "offres en ligne", `${nb(dernier.alternance)} alternances · ${nb(dernier.stage)} stages — ${dateFr(dernier.date)}`, "fort");
  // Variation sur environ 7 jours : le jour le plus proche de J-7.
  const cible = Date.parse(dernier.date) - 7 * 86400000;
  const ref = JOURS.slice(0, -1).reduce((m, j) => !m || Math.abs(Date.parse(j.date) - cible) < Math.abs(Date.parse(m.date) - cible) ? j : m, null);
  if (ref) { const v = dernier.total - ref.total, p = ref.total ? Math.round(100 * v / ref.total) : 0; tuile(`${v >= 0 ? "+" : ""}${nb(v)}`, `depuis le ${dateFr(ref.date)}`, `${p >= 0 ? "+" : ""}${p} %`, v >= 0 ? "hausse" : "baisse"); }
  if (dernier.nouvelles != null) tuile(nb(dernier.nouvelles), "nouvelles offres ce matin", "jamais vues avant");
  if (dernier.retirees != null) tuile(nb(dernier.retirees), "offres retirées", dernier.depuis ? `depuis le ${dateFr(dernier.depuis)}` : "");
  if (dernier.duree_vie_med != null) tuile(`${dernier.duree_vie_med} j`, "durée de vie médiane", "des offres retirées ce matin");
  const tot = JOURS.reduce((a, j) => a + (j.nouvelles || 0), 0);
  if (JOURS.length > 1) tuile(nb(tot), "nouvelles offres suivies", `sur ${JOURS.length} jours`);
  $("e-chiffres").innerHTML = c.join("");
}

/* ---- 1. Le volume ---- */
function volume() {
  if (JOURS.length < 2) return vide("g-total", "Il faut au moins deux jours d'archive pour tracer une courbe.");
  plein("g-total");
  graph("g-total", "line", { labels: JOURS.map(j => court(j.date)), datasets: [
    ligne("Alternance", JOURS.map(j => j.alternance), BLEU), ligne("Stage", JOURS.map(j => j.stage), ORANGE),
    ligne("Total", JOURS.map(j => j.total), "#16181d", { borderDash: [5, 4], borderWidth: 1.8 })] },
    { scales: axes(), plugins: { legend: { position: "bottom" } } });
}

/* ---- 2. Les flux ---- */
function flux() {
  const j = JOURS.filter(x => x.retirees != null || x.nouvelles != null);
  if (j.length < 1 || JOURS.length < 2) { vide("g-flux", "Les flux se mesurent à partir du deuxième jour d'archive."); vide("g-vie", "Disponible dès les premières offres retirées."); return; }
  plein("g-flux");
  graph("g-flux", "bar", { labels: j.map(x => court(x.date)), datasets: [
    { label: "Nouvelles", data: j.map(x => x.nouvelles), backgroundColor: VERT, borderRadius: 5, maxBarThickness: 28 },
    { label: "Retirées", data: j.map(x => x.retirees), backgroundColor: ROUGE, borderRadius: 5, maxBarThickness: 28 }] },
    { scales: axes(), plugins: { legend: { position: "bottom" } } });
  const v = JOURS.filter(x => x.duree_vie_med != null);
  if (!v.length) return vide("g-vie", "Disponible dès les premières offres retirées.");
  plein("g-vie");
  graph("g-vie", "line", { labels: v.map(x => court(x.date)), datasets: [ligne("Durée de vie médiane (jours)", v.map(x => x.duree_vie_med), PALE)] }, { scales: axes(), plugins: { legend: { display: false } } });
}

/* ---- 3. Par métier : la série France Travail ---- */
function metiers() {
  const sel = $("e-metier");
  sel.innerHTML = `<option value="*">Tous les métiers suivis</option>` + D.metiers.slice().sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")).map(m => `<option value="${esc(m.code)}">${esc(m.libelle)} (${esc(m.code)})</option>`).join("");
  const rendre = () => {
    const m = sel.value, codes = m === "*" ? Object.keys(METIER) : [m];
    if (SERIE.length < 2) return vide("g-metier", "La série France Travail a besoin d'au moins deux jours.");
    plein("g-metier");
    const tot = SERIE.map(j => codes.reduce((a, c) => a + ((j.tot || {})[c] || 0), 0)), alt = SERIE.map(j => codes.reduce((a, c) => a + ((j.alt || {})[c] || 0), 0));
    graph("g-metier", "line", { labels: SERIE.map(j => court(j.date)), datasets: [ligne("Toutes les offres France Travail", tot, GRIS), ligne("dont alternance", alt, BLEU)] },
      { scales: axes(), plugins: { legend: { position: "bottom" } } });
  };
  sel.addEventListener("change", rendre); rendre();
}

/* ---- 4. Comparer deux dates ---- */
function comparer() {
  const a = $("e-date-a"), b = $("e-date-b");
  const avecMetiers = JOURS.filter(j => j.par_rome);
  if (avecMetiers.length < 2) { a.disabled = b.disabled = true; $("e-compare-note").textContent = ""; return vide("g-compare", "Il faut deux jours d'archive pour comparer deux dates."); }
  const opts = avecMetiers.map(j => `<option value="${j.date}">${dateFr(j.date)}</option>`).join("");
  a.innerHTML = b.innerHTML = opts; a.value = avecMetiers[0].date; b.value = avecMetiers.at(-1).date;
  const rendre = () => {
    const ja = avecMetiers.find(j => j.date === a.value), jb = avecMetiers.find(j => j.date === b.value);
    const codes = [...new Set([...Object.keys(ja.par_rome), ...Object.keys(jb.par_rome)])]
      .map(c => [c, (ja.par_rome[c] || [0, 0]).reduce((x, y) => x + y), (jb.par_rome[c] || [0, 0]).reduce((x, y) => x + y)])
      .sort((x, y) => Math.max(y[1], y[2]) - Math.max(x[1], x[2])).slice(0, 15);
    plein("g-compare");
    graph("g-compare", "bar", { labels: codes.map(([c]) => (METIER[c] ? METIER[c].libelle : c)), datasets: [
      { label: dateFr(ja.date), data: codes.map(x => x[1]), backgroundColor: PALE, borderRadius: 5 }, { label: dateFr(jb.date), data: codes.map(x => x[2]), backgroundColor: BLEU, borderRadius: 5 }] },
      { indexAxis: "y", scales: { x: { beginAtZero: true, grid: { color: "#eef0f4" }, border: { display: false } }, y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false } } }, plugins: { legend: { position: "bottom" } } });
    const t1 = somme(Object.fromEntries(Object.entries(ja.par_rome).map(([k, v]) => [k, v[0] + v[1]]))), t2 = somme(Object.fromEntries(Object.entries(jb.par_rome).map(([k, v]) => [k, v[0] + v[1]])));
    $("e-compare-note").textContent = `${nb(t1)} offres le ${dateFr(ja.date)}, ${nb(t2)} le ${dateFr(jb.date)} (${t2 - t1 >= 0 ? "+" : ""}${nb(t2 - t1)}). Les 15 métiers les plus fournis sont affichés.`;
  };
  a.addEventListener("change", rendre); b.addEventListener("change", rendre); rendre();
}

/* ---- 5. Salaire ---- */
function salaire() {
  const j = JOURS.filter(x => x.sal_med_alternance != null || x.sal_med_stage != null);
  if (j.length < 2) return vide("g-salaire", "Il faut au moins deux jours d'archive pour tracer une courbe.");
  plein("g-salaire");
  graph("g-salaire", "line", { labels: j.map(x => court(x.date)), datasets: [ligne("Alternance", j.map(x => x.sal_med_alternance), BLEU), ligne("Stage", j.map(x => x.sal_med_stage), ORANGE)] },
    { scales: axes({ beginAtZero: false, ticks: { callback: v => nb(v) + " €" } }), plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => `${c.dataset.label} : ${nb(c.parsed.y)} € brut/mois (${nb(j[c.dataIndex][c.datasetIndex ? "sal_n_stage" : "sal_n_alternance"])} offres avec salaire)` } } } });
}

/* ---- 6. Régions ---- */
function regions() {
  const avec = JOURS.filter(j => j.par_region && Object.keys(j.par_region).length);
  if (avec.length < 2) return vide("g-region", "Il faut deux jours d'archive pour comparer.");
  const a = avec[0], b = avec.at(-1);
  const noms = [...new Set([...Object.keys(a.par_region), ...Object.keys(b.par_region)])].sort((x, y) => (b.par_region[y] || 0) - (b.par_region[x] || 0));
  plein("g-region");
  graph("g-region", "bar", { labels: noms, datasets: [{ label: dateFr(a.date), data: noms.map(n => a.par_region[n] || 0), backgroundColor: PALE, borderRadius: 5 }, { label: dateFr(b.date), data: noms.map(n => b.par_region[n] || 0), backgroundColor: BLEU, borderRadius: 5 }] },
    { indexAxis: "y", scales: { x: { beginAtZero: true, grid: { color: "#eef0f4" }, border: { display: false } }, y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false } } }, plugins: { legend: { position: "bottom" } } });
}

chiffres(); volume(); flux(); metiers(); comparer(); salaire(); regions();
