/* ============================================================
   alternance.js — la page Alternance.
   Les données viennent de data/alternance.js (window.ALTERNANCE),
   écrit par scripts/alternance.mjs. Tout est recalculé ici, dans le
   navigateur, à chaque changement de filtre. Deux choses sont
   interrogées en direct : la fiche d'un employeur et la liste des
   entreprises à démarcher (API Recherche d'entreprises, sans clé).
   L'état des filtres vit dans l'adresse (#m=M1620&z=dep:63…) :
   copier le lien, c'est partager exactement cette vue.
   ============================================================ */
"use strict";

/* ============================================================
   1) UTILITAIRES
   ============================================================ */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const nb = n => Number(n || 0).toLocaleString("fr-FR");
const euro = n => n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR") + " €";
const s = k => k > 1 ? "s" : "";
function mediane(a) {
  const t = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y);
  if (!t.length) return null;
  const m = (t.length - 1) / 2;
  return (t[Math.floor(m)] + t[Math.ceil(m)]) / 2;
}
const compter = (liste, cle) => { const c = new Map(); for (const x of liste) { for (const k of [].concat(cle(x))) { if (k == null || k === "") continue; c.set(k, (c.get(k) || 0) + 1); } } return [...c].sort((a, b) => b[1] - a[1]); };
const dateFr = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "?"; };
const court = (t, n) => !t ? "—" : t.length > n ? t.slice(0, n - 1) + "…" : t;
const sansAccents = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = t => sansAccents(String(t || "").toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
function enLignes(texte, max = 30) {
  const lignes = []; let l = "";
  for (const mot of String(texte).split(" ")) { if (l && (l + " " + mot).length > max) { lignes.push(l); l = mot; } else l = l ? l + " " + mot : mot; }
  if (l) lignes.push(l);
  return lignes;
}

const D = window.ALTERNANCE;
if (!D) {
  document.getElementById("sous").innerHTML = "Données absentes : lancez <code>node scripts/alternance.mjs</code> dans le dossier du dépôt, puis rechargez la page.";
  throw new Error("data/alternance.js absent");
}
const METIER = Object.fromEntries(D.metiers.map(m => [m.code, m]));
const COUL_GROUPE = { Marketing: "#0a5cff", Digital: "#ff6a00", Frontière: "#8e8e93" };
const COUL_PUBLIE = { "Entreprise": "#0a5cff", "École / organisme de formation": "#ff6a00", "Intérim / cabinet de recrutement": "#8e8e93", "Non précisé": "#c7c7cc" };
const COUL_TYPE = { apprentissage: "#0a5cff", professionnalisation: "#5f9bf5", "non précisé": "#c7c7cc" };
const SOURCES = { FT: "France Travail", LBA: "La bonne alternance", ADZ: "Adzuna", JOO: "Jooble" };
const TYPES = ["apprentissage", "professionnalisation", "non précisé"];
const AURA = "Auvergne-Rhône-Alpes", IDF = "Île-de-France";
const EFFECTIFS = { NN: "Non renseigné", "00": "0 salarié", "01": "1 ou 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés", 11: "10 à 19 salariés", 12: "20 à 49 salariés", 21: "50 à 99 salariés", 22: "100 à 199 salariés", 31: "200 à 249 salariés", 32: "250 à 499 salariés", 41: "500 à 999 salariés", 42: "1 000 à 1 999 salariés", 51: "2 000 à 4 999 salariés", 52: "5 000 à 9 999 salariés", 53: "10 000 salariés et plus" };
const sectionLib = naf => { const d = parseInt(String(naf || "").slice(0, 2), 10); if (!isFinite(d)) return null;
  for (const [max, k] of [[3, "A"], [9, "B"], [33, "C"], [35, "D"], [39, "E"], [43, "F"], [47, "G"], [53, "H"], [56, "I"], [63, "J"], [66, "K"], [68, "L"], [75, "M"], [82, "N"], [84, "O"], [85, "P"], [88, "Q"], [93, "R"], [96, "S"], [98, "T"], [99, "U"]]) if (d <= max) return D.sections[k]; return null; };
const JOUR = Date.parse(D.date);
const age = o => { const t = Date.parse(o.date); return isFinite(t) && isFinite(JOUR) ? Math.max(0, Math.round((JOUR - t) / 86400000)) : null; };

Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.plugins.legend.display = false;

/* ============================================================
   2) ÉTAT (dans l'adresse de la page)
   ============================================================ */
const sourcesPresentes = [...new Set(D.offres.map(o => o.src))];
const DUREES = D.classes_duree || ["2 mois ou moins", "3 à 4 mois", "5 à 6 mois", "Plus de 6 mois", "Non précisée"];
// c = type d'offre (alternance, stage, tous) ; d = durées de stage cochées (indices dans DUREES).
const DEFAUT = { c: "alternance", m: D.metier_par_defaut || "*", z: D.zone_par_defaut || "", q: "", t: TYPES.join(","), d: DUREES.map((_, i) => i).join(","), s: sourcesPresentes.join(","), e: "0", i: "0", r: "0", tri: "date" };
// Comment dire le type d'offre dans une phrase.
const EN = () => ({ alternance: "en alternance", stage: "de stage", tous: "d'alternance ou de stage" })[E.c] || "en alternance";
let E = { ...DEFAUT };
function lireAdresse() {
  const p = new URLSearchParams(location.hash.slice(1));
  E = { ...DEFAUT };
  for (const k of Object.keys(DEFAUT)) if (p.has(k)) E[k] = p.get(k);
  if (E.m !== "*" && !E.m.startsWith("g:") && !METIER[E.m]) E.m = DEFAUT.m;
}
function ecrireAdresse() {
  const p = new URLSearchParams();
  for (const k of Object.keys(DEFAUT)) if (E[k] !== DEFAUT[k]) p.set(k, E[k]);
  history.replaceState(null, "", location.pathname + location.search + (p.toString() ? "#" + p : ""));
}
const ensemble = v => new Set(String(v || "").split(",").filter(Boolean));

/* ============================================================
   3) FILTRES
   ============================================================ */
const passeZone = (o, z) => !z ? true : z.startsWith("dep:") ? o.dep === z.slice(4) : z.startsWith("reg:") ? o.reg === z.slice(4) : true;
const passeMetier = (o, m) => !m || m === "*" ? true : m.startsWith("g:") ? (METIER[o.rome] || {}).groupe === m.slice(2) : o.rome === m;
const motsCherches = () => norm(E.q).split(" ").filter(Boolean);
const filtresCourants = () => ({ types: ensemble(E.t), sources: ensemble(E.s), mots: motsCherches(),
  durees: new Set([...ensemble(E.d)].map(i => DUREES[+i]).filter(Boolean)) });
/* Tout sauf le métier : sert à comparer les métiers entre eux. */
function filtreSansMetier(o, f, zone = E.z) {
  if (!passeZone(o, zone)) return false;
  if (E.c !== "tous" && (o.contrat || "alternance") !== E.c) return false;
  if (o.contrat === "stage") { if (!f.durees.has(o.duree_classe || DUREES.at(-1))) return false; }
  else if (!f.types.has(o.type)) return false;
  if (!(o.srcs || [o.src]).some(x => f.sources.has(x))) return false;
  if (E.e !== "1" && o.ecole) return false;          // écoles masquées sauf si la case est cochée
  if (E.i === "1" && o.interim) return false;
  if (E.r === "1") { const a = age(o); if (a != null && a > 90) return false; }
  if (f.mots.length) { const t = norm(o.titre); if (!f.mots.every(w => t.includes(w))) return false; }
  return true;
}
/* Combien d'offres d'écoles la sélection cache : mêmes filtres, écoles comprises. */
function ecolesMasquees() {
  const f = filtresCourants();
  const avant = E.e; E.e = "1";
  const n = D.offres.filter(o => o.ecole && passeMetier(o, E.m) && filtreSansMetier(o, f)).length;
  E.e = avant;
  return n;
}
function libelleMetier(m) {
  if (!m || m === "*") return "tous les métiers suivis";
  if (m.startsWith("g:")) return "le groupe « " + m.slice(2) + " »";
  return (METIER[m] || {}).libelle || m;
}
const libDep = code => (D.departements || {})[code] ? `${D.departements[code]} (${code})` : "département " + code;
const libelleZone = z => !z ? "France entière" : z.startsWith("dep:") ? libDep(z.slice(4)) : z.slice(4);
const PETIT = 20;   // en dessous, un pourcentage ne tient pas debout : on le dit

/* ============================================================
   4) GRAPHIQUES
   ============================================================ */
const G = {};
function graph(id, type, data, options) {
  const el = document.getElementById(id);
  const opts = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, options);
  if (G[id]) { G[id].data = data; G[id].options = opts; G[id].resize(); G[id].update(); return G[id]; }
  G[id] = new Chart(el, { type, data, options: opts });
  return G[id];
}
const hauteur = (id, n, parBarre = 26) => { const el = document.getElementById(id); if (el) el.parentNode.style.height = Math.max(220, 60 + n * parBarre) + "px"; };
function barres(id, etiquettes, valeurs, { horizontal = true, couleurs = "#0a5cff", total = null, suffixe = " offre", onClick = null, pourcent = false } = {}) {
  if (horizontal) hauteur(id, etiquettes.length);
  graph(id, "bar", { labels: etiquettes.map(e => horizontal ? enLignes(e, 34) : e), datasets: [{ data: valeurs, backgroundColor: couleurs, borderRadius: 4 }] }, {
    indexAxis: horizontal ? "y" : "x",
    onClick: onClick ? (ev, els) => { if (els.length) onClick(els[0].index); } : undefined,
    onHover: onClick ? (ev, els) => { ev.native.target.style.cursor = els.length ? "pointer" : "default"; } : undefined,
    plugins: { tooltip: { callbacks: { label: c => { const v = c.parsed[horizontal ? "x" : "y"];
      return pourcent ? `${v} % des offres` : `${nb(v)}${suffixe}${v > 1 && suffixe ? "s" : ""}${total ? ` (${pct(v, total)} %)` : ""}`; } } } },
    scales: { x: { beginAtZero: true, grid: { display: !horizontal }, ticks: pourcent && horizontal ? { callback: v => v + " %" } : {} },
              y: { beginAtZero: true, grid: { display: horizontal }, ticks: { autoSkip: false } } } });
}
function anneau(id, etiquettes, valeurs, couleurs) {
  const total = valeurs.reduce((a, b) => a + b, 0);
  graph(id, "doughnut", { labels: etiquettes, datasets: [{ data: valeurs, backgroundColor: couleurs, borderWidth: 2, borderColor: "#fff" }] }, {
    cutout: "58%",
    plugins: { legend: { display: true, position: "right", labels: { boxWidth: 12, boxHeight: 12, padding: 10,
      generateLabels: ch => ch.data.labels.map((l, i) => ({ text: `${l} — ${pct(valeurs[i], total)} %`, fillStyle: couleurs[i], strokeStyle: couleurs[i], index: i })) } },
      tooltip: { callbacks: { label: c => `${c.label} : ${nb(c.parsed)} offre${s(c.parsed)} (${pct(c.parsed, total)} %)` } } } });
}
const lecture = (id, html) => { document.getElementById(id).innerHTML = html ? "<b>Lecture :</b> " + html : ""; };
const pluriel = (n, mot) => `${nb(n)} ${mot}${s(n)}`;

