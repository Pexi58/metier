/* ============================================================
   presentation.js — la page Synthèse.
   Pour le métier et le type d'offre choisis : les chiffres-clés, puis
   une idée par section (« À retenir » + graphique + source).
   Tout est cliquable : un chiffre, une barre ou un encadré ouvre la
   fenêtre « Vérifier ce chiffre » (assets/verif.js).
   Même règle que la page Explorer : les offres d'écoles sont retirées,
   sauf si « Inclure les offres d'écoles » est coché.
   ============================================================ */
"use strict";
const D = window.ALTERNANCE;
if (!D) { document.querySelector(".page").innerHTML = "<p>Données absentes : lancez <code>mettre-a-jour-alternance.cmd</code>.</p>"; throw new Error("données absentes"); }
const { esc, nb, pct, dateFr, libDep, villeSimple } = Site;

const METIER = Object.fromEntries(D.metiers.map(m => [m.code, m]));
const REG = D.region_suivie || { nom: "Auvergne-Rhône-Alpes", deps: [] };
const DUREES = D.classes_duree || [];
const PETIT = 20;
const BLEU = "#1f5eff", PALE = "#b9ccff", GRIS = "#cfd3dc", ORANGE = "#ff6a00";
const s = n => n > 1 ? "s" : "";
const euro = n => n == null ? "—" : Math.round(n).toLocaleString("fr-FR") + " €";
const mediane = a => { const t = a.filter(x => x != null).sort((x, y) => x - y); if (!t.length) return null; const m = (t.length - 1) / 2; return (t[Math.floor(m)] + t[Math.ceil(m)]) / 2; };
const compter = (liste, cle) => { const c = new Map(); for (const x of liste) { const k = cle(x); if (k == null || k === "") continue; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1]); };
const JOUR = Date.parse(D.date);
const age = o => { const t = Date.parse(o.date); return isFinite(t) ? Math.max(0, Math.round((JOUR - t) / 86400000)) : null; };
const ecrire = (id, html) => { document.getElementById(id).innerHTML = html; };

/* ---- État : l'adresse d'abord (#c=stage&m=M1620), sinon le dernier choix fait sur une autre page ---- */
let metier = D.metier_par_defaut || "M1620", ecoles = false, contrat = "alternance";
(function lireAdresse() {
  const p = new URLSearchParams(location.hash.slice(1)), ch = Site.lireChoix();
  const m = p.get("m") || ch.m, c = p.get("c") || ch.c;
  if (m && (m === "*" || m.startsWith("g:") || METIER[m])) metier = m;
  if (["alternance", "stage", "tous"].includes(c)) contrat = c;
  ecoles = p.get("e") === "1";
})();
const passeMetier = o => metier === "*" ? true : metier.startsWith("g:") ? (METIER[o.rome] || {}).groupe === metier.slice(2) : o.rome === metier;
const passeContrat = o => contrat === "tous" || (o.contrat || "alternance") === contrat;
const garde = o => (ecoles || !o.ecole) && passeContrat(o);
const libMetier = () => metier === "*" ? "tous les métiers du marketing suivis" : metier.startsWith("g:") ? `les métiers du groupe « ${metier.slice(2)} »` : METIER[metier].libelle;
const EN = () => ({ alternance: "en alternance", stage: "de stage", tous: "d'alternance ou de stage" })[contrat];
const TITRE = () => ({ alternance: "L'alternance", stage: "Les stages", tous: "L'alternance et les stages" })[contrat];
const decrireFiltres = () => `offres : ${({ alternance: "alternance", stage: "stages", tous: "alternance et stages" })[contrat]} · métier : ${libMetier()} · zone : France entière · `
  + `${ecoles ? "écoles comprises" : "offres d'écoles retirées"} · toutes les sources · une offre vue dans plusieurs sources ne compte qu'une fois.`;

