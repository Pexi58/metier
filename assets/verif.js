/* ============================================================
   verif.js — « Vérifier ce chiffre ».
   Partagé par alternance.html, presentation.html et offres.html.
   Un clic sur un chiffre ou sur une barre ouvre une fenêtre qui montre :
     - le calcul (numérateur ÷ dénominateur) et les filtres appliqués ;
     - le champ utilisé et d'où il vient (champ de la source ou lu dans le texte) ;
     - les sources des offres comptées, avec le lien vers chaque API ;
     - la liste des offres comptées, chacune cliquable vers l'annonce d'origine,
       et un export CSV pour refaire le calcul dans Excel.
   Utilisation :
     Verif.ouvrir({ titre, calcul: { num, den, texte }, champ, filtres, offres, base, lignes, valeur })
       - offres : les offres comptées (numérateur)  - base : la sélection entière (dénominateur)
       - lignes : [{ libelle, offres }] pour une répartition complète (un graphique entier)
       - champ : clé de CHAMPS ci-dessous, pour expliquer d'où vient la valeur
   ============================================================ */
"use strict";
const Verif = (() => {
  const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nb = n => Number(n || 0).toLocaleString("fr-FR");
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const dateFr = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };

  const SOURCES = {
    FT: ["France Travail", "API Offres d'emploi v2", "https://francetravail.io/data/api/offres-emploi"],
    LBA: ["La bonne alternance", "API officielle de l'alternance", "https://api.apprentissage.beta.gouv.fr/fr/explorer"],
    ADZ: ["Adzuna", "API d'un agrégateur d'offres", "https://developer.adzuna.com/"],
  };
  // Pour chaque champ : ce qu'il veut dire et comment il est obtenu (voir scripts/alternance.mjs).
  const CHAMPS = {
    contrat: "Alternance ou stage. France Travail et La bonne alternance : offres cherchées avec le filtre « apprentissage / professionnalisation ». Adzuna : recherche « métier + alternance » ou « métier + stage », puis le mot doit figurer dans le titre ou le texte.",
    type: "Type de contrat. France Travail : champ natureContrat (« Contrat apprentissage », « Cont. professionnalisation »). La bonne alternance : champ contract.type. Adzuna : lu dans le texte ; « non précisé » si le texte ne le dit pas.",
    duree_classe: "Durée du stage, lue dans le titre et le texte de l'annonce (« 6 mois », « 4 à 6 mois », « 8 semaines ») ; si une fourchette est donnée, c'est la plus longue qui est retenue. « Non précisée » quand le texte n'en parle pas (Adzuna ne donne que le début de l'annonce).",
    lieu: "Lieu. France Travail : code commune INSEE de l'offre. La bonne alternance : code postal de l'adresse. Adzuna : nom du département renvoyé par l'API. La région se déduit du département.",
    diplome: "Diplôme. Champ de la source quand il existe (France Travail : formations, La bonne alternance : target_diploma), sinon lu dans le texte (« Bac+2 », « BTS », « Bachelor », « Master »…) : c'est le plus haut niveau mentionné qui est retenu.",
    publie_par: "Qui publie. « École » : activité d'enseignement (code NAF 85, répertoire SIRENE) ou nom d'école connu. « Intérim / cabinet » : code NAF 78 ou nom connu (Randstad, Direct Emploi…). « Entreprise » : tout autre employeur nommé. « Non précisé » : l'annonce ne nomme pas l'employeur.",
    eff: "Taille de l'employeur : tranche d'effectif de l'entreprise dans le répertoire SIRENE (API Recherche d'entreprises), retrouvée par le nom et le département de l'offre ; à défaut, tranche donnée par France Travail.",
    section: "Secteur : code NAF (activité principale) de l'employeur, regroupé en grandes sections. Source : champ de l'offre ou répertoire SIRENE.",
    outils: "Outils cités : mots cherchés dans le titre et le texte de l'annonce (mot entier), selon la grille de config/alternance.json. Une offre peut en citer plusieurs.",
    salaire: "Salaire : libellé de la source ramené en brut mensuel. Un montant mensuel saisi dans la case « annuel » est corrigé ; les montants hors 300–6 000 € sont écartés ; les salaires estimés par Adzuna ne sont pas repris. Les fourchettes « 27 % à 100 % du SMIC » (le barème légal de l'apprentissage recopié en entier, ex. « 486 € à 1 801 € ») ne sont pas ce que l'employeur propose : elles sont retirées des médianes.",
    age: "Ancienneté : écart entre la date de publication de l'annonce et la date de la collecte.",
    rome: "Métier : code ROME donné par la source (France Travail, La bonne alternance) ; pour Adzuna, déduit du titre (tous les mots-clés du métier doivent y figurer), sinon métier de la recherche.",
    ecole: "École : employeur dont l'activité est l'enseignement (NAF 85) ou dont le nom est celui d'une école connue.",
    recruteur: "Entreprise « susceptible de recruter en alternance » : sélection de l'algorithme de La bonne alternance (d'après les embauches passées), gardée seulement si elle est dans le rayon demandé et dans la région.",
  };
  const COLONNES_CSV = ["offre", "source", "via", "code_rome", "intitule", "entreprise", "siren", "publie_par", "ville", "departement", "region", "type", "duree_mois", "diplome", "salaire_min", "salaire_max", "date_publication", "lien"];
  const versCsv = o => [o.contrat || "alternance", (SOURCES[o.src] || [o.src])[0], o.via, o.rome, o.titre, o.ent, o.siren || "", o.publie_par, o.ville, o.dep, o.reg, o.type, o.duree || "", o.diplome || "", o.smin || "", o.smax || "", o.date, o.url];

  let dlg, pile = [], courant = null;

  function creer() {
    if (dlg) return;
    dlg = document.createElement("dialog");
    dlg.id = "verif";
    dlg.innerHTML = `<div class="verif-tete"><button class="verif-retour" hidden>← Retour</button><button class="verif-fermer" aria-label="Fermer">Fermer ✕</button></div><div class="verif-corps"></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector(".verif-fermer").addEventListener("click", () => dlg.close());
    dlg.querySelector(".verif-retour").addEventListener("click", () => { const p = pile.pop(); if (p) afficher(p, false); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });   // clic à côté = fermer
  }

  function blocSources(offres) {
    const par = {};
    for (const o of offres) for (const s of (o.srcs || [o.src])) par[s] = (par[s] || 0) + 1;
    const via = new Map();
    for (const o of offres) if (o.src === "FT" && o.via && o.via !== "France Travail") via.set(o.via, (via.get(o.via) || 0) + 1);
    const nbMulti = offres.filter(o => (o.srcs || []).length > 1).length;
    return `<ul class="verif-sources">` + Object.entries(par).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
      const [nom, quoi, url] = SOURCES[k] || [k, "", ""];
      return `<li><b>${esc(nom)}</b> — ${nb(n)} offre${n > 1 ? "s" : ""} · ${esc(quoi)}${url ? ` · <a href="${url}" target="_blank" rel="noopener">documentation</a>` : ""}</li>`;
    }).join("") + `</ul>`
      + (via.size ? `<p class="verif-note">France Travail relaie ici des annonces de : ${esc([...via].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v} (${n})`).join(", "))}.</p>` : "")
      + (nbMulti ? `<p class="verif-note">${nb(nbMulti)} offre${nbMulti > 1 ? "s ont été vues" : " a été vue"} dans plusieurs sources : chacune n'est comptée qu'une fois.</p>` : "");
  }

  function tableOffres(offres, valeur) {
    const max = 300, t = offres.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `<div class="verif-table"><table><thead><tr><th>Offre</th><th>Employeur</th><th>Lieu</th><th>Source</th><th>Publiée</th>${valeur ? "<th>Valeur utilisée</th>" : ""}</tr></thead><tbody>`
      + t.slice(0, max).map(o => `<tr><td>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.titre)}</a>` : esc(o.titre)}</td>
          <td>${o.siren ? `<a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${esc(o.siren)}" target="_blank" rel="noopener" title="Fiche officielle de l'entreprise">${esc(o.ent)}</a>` : esc(o.ent || "non précisé")}</td>
          <td>${esc(o.ville || o.lieu || "—")}${o.dep ? ` (${esc(o.dep)})` : ""}</td><td>${esc((SOURCES[o.src] || [o.src])[0])}${o.via && o.src === "FT" && o.via !== "France Travail" ? `<br><small>via ${esc(o.via)}</small>` : ""}</td>
          <td>${dateFr(o.date)}</td>${valeur ? `<td>${esc(valeur(o))}</td>` : ""}</tr>`).join("")
      + `</tbody></table></div>` + (t.length > max ? `<p class="verif-note">${nb(max)} premières offres affichées sur ${nb(t.length)} : l'export CSV les contient toutes.</p>` : "");
  }

  function csv(offres, nom) {
    const lignes = [COLONNES_CSV, ...offres.map(versCsv)];
    const txt = "﻿" + lignes.map(l => l.map(v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function afficher(spec, empiler = true) {
    if (empiler && courant && dlg.open) pile.push(courant);
    courant = spec;
    const c = dlg.querySelector(".verif-corps");
    const offres = spec.offres || [], base = spec.base || offres;
    let html = `<p class="verif-surtitre">Vérifier ce chiffre</p><h2>${esc(spec.titre)}</h2>`;
    // 1) Le calcul
    if (spec.lignes) {
      const total = spec.total != null ? spec.total : base.length;
      html += `<h3>Le calcul</h3><p>Chaque ligne = nombre d'offres de la catégorie ÷ ${nb(total)} ${esc(spec.totalLibelle || "offres de la sélection")}. Cliquez une ligne pour voir ses offres.</p>
        <table class="verif-repart"><thead><tr><th>Catégorie</th><th>Offres</th><th>Part</th></tr></thead><tbody>`
        + spec.lignes.map((l, i) => `<tr data-i="${i}" class="cliquable"><td>${esc(l.libelle)}</td><td class="n">${nb(l.offres.length)}</td><td class="n">${pct(l.offres.length, total)} %</td></tr>`).join("")
        + `</tbody></table>`;
    } else if (spec.calcul) {
      const { num, den, texte } = spec.calcul;
      html += `<h3>Le calcul</h3><p class="verif-calcul">${texte ? esc(texte) + "<br>" : ""}${den != null ? `<b>${nb(num)}</b> ÷ <b>${nb(den)}</b> = <b>${pct(num, den)} %</b>` : `<b>${esc(num)}</b>`}</p>`;
    }
    if (spec.filtres) html += `<p class="verif-note"><b>Filtres appliqués :</b> ${esc(spec.filtres)}</p>`;
    // 2) Le champ
    if (spec.champ && CHAMPS[spec.champ]) html += `<h3>D'où vient la valeur</h3><p>${esc(CHAMPS[spec.champ])}</p>`;
    if (spec.note) html += `<p class="verif-note">${esc(spec.note)}</p>`;
    // 3) Les sources
    if (offres.length) html += `<h3>Les sources des ${nb(offres.length)} offres comptées</h3>` + blocSources(offres);
    // 4) Les offres
    if (offres.length) html += `<h3>Les offres comptées</h3><p><button class="verif-csv">Exporter ces ${nb(offres.length)} offres (CSV pour Excel)</button>${base !== offres && base.length ? ` <button class="verif-csv-base">Exporter les ${nb(base.length)} offres du dénominateur</button>` : ""}</p>` + tableOffres(offres, spec.valeur);
    html += `<p class="verif-note">Le calcul complet est dans <code>scripts/alternance.mjs</code> (collecte, nettoyage, contrôles) et dans le code de la page (comptages). Données de la collecte du ${dateFr((window.ALTERNANCE || {}).date)}.</p>`;
    c.innerHTML = html;
    c.scrollTop = 0;
    dlg.querySelector(".verif-retour").hidden = !pile.length;
    c.querySelectorAll(".verif-repart tr[data-i]").forEach(tr => tr.addEventListener("click", () => {
      const l = spec.lignes[+tr.dataset.i];
      afficher({ titre: `${spec.titre} — ${l.libelle}`, calcul: { num: l.offres.length, den: spec.total != null ? spec.total : base.length, texte: `Offres « ${l.libelle} » ÷ ${spec.totalLibelle || "offres de la sélection"}` },
        champ: spec.champ, filtres: spec.filtres, offres: l.offres, base, valeur: spec.valeur });
    }));
    const b1 = c.querySelector(".verif-csv"), b2 = c.querySelector(".verif-csv-base");
    const nomFichier = s => "verification_" + String(s).normalize("NFD").replace(/[^\w]+/g, "_").slice(0, 60) + ".csv";
    if (b1) b1.addEventListener("click", () => csv(offres, nomFichier(spec.titre)));
    if (b2) b2.addEventListener("click", () => csv(base, nomFichier(spec.titre + "_denominateur")));
  }

  return {
    CHAMPS,
    ouvrir(spec) { creer(); pile = []; courant = null; afficher(spec, false); if (!dlg.open) dlg.showModal(); },
  };
})();
// Rendu visible de tous les scripts de la page.
window.Verif = Verif;