/* ============================================================
   5) LE RENDU
   ============================================================ */
let carte, calque, listeN = 30;

function rendre() {
  const f = filtresCourants();
  const zoneOk = D.offres.filter(o => filtreSansMetier(o, f));
  const sel = zoneOk.filter(o => passeMetier(o, E.m));
  const N = sel.length;
  ecrireAdresse();

  const lm = libelleMetier(E.m), lz = libelleZone(E.z);
  document.getElementById("compte").innerHTML = `<b>${pluriel(N, "offre")}</b> ${EN()} pour <b>${esc(lm)}</b>, ${esc(lz)}${f.mots.length ? `, intitulé contenant « ${esc(E.q)} »` : ""} — sur ${nb(D.offres.length)} offres en base.`
    + (N > 0 && N < PETIT ? ` <span class="non">Attention : moins de ${PETIT} offres, les pourcentages ci-dessous sont fragiles ; citez plutôt les effectifs.</span>` : "");
  document.getElementById("aucune").hidden = N > 0;
  document.getElementById("titre-sel").textContent = `— ${lm}, ${lz}`;
  const baseFiab = D.offres.filter(o => passeZone(o, E.z) && passeMetier(o, E.m));
  document.getElementById("nb-ecoles").textContent = baseFiab.filter(o => o.ecole).length;
  document.getElementById("nb-interim").textContent = baseFiab.filter(o => o.interim).length;
  document.getElementById("nb-anciennes").textContent = baseFiab.filter(o => (age(o) || 0) > 90).length + " plus anciennes";

  rendreMetiers(zoneOk, f);
  rendreChiffres(sel);
  rendreCarte(sel);
  rendreLieux(sel);
  rendreSerie();
  rendreContrat(sel);
  rendreRecruteurs(sel);
  rendreOutils(sel);
  rendreRegion(f);
  recN = 30; rendreRecruteursLBA();
  listeN = 30; rendreListe(sel);
}

/* ============================================================
   5 bis) LA RÉGION SUIVIE, DÉPARTEMENT PAR DÉPARTEMENT
   ============================================================ */
const REG = D.region_suivie;
const RECS = (window.ALTERNANCE_RECRUTEURS || {}).recruteurs || [];
const codesChoisis = () => D.metiers.filter(m => passeMetier({ rome: m.code }, E.m)).map(m => m.code);
// « Lyon 3e Arrondissement » et « Lyon 7e » sont la même ville pour ce graphique.
const villeSimple = v => String(v || "").replace(/\s+\d+(er|e|ème)?\s+arrondissement$/i, "").replace(/\s+\d+(er|e|ème)?\s+canton$/i, "").trim();

