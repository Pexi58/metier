/* ============================================================
   presentation.js — la page Présentation : une question par diapo,
   une phrase « À retenir » avec son chiffre, un graphique, sa source.
   Mêmes données que la page Alternance (data/alternance.js) ;
   même règle : les offres publiées par des écoles sont retirées,
   sauf si la case « Inclure les offres d'écoles » est cochée.
   Le métier choisi est dans l'adresse (#m=M1620) : on peut préparer
   un lien par membre du groupe.
   ============================================================ */
"use strict";
const D = window.ALTERNANCE;
if (!D) { document.body.innerHTML = "<p style='padding:40px'>Données absentes : lancez <code>mettre-a-jour-alternance.cmd</code>.</p>"; throw new Error("données absentes"); }

/* ---- Petits outils ---- */
const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nb = n => Number(n || 0).toLocaleString("fr-FR");
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const s = n => n > 1 ? "s" : "";
const euro = n => n == null ? "—" : Math.round(n).toLocaleString("fr-FR") + " €";
const dateFr = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "?"; };
const mediane = a => { const t = a.filter(x => x != null).sort((x, y) => x - y); if (!t.length) return null; const m = (t.length - 1) / 2; return (t[Math.floor(m)] + t[Math.ceil(m)]) / 2; };
const compter = (liste, cle) => { const c = new Map(); for (const x of liste) { const k = cle(x); if (k == null || k === "") continue; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1]); };
const METIER = Object.fromEntries(D.metiers.map(m => [m.code, m]));
const REG = D.region_suivie || { nom: "Auvergne-Rhône-Alpes", deps: [] };
const libDep = c => (D.departements || {})[c] ? `${D.departements[c]} (${c})` : c;
const villeSimple = v => String(v || "").replace(/\s+\d+(er|e|ème)?\s+(arrondissement|canton)$/i, "").trim();
const PETIT = 20;
const BLEU = "#0a5cff", PALE = "#a7c9ff", GRIS = "#c7c7cc";

Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 14;
Chart.defaults.plugins.legend.display = false;
const G = {};
function graph(id, type, data, options) {
  const opts = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, options);
  if (G[id]) { G[id].data = data; G[id].options = opts; G[id].update(); return; }
  G[id] = new Chart(document.getElementById(id), { type, data, options: opts });
}
function barres(id, etiquettes, valeurs, { horizontal = true, couleurs = BLEU, titre = "", total = null } = {}) {
  graph(id, "bar", { labels: etiquettes, datasets: [{ data: valeurs, backgroundColor: couleurs, borderRadius: 4 }] }, {
    indexAxis: horizontal ? "y" : "x",
    plugins: { title: { display: !!titre, text: titre, font: { size: 15, weight: "600" } },
      tooltip: { callbacks: { label: c => { const v = c.parsed[horizontal ? "x" : "y"]; return `${nb(v)} offre${s(v)}${total ? ` (${pct(v, total)} %)` : ""}`; } } } },
    scales: { x: { beginAtZero: true, grid: { display: !horizontal } }, y: { beginAtZero: true, grid: { display: horizontal }, ticks: { autoSkip: false } } } });
}
function anneau(id, etiquettes, valeurs, couleurs, titre) {
  const t = valeurs.reduce((a, b) => a + b, 0);
  graph(id, "doughnut", { labels: etiquettes.map((l, i) => `${l} — ${pct(valeurs[i], t)} %`), datasets: [{ data: valeurs, backgroundColor: couleurs, borderColor: "#fff", borderWidth: 2 }] }, {
    cutout: "55%", plugins: { title: { display: true, text: titre, font: { size: 15, weight: "600" } }, legend: { display: true, position: "bottom" } } });
}
const ecrire = (id, html) => { document.getElementById(id).innerHTML = html; };

