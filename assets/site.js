/* ============================================================
   site.js — ce que les pages Synthèse, Explorer et Offres partagent :
   l'en-tête et le menu, le pied de page, quelques outils de mise
   en forme, et la mémoire des choix (alternance / stage, métier)
   qui suivent d'une page à l'autre.
   Tout est rangé dans l'objet Site, pour ne pas entrer en conflit
   avec les variables des scripts de chaque page.
   ============================================================ */
"use strict";
const Site = (() => {
  const D = window.ALTERNANCE || {};
  const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nb = n => Number(n || 0).toLocaleString("fr-FR");
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const dateFr = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
  const PAGES = [
    ["presentation.html", "Synthèse"],
    ["alternance.html", "Explorer les données"],
    ["offres.html", "Offres disponibles"],
    ["alternance.html#fiabilite", "Méthode et sources"],
    ["marche.html", "Tout le marché (emplois)"],
  ];
  const ici = location.pathname.split("/").pop() || "presentation.html";

  // Les choix communs aux pages : type d'offre (c) et métier (m).
  const CLE = "alternance-choix";
  function lireChoix() { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; } }
  function memoriser(choix) { try { localStorage.setItem(CLE, JSON.stringify({ ...lireChoix(), ...choix })); } catch {} majLiens(); }
  // Les liens du menu emportent les choix : on retrouve le même métier en changeant de page.
  function majLiens() {
    const ch = lireChoix();
    document.querySelectorAll(".menu a[data-page]").forEach(a => {
      const [page, ancre] = a.dataset.page.split("#");
      const p = new URLSearchParams();
      if (ch.c && ch.c !== "alternance") p.set("c", ch.c);
      if (ch.m) p.set("m", ch.m);
      a.href = page + (ancre ? "#" + ancre : (p.toString() ? "#" + p : ""));
    });
  }

  function entete() {
    const el = document.getElementById("entete");
    if (!el) return;
    const pc = (D.qualite && D.qualite.par_contrat) || {};
    el.outerHTML = `<header class="entete"><div class="entete-int">
      <a class="marque" href="presentation.html"><i>A</i><span>Alternance &amp; stages<small>marketing, digital, communication</small></span></a>
      <nav class="menu" aria-label="Pages">${PAGES.map(([p, l]) => `<a data-page="${p}" href="${p}"${p === ici ? ' class="ici" aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <span class="fraicheur" title="Collecte automatique chaque matin sur GitHub">Données du ${dateFr(D.date)} · ${nb(pc.alternance)} alternances, ${nb(pc.stage)} stages</span>
    </div></header>`;
    majLiens();
  }
  function pied() {
    const el = document.getElementById("pied");
    if (!el) return;
    el.outerHTML = `<footer class="pied">
      Réalisé par <a href="https://github.com/Pexi58/metier">Pexi58</a> (M2 MOD, IAE Clermont Auvergne).
      Sources : France Travail, La bonne alternance, Adzuna, croisées avec le répertoire des entreprises (API Recherche d'entreprises).
      Collecte, nettoyage et contrôles : <code>scripts/alternance.mjs</code>, relancé chaque matin par GitHub Actions.
      Chaque chiffre est cliquable pour voir son calcul et les offres comptées. <a href="alternance.html#fiabilite">Méthode, contrôles et limites</a>.
      Pas de scraping de LinkedIn, Indeed, APEC, HelloWork ou JobTeaser (interdit par leurs conditions d'utilisation).
      Les pages « Tout le marché » (toutes les offres d'emploi, pas seulement l'alternance) reprennent la base du cours d'analyse de données (M2 MOD, IAE Clermont Auvergne).
    </footer>`;
  }
  // Sommaire latéral : met en évidence la section en cours de lecture.
  function sommaire() {
    const liens = [...document.querySelectorAll(".sommaire a[href^='#']")];
    if (!liens.length || !("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) liens.forEach(a => a.classList.toggle("ici", a.getAttribute("href") === "#" + e.target.id));
    }), { rootMargin: "-40% 0px -55% 0px" });
    liens.forEach(a => { const s = document.getElementById(a.getAttribute("href").slice(1)); if (s) obs.observe(s); });
  }
  document.addEventListener("DOMContentLoaded", () => { entete(); pied(); sommaire(); });
  if (document.readyState !== "loading") { entete(); pied(); sommaire(); }

  /* ---- Salaires : ce qui se compte, et comment ----
     Un salaire « utile » est affiché, lisible, et n'est pas le barème légal recopié tel quel
     (« 486 € à 1 801 € » = 27 % à 100 % du SMIC : ce n'est pas ce que propose l'employeur). */
  const salUtile = o => o.smin != null && o.sal_etat !== "absent" && !o.sal_bareme;
  // Quartiles par interpolation (comme Excel QUARTILE.INCLUS) : Q1, médiane, Q3.
  function quartiles(valeurs) {
    const t = valeurs.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!t.length) return null;
    const q = p => { const i = (t.length - 1) * p, b = Math.floor(i); return t[b] + (t[Math.min(b + 1, t.length - 1)] - t[b]) * (i - b); };
    return { n: t.length, q1: q(0.25), med: q(0.5), q3: q(0.75), min: t[0], max: t.at(-1) };
  }
  // Minima légaux (config/alternance.json, remuneration_legale) : tableau HTML, recalculé si le SMIC change.
  function minimaLegaux(contrat) {
    const L = D.remuneration_legale;
    if (!L) return "";
    const eur = v => Math.round(v).toLocaleString("fr-FR") + " €";
    const depuis = dateFr(L.smic_depuis);
    if (contrat === "stage") {
      const g = L.gratification_horaire * L.heures_mois;
      return `<p class="note">Gratification minimale d'un stage de plus de 2 mois : <b>${L.gratification_horaire.toLocaleString("fr-FR")} € de l'heure</b>, soit environ <b>${eur(g)} par mois</b> à temps plein (${String(L.heures_mois).replace(".", ",")} h). <a href="${esc(L.source_stage)}" target="_blank" rel="noopener">service-public.fr</a></p>`;
    }
    return `<table class="legal"><caption>Minimum légal d'un apprenti, brut par mois (SMIC de ${eur(L.smic_mensuel)} depuis le ${depuis})</caption>
      <tr><th>Âge</th><th>1<sup>re</sup> année</th><th>2<sup>e</sup> année</th><th>3<sup>e</sup> année</th></tr>`
      + L.apprentissage.map(l => `<tr><td>${esc(l.age)}</td>${l.taux.map(t => `<td>${eur(L.smic_mensuel * t / 100)} <small>(${t} %)</small></td>`).join("")}</tr>`).join("")
      + `</table><p class="note">Un étudiant de master a le plus souvent 21 à 25 ans : de ${eur(L.smic_mensuel * 0.53)} à ${eur(L.smic_mensuel * 0.78)}. Le contrat de professionnalisation suit une grille proche. <a href="${esc(L.source)}" target="_blank" rel="noopener">service-public.fr</a></p>`;
  }
  /* ---- Offres douteuses et tri par fiabilité ----
     o.alertes (écrit par scripts/alternance.mjs, contrôles de sens) : les raisons de lire l'offre avec prudence. */
  const badgeAlerte = o => (o.alertes || []).length
    ? `<span class="badge alerte" title="${esc("À vérifier : " + o.alertes.join(" ; "))}">⚠ à vérifier : ${esc(o.alertes[0])}${o.alertes.length > 1 ? ` (+${o.alertes.length - 1})` : ""}</span>` : "";
  // Une offre « complète et fiable » : employeur nommé, salaire exploitable, texte complet, lieu exact, récente, sans alerte.
  function fiabilite(o) {
    const j = Date.parse(D.date) - Date.parse(o.date), age = isFinite(j) ? j / 86400000 : 99;
    return (o.ent ? 3 : 0) + (salUtile(o) ? 2 : 0) + (o.src !== "ADZ" ? 1 : 0) + (o.prec === "offre" ? 1 : 0) + (o.diplome ? 0.5 : 0)
      + (age < 7 ? 2 : age < 30 ? 1 : 0) - 4 * (o.alertes || []).length;
  }
  // Le salaire tel qu'il faut le montrer : exploitable, barème recopié, ou invraisemblable (montant annoncé, barré du calcul).
  function salaireAffiche(o) {
    const eur = v => Math.round(v).toLocaleString("fr-FR");
    if (o.sal_bareme) return `<span title="L'annonce recopie le barème légal de l'apprentissage (27 % à 100 % du SMIC) : le montant réel dépend de l'âge et de l'année de contrat">Salaire : barème légal</span>`;
    if (o.sal_etat === "invraisemblable" && o.sal_annonce) return `<span class="sal-douteux" title="Montant invraisemblable pour ce type de contrat : il n'est compté dans aucune statistique">${eur(o.sal_annonce[0])}${o.sal_annonce[1] > o.sal_annonce[0] ? "–" + eur(o.sal_annonce[1]) : ""} € annoncés ⚠</span>`;
    if (o.sal_etat === "rejeté" && o.sal_lib) return `<span class="sal-douteux" title="Montant illisible ou hors de 300–6 000 € par mois : il n'est compté dans aucune statistique">« ${esc(o.sal_lib)} » ⚠</span>`;
    return o.smin ? `<span class="sal">${eur(o.smin)}${o.smax > o.smin ? "–" + eur(o.smax) : ""} € brut/mois</span>` : "";
  }

  // Rend un élément cliquable utilisable au clavier (Entrée, Espace) et annoncé comme bouton.
  function commeBouton(el, action, libelle) {
    el.setAttribute("role", "button"); el.tabIndex = 0;
    if (libelle) el.setAttribute("aria-label", libelle);
    el.addEventListener("click", e => { if (!e.target.closest("a")) action(e); });
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); action(e); } });
  }

  return {
    esc, nb, pct, dateFr, lireChoix, memoriser, salUtile, quartiles, minimaLegaux, commeBouton, badgeAlerte, fiabilite, salaireAffiche,
    // Toutes les offres publiées, y compris celles retirées des chiffres (annonces sans poste) : pour retrouver une offre par son identifiant.
    toutesOffres: () => [...(D.offres || []), ...(D.offres_signalees || [])],
    libDep: code => (D.departements || {})[code] ? `${D.departements[code]} (${code})` : "département " + code,
    villeSimple: v => String(v || "").replace(/\s+\d+(er|e|ème)?\s+(arrondissement|canton)$/i, "").trim(),
    SOURCES: { FT: "France Travail", LBA: "La bonne alternance", ADZ: "Adzuna" },
  };
})();
// Rendu visible de tous les scripts de la page.
window.Site = Site;