/* ---- Vérification : ce que compte chaque graphique ---- */
const VERIF = {};
const verifier = (id, v) => { VERIF[id] = v; };
const offresDe = (v, i) => v.base.filter(o => [].concat(v.cle(o)).includes(v.cles[i]));
const libDe = (v, i) => v.libelles ? v.libelles[i] : v.cles[i];
function verifCategorie(id, i) {
  const v = VERIF[id]; if (!v || v.cles[i] == null) return;
  const off = offresDe(v, i);
  Verif.ouvrir({ titre: `${v.titre} — ${libDe(v, i)}`, calcul: { num: off.length, den: v.total != null ? v.total : v.base.length, texte: `Offres « ${libDe(v, i)} » ÷ ${v.totalLibelle || "offres de la sélection"}` },
    champ: v.champ, filtres: v.filtres || decrireFiltres(), offres: off, base: v.base, valeur: v.valeur, note: v.note });
}
function verifGraphique(id) {
  const v = VERIF[id]; if (!v) return;
  Verif.ouvrir({ titre: v.titre, lignes: v.cles.map((k, i) => ({ libelle: libDe(v, i), offres: offresDe(v, i) })), total: v.total != null ? v.total : v.base.length,
    totalLibelle: v.totalLibelle, champ: v.champ, filtres: v.filtres || decrireFiltres(), base: v.base, valeur: v.valeur, note: v.note });
}

/* ---- Graphiques ---- */
Chart.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 13;
Chart.defaults.color = "#4a4f59";
Chart.defaults.plugins.legend.display = false;
const G = {};
function graph(id, type, data, options) {
  const opts = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false,
    onClick: (ev, els) => { if (els.length) verifCategorie(id, els[0].index); },
    onHover: (ev, els) => { ev.native.target.style.cursor = els.length ? "pointer" : "default"; } }, options);
  if (G[id]) { G[id].data = data; G[id].options = opts; G[id].update(); return; }
  G[id] = new Chart(document.getElementById(id), { type, data, options: opts });
}
function barres(id, etiquettes, valeurs, { horizontal = true, couleurs = BLEU, total = null, pourcent = false } = {}) {
  graph(id, "bar", { labels: etiquettes, datasets: [{ data: valeurs, backgroundColor: couleurs, borderRadius: 6, maxBarThickness: 34 }] }, {
    indexAxis: horizontal ? "y" : "x",
    plugins: { tooltip: { callbacks: { label: c => { const v = c.parsed[horizontal ? "x" : "y"]; return pourcent ? `${v} % des offres` : `${nb(v)} offre${s(v)}${total ? ` (${pct(v, total)} %)` : ""} — cliquer pour vérifier`; } } } },
    scales: { x: { beginAtZero: true, grid: { display: !horizontal, color: "#eef0f4" }, border: { display: false }, ticks: pourcent ? { callback: v => v + " %" } : {} },
              y: { beginAtZero: true, grid: { display: horizontal, color: "#eef0f4" }, border: { display: false }, ticks: { autoSkip: false } } } });
}
function anneau(id, etiquettes, valeurs, couleurs) {
  const t = valeurs.reduce((a, b) => a + b, 0);
  graph(id, "doughnut", { labels: etiquettes.map((l, i) => `${l} — ${pct(valeurs[i], t)} %`), datasets: [{ data: valeurs, backgroundColor: couleurs, borderColor: "#fff", borderWidth: 2 }] }, {
    cutout: "62%", plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 12 } } } });
}

/* ============================================================
   LE RENDU
   ============================================================ */