function rendreRegion(f) {
  const bloc = document.getElementById("region");
  if (!REG) { bloc.hidden = true; return; }
  const dansReg = o => o.reg === REG.nom && passeMetier(o, E.m);
  const offres = D.offres.filter(o => dansReg(o) && filtreSansMetier(o, f, ""));
  const avant = E.e; E.e = "1";
  const ecoles = D.offres.filter(o => dansReg(o) && o.ecole && filtreSansMetier(o, f, ""));
  E.e = avant;
  const codes = codesChoisis();
  const recs = RECS.filter(r => r.romes.some(c => codes.includes(c)));
  const deps = REG.deps.slice().sort((a, b) => libDep(a).localeCompare(libDep(b), "fr"));
  const lignes = deps.map(d => {
    const o = offres.filter(x => x.dep === d);
    return { d, n: o.length, ent: o.filter(x => x.publie_par === "Entreprise").length, ec: ecoles.filter(x => x.dep === d).length, rec: recs.filter(r => r.dep === d).length };
  });
  const tot = k => lignes.reduce((a, l) => a + l[k], 0);
  document.getElementById("region-table").innerHTML =
    `<tr><th>Département</th><th>Offres ${EN()}</th><th>dont publiées par l'entreprise</th><th>Offres d'écoles${E.e === "1" ? "" : " (masquées)"}</th><th>Entreprises « susceptibles de recruter » (LBA)</th><th></th></tr>` +
    lignes.map(l => `<tr${E.z === "dep:" + l.d ? ' style="background:#eef3ff"' : ""}><td>${esc(libDep(l.d))}</td><td class="n"><b>${nb(l.n)}</b></td><td class="n">${nb(l.ent)}</td><td class="n">${nb(l.ec)}</td><td class="n">${RECS.length ? nb(l.rec) : "—"}</td><td><button class="lien-ent lien-dep" data-dep="${l.d}">voir ce département</button></td></tr>`).join("") +
    `<tr><td><b>Total ${esc(REG.nom)}</b></td><td class="n"><b>${nb(tot("n"))}</b></td><td class="n">${nb(tot("ent"))}</td><td class="n">${nb(tot("ec"))}</td><td class="n">${RECS.length ? nb(tot("rec")) : "—"}</td><td></td></tr>`;
  document.querySelectorAll("#region-table [data-dep]").forEach(b => b.addEventListener("click", () => {
    E.z = "dep:" + b.dataset.dep; synchroniserFiltres(); rendre(); document.getElementById("chiffres").scrollIntoView({ behavior: "smooth" });
  }));

  // D'où viennent les offres de la région, et jusqu'où chaque source a été interrogée.
  const parSrc = k => offres.filter(o => (o.srcs || [o.src]).includes(k)).length;
  const srcOk = k => D.qualite.sources.some(s => s.source === k && s.n > 0);
  document.getElementById("region-couverture").innerHTML = `<b>Couverture de la région.</b> `
    + `France Travail : toutes les offres de chaque métier, France entière (${nb(parSrc("FT"))} ici). `
    + (srcOk("LBA") ? `La bonne alternance : recherche nationale, plus une recherche autour de ${REG.centres.length} villes (${esc(REG.centres.join(", "))}) dans un rayon de ${REG.rayon_km} km (${nb(parSrc("LBA"))} ici). ` : "La bonne alternance : pas de clé, non interrogée. ")
    + (srcOk("ADZ") ? `Adzuna : recherche nationale, plus une recherche dédiée à la région (${nb(parSrc("ADZ"))} ici). ` : "Adzuna : pas de clé, non interrogé. ")
    + `Une même offre vue dans plusieurs sources n'est comptée qu'une fois.`;

  const N = tot("n");
  const tri = lignes.slice().sort((a, b) => b.n - a.n);
  barres("g-region", tri.map(l => libDep(l.d)), tri.map(l => l.n), { total: N });
  const vides = lignes.filter(l => !l.n);
  const l63 = lignes.find(l => l.d === "63");
  lecture("l-region", N ? `<b>${nb(N)} offres</b> ${EN()} en ${esc(REG.nom)} pour ${esc(libelleMetier(E.m))}. <b>${esc(libDep(tri[0].d))}</b> en concentre ${pct(tri[0].n, N)} % (${nb(tri[0].n)}).`
    + (l63 && tri[0].d !== "63" ? ` Le Puy-de-Dôme en compte ${nb(l63.n)} (${pct(l63.n, N)} %).` : "")
    + (vides.length ? ` ${vides.length} département${s(vides.length)} n'en ${vides.length > 1 ? "ont" : "a"} aucune (${esc(vides.map(l => libDep(l.d)).join(", "))}) : là, les entreprises à démarcher sont la meilleure piste.` : "")
    : `aucune offre en ${esc(REG.nom)} pour ce choix${E.e !== "1" && tot("ec") ? ` (hors ${nb(tot("ec"))} offres d'écoles masquées)` : ""}.`);

  const villes = compter(offres, o => villeSimple(o.ville) || null).slice(0, 12);
  barres("g-region-villes", villes.map(x => x[0]), villes.map(x => x[1]), { total: N });
  lecture("l-region-villes", villes.length ? `<b>${esc(villes[0][0])}</b> arrive en tête avec ${pluriel(villes[0][1], "offre")} (${pct(villes[0][1], N)} % de la région)${villes[1] ? `, devant ${esc(villes[1][0])} (${nb(villes[1][1])})` : ""}.` : "");
}

/* ---- Entreprises « susceptibles de recruter » (La bonne alternance) ---- */
let recN = 30, recSel = [];
const sirenDe = r => /^\d{14}$/.test(r.siret) ? r.siret.slice(0, 9) : "";
function rendreRecruteursLBA() {
  const liste = document.getElementById("r-liste");
  document.querySelectorAll(".nom-region").forEach(e => { e.textContent = REG ? REG.nom : "la région"; });
  if (!RECS.length) { liste.innerHTML = `<p class="note">Pas encore de données : il faut une clé La bonne alternance dans <code>.env</code> (LBA_API_KEY), puis relancer <code>mettre-a-jour-alternance.cmd</code>.</p>`; return; }
  const horsRegion = E.z && !(E.z === "reg:" + REG.nom || (E.z.startsWith("dep:") && REG.deps.includes(E.z.slice(4))));
  if (horsRegion) { recSel = []; liste.innerHTML = `<p class="note">Cette liste ne couvre que ${esc(REG.nom)} : choisissez « France », la région ou un de ses départements dans la zone.</p>`;
    document.getElementById("r-titre").textContent = ""; document.getElementById("r-plus").hidden = document.getElementById("r-csv").hidden = true; return; }
  let codes = codesChoisis(), remplacement = "";
  const dep = E.z.startsWith("dep:") ? E.z.slice(4) : null;
  const sirens = new Set(D.offres.map(o => o.siren).filter(Boolean));
  // La bonne alternance ne connaît pas tous les codes métier (ex. M1620) : on se rabat alors sur le groupe, en le disant.
  if (!RECS.some(r => r.romes.some(c => codes.includes(c))) && E.m.length === 5 && METIER[E.m]) {
    const g = METIER[E.m].groupe;
    codes = D.metiers.filter(m => m.groupe === g).map(m => m.code);
    remplacement = `La bonne alternance ne propose aucune entreprise pour le code ${E.m} : voici celles des autres métiers du groupe ${g}.`;
  }
  recSel = RECS.filter(r => r.romes.some(c => codes.includes(c)) && (!dep || r.dep === dep))
    .map(r => ({ ...r, communs: r.romes.filter(c => codes.includes(c)).length, offre: sirens.has(sirenDe(r)) }))
    .sort((a, b) => b.offre - a.offre || b.communs - a.communs || a.nom.localeCompare(b.nom, "fr"));
  document.getElementById("r-titre").textContent = `— ${nb(recSel.length)} entreprise${s(recSel.length)} ${dep ? "en " + libDep(dep) : "dans la région"}, pour ${libelleMetier(E.m)}`;
  liste.innerHTML = (remplacement ? `<p class="vide" style="margin:0 0 8px">${esc(remplacement)}</p>` : "") + recSel.slice(0, recN).map(r => {
    const sir = sirenDe(r);
    const metiers = r.romes.filter(c => codes.includes(c)).map(c => (METIER[c] || {}).libelle || c);
    return `<div class="item"><div class="titre">${sir ? `<a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${sir}" target="_blank" rel="noopener">${esc(r.nom)}</a>` : esc(r.nom)}
        ${r.offre ? `<span class="badge ok">a aussi une offre en base</span>` : ""}</div>
      <div class="meta">${esc(r.secteur || r.naf || "activité non précisée")} · ${esc(r.eff ? r.eff + " salariés" : "taille non précisée")} · ${esc(r.adresse)}
        <span class="badge" title="${esc(metiers.join(", "))}">${metiers.length > 2 ? esc(metiers.slice(0, 2).join(", ")) + ` +${metiers.length - 2}` : esc(metiers.join(", "))}</span></div></div>`;
  }).join("") || `<p class="note">Aucune entreprise repérée par La bonne alternance pour ce choix.</p>`;
  document.getElementById("r-plus").hidden = recN >= recSel.length;
  document.getElementById("r-csv").hidden = !recSel.length;
}

/* ---- Quel métier viser ---- */
function rendreMetiers(zoneOk) {
  const par = compter(zoneOk, o => o.rome);
  const lignes = D.metiers.map(m => ({ m, n: (par.find(x => x[0] === m.code) || [0, 0])[1] })).sort((a, b) => b.n - a.n);
  const choisi = o => passeMetier({ rome: o.m.code }, E.m);
  const coul = lignes.map(l => { const c = COUL_GROUPE[l.m.groupe] || "#0a5cff"; return E.m === "*" || choisi(l) ? c : c + "40"; });
  const total = zoneOk.length;
  barres("g-metiers", lignes.map(l => `${l.m.libelle} (${l.m.code})`), lignes.map(l => l.n), { couleurs: coul, total,
    onClick: i => { E.m = lignes[i].m.code; document.getElementById("f-metier").value = E.m; rendre(); } });
  G["g-metiers"].options.plugins.tooltip.callbacks.afterLabel = c => { const m = lignes[c.dataIndex].m;
    return m.total_ft ? `Au niveau national, ${pct(m.alt_ft, m.total_ft)} % des offres France Travail de ce métier sont en alternance (${m.alt_ft} sur ${m.total_ft}).` : ""; };
  G["g-metiers"].update();
  const top = lignes[0];
  const nSel = lignes.filter(choisi).reduce((a, l) => a + l.n, 0);
  const ftSel = D.metiers.filter(m => passeMetier({ rome: m.code }, E.m));
  const altFt = ftSel.reduce((a, m) => a + m.alt_ft, 0), totFt = ftSel.reduce((a, m) => a + m.total_ft, 0);
  lecture("l-metiers", total ? `avec ces filtres (${esc(libelleZone(E.z))}), <b>${esc(top.m.libelle)}</b> compte le plus d'offres ${EN()} : ${pluriel(top.n, "offre")}, soit ${pct(top.n, total)} % des ${nb(total)}.`
    + (E.m !== "*" ? ` Votre choix, ${esc(libelleMetier(E.m))}, en réunit ${nb(nSel)} (${pct(nSel, total)} %).` : "")
    + (totFt && E.c === "alternance" ? ` Au niveau national, ${pct(altFt, totFt)} % des offres France Travail de ce choix sont des alternances (${nb(altFt)} sur ${nb(totFt)}).` : "") : "");
}

/* ---- Chiffres-clés ---- */
function rendreChiffres(sel) {
  const N = sel.length;
  const avecSal = sel.filter(o => o.smin != null);
  const ecoles = sel.filter(o => o.ecole).length;
  const appr = sel.filter(o => o.type === "apprentissage").length, pro = sel.filter(o => o.type === "professionnalisation").length;
  const recentes = sel.filter(o => { const a = age(o); return a != null && a < 30; }).length;
  const employeurs = new Set(sel.map(o => norm(o.ent)).filter(Boolean)).size;
  const fusion = sel.reduce((a, o) => a + (o.annonces > 1 ? o.annonces - 1 : 0), 0);
  const tuiles = [
    [nb(N), `offres ${EN()}` + (fusion ? ` (${fusion} republications comptées une fois)` : "")],
    [nb(sel.filter(o => o.dep === "63").length), "dans le Puy-de-Dôme"],
    [nb(sel.filter(o => o.reg === AURA).length), "en Auvergne-Rhône-Alpes"],
    [nb(sel.filter(o => o.reg === IDF).length), "en Île-de-France"],
    E.e === "1" ? [pct(ecoles, N) + " %", `publiées par des écoles (${nb(ecoles)})`]
                : [nb(ecolesMasquees(sel)), "offres d'écoles masquées (case « Afficher aussi… »)"],
    E.c === "stage"
      ? (() => { const dk = sel.filter(o => o.duree != null); const six = dk.filter(o => o.duree >= 5 && o.duree <= 6).length;
          return [dk.length ? pct(six, dk.length) + " %" : "—", `des stages de durée connue font 5 à 6 mois (${nb(dk.length)} durées connues sur ${nb(N)})`]; })()
      : [`${pct(appr, N)} % / ${pct(pro, N)} %`, "apprentissage / professionnalisation" + (E.c === "tous" ? ` (${pct(sel.filter(o => o.contrat === "stage").length, N)} % de stages)` : "")],
    [avecSal.length ? euro(mediane(avecSal.map(o => o.smin))) : "—", `brut mensuel médian affiché (${avecSal.length} offre${s(avecSal.length)} sur ${N})`],
    [nb(employeurs), "employeurs différents"],
    [pct(recentes, N) + " %", `publiées il y a moins de 30 jours (${recentes})`],
  ];
  document.getElementById("chiffres").innerHTML = tuiles.map(([v, l]) => `<div class="chiffre"><b>${v}</b><span>${esc(l)}</span></div>`).join("");
}

/* ---- Carte ---- */
function rendreCarte(sel) {
  calque.clearLayers();
  let places = 0;
  for (const o of sel) {
    if (o.lat == null) continue;
    places++;
    const m = L.circleMarker([o.lat, o.lon], { radius: 6, color: "#fff", weight: 1, fillColor: COUL_PUBLIE[o.publie_par] || "#0a5cff", fillOpacity: o.prec === "departement" ? .45 : .9 });
    m.bindPopup(`<b>${esc(o.titre)}</b>${esc(o.ent || "employeur non précisé")} · ${esc(o.lieu)}<br>${esc(o.type)}${o.smin ? " · " + euro(o.smin) + " brut/mois" : ""}<br><span style="color:#888">${esc(o.publie_par)} · ${esc(SOURCES[o.src])}${o.prec !== "offre" ? " · position : " + o.prec : ""}</span>`, { closeButton: false });
    m.on("mouseover", function () { this.openPopup(); });
    m.on("mouseout", function () { this.closePopup(); });
    if (o.url) m.on("click", () => window.open(o.url, "_blank", "noopener"));
    calque.addLayer(m);
  }
  document.getElementById("note-carte").textContent = `${places} offres placées, ${sel.length - places} sans lieu précis. Point pâle : placé au centre du département. Survol = l'offre, clic = l'annonce.`;
}

/* ---- Lieux ---- */
function rendreLieux(sel) {
  const N = sel.length;
  let titre, par;
  if (E.z.startsWith("dep:")) { titre = "Par ville"; par = compter(sel, o => o.ville || null); }
  else if (E.z.startsWith("reg:")) { titre = "Par département"; par = compter(sel, o => o.dep ? libDep(o.dep) : null); }
  else { titre = "Par région"; par = compter(sel, o => o.reg || null); }
  par = par.slice(0, 14);
  document.getElementById("t-lieux").textContent = titre;
  barres("g-lieux", par.map(x => x[0]), par.map(x => x[1]), { total: N });
  const sansLieu = sel.filter(o => !o.dep).length;
  lecture("l-lieux", par.length ? `<b>${esc(par[0][0])}</b> concentre ${pct(par[0][1], N)} % des offres (${nb(par[0][1])} sur ${nb(N)})`
    + (!E.z ? `, le Puy-de-Dôme en compte ${nb(sel.filter(o => o.dep === "63").length)}.` : ".")
    + (sansLieu ? ` ${pluriel(sansLieu, "offre")} sans lieu précis n'apparaissent pas.` : "") : "");
}

/* ---- Série ---- */
function rendreSerie() {
  const codes = D.metiers.filter(m => passeMetier({ rome: m.code }, E.m)).map(m => m.code);
  const serie = D.serie || [];
  const vals = serie.map(j => codes.reduce((a, c) => a + ((j.alt || {})[c] || 0), 0));
  const tots = serie.map(j => codes.reduce((a, c) => a + ((j.tot || {})[c] || 0), 0));
  graph("g-serie", "line", { labels: serie.map(j => dateFr(j.date).slice(0, 5)),
    datasets: [{ data: vals, borderColor: "#0a5cff", backgroundColor: "rgba(10,92,255,.12)", fill: true, tension: .25, pointRadius: 4 }] },
    { plugins: { tooltip: { callbacks: { label: c => `${c.parsed.y} offres en alternance sur ${tots[c.dataIndex]} (${pct(c.parsed.y, tots[c.dataIndex])} %)` } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "offres actives" } }, x: { grid: { display: false } } } });
  if (E.c === "stage") lecture("l-serie", "cette série suit les offres en <b>alternance</b> de France Travail (la base du cours ne contient pas de stages) : elle ne change pas avec le choix « Stage ».");
  else if (vals.length >= 2) {
    const d = vals.at(-1) - vals[0];
    lecture("l-serie", `le ${dateFr(serie.at(-1).date)}, ${nb(vals.at(-1))} offres en alternance sur France Travail pour ce choix (France entière, avant dédoublonnage), contre ${nb(vals[0])} le ${dateFr(serie[0].date)} (${d >= 0 ? "+" : ""}${d}). Elles pèsent ${pct(vals.at(-1), tots.at(-1))} % des offres du métier.`);
  } else lecture("l-serie", "");
}

/* ---- Contrat ---- */
function rendreContrat(sel) {
  const N = sel.length;
  if (E.c === "stage") {
    // Pour les stages, ce graphique montre la durée (lue dans l'annonce).
    document.getElementById("t-type").textContent = "Durée du stage";
    const v = DUREES.map(k => sel.filter(o => (o.duree_classe || DUREES.at(-1)) === k).length);
    anneau("g-type", DUREES, v, ["#a7c9ff", "#5f9bf5", "#0a5cff", "#123a7a", "#c7c7cc"]);
    const connus = N - v.at(-1), iMax = v.slice(0, -1).indexOf(Math.max(...v.slice(0, -1)));
    lecture("l-type", connus ? `quand l'annonce donne la durée (${pct(connus, N)} % des stages), c'est le plus souvent <b>${DUREES[iMax]}</b> : ${pct(v[iMax], connus)} % (${nb(v[iMax])} sur ${nb(connus)}). La durée est lue dans le titre et le texte (« 6 mois », « 4 à 6 mois ») : la plus longue est retenue.` : N ? "aucune annonce de la sélection ne précise la durée." : "");
  } else {
    document.getElementById("t-type").textContent = E.c === "tous" ? "Alternance ou stage" : "Apprentissage ou professionnalisation";
    const cats = E.c === "tous" ? [...TYPES, "stage"] : TYPES;
    const t = cats.map(k => sel.filter(o => o.type === k).length);
    anneau("g-type", cats.map(k => k[0].toUpperCase() + k.slice(1)), t, cats.map(k => COUL_TYPE[k] || "#ff6a00"));
    lecture("l-type", N ? `${pct(t[0], N)} % des offres sont en apprentissage (${nb(t[0])} sur ${nb(N)}) et ${pct(t[1], N)} % en contrat de professionnalisation (${nb(t[1])})`
      + (E.c === "tous" ? ` ; ${pct(t[3], N)} % sont des stages (${nb(t[3])}).` : ".") : "");
  }

  const dipl = [...D.diplomes, "Non précisé"];
  const vd = dipl.map(k => sel.filter(o => (o.diplome || "Non précisé") === k).length);
  barres("g-diplome", dipl, vd, { horizontal: false, total: N, couleurs: dipl.map(k => k === "Non précisé" ? "#c7c7cc" : "#0a5cff") });
  const connus = N - vd.at(-1);
  const iMax = vd.slice(0, -1).indexOf(Math.max(...vd.slice(0, -1)));
  const texte = sel.filter(o => o.dipl_src === "texte").length;
  lecture("l-diplome", connus ? `${connus > 1 ? `parmi les ${nb(connus)} offres qui citent un diplôme, ${pct(vd[iMax], connus)} % visent` : "la seule offre qui cite un diplôme vise"} un <b>${dipl[iMax]}</b> (${pluriel(vd[iMax], "offre")}). ${pct(vd.at(-1), N)} % des annonces n'en citent aucun. Le niveau est le plus souvent lu dans le texte (${pluriel(texte, "offre")}) : c'est le plus haut diplôme mentionné.` : N ? "aucune annonce de la sélection ne cite de diplôme." : "");

  const avec = sel.filter(o => o.smin != null);
  const tr = [["< 600 €", 0, 600], ["600–899 €", 600, 900], ["900–1 199 €", 900, 1200], ["1 200–1 499 €", 1200, 1500], ["1 500–1 799 €", 1500, 1800], ["1 800 € et plus", 1800, 1e9]];
  barres("g-salaire", tr.map(x => x[0]), tr.map(([, a, b]) => avec.filter(o => o.smin >= a && o.smin < b).length), { horizontal: false, total: avec.length });
  const corr = avec.filter(o => o.sal_etat === "corrigé").length;
  lecture("l-salaire", avec.length ? `${nb(avec.length)} offres sur ${nb(N)} (${pct(avec.length, N)} %) affichent une rémunération. Le minimum médian est de <b>${euro(mediane(avec.map(o => o.smin)))} brut par mois</b>, le maximum médian de ${euro(mediane(avec.map(o => o.smax)))}.`
    + (corr ? ` ${nb(corr)} montants saisis par erreur en « annuel » ont été lus comme mensuels.` : "") + (E.c === "stage" ? " Un stage de plus de 2 mois doit obligatoirement être gratifié (montant minimum fixé par la loi)." : " Pour un apprenti, le minimum légal dépend de l'âge et de l'année de contrat.") : "aucune offre de la sélection n'affiche de rémunération.");

  const ta = [["< 7 jours", 0, 7], ["7–29 j", 7, 30], ["30–59 j", 30, 60], ["60–89 j", 60, 90], ["90 j et plus", 90, 1e9]];
  const va = ta.map(([, a, b]) => sel.filter(o => { const x = age(o); return x != null && x >= a && x < b; }).length);
  barres("g-age", ta.map(x => x[0]), va, { horizontal: false, total: N, couleurs: ["#0a5cff", "#0a5cff", "#5f9bf5", "#a7c9ff", "#c7c7cc"] });
  lecture("l-age", N ? `${pct(va[0] + va[1], N)} % des offres ont moins de 30 jours ; ${pct(va[4], N)} % ont plus de 90 jours (${nb(va[4])}) : à vérifier avant de postuler, le poste est peut-être pourvu.` : "");
}

/* ---- Qui recrute ---- */
function rendreRecruteurs(sel) {
  const N = sel.length;
  const cats = Object.keys(COUL_PUBLIE);
  const vp = cats.map(k => sel.filter(o => o.publie_par === k).length);
  anneau("g-publie", cats, vp, cats.map(k => COUL_PUBLIE[k]));
  lecture("l-publie", !N ? "" : (vp[1] ? `${pct(vp[1], N)} % des offres sont publiées par des écoles ou organismes de formation (${nb(vp[1])} sur ${nb(N)}) : elles cherchent des élèves autant que des alternants. ` : (E.e !== "1" ? `les offres d'écoles sont masquées (${nb(ecolesMasquees())} dans cette sélection) : cochez « Afficher aussi les offres publiées par des écoles » pour les voir. ` : "aucune offre de la sélection n'est publiée par une école. "))
    + `${pct(vp[0], N)} % viennent directement d'une entreprise (${nb(vp[0])})${vp[3] ? `, ${pct(vp[3], N)} % n'indiquent pas l'employeur` : ""}.`);

  const cl = [...D.classes_effectif, "Inconnue"];
  const vt = cl.map(k => sel.filter(o => (o.eff || "Inconnue") === k).length);
  barres("g-taille", cl.map(k => k === "Inconnue" ? k : k + " salariés"), vt, { horizontal: false, total: N, couleurs: cl.map(k => k === "Inconnue" ? "#c7c7cc" : "#0a5cff") });
  const connus = N - vt.at(-1), petites = vt[0] + vt[1] + vt[2];
  lecture("l-taille", connus ? `parmi les ${nb(connus)} offres dont l'employeur a une taille connue, ${pct(petites, connus)} % viennent de structures de moins de 50 salariés et ${pct(vt[4] + vt[5], connus)} % de 250 salariés et plus. Taille de l'unité légale (SIRENE), ou tranche de l'établissement donnée par France Travail.` : "taille inconnue pour toutes les offres de la sélection.");

  const sec = compter(sel, o => o.section ? D.sections[o.section] : null).slice(0, 10);
  const sansSec = sel.filter(o => !o.section).length;
  barres("g-secteurs", sec.map(x => x[0]), sec.map(x => x[1]), { total: N });
  lecture("l-secteurs", sec.length ? `le premier secteur est <b>${esc(sec[0][0])}</b> : ${pluriel(sec[0][1], "offre")}, ${pct(sec[0][1], N - sansSec)} % de celles dont le secteur est connu (${pct(sansSec, N)} % ne le sont pas).` : "");

  const emp = compter(sel, o => o.ent || null).slice(0, 12);
  const estEcole = nom => sel.some(o => o.ent === nom && o.ecole);
  barres("g-employeurs", emp.map(x => x[0] + (estEcole(x[0]) ? " (école)" : "")), emp.map(x => x[1]), { total: N, couleurs: emp.map(x => estEcole(x[0]) ? "#ff6a00" : "#0a5cff") });
  lecture("l-employeurs", emp.length ? `le premier employeur, <b>${esc(emp[0][0])}</b>${estEcole(emp[0][0]) ? " (une école)" : ""}, publie ${pluriel(emp[0][1], "offre")}, soit ${pct(emp[0][1], N)} % de la sélection.` + (emp.length > 2 ? ` Les ${Math.min(12, emp.length)} premiers en publient ${pct(emp.reduce((a, x) => a + x[1], 0), N)} %.` : "") : "");
}

/* ---- Outils ---- */
function rendreOutils(sel) {
  const N = sel.length;
  const par = D.outils.map(nom => [nom, sel.filter(o => (o.outils || []).includes(nom)).length]).sort((a, b) => b[1] - a[1]);
  barres("g-outils", par.map(x => x[0]), par.map(x => pct(x[1], N)), { pourcent: true });
  const aucun = sel.filter(o => !(o.outils || []).length).length;
  lecture("l-outils", N ? `<b>${esc(par[0][0])}</b> est cité dans ${pct(par[0][1], N)} % des offres (${nb(par[0][1])}), ${esc(par[1][0])} dans ${pct(par[1][1], N)} %, ${esc(par[2][0])} dans ${pct(par[2][1], N)} %. ${pct(aucun, N)} % des annonces ne citent aucun outil de la grille (config/alternance.json).` : "");
}

/* ---- Liste des offres ---- */
let selCourante = [];
function rendreListe(sel) {
  selCourante = sel;
  const t = [...sel];
  if (E.tri === "salaire") t.sort((a, b) => (b.smin || -1) - (a.smin || -1));
  else if (E.tri === "lieu") t.sort((a, b) => String(a.dep).localeCompare(String(b.dep)) || String(b.date).localeCompare(String(a.date)));
  else t.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  document.getElementById("nb-liste").textContent = `— ${Math.min(listeN, t.length)} sur ${nb(t.length)}`;
  document.getElementById("liste").innerHTML = t.slice(0, listeN).map((o, i) => {
    const a = age(o);
    const badges = [
      `<span class="badge src" title="${esc(o.via)}">${esc(SOURCES[o.src])}${o.src === "FT" && o.via !== "France Travail" ? " via " + esc(court(o.via, 24)) : ""}</span>`,
      o.ecole ? `<span class="badge ecole">école</span>` : "",
      o.interim ? `<span class="badge interim">intérim / cabinet</span>` : "",
      o.annonces > 1 ? `<span class="badge" title="La même annonce a été publiée ${o.annonces} fois ; elle n'est comptée qu'une fois.">publiée ${o.annonces} fois</span>` : "",
      o.rome_deduit ? `<span class="badge" title="Métier déduit des mots-clés de la recherche">métier déduit</span>` : "",
    ].join(" ");
    return `<div class="item"><div class="titre">${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.titre)}</a>` : esc(o.titre)}</div>
      <div class="meta">${o.ent ? `<button class="lien-ent" data-i="${i}">${esc(o.ent)}</button>` : "employeur non précisé"} · ${esc(o.lieu || "lieu non précisé")} · ${esc(o.type)}${o.diplome ? " · " + esc(o.diplome) : ""}${o.duree ? ` · ${o.duree} mois` : ""}${o.smin ? ` · <span class="sal">${euro(o.smin)}${o.smax > o.smin ? " à " + euro(o.smax) : ""} brut/mois</span>` : ""} · publiée le ${dateFr(o.date)}${a != null ? ` (${a} j)` : ""} ${badges}</div></div>`;
  }).join("");
  document.getElementById("liste").querySelectorAll(".lien-ent").forEach(b => b.addEventListener("click", () => ficheEmployeur(t[Number(b.dataset.i)])));
  document.getElementById("b-plus").hidden = listeN >= t.length;
}

/* ============================================================
   6) EN DIRECT : API Recherche d'entreprises
   ============================================================ */
const API_ENT = "https://recherche-entreprises.api.gouv.fr/search";
/* L'API accepte 7 appels par seconde : au-delà elle répond 429. On patiente et on réessaie. */
async function appelApi(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.status !== 429) {
      if (!r.ok) throw new Error(`l'API répond ${r.status}`);
      return r.json();
    }
    await new Promise(ok => setTimeout(ok, 1200 * (i + 1)));
  }
  throw new Error("l'API est saturée (trop de demandes), réessayez dans une minute");
}
async function ficheEmployeur(o) {
  const dlg = document.getElementById("fiche"), corps = document.getElementById("fiche-corps");
  corps.innerHTML = `<h3 style="margin:0">${esc(o.ent)}</h3><p class="note">Interrogation de l'API Recherche d'entreprises…</p>`;
  dlg.showModal();
  const nOffres = D.offres.filter(x => norm(x.ent) === norm(o.ent)).length;
  try {
    const q = o.siren || o.ent;
    const e = ((await appelApi(`${API_ENT}?q=${encodeURIComponent(q)}&per_page=1${!o.siren && o.dep && !o.dep.startsWith("97") ? "&departement=" + o.dep : ""}`)).results || [])[0];
    if (!e) { corps.innerHTML += `<p>Aucune entreprise trouvée sous ce nom dans le répertoire SIRENE. ${nOffres} offre${s(nOffres)} en base.</p>`; return; }
    const siege = e.siege || {}, comp = e.complements || {};
    const fiab = o.siren ? (o.match >= 1 ? `<span class="badge ok">correspondance exacte du nom</span>` : `<span class="badge">correspondance approchée (score ${o.match})</span>`) : `<span class="badge">recherche par nom, à vérifier</span>`;
    corps.innerHTML = `<h3 style="margin:0 0 6px">${esc(e.nom_complet)}</h3>${fiab}
      <dl class="fiche">
        <dt>Nom dans l'annonce</dt><dd>${esc(o.ent)}</dd>
        <dt>SIREN</dt><dd>${esc(e.siren)}</dd>
        <dt>Activité</dt><dd>${esc(e.activite_principale || "—")} · ${esc(sectionLib(e.activite_principale) || "")}</dd>
        <dt>Effectif</dt><dd>${esc(EFFECTIFS[e.tranche_effectif_salarie] || "Non renseigné")}${e.annee_tranche_effectif_salarie ? " (" + esc(e.annee_tranche_effectif_salarie) + ")" : ""}</dd>
        <dt>Catégorie</dt><dd>${esc(e.categorie_entreprise || "—")}</dd>
        <dt>Créée le</dt><dd>${dateFr(e.date_creation)}</dd>
        <dt>Siège</dt><dd>${esc(siege.adresse || "—")}</dd>
        <dt>Établissements ouverts</dt><dd>${nb(e.nombre_etablissements_ouverts)}</dd>
        <dt>Organisme de formation</dt><dd>${comp.est_organisme_formation ? "oui" : "non"}${String(e.activite_principale || "").startsWith("85") ? " — activité d'enseignement (NAF 85)" : ""}</dd>
        <dt>Offres en base</dt><dd>${nOffres}</dd>
      </dl>
      <p><a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${esc(e.siren)}" target="_blank" rel="noopener">Fiche complète sur l'Annuaire des entreprises →</a></p>`;
  } catch (err) {
    corps.innerHTML += `<p class="non">Fiche indisponible : ${esc(err.message === "Failed to fetch" ? "pas de connexion internet" : err.message)}.</p>`;
  }
}

/* ---- Entreprises à démarcher ---- */
const EP = { page: 1, total: 0, lignes: [] };
function nafDuChoix() {
  const groupes = E.m === "*" ? Object.keys(D.naf_par_groupe) : E.m.startsWith("g:") ? [E.m.slice(2)] : [(METIER[E.m] || {}).groupe];
  return [...new Set(groupes.flatMap(g => D.naf_par_groupe[g] || []))];
}
async function chercherEntreprises(page = 1) {
  const dep = document.getElementById("e-dep").value.trim().toUpperCase();
  const toutes = document.getElementById("e-toutes").checked;
  const naf = nafDuChoix();
  const liste = document.getElementById("e-liste");
  if (!/^(\d{2,3}|2A|2B)$/.test(dep)) { liste.innerHTML = `<p class="non">Département invalide : tapez un code comme 63, 69 ou 2A.</p>`; return; }
  if (page === 1) { EP.lignes = []; liste.innerHTML = `<p class="note">Recherche en cours…</p>`; }
  document.getElementById("e-naf").textContent = toutes ? `Toutes activités, département ${dep}.` : `Activités retenues pour ${libelleMetier(E.m)} (config/alternance.json) : ${naf.join(", ")}.`;
  const p = new URLSearchParams({ departement: dep, etat_administratif: "A", tranche_effectif_salarie: document.getElementById("e-taille").value, per_page: "25", page: String(page) });
  if (!toutes) p.set("activite_principale", naf.join(","));
  try {
    const d = await appelApi(`${API_ENT}?${p}`);
    EP.page = page; EP.total = d.total_results || 0;
    const sirensOffres = new Set(D.offres.map(o => o.siren).filter(Boolean));
    for (const e of d.results || []) {
      const et = (e.matching_etablissements || []).find(x => String(x.commune || "").startsWith(dep)) || (e.matching_etablissements || [])[0] || e.siege || {};
      // Le filtre d'activité porte sur l'entreprise : on affiche donc SON code NAF, pas celui de l'établissement local.
      EP.lignes.push({ siren: e.siren, nom: e.nom_complet, naf: e.activite_principale || et.activite_principale, eff: EFFECTIFS[et.tranche_effectif_salarie || e.tranche_effectif_salarie] || "Non renseigné",
        eff_ul: EFFECTIFS[e.tranche_effectif_salarie] || "", adresse: et.adresse || "", commune: et.libelle_commune || "", offre: sirensOffres.has(e.siren) });
    }
    liste.innerHTML = `<p class="note" style="margin:0">${nb(EP.total)} entreprise${s(EP.total)} trouvée${s(EP.total)} ; ${EP.lignes.length} affichée${s(EP.lignes.length)}.</p>` + EP.lignes.map(x =>
      `<div class="item"><div class="titre"><a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${esc(x.siren)}" target="_blank" rel="noopener">${esc(x.nom)}</a> ${x.offre ? `<span class="badge ok">a une offre en alternance en base</span>` : ""}</div>
       <div class="meta">${esc(x.naf)} · ${esc(sectionLib(x.naf) || "")} · établissement : ${esc(x.eff)}${x.eff_ul && x.eff_ul !== x.eff ? ` (entreprise : ${esc(x.eff_ul)})` : ""} · ${esc(x.adresse)}</div></div>`).join("");
    document.getElementById("e-plus").hidden = EP.lignes.length >= EP.total;
    document.getElementById("e-csv").hidden = !EP.lignes.length;
  } catch (err) {
    liste.innerHTML = `<p class="non">Recherche indisponible : ${esc(err.message === "Failed to fetch" ? "pas de connexion internet" : err.message)}. Le bouton « Chercher » relance.</p>`;
  }
}

/* ============================================================
   7) EXPORTS
   ============================================================ */
function telecharger(nom, lignes) {
  const csv = "﻿" + lignes.map(l => l.map(v => { const t = String(v == null ? "" : v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exporterOffres() {
  const t = [["offre", "source", "via", "code_rome", "metier", "intitule", "entreprise", "siren", "publie_par", "ville", "departement", "region", "type_contrat", "diplome", "duree_mois", "salaire_min_brut_mensuel", "salaire_max_brut_mensuel", "date_publication", "age_jours", "outils", "lien"]];
  for (const o of selCourante) t.push([o.contrat || "alternance", SOURCES[o.src], o.via, o.rome, (METIER[o.rome] || {}).libelle, o.titre, o.ent, o.siren || "", o.publie_par, o.ville, o.dep, o.reg, o.type, o.diplome || "", o.duree || "", o.smin || "", o.smax || "", o.date, age(o), (o.outils || []).join(", "), o.url]);
  telecharger(`${E.c}_${E.m.replace(/[^\w]/g, "")}_${(E.z || "france").replace(/[^\w]/g, "")}_${D.date}.csv`, t);
}

/* ============================================================
   8) FIABILITÉ
   ============================================================ */
function rendreQualite() {
  const q = D.qualite;
  document.getElementById("q-sources").innerHTML = `<table class="q"><tr><th>Source</th><th>Offres</th><th>État</th></tr>` +
    q.sources.map(x => `<tr><td>${esc(x.source)}</td><td class="n">${nb(x.n)}</td><td>${esc(x.statut)}</td></tr>`).join("") + `</table>
    <p class="note">France Travail relaie déjà plusieurs sites partenaires : ${esc(compter(D.offres.filter(o => o.src === "FT"), o => o.via).slice(0, 6).map(([v, n]) => `${v} (${n})`).join(", "))}.</p>`;
  document.getElementById("q-controles").innerHTML = `<table class="q">` +
    q.controles.map(c => `<tr><td class="${c.ok ? "oui" : "non"}">${c.ok ? "✓" : "✗"}</td><td><b>${esc(c.nom)}</b><br><span class="note">${esc(c.detail)}</span></td></tr>`).join("") + `</table>`;
  const sal = q.salaire || {}, pos = q.positions || {}, dip = q.diplome || {};
  const lignes = [
    ["Offres lues, toutes sources", q.brutes],
    ["Doublons exacts retirés (même identifiant, vu dans deux sources)", q.doublons_meme_id],
    ["Annonces republiées fusionnées (même intitulé, même employeur, même ville)", q.doublons_proches],
    ["Offres retenues", q.retenues],
    ["Employeurs reliés au répertoire SIRENE (API Recherche d'entreprises)", `${nb(q.entreprises.offres_identifiees)} offres (${pct(q.entreprises.offres_identifiees, q.retenues)} %), ${nb(q.entreprises.noms_distincts)} noms cherchés`],
    ["Correspondances rejetées : homonyme dont l'activité ne colle pas avec celle donnée par l'offre", q.entreprises.homonymes_rejetes || 0],
    ["Offres publiées par une école ou un organisme de formation (NAF 85 ou nom)", q.ecoles],
    ["Offres publiées par l'intérim ou un cabinet (NAF 78 ou nom)", q.interim],
    ["Offres sans employeur nommé", q.sans_entreprise],
    ["Salaire : affiché et plausible / corrigé (mensuel saisi en « annuel ») / rejeté / absent", `${nb(sal.ok || 0)} / ${nb(sal["corrigé"] || 0)} / ${nb(sal["rejeté"] || 0)} / ${nb(sal.absent || 0)}`],
    ["Diplôme : donné par un champ / lu dans le texte / inconnu", `${nb(dip.champ || 0)} / ${nb(dip.texte || 0)} / ${nb(dip.inconnu || 0)}`],
    ["Position : exacte / centre de la commune / centre du département / aucune", `${nb(pos.offre || 0)} / ${nb(pos.commune || 0)} / ${nb(pos.departement || 0)} / ${nb(pos.aucune || 0)}`],
    ["Offres de plus de 90 jours", q.anciennes_90j],
  ];
  document.getElementById("q-nettoyage").innerHTML = `<table class="q">` + lignes.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="n">${typeof b === "number" ? nb(b) : esc(b)}</td></tr>`).join("") + `</table>`;
}

/* ============================================================
   9) MISE EN PLACE
   ============================================================ */
function poserFiltres() {
  const groupes = [...new Set(D.metiers.map(m => m.groupe))];
  // Les nombres de la liste comptent les offres hors écoles (ce que la page montre par défaut).
  const horsEcoles = D.offres.filter(o => !o.ecole);
  const n = (liste, c) => liste.filter(o => (o.contrat || "alternance") === c).length;
  const compte = liste => `${nb(n(liste, "alternance"))} alt. · ${nb(n(liste, "stage"))} stages`;
  const duMetier = code => horsEcoles.filter(o => o.rome === code);
  document.getElementById("f-metier").innerHTML =
    `<optgroup label="Ensembles (offres hors écoles)"><option value="*">Tous les métiers suivis (${compte(horsEcoles)})</option>` +
    groupes.map(g => `<option value="g:${esc(g)}">Tout le groupe ${esc(g)} (${compte(horsEcoles.filter(o => (METIER[o.rome] || {}).groupe === g))})</option>`).join("") + `</optgroup>` +
    groupes.map(g => `<optgroup label="${esc(g)}">` + D.metiers.filter(m => m.groupe === g).map(m => `<option value="${m.code}">${esc(m.libelle)} — ${m.code} (${compte(duMetier(m.code))})</option>`).join("") + `</optgroup>`).join("");
  document.getElementById("f-durees").innerHTML = DUREES.map((k, i) => `<label><input type="checkbox" value="${i}"> ${esc(k)} <small>${D.offres.filter(o => o.contrat === "stage" && (o.duree_classe || DUREES.at(-1)) === k).length}</small></label>`).join("");

  const zones = [["", "France"], ["dep:63", "Puy-de-Dôme"], ["reg:" + AURA, "Auvergne-Rhône-Alpes"], ["reg:" + IDF, "Île-de-France"]];
  document.getElementById("f-zones").innerHTML = zones.map(([v, l]) => `<button data-z="${esc(v)}">${esc(l)}</button>`).join("");
  const deps = [...new Set(D.offres.map(o => o.dep).filter(Boolean))].sort();
  document.getElementById("f-zone-plus").innerHTML = `<option value="">Autre région ou département…</option><optgroup label="Régions">` +
    D.regions.map(r => `<option value="reg:${esc(r)}">${esc(r)} (${D.offres.filter(o => o.reg === r).length})</option>`).join("") + `</optgroup><optgroup label="Départements">` +
    deps.map(d => `<option value="dep:${d}">${esc(libDep(d))} — ${D.offres.filter(o => o.dep === d).length}</option>`).join("") + `</optgroup>`;

  document.getElementById("f-types").innerHTML = TYPES.map(k => `<label><input type="checkbox" value="${k}"> ${k[0].toUpperCase() + k.slice(1)} <small>${D.offres.filter(o => o.type === k).length}</small></label>`).join("");
  document.getElementById("f-sources").innerHTML = Object.entries(SOURCES).map(([k, l]) => {
    const n = D.offres.filter(o => (o.srcs || [o.src]).includes(k)).length;
    return `<label title="${n ? "" : "Pas de clé dans .env : voir la section Fiabilité"}"><input type="checkbox" value="${k}" ${n ? "" : "disabled"}> ${l} <small>${n || "pas de clé"}</small></label>`;
  }).join("");
}
function synchroniserFiltres() {
  document.querySelectorAll("#f-contrat button").forEach(b => b.classList.toggle("actif", b.dataset.c === E.c));
  document.getElementById("bloc-types").hidden = E.c === "stage";
  document.getElementById("bloc-durees").hidden = E.c === "alternance";
  const dd = ensemble(E.d);
  document.querySelectorAll("#f-durees input").forEach(i => { i.checked = dd.has(i.value); });
  document.getElementById("f-metier").value = E.m;
  document.getElementById("f-mot").value = E.q;
  document.querySelectorAll("#f-zones button").forEach(b => b.classList.toggle("actif", b.dataset.z === E.z));
  const plus = document.getElementById("f-zone-plus");
  plus.value = [...document.querySelectorAll("#f-zones button")].some(b => b.dataset.z === E.z) ? "" : E.z;
  const t = ensemble(E.t), so = ensemble(E.s);
  document.querySelectorAll("#f-types input").forEach(i => { i.checked = t.has(i.value); });
  document.querySelectorAll("#f-sources input").forEach(i => { i.checked = so.has(i.value); });
  document.getElementById("f-ecoles").checked = E.e === "1";
  document.getElementById("f-interim").checked = E.i === "1";
  document.getElementById("f-recentes").checked = E.r === "1";
  document.getElementById("f-tri").value = E.tri;
  if (E.z.startsWith("dep:")) document.getElementById("e-dep").value = E.z.slice(4);
}
function brancher() {
  const cases = sel => [...document.querySelectorAll(sel + " input:checked")].map(i => i.value).join(",");
  document.getElementById("f-metier").addEventListener("change", e => { E.m = e.target.value; rendre(); chercherEntreprises(1); });
  let minuteur;
  document.getElementById("f-mot").addEventListener("input", e => { clearTimeout(minuteur); minuteur = setTimeout(() => { E.q = e.target.value.trim(); rendre(); }, 250); });
  document.getElementById("f-zones").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; E.z = b.dataset.z; synchroniserFiltres(); rendre(); });
  document.getElementById("f-zone-plus").addEventListener("change", e => { if (!e.target.value) return; E.z = e.target.value; synchroniserFiltres(); rendre(); });
  document.getElementById("f-contrat").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; E.c = b.dataset.c; synchroniserFiltres(); rendre(); });
  document.getElementById("f-durees").addEventListener("change", () => { E.d = cases("#f-durees"); rendre(); });
  document.getElementById("f-types").addEventListener("change", () => { E.t = cases("#f-types"); rendre(); });
  document.getElementById("f-sources").addEventListener("change", () => { E.s = cases("#f-sources"); rendre(); });
  document.getElementById("f-ecoles").addEventListener("change", e => { E.e = e.target.checked ? "1" : "0"; rendre(); });
  document.getElementById("f-interim").addEventListener("change", e => { E.i = e.target.checked ? "1" : "0"; rendre(); });
  document.getElementById("f-recentes").addEventListener("change", e => { E.r = e.target.checked ? "1" : "0"; rendre(); });
  document.getElementById("f-tri").addEventListener("change", e => { E.tri = e.target.value; ecrireAdresse(); rendreListe(selCourante); });
  document.getElementById("b-plus").addEventListener("click", () => { listeN += 30; rendreListe(selCourante); });
  document.getElementById("b-reset").addEventListener("click", () => { E = { ...DEFAUT }; synchroniserFiltres(); rendre(); });
  document.getElementById("b-csv").addEventListener("click", exporterOffres);
  document.getElementById("b-lien").addEventListener("click", async e => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Lien copié ✓"; } catch { e.target.textContent = "Copie impossible : copiez l'adresse du navigateur"; }
    setTimeout(() => { e.target.textContent = "Copier le lien de cette vue"; }, 2000);
  });
  document.getElementById("r-plus").addEventListener("click", () => { recN += 30; rendreRecruteursLBA(); });
  document.getElementById("r-csv").addEventListener("click", () => telecharger(`entreprises_susceptibles_${(E.z || "region").replace(/[^\w]/g, "")}_${D.date}.csv`,
    [["siret", "nom", "secteur", "taille", "adresse", "departement", "metiers", "offre_en_base", "fiche"],
     ...recSel.map(r => [r.siret, r.nom, r.secteur, r.eff, r.adresse, r.dep, r.romes.map(c => (METIER[c] || {}).libelle || c).join(", "), r.offre ? "oui" : "non", sirenDe(r) ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${sirenDe(r)}` : ""])]));
  document.getElementById("e-go").addEventListener("click", () => chercherEntreprises(1));
  document.getElementById("e-plus").addEventListener("click", () => chercherEntreprises(EP.page + 1));
  document.getElementById("e-csv").addEventListener("click", () => telecharger(`entreprises_${document.getElementById("e-dep").value}_${D.date}.csv`,
    [["siren", "nom", "naf", "secteur", "effectif_etablissement", "effectif_entreprise", "adresse", "offre_en_base", "fiche"],
     ...EP.lignes.map(x => [x.siren, x.nom, x.naf, sectionLib(x.naf) || "", x.eff, x.eff_ul, x.adresse, x.offre ? "oui" : "non", `https://annuaire-entreprises.data.gouv.fr/entreprise/${x.siren}`])]));
  // Une ancre simple (#fiabilite) n'est pas un état de filtres : on la laisse faire défiler la page.
  window.addEventListener("hashchange", () => { if (!location.hash.includes("=")) return; lireAdresse(); synchroniserFiltres(); rendre(); });
}

/* ---- La carte, créée une fois ---- */
const VUES = { france: [[46.4, 2.4], 6], clermont: [[45.78, 3.09], 10], aura: [[45.5, 4.6], 8], paris: [[48.8, 2.4], 10] };
carte = L.map("map", { scrollWheelZoom: false, zoomSnap: .5 }).setView(...VUES.france);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Tiles &copy; Esri, OpenStreetMap" }).addTo(carte);
calque = L.markerClusterGroup({ maxClusterRadius: 45, disableClusteringAtZoom: 12, showCoverageOnHover: false, chunkedLoading: true,
  iconCreateFunction: c => { const k = c.getChildCount(), t = k < 10 ? "petite" : k < 100 ? "moyenne" : "grande", dia = k < 10 ? 28 : k < 100 ? 36 : 46;
    return L.divIcon({ html: `<div class="grappe ${t}" style="width:${dia}px;height:${dia}px">${k}</div>`, className: "", iconSize: [dia, dia] }); } }).addTo(carte);
document.querySelectorAll("[data-vue]").forEach(b => b.addEventListener("click", () => carte.flyTo(...VUES[b.dataset.vue])));

const pc = D.qualite.par_contrat || {};
document.getElementById("sous").innerHTML = `Offres actives au <b>${dateFr(D.date)}</b> : ${nb(pc.alternance || D.offres.length)} en alternance, ${nb(pc.stage || 0)} stages, après nettoyage (${nb(D.qualite.brutes)} lues) · sources : ${esc(D.qualite.sources.filter(x => x.n).map(x => x.source).join(", "))} · croisées avec l'API Recherche d'entreprises · <a href="#fiabilite">fiabilité</a>`;
lireAdresse();
poserFiltres();
synchroniserFiltres();
brancher();
rendreQualite();
rendre();
chercherEntreprises(1);