/* ---- État ---- */
let metier = D.metier_par_defaut || "M1620", ecoles = false, contrat = "alternance";
function lireAdresse() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("m") && (p.get("m") === "*" || p.get("m").startsWith("g:") || METIER[p.get("m")])) metier = p.get("m");
  ecoles = p.get("e") === "1";
  if (["alternance", "stage", "tous"].includes(p.get("c"))) contrat = p.get("c");
}
const passeMetier = o => metier === "*" ? true : metier.startsWith("g:") ? (METIER[o.rome] || {}).groupe === metier.slice(2) : o.rome === metier;
const libMetier = () => metier === "*" ? "tous les métiers du marketing suivis" : metier.startsWith("g:") ? `les métiers du groupe « ${metier.slice(2)} »` : METIER[metier].libelle;
const passeContrat = o => contrat === "tous" || (o.contrat || "alternance") === contrat;
const garde = o => (ecoles || !o.ecole) && passeContrat(o);
// Le type d'offre dit dans une phrase, et dans un titre.
const EN = () => ({ alternance: "en alternance", stage: "de stage", tous: "d'alternance ou de stage" })[contrat];
const TITRE = () => ({ alternance: "L'alternance", stage: "Les stages", tous: "L'alternance et les stages" })[contrat];

/* ============================================================
   LE RENDU
   ============================================================ */