function rendre() {
  const p = new URLSearchParams({ m: metier, ...(contrat !== "alternance" ? { c: contrat } : {}), ...(ecoles ? { e: "1" } : {}) });
  history.replaceState(null, "", "#" + p);
  Site.memoriser({ c: contrat, m: metier });
  document.querySelectorAll("#p-contrat button").forEach(b => b.classList.toggle("actif", b.dataset.c === contrat));

  const toutes = D.offres.filter(o => passeMetier(o) && passeContrat(o));          // écoles comprises : pour dire combien on en retire
  const sel = toutes.filter(garde);
  const N = sel.length;
  const reg = sel.filter(o => o.reg === REG.nom);
  const p63 = sel.filter(o => o.dep === "63");
  const nEcoles = toutes.filter(o => o.ecole).length;
  const F = decrireFiltres();
  const fragile = n => n < PETIT ? ` <i>(moins de ${PETIT} offres : chiffre à citer avec prudence)</i>` : "";
  const noms = { FT: "France Travail", LBA: "La bonne alternance", ADZ: "Adzuna" };
  const sources = [...new Set(D.qualite.sources.filter(x => x.n > 0).map(x => noms[x.source.split(" ")[0]]).filter(Boolean))];
  const lSource = `Sources : ${sources.join(", ")} — offres en ligne le ${dateFr(D.date)}, dédoublonnées${ecoles ? "" : ", hors offres d'écoles"}.`;
  document.querySelectorAll(".nom-region, .nom-region-lien").forEach(e => { e.textContent = REG.nom; });

  /* ---- En-tête de page ---- */
  document.title = `Synthèse — ${TITRE().toLowerCase()}, ${libMetier()}`;
  ecrire("t-surtitre", `Synthèse · offres en ligne le ${dateFr(D.date)}`);
  ecrire("t-titre", `${TITRE()} pour ${esc(libMetier())}`);
  ecrire("t-sous", `Ce que disent <b>${nb(N)} offres</b> ${EN()} publiées en France, dont <b>${nb(reg.length)}</b> en ${esc(REG.nom)} et <b>${nb(p63.length)}</b> dans le Puy-de-Dôme.`
    + (nEcoles && !ecoles ? ` ${nb(nEcoles)} offres publiées par des écoles sont mises de côté.` : ""));

  /* ---- Chiffres-clés (cliquables) ---- */
  const lieu = o => `${o.ville || o.lieu || "—"} (${o.dep || "?"})`;
  const avecSal = sel.filter(o => o.smin != null);
  const dk = sel.filter(o => o.duree != null), six = dk.filter(o => o.duree >= 5 && o.duree <= 6);
  const appr = sel.filter(o => o.type === "apprentissage");
  const employeurs = new Set(sel.map(o => (o.ent || "").toLowerCase()).filter(Boolean)).size;
  const compte = (titre, offres, texte, champ, valeur) => () => Verif.ouvrir({ titre, calcul: { num: offres.length, den: null, texte }, champ, filtres: F, offres, base: sel, valeur });
  const tuiles = [
    [nb(N), `offres ${EN()} en France`, compte(`Offres ${EN()} en France`, sel, "Offres qui passent les filtres, après suppression des doublons", "contrat", o => o.contrat), true],
    [nb(reg.length), `en ${REG.nom}`, compte(`Offres en ${REG.nom}`, reg, "Offres dont le département est dans la région", "lieu", lieu), true],
    [nb(p63.length), "dans le Puy-de-Dôme", compte("Offres dans le Puy-de-Dôme", p63, "Offres dont le lieu est dans le département 63", "lieu", lieu), true],
    contrat === "stage"
      ? [dk.length ? pct(six.length, dk.length) + " %" : "—", `des stages de durée connue font 5 à 6 mois (${nb(dk.length)} connues)`,
         () => Verif.ouvrir({ titre: "Stages de 5 à 6 mois", calcul: { num: six.length, den: dk.length, texte: "Stages de 5 à 6 mois ÷ stages dont la durée est connue" }, champ: "duree_classe", filtres: F, offres: six, base: dk, valeur: o => o.duree + " mois" })]
      : [pct(appr.length, N) + " %", "en apprentissage", () => Verif.ouvrir({ titre: "Offres en apprentissage", calcul: { num: appr.length, den: N, texte: "Offres en apprentissage ÷ offres de la sélection" }, champ: "type", filtres: F, offres: appr, base: sel, valeur: o => o.type })],
    [avecSal.length ? euro(mediane(avecSal.map(o => o.smin))) : "—", `brut mensuel médian (${nb(avecSal.length)} offres l'affichent)`,
      () => Verif.ouvrir({ titre: "Rémunération médiane affichée", calcul: { num: avecSal.length ? euro(mediane(avecSal.map(o => o.smin))) : "—", den: null, texte: `Médiane des minimums affichés par ${avecSal.length} offres (la moitié affiche moins, l'autre moitié plus)` },
        champ: "salaire", filtres: F, offres: avecSal, base: sel, valeur: o => `${o.smin}${o.smax > o.smin ? "–" + o.smax : ""} € — ${o.sal_lib || ""}` })],
    [nb(employeurs), "employeurs différents", compte("Employeurs différents", sel.filter(o => o.ent), `${nb(employeurs)} noms d'employeurs différents parmi les offres qui en nomment un`, "publie_par", o => o.ent)],
  ];
  const el = document.getElementById("n-nombres");
  el.innerHTML = tuiles.map(([v, l, , fort], i) => `<div class="chiffre verifiable${fort ? " fort" : ""}" data-k="${i}" title="Cliquer pour vérifier ce chiffre"><b>${v}</b><span>${esc(l)}</span></div>`).join("");
  el.querySelectorAll(".chiffre").forEach(t => t.addEventListener("click", () => tuiles[+t.dataset.k][2]()));

  /* 1. Combien */
  ecrire("h-combien", `Combien d'offres ${EN()} ?`);
  const parMetier = D.metiers.map(m => ({ m, n: D.offres.filter(o => o.rome === m.code && garde(o)).length })).sort((a, b) => b.n - a.n);
  const choisi = x => metier === "*" || (metier.startsWith("g:") ? x.m.groupe === metier.slice(2) : x.m.code === metier);
  const montres = parMetier.filter((x, i) => i < 12 || choisi(x));
  const totalTous = parMetier.reduce((a, x) => a + x.n, 0);
  barres("g-combien", montres.map(x => x.m.libelle), montres.map(x => x.n), { couleurs: montres.map(x => choisi(x) ? BLEU : PALE), total: totalTous });
  const baseTous = D.offres.filter(garde);
  verifier("g-combien", { titre: `Offres ${EN()} par métier`, base: baseTous, cle: o => o.rome, cles: montres.map(x => x.m.code), libelles: montres.map(x => x.m.libelle), champ: "rome",
    totalLibelle: "offres de tous les métiers", filtres: F.replace(/métier : [^·]*·/, "tous les métiers ·") });
  const rang = parMetier.findIndex(choisi) + 1;
  ecrire("r-combien", (metier.length === 5
    ? `<b>${nb(N)} offres</b> ${EN()} pour ce métier en France : il se classe <b>${rang}<sup>e</sup> sur ${parMetier.length}</b> métiers suivis (${pct(N, totalTous)} % des offres). ${p63.length ? `Seulement ${nb(p63.length)} dans le Puy-de-Dôme.` : "Aucune dans le Puy-de-Dôme."}${fragile(N)}`
    : `<b>${nb(N)} offres</b> ${EN()} en France pour ${esc(libMetier())}, dont ${nb(reg.length)} en ${esc(REG.nom)} (${pct(reg.length, N)} %).`) + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-combien", lSource + (nEcoles && !ecoles ? ` ${nb(nEcoles)} offres d'écoles retirées (${pct(nEcoles, toutes.length)} % des annonces de ce choix).` : ""));

  /* 2. France */
  const regions = compter(sel, o => o.reg || null);
  barres("g-france", regions.map(x => x[0]), regions.map(x => x[1]), { couleurs: regions.map(x => x[0] === REG.nom ? BLEU : PALE), total: N });
  verifier("g-france", { titre: `Offres ${EN()} par région`, base: sel, cle: o => o.reg || null, cles: regions.map(x => x[0]), champ: "lieu", valeur: lieu });
  const rangReg = regions.findIndex(x => x[0] === REG.nom) + 1;
  ecrire("r-france", (regions.length ? `<b>${esc(regions[0][0])}</b> concentre <b>${pct(regions[0][1], N)} %</b> des offres (${nb(regions[0][1])} sur ${nb(N)}). ${esc(REG.nom)} arrive ${rangReg ? `${rangReg}<sup>e</sup>` : "—"} avec ${nb(reg.length)} offres (${pct(reg.length, N)} %).${fragile(N)}` : "Aucune offre.") + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-france", lSource + ` ${nb(sel.filter(o => !o.reg).length)} offres sans lieu précis ne sont pas comptées ici.`);

  /* 3. Région */
  const deps = REG.deps.map(d => [d, reg.filter(o => o.dep === d).length]).sort((a, b) => b[1] - a[1]);
  barres("g-region", deps.map(x => libDep(x[0])), deps.map(x => x[1]), { couleurs: deps.map(x => x[0] === "63" ? BLEU : PALE), total: reg.length });
  verifier("g-region", { titre: `Offres par département — ${REG.nom}`, base: reg, cle: o => o.dep, cles: deps.map(x => x[0]), libelles: deps.map(x => libDep(x[0])), champ: "lieu", totalLibelle: "offres de la région", valeur: lieu });
  const villes = compter(reg, o => villeSimple(o.ville) || null).slice(0, 10);
  barres("g-villes", villes.map(x => x[0]), villes.map(x => x[1]), { total: reg.length });
  verifier("g-villes", { titre: `Villes — ${REG.nom}`, base: reg, cle: o => villeSimple(o.ville) || null, cles: villes.map(x => x[0]), champ: "lieu", totalLibelle: "offres de la région", valeur: lieu });
  const vides = deps.filter(x => !x[1]);
  ecrire("r-region", (reg.length ? `En ${esc(REG.nom)}, <b>${esc(libDep(deps[0][0]))}</b> regroupe <b>${pct(deps[0][1], reg.length)} %</b> des ${nb(reg.length)} offres ; le Puy-de-Dôme en compte <b>${nb(p63.length)}</b>.`
      + (vides.length ? ` ${vides.length} département${s(vides.length)} n'en ${vides.length > 1 ? "ont" : "a"} aucune : là, il faut démarcher les entreprises directement.` : "") + fragile(reg.length)
    : `Aucune offre en ${esc(REG.nom)} pour ce choix : la piste, ce sont les candidatures spontanées.`) + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-region", lSource + ` Pour la région, La bonne alternance a été interrogée autour de ${REG.centres ? REG.centres.length : "plusieurs"} villes et Adzuna avec une recherche dédiée.`);

  /* 4. Contrat ou durée, et diplôme */
  let phrase;
  if (contrat === "stage") {
    ecrire("h-contrat", "Quelle durée, quel niveau d'études ?"); ecrire("t-type", "Durée du stage"); ecrire("som-contrat", "Durée et diplôme");
    const v = DUREES.map(k => sel.filter(o => (o.duree_classe || DUREES.at(-1)) === k).length);
    anneau("g-type", DUREES, v, [PALE, "#7b9dff", BLEU, "#0d2f8a", GRIS]);
    verifier("g-type", { titre: "Durée du stage", base: sel, cle: o => o.duree_classe || DUREES.at(-1), cles: DUREES, champ: "duree_classe", valeur: o => o.duree != null ? o.duree + " mois" : "non précisée" });
    const cn = N - v.at(-1), iM = v.slice(0, -1).indexOf(Math.max(...v.slice(0, -1)));
    phrase = cn ? `Quand l'annonce la donne (${pct(cn, N)} % des cas), la durée la plus courante est <b>${DUREES[iM]}</b> (${pct(v[iM], cn)} %).` : "Les annonces ne précisent presque jamais la durée.";
  } else {
    ecrire("h-contrat", "Quel contrat, quel niveau d'études ?"); ecrire("t-type", "Type de contrat"); ecrire("som-contrat", "Contrat et diplôme");
    const types = [["apprentissage", "Apprentissage", BLEU], ["professionnalisation", "Professionnalisation", "#7b9dff"], ["non précisé", "Non précisé", GRIS], ...(contrat === "tous" ? [["stage", "Stage", ORANGE]] : [])];
    const vt = types.map(([k]) => sel.filter(o => o.type === k).length);
    anneau("g-type", types.map(t => t[1]), vt, types.map(t => t[2]));
    verifier("g-type", { titre: "Type de contrat", base: sel, cle: o => o.type, cles: types.map(t => t[0]), libelles: types.map(t => t[1]), champ: "type", valeur: o => o.type });
    phrase = `<b>${pct(vt[0], N)} %</b> des offres sont en <b>apprentissage</b>, ${pct(vt[1], N)} % en contrat de professionnalisation${contrat === "tous" ? `, ${pct(vt[3], N)} % sont des stages` : ""}.`;
  }
  const dipl = D.diplomes.map(k => [k, sel.filter(o => o.diplome === k).length]);
  const connus = dipl.reduce((a, x) => a + x[1], 0);
  ecrire("t-diplome", `Diplôme cité <small>(${nb(connus)} offres sur ${nb(N)})</small>`);
  barres("g-diplome", dipl.map(x => x[0]), dipl.map(x => x[1]), { horizontal: false, total: connus });
  verifier("g-diplome", { titre: "Diplôme cité", base: sel.filter(o => o.diplome), cle: o => o.diplome, cles: D.diplomes, champ: "diplome", total: connus, totalLibelle: "offres qui citent un diplôme",
    valeur: o => `${o.diplome} (${o.dipl_src === "champ" ? "champ de la source" : "lu dans le texte"})` });
  const top = dipl.slice().sort((a, b) => b[1] - a[1])[0];
  ecrire("r-contrat", (N ? phrase + (connus >= 3 ? ` Quand un diplôme est cité (${pct(connus, N)} % des annonces), c'est le plus souvent un <b>${top[0]}</b> (${pct(top[1], connus)} %).` : " Les annonces ne citent presque jamais le diplôme.") + fragile(N) : "Aucune offre.") + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-contrat", lSource + " Diplôme : le plus haut niveau mentionné dans l'annonce (champ de la source, sinon lu dans le texte).");

  /* 5. Qui recrute */
  const cl = D.classes_effectif;
  const vc = cl.map(k => sel.filter(o => o.eff === k).length);
  const taillesConnues = vc.reduce((a, b) => a + b, 0);
  ecrire("t-taille", `Taille de l'employeur <small>(connue pour ${nb(taillesConnues)} offres)</small>`);
  barres("g-taille", cl.map(k => k + " sal."), vc, { horizontal: false, total: taillesConnues });
  verifier("g-taille", { titre: "Taille de l'employeur", base: sel.filter(o => o.eff), cle: o => o.eff, cles: cl, libelles: cl.map(k => k + " salariés"), champ: "eff", total: taillesConnues, totalLibelle: "offres dont la taille de l'employeur est connue",
    valeur: o => o.ent_off ? `${o.ent_off} (SIRENE)` : (o.eff_lib ? `tranche France Travail : ${o.eff_lib}` : "—") });
  const sect = compter(sel, o => o.section ? D.sections[o.section] : null).slice(0, 7);
  const sectConnus = sel.filter(o => o.section).length;
  barres("g-secteur", sect.map(x => x[0].length > 32 ? x[0].slice(0, 31) + "…" : x[0]), sect.map(x => x[1]), { total: sectConnus });
  verifier("g-secteur", { titre: "Secteur de l'employeur", base: sel.filter(o => o.section), cle: o => D.sections[o.section], cles: sect.map(x => x[0]), champ: "section", total: sectConnus, totalLibelle: "offres dont le secteur est connu", valeur: o => `NAF ${o.naf}` });
  const petites = vc.slice(0, 3).reduce((a, b) => a + b, 0);
  ecrire("r-qui", (taillesConnues ? `<b>${pct(petites, taillesConnues)} %</b> des offres dont on connaît l'employeur viennent de structures de <b>moins de 50 salariés</b>.`
    + (sect.length ? ` Premier secteur : <b>${esc(sect[0][0])}</b>.` : "") + (nEcoles && !ecoles ? ` Et ${pct(nEcoles, toutes.length)} % des annonces du marché sont publiées par des écoles.` : "") + fragile(taillesConnues) : "Taille des employeurs inconnue.") + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-qui", lSource + " Taille et secteur : répertoire SIRENE (API Recherche d'entreprises), employeur retrouvé par son nom et son département.");

  /* 6. Outils */
  const outils = D.outils.map(n => [n, sel.filter(o => (o.outils || []).includes(n)).length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  barres("g-outils", outils.map(x => x[0]), outils.map(x => pct(x[1], N)), { pourcent: true });
  verifier("g-outils", { titre: "Outils et compétences cités", base: sel, cle: o => o.outils || [], cles: outils.map(x => x[0]), champ: "outils",
    note: "Une offre qui cite plusieurs outils est comptée dans chaque ligne.", valeur: o => (o.outils || []).join(", ") || "aucun" });
  ecrire("r-outils", (N && outils[0][1] ? `<b>${esc(outils[0][0])}</b> revient dans <b>${pct(outils[0][1], N)} %</b> des offres, devant ${esc(outils[1][0])} (${pct(outils[1][1], N)} %) et ${esc(outils[2][0])} (${pct(outils[2][1], N)} %).${fragile(N)}` : "Pas d'outil cité.") + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-outils", lSource + " Mots cherchés dans le titre et le texte de l'annonce (grille modifiable dans config/alternance.json).");

  /* 7. Salaire */
  const tr = [["< 600 €", 0, 600], ["600–899", 600, 900], ["900–1 199", 900, 1200], ["1 200–1 499", 1200, 1500], ["1 500–1 799", 1500, 1800], ["1 800 € et +", 1800, 1e9]];
  ecrire("t-salaire", `Minimum affiché, brut par mois <small>(${nb(avecSal.length)} offres)</small>`);
  barres("g-salaire", tr.map(x => x[0]), tr.map(([, a, b]) => avecSal.filter(o => o.smin >= a && o.smin < b).length), { horizontal: false, total: avecSal.length });
  verifier("g-salaire", { titre: "Rémunération affichée (minimum)", base: avecSal, cle: o => (tr.find(([, a, b]) => o.smin >= a && o.smin < b) || [])[0], cles: tr.map(x => x[0]), champ: "salaire",
    totalLibelle: "offres qui affichent une rémunération", valeur: o => `${o.smin}${o.smax > o.smin ? "–" + o.smax : ""} € — ${o.sal_lib || ""}` });
  ecrire("r-salaire", (avecSal.length ? `Seules <b>${pct(avecSal.length, N)} %</b> des offres affichent une rémunération. Pour elles, le minimum médian est de <b>${euro(mediane(avecSal.map(o => o.smin)))} brut par mois</b>.${fragile(avecSal.length)}` : "Aucune offre de ce choix n'affiche de rémunération.") + ` <button class="lien-verif">Vérifier</button>`);
  ecrire("s-salaire", lSource + (contrat === "stage" ? " Un stage de plus de 2 mois doit être gratifié (minimum fixé par la loi)." : " Pour un apprenti, le minimum légal dépend de l'âge et de l'année de contrat.") + " Montants mensuels saisis par erreur dans la case « annuel » : corrigés.");

  /* 8. Méthode */
  const q = D.qualite;
  ecrire("m-sources", q.sources.filter(x => noms[x.source]).map(x => `<li><b>${esc(noms[x.source])}</b> : ${x.n ? nb(x.n) + " offres lues" : "non interrogé (pas de clé)"}</li>`).join("")
    + `<li><b>API Recherche d'entreprises</b> (État) : taille et secteur de ${nb(q.entreprises.offres_identifiees)} offres</li>`);
  ecrire("m-verifs", [
    `${nb(q.brutes)} offres lues → <b>${nb(q.retenues)}</b> après suppression des doublons (${nb(q.doublons_meme_id + q.doublons_proches)} retirés)`,
    `${nb(q.ecoles)} offres publiées par des écoles repérées (activité « enseignement » ou nom)`,
    `${nb((q.salaire || {})["corrigé"] || 0)} salaires mal saisis corrigés`,
    `<b>${q.controles.filter(c => c.ok).length} contrôles automatiques sur ${q.controles.length} réussis</b> (dates, lieux, liens, recoupement avec la base du cours)`,
  ].map(t => `<li>${t}</li>`).join(""));
  const dispo = D.offres.filter(o => passeMetier(o) && passeContrat(o) && (ecoles || !o.ecole)).length;
  ecrire("appel-titre", `Voir les ${nb(dispo)} offres ${EN()} disponibles pour ${esc(libMetier())}`);
  document.getElementById("appel-offres").href = "offres.html#" + p;
}

/* ---- Mise en place ---- */
const groupes = [...new Set(D.metiers.map(m => m.groupe))];
document.getElementById("p-metier").innerHTML = `<option value="*">Tous les métiers suivis</option>`
  + groupes.map(g => `<option value="g:${esc(g)}">Groupe ${esc(g)}</option>`).join("")
  + groupes.map(g => `<optgroup label="${esc(g)}">` + D.metiers.filter(m => m.groupe === g).map(m => `<option value="${m.code}">${esc(m.libelle)}</option>`).join("") + `</optgroup>`).join("");
document.getElementById("p-metier").value = metier;
document.getElementById("p-ecoles").checked = ecoles;
document.getElementById("p-metier").addEventListener("change", e => { metier = e.target.value; rendre(); });
document.getElementById("p-contrat").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { contrat = b.dataset.c; rendre(); } });
document.getElementById("p-ecoles").addEventListener("change", e => { ecoles = e.target.checked; rendre(); });
document.getElementById("p-imprimer").addEventListener("click", () => window.print());
// Un encadré « À retenir » ouvre la répartition complète du graphique voisin.
document.querySelectorAll(".retenir[data-g]").forEach(r => r.addEventListener("click", () => verifGraphique(r.dataset.g)));
rendre();
