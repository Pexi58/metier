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
      <a class="marque" href="presentation.html"><i>A</i><span>Alternance &amp; stages<small>métiers du marketing</small></span></a>
      <nav class="menu" aria-label="Pages">${PAGES.map(([p, l]) => `<a data-page="${p}" href="${p}"${p === ici ? ' class="ici" aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <span class="fraicheur" title="Collecte automatique chaque matin sur GitHub">Données du ${dateFr(D.date)} · ${nb(pc.alternance)} alternances, ${nb(pc.stage)} stages</span>
    </div></header>`;
    majLiens();
  }
  function pied() {
    const el = document.getElementById("pied");
    if (!el) return;
    el.outerHTML = `<footer class="pied">
      Sources : France Travail, La bonne alternance, Adzuna (et Jooble si la clé est fournie), croisées avec le répertoire des entreprises (API Recherche d'entreprises).
      Collecte, nettoyage et contrôles : <code>scripts/alternance.mjs</code>, relancé chaque matin par GitHub Actions.
      Chaque chiffre est cliquable pour voir son calcul et les offres comptées. <a href="alternance.html#fiabilite">Méthode, contrôles et limites</a>.
      Pas de scraping de LinkedIn, Indeed ou APEC (interdit par leurs conditions d'utilisation).
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

  return {
    esc, nb, pct, dateFr, lireChoix, memoriser,
    libDep: code => (D.departements || {})[code] ? `${D.departements[code]} (${code})` : "département " + code,
    villeSimple: v => String(v || "").replace(/\s+\d+(er|e|ème)?\s+(arrondissement|canton)$/i, "").trim(),
    SOURCES: { FT: "France Travail", LBA: "La bonne alternance", ADZ: "Adzuna", JOO: "Jooble" },
  };
})();
// Rendu visible de tous les scripts de la page.
window.Site = Site;