function rendre() {
  history.replaceState(null, "", "#" + new URLSearchParams({ m: metier, ...(contrat !== "alternance" ? { c: contrat } : {}), ...(ecoles ? { e: "1" } : {}) }));
  const toutes = D.offres.filter(o => passeMetier(o) && passeContrat(o));                // écoles comprises, pour dire combien on en retire
  const sel = toutes.filter(garde);
  const N = sel.length;
  const reg = sel.filter(o => o.reg === REG.nom);
  const p63 = sel.filter(o => o.dep === "63");
  const nEcoles = toutes.filter(o => o.ecole).length;
  const fragile = n => n < PETIT ? ` <i>(moins de ${PETIT} offres : chiffre à citer avec prudence)</i>` : "";
  const sources = [...new Set(D.qualite.sources.filter(x => x.n > 0).map(x => ({ FT: "France Travail", LBA: "La bonne alternance", ADZ: "Adzuna", JOO: "Jooble" })[x.source.split(" ")[0]]).filter(Boolean))];
  const lSource = `Sources : ${sources.join(", ")} — offres actives au ${dateFr(D.date)}, dédoublonnées${ecoles ? "" : ", hors offres publiées par des écoles"}.`;
  document.querySelectorAll(".nom-region").forEach(e => { e.textContent = REG.nom; });

  /* 0. Titre */
  document.title = `Présentation — ${TITRE().toLowerCase()}, ${libMetier()}`;
  ecrire("h-combien", `1. Combien d'offres ${EN()} ?`);
  ecrire("h-contrat", contrat === "stage" ? "4. Quelle durée, quel niveau d'études ?" : "4. Quel contrat, quel niveau d'études ?");
  ecrire("t-titre", `${TITRE()} pour <br>${esc(libMetier())}`);
  ecrire("t-sous", `Ce que disent <b>${nb(N)} offres</b> ${EN()} publiées en France au ${dateFr(D.date)}, dont <b>${nb(reg.length)}</b> en ${esc(REG.nom)}.`);
  ecrire("t-sources", lSource);

  /* 1. Combien */
  ecrire("n-nombres", [[N, "en France"], [reg.length, "en " + REG.nom], [p63.length, "dans le Puy-de-Dôme"]].map(([v, l]) => `<div><b>${nb(v)}</b><span>offre${s(v)} ${esc(l)}</span></div>`).join(""));
  const parMetier = D.metiers.map(m => ({ m, n: D.offres.filter(o => o.rome === m.code && garde(o)).length })).sort((a, b) => b.n - a.n);
  const choisi = x => metier === "*" || (metier.startsWith("g:") ? x.m.groupe === metier.slice(2) : x.m.code === metier);
  const montres = parMetier.filter((x, i) => i < 12 || choisi(x));
  const totalTous = parMetier.reduce((a, x) => a + x.n, 0);
  barres("g-combien", montres.map(x => x.m.libelle), montres.map(x => x.n), { couleurs: montres.map(x => choisi(x) ? BLEU : PALE), titre: `Offres ${EN()} par métier (France)`, total: totalTous });
  const rang = parMetier.findIndex(choisi) + 1;
  ecrire("r-combien", metier.length === 5
    ? `<b>${nb(N)} offres</b> ${EN()} pour ce métier en France : il se classe <b>${rang}<sup>e</sup> sur ${parMetier.length}</b> métiers suivis (${pct(N, totalTous)} % des offres). ${p63.length ? `Seulement ${nb(p63.length)} dans le Puy-de-Dôme.` : "Aucune dans le Puy-de-Dôme."}${fragile(N)}`
    : `<b>${nb(N)} offres</b> ${EN()} en France pour ${esc(libMetier())}, dont ${nb(reg.length)} en ${esc(REG.nom)} (${pct(reg.length, N)} %).`);
  ecrire("s-combien", lSource + (nEcoles && !ecoles ? ` ${nb(nEcoles)} offres publiées par des écoles ont été retirées (${pct(nEcoles, toutes.length)} % des annonces de ce métier).` : ""));

  /* 2. France */
  const regions = compter(sel, o => o.reg || null);
  barres("g-france", regions.map(x => x[0]), regions.map(x => x[1]), { couleurs: regions.map(x => x[0] === REG.nom ? BLEU : PALE), titre: `Offres ${EN()} par région`, total: N });
  const rangReg = regions.findIndex(x => x[0] === REG.nom) + 1;
  ecrire("r-france", regions.length ? `<b>${esc(regions[0][0])}</b> concentre <b>${pct(regions[0][1], N)} %</b> des offres (${nb(regions[0][1])} sur ${nb(N)}). ${esc(REG.nom)} arrive ${rangReg ? `${rangReg}<sup>e</sup>` : "—"} avec ${nb(reg.length)} offres (${pct(reg.length, N)} %).${fragile(N)}` : "Aucune offre.");
  ecrire("s-france", lSource + ` ${nb(sel.filter(o => !o.reg).length)} offres sans lieu précis ne sont pas comptées ici.`);

  /* 3. Région */
  const deps = REG.deps.map(d => [libDep(d), reg.filter(o => o.dep === d).length]).sort((a, b) => b[1] - a[1]);
  barres("g-region", deps.map(x => x[0]), deps.map(x => x[1]), { couleurs: deps.map(x => /\(63\)/.test(x[0]) ? BLEU : PALE), titre: "Par département", total: reg.length });
  const villes = compter(reg, o => villeSimple(o.ville) || null).slice(0, 10);
  barres("g-villes", villes.map(x => x[0]), villes.map(x => x[1]), { titre: "Les 10 premières villes", total: reg.length });
  const vides = deps.filter(x => !x[1]);
  ecrire("r-region", reg.length ? `En ${esc(REG.nom)}, <b>${esc(deps[0][0])}</b> regroupe <b>${pct(deps[0][1], reg.length)} %</b> des ${nb(reg.length)} offres ; le Puy-de-Dôme en compte <b>${nb(p63.length)}</b>.`
      + (vides.length ? ` ${vides.length} département${s(vides.length)} n'en ${vides.length > 1 ? "ont" : "a"} aucune : là, il faut démarcher les entreprises directement.` : "") + fragile(reg.length)
    : `Aucune offre en ${esc(REG.nom)} pour ce métier : la piste, ce sont les candidatures spontanées.`);
  ecrire("s-region", lSource + ` Pour la région, La bonne alternance a été interrogée autour de ${REG.centres ? REG.centres.length : "plusieurs"} villes et Adzuna avec une recherche dédiée.`);

  /* 4. Contrat */
  const DUREES = D.classes_duree || [];
  let phraseContrat;
  if (contrat === "stage") {
    const vdu = DUREES.map(k => sel.filter(o => (o.duree_classe || DUREES.at(-1)) === k).length);
    anneau("g-type", DUREES, vdu, [PALE, "#5f9bf5", BLEU, "#123a7a", GRIS], "Durée du stage (lue dans l'annonce)");
    const cn = N - vdu.at(-1), iM = vdu.slice(0, -1).indexOf(Math.max(...vdu.slice(0, -1)));
    phraseContrat = cn ? `Quand l'annonce la donne (${pct(cn, N)} % des cas), la durée la plus courante est <b>${DUREES[iM]}</b> (${pct(vdu[iM], cn)} %).` : "Les annonces ne précisent presque jamais la durée.";
  } else {
    const types = [["apprentissage", "Apprentissage", BLEU], ["professionnalisation", "Professionnalisation", "#5f9bf5"], ["non précisé", "Non précisé", GRIS], ...(contrat === "tous" ? [["stage", "Stage", "#ff6a00"]] : [])];
    const vt = types.map(([k]) => sel.filter(o => o.type === k).length);
    anneau("g-type", types.map(t => t[1]), vt, types.map(t => t[2]), "Type de contrat");
    phraseContrat = `<b>${pct(vt[0], N)} %</b> des offres sont en <b>apprentissage</b>, ${pct(vt[1], N)} % en contrat de professionnalisation${contrat === "tous" ? `, ${pct(vt[3], N)} % sont des stages` : ""}.`;
  }
  const dipl = D.diplomes.map(k => [k, sel.filter(o => o.diplome === k).length]);
  const connus = dipl.reduce((a, x) => a + x[1], 0);
  barres("g-diplome", dipl.map(x => x[0]), dipl.map(x => x[1]), { horizontal: false, titre: `Diplôme cité (${nb(connus)} offres sur ${nb(N)})`, total: connus });
  const top = dipl.slice().sort((a, b) => b[1] - a[1])[0];
  ecrire("r-contrat", N ? phraseContrat
    + (connus >= 3 ? ` Quand un diplôme est cité (${pct(connus, N)} % des annonces), c'est le plus souvent un <b>${top[0]}</b> (${pct(top[1], connus)} %).` : " Les annonces ne citent presque jamais le diplôme.") + fragile(N) : "Aucune offre.");
  ecrire("s-contrat", lSource + " Diplôme : le plus haut niveau mentionné dans l'annonce (champ de la source, sinon lu dans le texte).");

  /* 5. Qui recrute */
  const cl = D.classes_effectif.map(k => [k + " sal.", sel.filter(o => o.eff === k).length]);
  const taillesConnues = cl.reduce((a, x) => a + x[1], 0);
  barres("g-taille", cl.map(x => x[0]), cl.map(x => x[1]), { horizontal: false, titre: `Taille de l'employeur (connue pour ${nb(taillesConnues)} offres)`, total: taillesConnues });
  const sect = compter(sel, o => o.section ? D.sections[o.section] : null).slice(0, 7);
  barres("g-secteur", sect.map(x => x[0].length > 34 ? x[0].slice(0, 33) + "…" : x[0]), sect.map(x => x[1]), { titre: "Secteur de l'employeur", total: sect.reduce((a, x) => a + x[1], 0) });
  const petites = cl.slice(0, 3).reduce((a, x) => a + x[1], 0);
  ecrire("r-qui", taillesConnues ? `<b>${pct(petites, taillesConnues)} %</b> des offres dont on connaît l'employeur viennent de structures de <b>moins de 50 salariés</b>.`
    + (sect.length ? ` Premier secteur : <b>${esc(sect[0][0])}</b>.` : "") + (nEcoles && !ecoles ? ` Et ${pct(nEcoles, toutes.length)} % des annonces du marché sont publiées par des écoles.` : "") + fragile(taillesConnues) : "Taille des employeurs inconnue.");
  ecrire("s-qui", lSource + " Taille et secteur : répertoire SIRENE (API Recherche d'entreprises), employeur retrouvé par son nom.");

  /* 6. Outils */
  const outils = D.outils.map(n => [n, sel.filter(o => (o.outils || []).includes(n)).length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  graph("g-outils", "bar", { labels: outils.map(x => x[0]), datasets: [{ data: outils.map(x => pct(x[1], N)), backgroundColor: BLEU, borderRadius: 4 }] }, {
    indexAxis: "y", plugins: { title: { display: true, text: "Part des offres qui citent…", font: { size: 15, weight: "600" } }, tooltip: { callbacks: { label: c => `${c.parsed.x} % des offres` } } },
    scales: { x: { beginAtZero: true, ticks: { callback: v => v + " %" } }, y: { grid: { display: false }, ticks: { autoSkip: false } } } });
  ecrire("r-outils", N && outils[0][1] ? `<b>${esc(outils[0][0])}</b> revient dans <b>${pct(outils[0][1], N)} %</b> des offres, devant ${esc(outils[1][0])} (${pct(outils[1][1], N)} %) et ${esc(outils[2][0])} (${pct(outils[2][1], N)} %).${fragile(N)}` : "Pas d'outil cité.");
  ecrire("s-outils", lSource + " Mots cherchés dans le titre et le texte de l'annonce (grille modifiable dans config/alternance.json).");

  /* 7. Salaire */
  const avec = sel.filter(o => o.smin != null);
  const tr = [["< 600 €", 0, 600], ["600–899", 600, 900], ["900–1 199", 900, 1200], ["1 200–1 499", 1200, 1500], ["1 500–1 799", 1500, 1800], ["1 800 € et +", 1800, 1e9]];
  barres("g-salaire", tr.map(x => x[0]), tr.map(([, a, b]) => avec.filter(o => o.smin >= a && o.smin < b).length), { horizontal: false, titre: `Minimum affiché, brut par mois (${nb(avec.length)} offres)`, total: avec.length });
  ecrire("r-salaire", avec.length ? `Seules <b>${pct(avec.length, N)} %</b> des offres affichent une rémunération. Pour elles, le minimum médian est de <b>${euro(mediane(avec.map(o => o.smin)))} brut par mois</b>.${fragile(avec.length)}`
    : "Aucune offre de ce métier n'affiche de rémunération.");
  ecrire("s-salaire", lSource + (contrat === "stage" ? " Un stage de plus de 2 mois doit être gratifié (minimum fixé par la loi)." : " Pour un apprenti, le minimum légal dépend de l'âge et de l'année de contrat.") + " Montants mensuels saisis par erreur dans la case « annuel » : corrigés.");

  /* 8. Méthode */
  const q = D.qualite;
  ecrire("m-sources", q.sources.filter(x => x.n > 0 || /API en direct/.test(x.source) === false).map(x => `<li><b>${esc(({ FT: "France Travail", LBA: "La bonne alternance", ADZ: "Adzuna" })[x.source] || x.source)}</b> : ${nb(x.n)} offres lues</li>`).join("")
    + `<li><b>API Recherche d'entreprises</b> (État) : taille et secteur de ${nb(q.entreprises.offres_identifiees)} offres</li>`);
  ecrire("m-verifs", [
    `${nb(q.brutes)} offres lues → <b>${nb(q.retenues)}</b> après suppression des doublons (${nb(q.doublons_meme_id + q.doublons_proches)} retirés)`,
    `${nb(q.ecoles)} offres publiées par des écoles repérées (activité « enseignement » ou nom)`,
    `${nb((q.salaire || {})["corrigé"] || 0)} salaires mal saisis corrigés`,
    `${q.controles.filter(c => c.ok).length} contrôles automatiques sur ${q.controles.length} réussis (dates, lieux, liens, recoupement avec la base du cours)`,
  ].map(t => `<li>${t}</li>`).join(""));
}

/* ---- Mise en place ---- */
lireAdresse();
const groupes = [...new Set(D.metiers.map(m => m.groupe))];
document.getElementById("p-metier").innerHTML = `<option value="*">Tous les métiers suivis</option>`
  + groupes.map(g => `<option value="g:${esc(g)}">Groupe ${esc(g)}</option>`).join("")
  + groupes.map(g => `<optgroup label="${esc(g)}">` + D.metiers.filter(m => m.groupe === g).map(m => `<option value="${m.code}">${esc(m.libelle)}</option>`).join("") + `</optgroup>`).join("");
document.getElementById("p-metier").value = metier;
document.getElementById("p-contrat").value = contrat;
document.getElementById("p-contrat").addEventListener("change", e => { contrat = e.target.value; rendre(); });
document.getElementById("p-ecoles").checked = ecoles;
document.getElementById("p-metier").addEventListener("change", e => { metier = e.target.value; rendre(); });
document.getElementById("p-ecoles").addEventListener("change", e => { ecoles = e.target.checked; rendre(); });
document.getElementById("p-imprimer").addEventListener("click", () => window.print());
// Flèches du clavier : diapo suivante / précédente.
document.addEventListener("keydown", e => {
  if (/^(SELECT|INPUT)$/.test(document.activeElement.tagName)) return;
  const diapos = [...document.querySelectorAll(".diapo")];
  const ici = diapos.findIndex(d => d.getBoundingClientRect().top > -window.innerHeight / 2);
  const cible = ["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key) ? ici + 1 : ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key) ? ici - 1 : null;
  if (cible == null) return;
  e.preventDefault();
  diapos[Math.max(0, Math.min(diapos.length - 1, cible))].scrollIntoView({ behavior: "smooth" });
});
rendre();
