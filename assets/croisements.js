/* ============================================================
   croisements.js — la page « Analyse croisée » (croisements.html).
   Données : data/metiers-cibles.js (scripts/metiers_cibles.py).
   Utilitaires : assets/commun.js (trancheExp, familleContrat,
   dessiner, dateFr, IDF…).

   Chaque croisement est un tableau de contingence : on compte les
   offres pour chaque couple (ligne, colonne), on dessine la part
   de chaque colonne dans chaque ligne (barres à 100 %), et un test
   du khi-deux dit si les écarts sont dus au hasard ou non
   (méthode du CM 2 du cours). Les croisements avec le salaire
   comparent des médianes (test de Kruskal-Wallis).
   ============================================================ */
(() => {
  const MC = window.METIERS_CIBLES;
  if (!MC) { document.getElementById("sous").textContent = "Impossible de lire data/metiers-cibles.js."; return; }
  D = MC;
  if (window.Navigation) Navigation.poser(`Données du ${dateFr(MC.date)}`);

  const echap = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nb = n => n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR");
  const dec = (n, d = 1) => n == null || !isFinite(n) ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pc = (a, b) => b ? Math.round(100 * a / b) : 0;
  const pluriel = (n, mot) => `${nb(n)} ${mot}${n > 1 ? "s" : ""}`;
  const pTexte = p => p < 0.001 ? "p < 0,001" : `p = ${dec(p, p < 0.01 ? 3 : 2)}`;
  const INTERMEDIAIRE = /travail temporaire|placement de main|mise à disposition de ressources humaines|agences de placement|activités liées à l'emploi/i;

  /* ============================================================
     1) STATISTIQUES : khi-deux et Kruskal-Wallis, sans bibliothèque
     ============================================================ */
  function lnGamma(z) {   // approximation de Lanczos
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function gammaQ(a, x) {  // fonction gamma incomplète régularisée « haute » Q(a, x)
    if (x <= 0) return 1;
    if (x < a + 1) {
      let somme = 1 / a, terme = somme;
      for (let n = 1; n < 500; n++) { terme *= x / (a + n); somme += terme; if (Math.abs(terme) < Math.abs(somme) * 1e-14) break; }
      return 1 - somme * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 1e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  const pKhi2 = (x, ddl) => gammaQ(ddl / 2, x / 2);

  /* Khi-deux d'indépendance sur un tableau de comptes (lignes × colonnes), lignes/colonnes vides écartées. */
  function khi2(tab) {
    const L = tab.filter(l => l.reduce((s, v) => s + v, 0) > 0);
    if (!L.length) return null;
    const totC = L[0].map((_, j) => L.reduce((s, l) => s + l[j], 0));
    const cols = totC.map((t, j) => t > 0 ? j : -1).filter(j => j >= 0);
    const T = L.map(l => cols.map(j => l[j]));
    const r = T.length, k = cols.length;
    if (r < 2 || k < 2) return null;
    const totL = T.map(l => l.reduce((s, v) => s + v, 0)), totK = cols.map((_, j) => T.reduce((s, l) => s + l[j], 0));
    const n = totL.reduce((s, v) => s + v, 0);
    let x = 0, petits = 0;
    for (let i = 0; i < r; i++) for (let j = 0; j < k; j++) {
      const e = totL[i] * totK[j] / n;
      if (e < 5) petits++;
      x += (T[i][j] - e) ** 2 / e;
    }
    const ddl = (r - 1) * (k - 1);
    return { x, ddl, p: pKhi2(x, ddl), v: Math.sqrt(x / (n * (Math.min(r, k) - 1))), n, petits: petits / (r * k) };
  }
  /* Kruskal-Wallis : les médianes des groupes diffèrent-elles ? (rangs, correction des ex aequo) */
  function kruskal(groupes) {
    const G = groupes.filter(g => g.length >= 2);
    if (G.length < 2) return null;
    const tous = G.flatMap((g, i) => g.map(v => [v, i])).sort((a, b) => a[0] - b[0]);
    const N = tous.length, rangs = new Array(N);
    let ex = 0;
    for (let i = 0; i < N;) {
      let j = i; while (j + 1 < N && tous[j + 1][0] === tous[i][0]) j++;
      const r = (i + j + 2) / 2, t = j - i + 1;
      for (let m = i; m <= j; m++) rangs[m] = r;
      ex += t ** 3 - t; i = j + 1;
    }
    const somme = G.map(() => 0), effectif = G.map(g => g.length);
    tous.forEach(([, g], i) => { somme[g] += rangs[i]; });
    let h = 12 / (N * (N + 1)) * somme.reduce((s, R, g) => s + R * R / effectif[g], 0) - 3 * (N + 1);
    h /= (1 - ex / (N ** 3 - N)) || 1;
    return { h, ddl: G.length - 1, p: pKhi2(h, G.length - 1), n: N };
  }
  const intensite = v => v < 0.1 ? "très faible" : v < 0.2 ? "faible" : v < 0.3 ? "moyen" : "fort";

  /* ============================================================
     2) LES CRITÈRES (dimensions) d'une offre
     ============================================================ */
  const METROPOLES = new Set(MC.grandes_villes.filter(c => c !== "75056").slice(0, 10));
  const nomsMetropoles = [...METROPOLES].map(c => (MC.villes[c] || [c])[0]).join(", ");
  const popVille = c => (MC.villes[c] || [])[1] || 0;
  const TERRITOIRES = ["Paris", "Reste de l'Île-de-France", "10 grandes métropoles", "Autres villes de 50 000 hab. et plus", "Communes de moins de 50 000 hab."];
  function territoire(o) {
    if (o.ville === "75056" || o.dep === "75") return TERRITOIRES[0];
    if (IDF.has(o.dep)) return TERRITOIRES[1];
    if (!o.ville) return null;
    if (METROPOLES.has(o.ville)) return TERRITOIRES[2];
    return popVille(o.ville) >= 50000 ? TERRITOIRES[3] : TERRITOIRES[4];
  }
  const region = o => { const d = MC.departements[o.dep]; return d && MC.regions[d[2]] || null; };
  const EXP = ["Débutant accepté", "Jusqu'à 2 ans", "3 à 4 ans", "5 ans et plus"];
  function experience(o) {
    const t = trancheExp(o);   // commun.js : Débutant accepté, Moins d'un an, 1 à 2 ans, 3 à 4 ans, 5 ans et plus, Non précisé
    return t === "Non précisé" ? null : (t === "Moins d'un an" || t === "1 à 2 ans") ? EXP[1] : t;
  }
  const ETUDES = ["Bac ou moins", "Bac+2", "Bac+3/4", "Bac+5"];
  const etudes = o => !o.etudes ? null : (o.etudes === "Bac" || o.etudes === "< Bac") ? ETUDES[0] : o.etudes;
  const CONTRATS_C = ["CDI", "CDD", "Intérim", "Alternance", "Autre"];
  const contrat = o => ({ cdi: "CDI", cdd: "CDD", mis: "Intérim", alt: "Alternance" })[familleContrat(o)] || "Autre";
  // Salaire annuel brut : milieu de la fourchette affichée. Les alternances sont écartées (rémunération légale, pas un salaire de marché).
  const salaire = o => (o.smin != null && !o.alternance && familleContrat(o) !== "alt") ? (o.smin + (o.smax != null ? o.smax : o.smin)) / 2 : null;
  const libMetier = Object.fromEntries(MC.metiers.map(m => [m.cle, m.libelle]));

  const CRITERES = {
    lieu: { titre: "Lieu", ordonne: false,
            valeurs: o => { const v = etat.lieu === "region" ? region(o) : territoire(o); return v ? [v] : []; },
            ordre: () => etat.lieu === "region" ? null : TERRITOIRES },
    exp: { titre: "Expérience demandée", ordonne: true, valeurs: o => { const v = experience(o); return v ? [v] : []; }, ordre: () => EXP },
    etudes: { titre: "Niveau d'études", ordonne: true, valeurs: o => { const v = etudes(o); return v ? [v] : []; }, ordre: () => ETUDES },
    contrat: { titre: "Type de contrat", ordonne: false, valeurs: o => [contrat(o)], ordre: () => CONTRATS_C },
    metier: { titre: "Métier", ordonne: false, multi: true,
              valeurs: o => MC.metiers.map(m => m.cle).filter(k => dans(o, k)).map(k => libMetier[k]),
              ordre: () => MC.metiers.map(m => m.libelle) },
  };
  const TEINTES_ORD = ["#c7dbff", "#86adff", "#3f78f0", "#173f9e"];
  const TEINTES_CAT = ["#1f5eff", "#ff8a3d", "#12a37f", "#b04ad6", "#9aa0ab", "#e3b505", "#e5484d"];

  /* Les croisements : 4 demandés, puis 5 proposés. */
  const CROISEMENTS = [
    { id: "lieu-exp", l: "lieu", c: "exp", question: "Les offres demandent-elles plus d'expérience selon l'endroit ?" },
    { id: "lieu-etudes", l: "lieu", c: "etudes", question: "Le niveau d'études demandé change-t-il selon l'endroit ?" },
    { id: "etudes-exp", l: "etudes", c: "exp", question: "Plus on demande de diplôme, plus on demande d'expérience ?" },
    { id: "metier-exp", l: "metier", c: "exp", question: "Quels métiers sont ouverts aux débutants, lesquels demandent de l'expérience ?" },
    { id: "metier-etudes", l: "metier", c: "etudes", propose: true, question: "Quel niveau d'études chaque métier demande-t-il ?" },
    { id: "metier-contrat", l: "metier", c: "contrat", propose: true, question: "Quels métiers recrutent en CDI, en CDD, en intérim ou en alternance ?" },
    { id: "lieu-contrat", l: "lieu", c: "contrat", propose: true, question: "Le type de contrat dépend-il de l'endroit ?" },
    { id: "exp-salaire", l: "exp", salaire: true, propose: true, question: "Combien rapporte l'expérience ? Le salaire affiché selon l'expérience demandée." },
    { id: "lieu-salaire", l: "lieu", salaire: true, propose: true, question: "Paie-t-on mieux à Paris ? Le salaire affiché selon l'endroit." },
  ];
  const titreC = c => c.salaire ? `${CRITERES[c.l].titre} × salaire` : `${CRITERES[c.l].titre} × ${CRITERES[c.c].titre.toLowerCase()}`;

  /* ============================================================
     3) ÉTAT ET SÉLECTION
     ============================================================ */
  const etat = { metier: "tous", intitule: true, inter: false, lieu: "territoire" };
  const lu = /m=([a-z]+)/.exec(location.hash);
  if (lu && (lu[1] === "tous" || MC.metiers.some(m => m.cle === lu[1]))) etat.metier = lu[1];
  const dans = (o, k) => o.m.includes(k) || (!etat.intitule && o.c.includes(k));
  const garde = o => !(etat.inter && INTERMEDIAIRE.test(o.secteur || ""));
  const selection = (metier = etat.metier) => {
    const cles = metier === "tous" ? MC.metiers.map(m => m.cle) : [metier];
    return MC.offres.filter(o => cles.some(k => dans(o, k)) && garde(o));
  };
  const libSel = () => etat.metier === "tous" ? "les six métiers" : libMetier[etat.metier];

  function poserChoix() {
    document.getElementById("choix").innerHTML = [["tous", "Les six ensemble"], ...MC.metiers.map(m => [m.cle, m.libelle])].map(([k, l]) =>
      `<button type="button" data-m="${k}" aria-pressed="${k === etat.metier}">${echap(l)}<small>${selection(k).length}</small></button>`).join("");
  }
  document.getElementById("choix").addEventListener("click", e => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    etat.metier = b.dataset.m;
    history.replaceState(null, "", "#m=" + etat.metier);
    rendre();
  });
  document.getElementById("r-intitule").addEventListener("change", e => { etat.intitule = e.target.checked; rendre(); });
  document.getElementById("r-intermediaires").addEventListener("change", e => { etat.inter = e.target.checked; rendre(); });
  document.getElementById("r-lieu").addEventListener("change", e => { etat.lieu = e.target.value; rendre(); });

  /* ---------- Fenêtre des offres comptées ---------- */
  const fenetre = document.getElementById("fenetre");
  let detail = { titre: "", offres: [] };
  function montrer(titre, offres, calcul) {
    detail = { titre, offres };
    document.getElementById("fenetre-titre").textContent = `${titre} — ${pluriel(offres.length, "offre")}`;
    document.getElementById("fenetre-calcul").textContent = calcul || "";
    const tri = [...offres].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    document.getElementById("fenetre-liste").innerHTML = tri.map(o => {
      const s = salaire(o);
      return `<div class="item">
        <div class="titre">${o.url ? `<a href="${echap(o.url)}" target="_blank" rel="noopener">${echap(o.intitule)}</a>` : echap(o.intitule)}</div>
        <div class="meta"><span>${echap(o.entreprise || "employeur non précisé")}</span><span>·</span><span>${echap(o.lieu || "lieu non précisé")}</span>
          <span>·</span><span>${echap(contrat(o))}</span><span>·</span><span>expérience : ${echap(trancheExp(o).toLowerCase())}</span>
          <span>·</span><span>études : ${echap(o.etudes || "non précisé")}${o.etudes_src === "texte" ? " (lu dans le texte)" : ""}</span>
          ${s ? `<span>·</span><span class="sal">${nb(s)} € brut/an</span>` : ""}</div></div>`;
    }).join("") || `<p class="note">Aucune offre.</p>`;
    if (fenetre.showModal) { if (!fenetre.open) fenetre.showModal(); } else fenetre.setAttribute("open", "");
  }
  document.getElementById("fermer").addEventListener("click", () => fenetre.close());
  fenetre.addEventListener("click", e => { if (e.target === fenetre) fenetre.close(); });
  document.getElementById("exporter").addEventListener("click", () => {
    const col = ["id", "rome", "intitule", "entreprise", "lieu", "departement", "contrat", "experience", "etudes", "etudes_source", "salaire_annuel_brut", "date", "url"];
    const cell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lignes = detail.offres.map(o => [o.id, o.rome, o.intitule, o.entreprise, o.lieu, o.dep, contrat(o), trancheExp(o), o.etudes, o.etudes_src, salaire(o), o.date, o.url].map(cell).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + col.join(";") + "\n" + lignes.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `croisement-${detail.titre.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()}-${MC.date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ============================================================
     4) CALCUL D'UN CROISEMENT
     ============================================================ */
  // Les lignes d'un critère : l'ordre fixe s'il existe, sinon par effectif ; en régions, les plus petites sont regroupées.
  function modalites(critere, offres) {
    const C = CRITERES[critere], fixe = C.ordre();
    const compte = new Map();
    offres.forEach(o => C.valeurs(o).forEach(v => compte.set(v, (compte.get(v) || 0) + 1)));
    if (fixe) return fixe.filter(v => compte.has(v));
    const tri = [...compte].sort((a, b) => b[1] - a[1]);
    return tri.map(x => x[0]);
  }
  function regrouperPetites(valeursDe, offres, seuil) {
    // Régions de moins de `seuil` offres : une seule ligne « Autres régions ».
    const compte = new Map();
    offres.forEach(o => valeursDe(o).forEach(v => compte.set(v, (compte.get(v) || 0) + 1)));
    const petites = new Set([...compte].filter(([, n]) => n < seuil).map(([v]) => v));
    return petites.size > 1 ? o => valeursDe(o).map(v => petites.has(v) ? "Autres régions" : v) : valeursDe;
  }

  function calculer(c, base) {
    const offres = (c.l === "metier") ? selection("tous") : base;   // « Métier × … » compare toujours les six métiers
    let valL = CRITERES[c.l].valeurs;
    if (c.l === "lieu" && etat.lieu === "region") valL = regrouperPetites(valL, offres, 20);
    const valC = c.salaire ? o => { const s = salaire(o); return s != null ? [s] : []; } : CRITERES[c.c].valeurs;
    const retenues = offres.filter(o => valL(o).length && valC(o).length);
    let lignes = [...new Set(retenues.flatMap(valL))];
    const fixe = CRITERES[c.l].ordre();
    lignes = fixe && !(c.l === "lieu" && etat.lieu === "region") ? fixe.filter(v => lignes.includes(v))
      : lignes.sort((a, b) => a === "Autres régions" ? 1 : b === "Autres régions" ? -1 : retenues.filter(o => valL(o).includes(b)).length - retenues.filter(o => valL(o).includes(a)).length);
    const cellule = (l, k) => retenues.filter(o => valL(o).includes(l) && (k == null || valC(o).includes(k)));
    const ecartees = offres.length - retenues.length;
    if (c.salaire) {
      const groupes = lignes.map(l => cellule(l).map(o => salaire(o)));
      return { c, offres, retenues, lignes, ecartees, groupes, test: kruskal(groupes), cellule, valL };
    }
    // Une colonne de moins de 5 offres (ex. « Autre » contrat) rendrait le test peu fiable : elle est mise de côté et signalée.
    const parCol = k => retenues.filter(o => valC(o).includes(k)).length;
    const toutes = CRITERES[c.c].ordre().filter(k => parCol(k) > 0);
    const colonnes = toutes.filter(k => parCol(k) >= 5);
    const minuscules = toutes.filter(k => parCol(k) < 5).map(k => [k, parCol(k)]);
    const tab = lignes.map(l => colonnes.map(k => cellule(l, k).length));
    return { c, offres, retenues, lignes, colonnes, tab, ecartees, minuscules, test: khi2(tab), cellule };
  }

  /* La phrase « à retenir » : l'écart le plus marqué entre une ligne et l'ensemble. */
  function aRetenir(r) {
    const { lignes, colonnes, tab, c } = r;
    const n = tab.flat().reduce((s, v) => s + v, 0);
    const totK = colonnes.map((_, j) => tab.reduce((s, l) => s + l[j], 0));
    let meilleur = null;
    tab.forEach((l, i) => {
      const nl = l.reduce((s, v) => s + v, 0);
      if (nl < 15) return;   // une ligne trop petite ne fait pas une conclusion
      l.forEach((v, j) => {
        const ecart = v / nl - totK[j] / n;
        if (!meilleur || Math.abs(ecart) > Math.abs(meilleur.ecart)) meilleur = { i, j, ecart, part: v / nl, moy: totK[j] / n, nl };
      });
    });
    if (!meilleur) return "";
    const ligne = lignes[meilleur.i], col = colonnes[meilleur.j].toLowerCase();
    const quoi = { exp: `demandent « ${col} »`, etudes: `demandent un niveau ${colonnes[meilleur.j]}`, contrat: `sont en ${colonnes[meilleur.j]}` }[c.c];
    const qui = c.l === "metier" ? `en ${ligne}` : c.l === "exp" ? `parmi celles qui demandent « ${ligne.toLowerCase()} »` : c.l === "etudes" ? `parmi celles qui demandent ${ligne}` : `pour « ${ligne} »`;
    return `<b>${pc(meilleur.part * meilleur.nl, meilleur.nl)} %</b> des offres ${qui} ${quoi}, contre <b>${pc(meilleur.moy * n, n)} %</b> pour l'ensemble.`;
  }

  /* ============================================================
     5) RENDU
     ============================================================ */
  function verdict(r) {
    const t = r.test;
    if (!t) return `<div class="verdict non"><span class="pastille-test">Pas de test</span><div>Trop peu d'offres renseignées pour comparer.</div></div>`;
    const fragile = !r.c.salaire && t.petits > 0.2;
    const lien = t.p < 0.05;
    const cls = fragile ? "fragile" : lien ? "oui" : "non";
    const pastille = fragile ? (lien ? "Lien probable" : "Test fragile") : lien ? "Lien démontré" : "Pas de lien démontré";
    const phrase = r.c.salaire ? texteSalaire(r) : aRetenir(r);
    const conclusion = r.c.salaire
      ? (lien ? "Les salaires affichés diffèrent vraiment d'un groupe à l'autre." : "Les écarts de salaire ne sont pas assez nets pour conclure.")
      : fragile ? (lien ? `Les écarts semblent trop grands pour être dus au hasard (lien ${intensite(t.v)}), mais trop de cases ont peu d'offres pour que le test soit sûr.` : "Trop de cases ont peu d'offres : on ne peut pas conclure.")
      : lien ? `Les deux critères sont liés (lien ${intensite(t.v)}).` : "Les écarts entre les barres peuvent être dus au hasard.";
    const stats = r.c.salaire
      ? `Kruskal-Wallis : H = ${dec(t.h, 2)}, ${t.ddl} ddl, ${pTexte(t.p)} — ${nb(t.n)} offres avec un salaire affiché.`
      : `Khi-deux = ${dec(t.x, 1)}, ${t.ddl} ddl, ${pTexte(t.p)} ; V de Cramér = ${dec(t.v, 2)} (${intensite(t.v)}) — ${nb(t.n)} offres.`
        + (t.petits > 0 ? ` ${pc(t.petits * 100, 100)} % des cases ont un effectif attendu inférieur à 5${fragile ? " (plus de 20 % : résultat à prendre avec prudence)" : ""}.` : "");
    return `<div class="verdict ${cls}"><span class="pastille-test">${pastille}</span><div>${conclusion} ${phrase}<p class="stats-test">${stats}</p></div></div>`;
  }
  function texteSalaire(r) {
    const med = r.groupes.map(g => mediane(g));
    const ok = r.lignes.map((l, i) => ({ l, m: med[i], n: r.groupes[i].length })).filter(x => x.n >= 5 && x.m != null);
    if (ok.length < 2) return "";
    const haut = ok.reduce((a, b) => b.m > a.m ? b : a), bas = ok.reduce((a, b) => b.m < a.m ? b : a);
    return `Salaire médian le plus haut : <b>${nb(haut.m)} €</b> brut par an (${echap(haut.l)}, ${haut.n} offres) ; le plus bas : <b>${nb(bas.m)} €</b> (${echap(bas.l)}, ${bas.n} offres).`;
  }

  function carte(r, i) {
    const c = r.c, idG = "g-" + c.id;
    const pour = c.l === "metier" ? "les six métiers" : libSel();
    const lignesTab = c.salaire ? "" : `<details class="tableau"><summary>Voir le tableau des effectifs</summary><div class="defile"><table class="tab" data-c="${i}">
        <thead><tr><th>${echap(CRITERES[c.l].titre)}</th>${r.colonnes.map(k => `<th>${echap(k)}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>${r.lignes.map((l, a) => { const t = r.tab[a].reduce((s, v) => s + v, 0);
          return `<tr><td>${echap(l)}</td>${r.tab[a].map((v, b) => `<td class="cellule" tabindex="0" data-l="${a}" data-k="${b}">${v} <small>${pc(v, t)} %</small></td>`).join("")}<td>${t}</td></tr>`; }).join("")}
          <tr class="total"><td>Ensemble</td>${r.colonnes.map((_, b) => { const v = r.tab.reduce((s, l) => s + l[b], 0); return `<td>${v} <small>${pc(v, r.tab.flat().reduce((s, x) => s + x, 0))} %</small></td>`; }).join("")}<td>${r.tab.flat().reduce((s, x) => s + x, 0)}</td></tr></tbody>
      </table></div><p class="note-c">Dans chaque case : le nombre d'offres, puis la part de la ligne. Cliquez une case pour voir ses offres.</p></details>`;
    const tableSal = !c.salaire ? "" : `<details class="tableau"><summary>Voir le détail des salaires</summary><div class="defile"><table class="tab" data-c="${i}">
        <thead><tr><th>${echap(CRITERES[c.l].titre)}</th><th>Offres</th><th>1<sup>er</sup> quartile</th><th>Médiane</th><th>3<sup>e</sup> quartile</th></tr></thead>
        <tbody>${r.lignes.map((l, a) => { const g = r.groupes[a];
          return `<tr><td>${echap(l)}</td><td class="cellule" tabindex="0" data-l="${a}">${g.length}</td><td>${nb(quantile(g, .25))} €</td><td><b>${nb(mediane(g))} €</b></td><td>${nb(quantile(g, .75))} €</td></tr>`; }).join("")}</tbody>
      </table></div><p class="note-c">Salaire annuel brut, milieu de la fourchette affichée. Cliquez un nombre d'offres pour les voir.</p></details>`;
    const notes = [];
    if (r.ecartees) notes.push(`${pluriel(r.ecartees, "offre")} sur ${nb(r.offres.length)} écartée${r.ecartees > 1 ? "s" : ""} : ${c.salaire ? "sans salaire affiché, ou en alternance" : "un des deux critères n'est pas précisé"}.`);
    if (r.minuscules && r.minuscules.length) notes.push(`Mis de côté car trop rare pour le test : ${r.minuscules.map(([k, n]) => `« ${echap(k)} » (${n})`).join(", ")}.`);
    if (c.l === "metier") notes.push("Une offre rangée dans deux métiers compte dans les deux lignes.");
    if ((c.l === "lieu" || c.c === "lieu") && etat.lieu === "territoire") notes.push(`Les 10 grandes métropoles : ${echap(nomsMetropoles)}.`);
    if (c.c === "etudes" || c.l === "etudes") notes.push("Niveau d'études : le champ de l'offre, ou à défaut le niveau le plus élevé cité dans le texte de l'annonce.");
    return `<section class="carte croisement" id="${c.id}">
      <div class="croisement-tete"><div><h2>${echap(titreC(c))}</h2><p class="question">${echap(c.question)}</p></div><span class="pour">Pour : ${echap(pour)}</span></div>
      ${verdict(r)}
      <div class="zone-c"><canvas id="${idG}"></canvas></div>
      ${lignesTab}${tableSal}
      ${notes.length ? `<p class="note-c">${notes.join(" ")}</p>` : ""}
    </section>`;
  }

  function graphique(r) {
    const c = r.c, id = "g-" + c.id, el = document.getElementById(id);
    el.parentNode.style.height = Math.max(200, 70 + r.lignes.length * (c.salaire ? 38 : 44)) + "px";
    if (c.salaire) {
      const lignes = r.lignes.map((l, a) => ({ l, g: r.groupes[a] }));
      return dessiner(id, "bar", {
        labels: lignes.map(x => enLignes(`${x.l} (${x.g.length})`, 34)),
        datasets: [{ label: "1er au 3e quartile", data: lignes.map(x => x.g.length ? [quantile(x.g, .25), quantile(x.g, .75)] : null), backgroundColor: "rgba(31,94,255,.25)", borderColor: "#1f5eff", borderWidth: 1, borderRadius: 4, borderSkipped: false },
                   { label: "Médiane", type: "scatter", data: lignes.map((x, i) => x.g.length ? { x: mediane(x.g), y: i } : null), backgroundColor: "#173f9e", pointRadius: 6, pointStyle: "rectRot" }],
      }, { indexAxis: "y",
        onClick: (e, els) => { if (els.length) { const a = els[0].index; montrer(`${r.lignes[a]}`, r.cellule(r.lignes[a]), `Offres avec un salaire affiché (hors alternance) — médiane ${nb(mediane(r.groupes[a]))} € brut par an.`); } },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
        plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.type === "scatter" ? `Médiane : ${nb(ctx.raw.x)} € brut par an` : `De ${nb(ctx.raw[0])} à ${nb(ctx.raw[1])} € (la moitié des offres)` } } },
        scales: { x: { beginAtZero: false, ticks: { callback: v => Math.round(v / 1000) + " k€" }, title: { display: true, text: "salaire annuel brut affiché" } },
                  y: { type: "category", labels: lignes.map(x => enLignes(`${x.l} (${x.g.length})`, 34)), grid: { display: false } } } });
    }
    const totaux = r.tab.map(l => l.reduce((s, v) => s + v, 0));
    const teintes = CRITERES[c.c].ordonne ? TEINTES_ORD : TEINTES_CAT;
    return dessiner(id, "bar", {
      labels: r.lignes.map((l, a) => enLignes(`${l} (${totaux[a]})`, 34)),
      datasets: r.colonnes.map((k, b) => ({ label: k, data: r.tab.map((l, a) => totaux[a] ? 100 * l[b] / totaux[a] : 0), backgroundColor: teintes[b % teintes.length], borderWidth: 0 })),
    }, { indexAxis: "y",
      onClick: (e, els) => { if (els.length) { const a = els[0].index, b = els[0].datasetIndex; montrer(`${r.lignes[a]} × ${r.colonnes[b]}`, r.cellule(r.lignes[a], r.colonnes[b]), `${r.tab[a][b]} offres sur les ${totaux[a]} de la ligne, soit ${pc(r.tab[a][b], totaux[a])} %.`); } },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} : ${pc(r.tab[ctx.dataIndex][ctx.datasetIndex], totaux[ctx.dataIndex])} % (${r.tab[ctx.dataIndex][ctx.datasetIndex]} offres)` } } },
      scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + " %" } }, y: { stacked: true, grid: { display: false } } } });
  }

  function rendre() {
    poserChoix();
    const base = selection();
    document.getElementById("compte").innerHTML = `<b>${pluriel(base.length, "offre")}</b> · ${echap(libSel())}`;
    const resultats = CROISEMENTS.map(c => calculer(c, base));
    // Les graphiques sont recréés à chaque rendu (le nombre de lignes change avec le métier ou le découpage du lieu).
    CROISEMENTS.forEach(c => { const g = graphiques["g-" + c.id]; if (g) { g.destroy(); delete graphiques["g-" + c.id]; } });
    document.getElementById("croisements").innerHTML =
      `<p class="groupe">Les croisements demandés</p>` + resultats.filter(r => !r.c.propose).map(r => carte(r, CROISEMENTS.indexOf(r.c))).join("")
      + `<p class="groupe">D'autres croisements utiles</p>` + resultats.filter(r => r.c.propose).map(r => carte(r, CROISEMENTS.indexOf(r.c))).join("");
    resultats.forEach(graphique);
    document.querySelectorAll("table.tab").forEach(t => {
      const r = resultats[+t.dataset.c];
      t.querySelectorAll("td.cellule").forEach(td => {
        const ouvrir = () => {
          const a = +td.dataset.l, b = td.dataset.k;
          if (r.c.salaire) montrer(r.lignes[a], r.cellule(r.lignes[a]), `Offres avec un salaire affiché (hors alternance).`);
          else montrer(`${r.lignes[a]} × ${r.colonnes[+b]}`, r.cellule(r.lignes[a], r.colonnes[+b]), `${r.tab[a][+b]} offres sur les ${r.tab[a].reduce((s, v) => s + v, 0)} de la ligne.`);
        };
        td.addEventListener("click", ouvrir);
        td.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); } });
      });
    });
  }

  document.getElementById("sur-page").innerHTML = `<span>Aller à :</span>` + CROISEMENTS.map(c =>
    `<a href="#${c.id}"${c.propose ? ' class="propose" title="Croisement proposé en plus"' : ""}>${echap(titreC(c))}</a>`).join("") + `<a href="#methode">Méthode</a>`;
  document.getElementById("sous").innerHTML = `Pour six métiers du marketing et de la communication, à partir des offres France Travail en ligne le <b>${dateFr(MC.date)}</b>. `
    + `Chaque croisement compare deux critères des offres et dit, test à l'appui, s'ils sont liés. Choisissez un métier : tout se recalcule. `
    + `<a href="metiers-cibles.html">← Entreprises et villes</a> · <a href="#methode">Méthode et limites</a>.`;
  const avecEtudes = MC.offres.filter(o => o.m.length && o.etudes), duTexte = avecEtudes.filter(o => o.etudes_src === "texte").length;
  const avecSal = MC.offres.filter(o => o.m.length && salaire(o) != null).length, sixOffres = MC.offres.filter(o => o.m.length).length;
  document.getElementById("t-methode").innerHTML = `
    <ul>
      <li><b>Les offres</b> : ${echap(MC.source)}, en ligne le ${dateFr(MC.date)}, rattachées aux six métiers comme sur la page <a href="metiers-cibles.html">Entreprises et villes</a> (code ROME et intitulé).</li>
      <li><b>Lieu</b> : par type de territoire (Paris ; reste de l'Île-de-France ; les 10 plus grandes villes hors Paris : ${echap(nomsMetropoles)} ; autres villes de 50 000 habitants et plus ; communes plus petites) ou par région. Une offre qui ne donne que sa région, ou un département hors Île-de-France sans commune, est écartée du découpage par territoire.</li>
      <li><b>Expérience demandée</b> : le champ « expérience » de l'offre ; « débutant accepté » quand l'annonce l'accepte ou demande 0 an. Les offres « moins d'un an » sont regroupées avec « 1 à 2 ans ».</li>
      <li><b>Niveau d'études</b> : le champ « formation » de l'offre, rarement rempli ; à défaut, le niveau le plus élevé cité dans le texte (« Bac+5 », « master », « école de commerce », « licence », « BTS »…). ${nb(avecEtudes.length)} offres sur ${nb(sixOffres)} ont un niveau, dont ${nb(duTexte)} lu dans le texte : les autres sont écartées des croisements avec les études.</li>
      <li><b>Type de contrat</b> : CDI, CDD, intérim, alternance (apprentissage ou professionnalisation, quel que soit le contrat qui la porte), autre.</li>
      <li><b>Salaire</b> : milieu de la fourchette affichée, ramené à l'année en brut. ${nb(avecSal)} offres sur ${nb(sixOffres)} en affichent un. Les alternances sont écartées : leur rémunération suit un barème légal, pas le marché.</li>
      <li><b>Tests</b> : khi-deux d'indépendance sur le tableau des effectifs (lignes ou colonnes vides écartées) ; V de Cramér pour l'intensité (moins de 0,1 très faible, 0,1 à 0,2 faible, 0,2 à 0,3 moyen, au-delà fort). Quand plus de 20 % des cases ont un effectif attendu inférieur à 5 (règle de Cochran), le test n'est pas sûr : on écrit « lien probable » au lieu de « lien démontré ». Une catégorie de moins de 5 offres (par exemple « Autre » contrat) est mise de côté, et c'est indiqué sous le graphique. Pour le salaire, test de Kruskal-Wallis sur les rangs.</li>
      <li><b>Limites</b> : un lien n'est pas une cause (Paris concentre aussi les sièges et les postes de responsable) ; une offre rangée dans deux métiers compte deux fois dans les croisements par métier ; les offres qui ne précisent pas un critère ne sont pas forcément comme les autres.</li>
    </ul>`;
  rendre();
})();
