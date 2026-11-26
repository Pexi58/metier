/* ============================================================
   navigation.js — la même barre de navigation sur toutes les pages.
   Chargé en premier par chaque page (avant site.js ou commun.js).

   Le site a quatre rubriques, toujours visibles en haut :
     Accueil · Alternance & stages · Marché de l'emploi · Six métiers
   et, sous la barre, les pages de la rubrique où l'on se trouve.
   En bas de chaque page : le plan complet du site.

   Navigation.poser(fraicheur) : pose (ou met à jour) la barre ; les
   pages qui lisent leurs données appellent poser() une seconde fois
   avec la date des données, affichée à droite.
   ============================================================ */
const Navigation = (() => {
  const RUBRIQUES = [
    { id: "accueil", titre: "Accueil", court: "Accueil", url: "index.html",
      dit: "Choisissez votre question : chaque page du site y répond par des chiffres vérifiables.",
      pages: [["index.html", "Par où commencer ?"]] },
    { id: "alternance", titre: "Alternance & stages", court: "Alternance", url: "presentation.html",
      dit: "Les offres d'alternance et de stage, toutes sources réunies.",
      pages: [
        ["presentation.html", "Synthèse", "L'essentiel pour un métier : combien, où, quel salaire."],
        ["offres.html", "Offres disponibles", "Les annonces en ligne ce matin, à filtrer et exporter."],
        ["alternance.html", "Explorer les données", "Tous les filtres, la carte, les entreprises à démarcher."],
        ["evolution.html", "Évolution", "Le marché jour après jour."],
        ["alternance.html#fiabilite", "Méthode et sources", "D'où viennent les offres, comment elles sont nettoyées."],
      ] },
    { id: "marche", titre: "Marché de l'emploi", court: "Emploi", url: "marche.html",
      dit: "Toutes les offres France Travail des métiers suivis (CDI, CDD, intérim…), pas seulement l'alternance.",
      pages: [
        ["marche.html", "Vue d'ensemble", "Combien d'offres, où, quels contrats, la carte."],
        ["salaires.html", "Ce que ça paie", "Les salaires affichés, par métier et par niveau."],
        ["exigences.html", "Ce qu'on vous demande", "Expérience, diplôme, outils et compétences."],
        ["recruteurs.html", "Qui recrute", "Les entreprises et les secteurs qui publient le plus."],
        ["mouvement.html", "Le marché bouge", "Nouvelles offres, offres retirées, et les limites des chiffres."],
      ] },
    { id: "six", titre: "Six métiers à la loupe", court: "6 métiers", url: "metiers-cibles.html",
      dit: "Brand manager, chef de produit, chargé de clientèle, chef de secteur GMS, chargé d'études marketing, chargé de communication.",
      pages: [["metiers-cibles.html", "Entreprises, secteurs, grandes villes, ratios", "Qui recrute, où, et combien d'habitants par offre."]] },
  ];

  const fichier = (location.pathname.split("/").pop() || "index.html");
  const ici = fichier === "" ? "index.html" : fichier;
  const rubrique = RUBRIQUES.find(r => r.pages.some(([p]) => p.split("#")[0] === ici)) || RUBRIQUES[0];
  const echap = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function barre(fraicheur) {
    const sousPages = rubrique.pages.length > 1
      ? `<nav class="menu" aria-label="Pages de la rubrique ${echap(rubrique.titre)}">${rubrique.pages.map(([p, l]) => {
          // Les pages « Alternance & stages » emportent le métier choisi : site.js réécrit ces liens (data-page).
          const actif = p === ici;
          return `<a href="${p}"${rubrique.id === "alternance" ? ` data-page="${p}"` : ""}${actif ? ' class="ici" aria-current="page"' : ""}>${echap(l)}</a>`;
        }).join("")}</nav>`
      : `<p class="rubrique-dit">${echap(rubrique.dit)}</p>`;
    return `<header class="barre-site barre-haut" id="barre-site"><div class="barre-int">
        <a class="logo" href="index.html" title="Accueil du site"><i aria-hidden="true">M</i><span>Marketing &amp; emploi<small>alternance, stages et emplois</small></span></a>
        <nav class="rubriques" aria-label="Rubriques du site">${RUBRIQUES.map(r =>
          `<a href="${r.url}"${r === rubrique ? ' class="ici" aria-current="true"' : ""} aria-label="${echap(r.titre)}"><span class="long">${echap(r.titre)}</span><span class="court" aria-hidden="true">${echap(r.court)}</span></a>`).join("")}</nav>
        <span class="fraicheur-site"${fraicheur ? "" : " hidden"}>${echap(fraicheur || "")}</span>
      </div></header>
      <div class="barre-site barre-bas" id="barre-bas"><div class="barre-int">${sousPages}</div></div>`;
  }

  function planDuSite() {
    return `<footer class="plan-site" aria-label="Plan du site"><div class="barre-int">
      ${RUBRIQUES.slice(1).map(r => `<div><h2><a href="${r.url}">${echap(r.titre)}</a></h2><ul>${r.pages.map(([p, l]) =>
        `<li><a href="${p}">${echap(l)}</a></li>`).join("")}</ul></div>`).join("")}
      <div><h2><a href="index.html">Accueil</a></h2><ul>
        <li><a href="index.html">Par où commencer ?</a></li>
        <li><a href="https://github.com/Pexi58/metier">Le code et les données (GitHub)</a></li></ul>
        <p>Données collectées chaque matin. Réalisé par Pexi58, M2 MOD, IAE Clermont Auvergne.</p></div>
    </div></footer>`;
  }

  // La hauteur de la barre collante : la barre de sélection des pages « Alternance » se cale dessous.
  function mesurer() {
    const h = document.getElementById("barre-site");
    if (h) document.documentElement.style.setProperty("--haut-entete", h.offsetHeight + "px");
  }

  let posee = false;
  function poser(fraicheur) {
    const existante = document.getElementById("barre-site");
    if (existante) {
      const f = existante.querySelector(".fraicheur-site");
      if (fraicheur && f) { f.textContent = fraicheur; f.hidden = false; }
    } else {
      const place = document.getElementById("entete") || document.getElementById("nav-ici");
      if (place) place.outerHTML = barre(fraicheur);
      else document.body.insertAdjacentHTML("afterbegin", barre(fraicheur));
    }
    if (!posee) {
      posee = true;
      document.body.insertAdjacentHTML("beforeend", planDuSite());
      window.addEventListener("resize", mesurer);
    }
    // Lien actif visible dans la barre du bas, même sur un petit écran qui la fait défiler.
    const actif = document.querySelector("#barre-bas a.ici");
    if (actif && actif.scrollIntoView) actif.parentNode.scrollLeft = actif.offsetLeft - 16;
    mesurer();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => poser());
  else poser();

  return { poser, RUBRIQUES, rubrique };
})();
