/* ============================================================
   metiers-cibles.js — la page « Six métiers à la loupe ».
   Données : data/metiers-cibles.js (écrit chaque matin par
   scripts/metiers_cibles.py). Utilitaires : assets/commun.js
   (compter, secteurCourt, enLignes, dessiner, dateFr…).
   Tous les comptages sont refaits ici, à chaque changement de
   métier ou de réglage.
   ============================================================ */
(() => {
  const MC = window.METIERS_CIBLES;
  if (!MC) { document.getElementById("sous").textContent = "Impossible de lire data/metiers-cibles.js."; return; }
  D = MC;   // commun.js lit D (libellés des contrats)

  const echap = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nb = n => n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR");
  const dec = (n, d = 1) => n == null || !isFinite(n) ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pluriel = (n, mot) => `${nb(n)} ${mot}${n > 1 ? "s" : ""}`;
  const INTERMEDIAIRE = /travail temporaire|placement de main|mise à disposition de ressources humaines|agences de placement|activités liées à l'emploi/i;
  const POP_FRANCE = Object.values(MC.departements).reduce((s, d) => s + (d[1] || 0), 0);
  const nomVille = c => (MC.villes[c] || [c])[0];
  const popVille = c => (MC.villes[c] || [])[1];
  const nomDep = c => (MC.departements[c] || [c])[0];
  const GRANDES = MC.grandes_villes.slice(0, 30);

  /* ---------- État : métier choisi et réglages, gardés dans l'adresse (#m=gms) ---------- */
  const etat = { metier: "tous", intitule: true, inter: false, tri: { villes: ["pop", -1], deps: ["ratio", -1] } };
  const lu = /m=([a-z]+)/.exec(location.hash);
  if (lu && (lu[1] === "tous" || MC.metiers.some(m => m.cle === lu[1]))) etat.metier = lu[1];

  function selection() {
    const cles = etat.metier === "tous" ? MC.metiers.map(m => m.cle) : [etat.metier];
    return MC.offres.filter(o => cles.some(k => o.m.includes(k) || (!etat.intitule && o.c.includes(k)))
      && !(etat.inter && INTERMEDIAIRE.test(o.secteur || "")));
  }
  const libSel = () => etat.metier === "tous" ? "les six métiers" : MC.metiers.find(m => m.cle === etat.metier).libelle;

  /* ---------- Boutons des métiers ---------- */
  function poserChoix() {
    const compteDe = k => MC.offres.filter(o => (k === "tous" ? o.m.length || (!etat.intitule && o.c.length) : (o.m.includes(k) || (!etat.intitule && o.c.includes(k))))
      && !(etat.inter && INTERMEDIAIRE.test(o.secteur || ""))).length;
    document.getElementById("choix").innerHTML = [["tous", "Les six ensemble"], ...MC.metiers.map(m => [m.cle, m.libelle])].map(([k, l]) =>
      `<button type="button" data-m="${k}" aria-pressed="${k === etat.metier}">${echap(l)} <small>${compteDe(k)}</small></button>`).join("");
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

  /* ---------- Le panneau « Les offres comptées » ---------- */
  let detailOffres = [], detailTitre = "";
  function montrer(titre, offres, calcul) {
    detailOffres = offres; detailTitre = titre;
    const tri = [...offres].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    document.getElementById("detail").innerHTML = `
      <div class="entete"><div><b>${echap(titre)}</b> — ${pluriel(offres.length, "offre")} (${echap(libSel())})
        ${calcul ? `<div class="note">${calcul}</div>` : ""}</div>
        <button type="button" id="exporter">Exporter (CSV)</button></div>
      <div class="liste">${tri.map(o => `<div class="item">
        <div class="titre">${o.url ? `<a href="${echap(o.url)}" target="_blank" rel="noopener">${echap(o.intitule)}</a>` : echap(o.intitule)}</div>
        <div class="meta"><span>${echap(o.entreprise || "employeur non précisé")}</span><span>·</span><span>${echap(o.lieu || "lieu non précisé")}</span>
          <span>·</span><span>${echap(secteurCourt(o.secteur) || "secteur non précisé")}</span>
          <span>·</span><span>${echap(o.alternance ? "Alternance" : libContrat(o.contrat))}</span>
          <span>·</span><span>publiée le ${dateFr(o.date)}</span><span>·</span><span>${o.rome}</span></div></div>`).join("")}</div>`;
    document.getElementById("exporter").addEventListener("click", exporter);
    document.getElementById("titre-detail").scrollIntoView({ block: "start" });
  }
  function exporter() {
    const col = ["id", "rome", "intitule", "entreprise", "secteur", "lieu", "ville", "departement", "contrat", "date", "url"];
    const cell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lignes = detailOffres.map(o => [o.id, o.rome, o.intitule, o.entreprise, o.secteur, o.lieu, o.ville ? nomVille(o.ville) : "", o.dep,
      o.alternance ? "Alternance" : o.contrat, o.date, o.url].map(cell).join(";"));
    const blob = new Blob(["﻿" + col.join(";") + "\n" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `offres-${etat.metier}-${detailTitre.replace(/[^\w]+/g, "-").toLowerCase()}-${MC.date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* Barres horizontales cliquables (Chart.js) : un clic montre les offres de la barre. */
  function barresCliquables(id, lignes, suffixe, quand) {
    zoneSelonBarres(id, lignes.length, 30);
    dessiner(id, "bar",
      { labels: lignes.map(l => enLignes(l.label, 30)), datasets: [{ data: lignes.map(l => l.valeur), backgroundColor: couleur, borderRadius: 4 }] },
      { indexAxis: "y",
        onClick: (e, el) => { if (el.length) quand(lignes[el[0].index]); },
        onHover: (e, el) => { e.native.target.style.cursor = el.length ? "pointer" : "default"; },
        plugins: { tooltip: { callbacks: { label: c => lignes[c.dataIndex].bulle || (c.parsed.x + suffixe), footer: () => "Cliquer pour voir les offres" } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { autoSkip: false } } } });
    // dessiner() réutilise le graphique : on remet le bon gestionnaire de clic à chaque rendu.
    graphiques[id].options.onClick = (e, el) => { if (el.length) quand(lignes[el[0].index]); };
    graphiques[id].options.plugins.tooltip.callbacks.label = c => lignes[c.dataIndex].bulle || (c.parsed.x + suffixe);
    graphiques[id].update();
  }

  /* Tableau triable : colonnes [cle, titre, numérique?, rendu] ; lignes : objets avec ces clés. */
  function tableau(id, colonnes, lignes, cleTri, quand) {
    const [cle, sens] = etat.tri[cleTri];
    const tri = [...lignes].sort((a, b) => {
      const x = a[cle], y = b[cle];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y, "fr") : x - y) * sens;
    });
    const t = document.getElementById(id);
    t.innerHTML = `<thead><tr>${colonnes.map(([k, titre, num]) =>
      `<th class="${num ? "n" : ""}"${k === cle ? ` aria-sort="${sens > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-k="${k}">${titre}</button></th>`).join("")}</tr></thead>
      <tbody>${tri.map((l, i) => `<tr data-i="${lignes.indexOf(l)}" tabindex="0" class="${l.offres ? "" : "zero"}">${colonnes.map(([k, , num, rendu]) =>
        `<td class="${num ? "n" : ""}">${rendu ? rendu(l, i) : echap(l[k])}</td>`).join("")}</tr>`).join("")}</tbody>`;
    t.querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k;
      etat.tri[cleTri] = [k, k === cle ? -sens : (typeof lignes[0]?.[k] === "string" ? 1 : -1)];
      tableau(id, colonnes, lignes, cleTri, quand);
    }));
    const ouvrir = tr => quand(lignes[+tr.dataset.i]);
    t.querySelectorAll("tbody tr").forEach(tr => {
      tr.addEventListener("click", () => ouvrir(tr));
      tr.addEventListener("keydown", e => { if (e.key === "Enter") ouvrir(tr); });
    });
  }

  /* ============================================================
     LE RENDU
     ============================================================ */
  function rendre() {
    poserChoix();
    const offres = selection();
    const n = offres.length;
    const nommees = offres.filter(o => o.entreprise);
    const localisees = offres.filter(o => o.ville);
    const inter = offres.filter(o => INTERMEDIAIRE.test(o.secteur || "")).length;

    document.getElementById("compte").innerHTML = `<b>${pluriel(n, "offre")}</b> pour ${echap(libSel())}, `
      + (etat.intitule ? "intitulé vérifié" : "toutes les offres des codes ROME du métier")
      + (etat.inter ? ", sans les agences d'intérim et de placement." : ".");

    const parFrance = n / POP_FRANCE * 100000;
    document.getElementById("chiffres").innerHTML = [
      [nb(n), "offres actives ce matin"],
      [nb(new Set(nommees.map(o => o.entreprise.toUpperCase())).size), `entreprises nommées (${pct(n - nommees.length, n)} % des offres ne donnent pas l'employeur)`],
      [nb(new Set(localisees.map(o => o.ville)).size), "villes différentes"],
      [n ? nb(POP_FRANCE / n) : "—", `habitants par offre en France (${dec(parFrance)} offres pour 100 000 habitants)`],
    ].map(([v, l]) => `<div class="chiffre"><b>${v}</b><span>${l}</span></div>`).join("");

    /* ---- 1. Entreprises ---- */
    const ent = compter(nommees, o => o.entreprise.trim().toUpperCase()).slice(0, 15);
    barresCliquables("g-entreprises", ent.map(([nom, v]) => ({ label: nom, valeur: v, bulle: `${pluriel(v, "offre")}, ${pct(v, n)} % de la sélection` })), " offres",
      l => montrer(l.label, nommees.filter(o => o.entreprise.trim().toUpperCase() === l.label), `${pluriel(l.valeur, "offre")} sur ${nb(n)}, soit ${pct(l.valeur, n)} %.`));
    document.getElementById("sous-ent").textContent = ent.length ? `— n° 1 : ${ent[0][0]} (${pluriel(ent[0][1], "offre")})` : "";
    document.getElementById("note-ent").innerHTML =
      `Classement par nombre d'offres publiées sous le nom de l'employeur (noms mis en majuscules pour regrouper les variantes). `
      + `${pluriel(n - nommees.length, "offre")} sur ${nb(n)} ne donnent pas le nom de l'employeur : elles ne peuvent pas compter ici. `
      + (inter && !etat.inter ? `${pluriel(inter, "offre")} viennent d'agences d'intérim ou de placement, qui recrutent pour le compte d'autres entreprises : la case « Masquer les agences » les retire.` : "");

    /* ---- 2. Secteurs ---- */
    const avecSecteur = offres.filter(o => o.secteur);
    const sec = compter(avecSecteur, o => secteurCourt(o.secteur)).slice(0, 12);
    barresCliquables("g-secteurs", sec.map(([s, v]) => ({ label: s, valeur: v, bulle: `${pluriel(v, "offre")}, ${pct(v, avecSecteur.length)} % des offres qui donnent leur secteur` })), " offres",
      l => montrer("Secteur : " + l.label, avecSecteur.filter(o => secteurCourt(o.secteur) === l.label), `${pluriel(l.valeur, "offre")} sur les ${nb(avecSecteur.length)} qui donnent leur secteur, soit ${pct(l.valeur, avecSecteur.length)} %.`));
    document.getElementById("note-sec").textContent =
      `${nb(avecSecteur.length)} offres sur ${nb(n)} (${pct(avecSecteur.length, n)} %) indiquent le secteur de l'employeur. Les pourcentages sont calculés sur elles.`;

    /* ---- 3 et 4. Villes : classement et ratios ---- */
    const parVille = new Map();
    for (const o of localisees) { if (!parVille.has(o.ville)) parVille.set(o.ville, []); parVille.get(o.ville).push(o); }
    const lignesVilles = GRANDES.map((code, i) => {
      const lot = parVille.get(code) || [], pop = popVille(code);
      const s1 = compter(lot.filter(o => o.secteur), o => secteurCourt(o.secteur))[0];
      const e1 = compter(lot.filter(o => o.entreprise), o => o.entreprise.trim().toUpperCase())[0];
      return { code, rang: i + 1, ville: nomVille(code), dep: MC.villes[code][2], pop, offres: lot.length,
               pour100k: lot.length / pop * 100000, habParOffre: lot.length ? pop / lot.length : null,
               secteur: s1 ? `${s1[0]} (${s1[1]})` : "—", entreprise: e1 ? `${e1[0]} (${e1[1]})` : "—", lot };
    });
    tableau("t-villes", [
      ["rang", "Rang", true],
      ["ville", "Ville", false, l => `<b>${echap(l.ville)}</b> <small class="note">${echap(l.dep)}</small>`],
      ["pop", "Habitants", true, l => nb(l.pop)],
      ["offres", "Offres", true, l => nb(l.offres)],
      ["pour100k", "Pour 100 000 hab.", true, l => dec(l.pour100k)],
      ["habParOffre", "Habitants par offre", true, l => nb(l.habParOffre)],
      ["secteur", "Secteur n° 1", false],
      ["entreprise", "Entreprise n° 1", false],
    ], lignesVilles, "villes", l => montrer(`${l.ville} (${nb(l.pop)} habitants)`, l.lot,
      l.offres ? `${pluriel(l.offres, "offre")} ÷ ${nb(l.pop)} habitants × 100 000 = ${dec(l.pour100k)} offres pour 100 000 habitants ; ${nb(l.pop)} ÷ ${l.offres} = ${nb(l.habParOffre)} habitants par offre.` : "Aucune offre dans cette ville pour cette sélection."));

    const ratio = [...lignesVilles].sort((a, b) => b.pour100k - a.pour100k);
    barresCliquables("g-ratio", ratio.map(l => ({ label: `${l.ville} (${l.offres})`, valeur: Math.round(l.pour100k * 10) / 10,
      bulle: `${dec(l.pour100k)} offres pour 100 000 habitants — ${l.offres ? nb(l.habParOffre) + " habitants par offre" : "aucune offre"}` , l })), "",
      x => montrer(`${x.l.ville} (${nb(x.l.pop)} habitants)`, x.l.lot, x.l.offres ? `${pluriel(x.l.offres, "offre")} ÷ ${nb(x.l.pop)} habitants × 100 000 = ${dec(x.l.pour100k)} offres pour 100 000 habitants.` : ""));
    const enGrandes = lignesVilles.reduce((s, l) => s + l.offres, 0), popGrandes = lignesVilles.reduce((s, l) => s + l.pop, 0);
    document.getElementById("sous-ratio").textContent = `— en France : ${n ? nb(POP_FRANCE / n) : "—"} habitants par offre`;
    document.getElementById("note-ratio").innerHTML =
      `Calcul : offres de la ville ÷ habitants × 100 000. Le nombre entre parenthèses est le nombre d'offres. `
      + `Les 30 plus grandes villes réunissent ${pct(popGrandes, POP_FRANCE)} % des habitants et ${pct(enGrandes, n)} % des offres (${nb(enGrandes)} sur ${nb(n)}). `
      + `Une ville avec très peu d'offres a un ratio fragile : une offre de plus ou de moins le change beaucoup. `
      + `${pluriel(n - localisees.length, "offre")} ne donnent que leur département ou leur région : elles comptent au département, pas à une ville.`;

    const parDep = new Map();
    for (const o of offres) if (o.dep) { if (!parDep.has(o.dep)) parDep.set(o.dep, []); parDep.get(o.dep).push(o); }
    const lignesDeps = Object.entries(MC.departements).map(([code, [nom, pop]]) => {
      const lot = parDep.get(code) || [];
      const s1 = compter(lot.filter(o => o.secteur), o => secteurCourt(o.secteur))[0];
      return { code, nom, pop, offres: lot.length, ratio: pop ? lot.length / pop * 100000 : null, habParOffre: lot.length ? pop / lot.length : null,
               secteur: s1 ? `${s1[0]} (${s1[1]})` : "—", lot };
    });
    tableau("t-deps", [
      ["code", "Code", false],
      ["nom", "Département", false],
      ["pop", "Habitants", true, l => nb(l.pop)],
      ["offres", "Offres", true, l => nb(l.offres)],
      ["ratio", "Pour 100 000 hab.", true, l => dec(l.ratio)],
      ["habParOffre", "Habitants par offre", true, l => nb(l.habParOffre)],
      ["secteur", "Secteur n° 1", false],
    ], lignesDeps, "deps", l => montrer(`${l.nom} (${l.code})`, l.lot,
      l.offres ? `${pluriel(l.offres, "offre")} ÷ ${nb(l.pop)} habitants × 100 000 = ${dec(l.ratio)} offres pour 100 000 habitants.` : "Aucune offre dans ce département pour cette sélection."));

    /* ---- 5. Secteurs par grande ville ---- */
    document.getElementById("villes-secteurs").innerHTML = lignesVilles.slice(0, 12).map((l, i) => {
      const avec = l.lot.filter(o => o.secteur);
      const top = compter(avec, o => secteurCourt(o.secteur)).slice(0, 3);
      const max = top.length ? top[0][1] : 1;
      return `<div class="carte ville"><h3>${i + 1}. ${echap(l.ville)} <small>${pluriel(l.offres, "offre")}</small></h3>
        ${top.length ? top.map(([s, v]) => `<button type="button" class="barre" data-v="${l.code}" data-s="${echap(s)}">
          <span><span>${echap(s)}</span><b>${v}</b></span><i style="width:${Math.max(4, 100 * v / max)}%"></i></button>`).join("")
          + (avec.length < l.offres ? `<p class="note" style="margin:6px 0 0">${l.offres - avec.length} offre(s) sans secteur indiqué</p>` : "")
          : `<p class="note">Aucune offre avec un secteur indiqué.</p>`}</div>`;
    }).join("");
    document.querySelectorAll("#villes-secteurs .barre").forEach(b => b.addEventListener("click", () => {
      const l = lignesVilles.find(x => x.code === b.dataset.v), s = b.dataset.s;
      const lot = l.lot.filter(o => secteurCourt(o.secteur) === s);
      montrer(`${l.ville} — ${s}`, lot, `${pluriel(lot.length, "offre")} sur les ${l.offres} de ${l.ville}.`);
    }));

    /* ---- Méthode ---- */
    poserMethode();
  }

  function poserMethode() {
    document.getElementById("t-methode").innerHTML = `
      <p style="margin-top:0"><b>Source des offres.</b> ${echap(MC.source)}, offres actives le ${dateFr(MC.date)}, France entière, une requête par code ROME.
        <b>Population.</b> ${echap(MC.population.source)}, lue le ${dateFr(MC.population.lu_le)}.</p>
      <p><b>Comment une offre est rattachée à un métier.</b> France Travail range chaque offre dans un code ROME, mais ce classement est imparfait :
        le code des chargés de communication contient aussi des « chargés d'affaires » de chantier, celui des chargés d'études des « chargés d'études VRD ».
        Par défaut, une offre ne compte donc que si son intitulé correspond au métier ; les codes voisins, où France Travail range aussi ce métier, sont fouillés de la même façon.
        Décochez « Seulement les offres dont l'intitulé correspond » pour compter toutes les offres des codes du métier.</p>
      <ul>${MC.metiers.map(m => `<li><b>${echap(m.libelle)}</b> : codes ${m.codes.map(c => `<code>${c}</code> ${echap(m.libelles_codes[c])}`).join(", ")}
        ${m.voisins.length ? `; codes voisins ${m.voisins.map(c => `<code>${c}</code>`).join(", ")}` : ""} — ${echap(m.regle)}.
        <span class="note">${m.retenues} offres retenues (dont ${m.par_voisins} trouvées dans les codes voisins) ; ${m.dans_code} offres dans le code, tous intitulés confondus.</span></li>`).join("")}</ul>
      <p><b>Limites.</b></p>
      <ul>
        <li>Une photo du jour : seules les offres encore en ligne ce matin comptent. Une offre peut proposer plusieurs postes ; elle compte pour une.</li>
        <li>Une offre peut appartenir à deux métiers (un « brand manager » rangé chez les chefs de produit) ; dans « Les six ensemble », elle ne compte qu'une fois.</li>
        <li>« Entreprise » est le nom affiché dans l'annonce : une agence d'intérim ou un cabinet de recrutement peut publier pour un client. La case « Masquer les agences » retire celles dont le secteur est l'intérim ou le placement.</li>
        <li>Le secteur est celui de l'employeur (code NAF), pas celui du poste : un chef de produit d'une entreprise de logiciels compte en « Programmation informatique ».</li>
        <li>Ratios par ville : la population est celle de la commune seule. Les offres de banlieue comptent pour leur commune ; le tableau par département donne une image plus juste des grandes agglomérations.</li>
        <li>« Responsable de secteur GMS » : France Travail mélange dans les codes D1510 et D1517 les chefs de secteur des marques (qui visitent les magasins) et les chefs de secteur des magasins eux-mêmes. « Chargé de clientèle » : le code D1415 (relation client) ; les chargés de clientèle des banques et des assurances sont rangés dans d'autres codes, non suivis ici.</li>
        <li>Pas d'autre source que France Travail sur cette page : LinkedIn, Indeed ou HelloWork interdisent la collecte automatique.</li>
      </ul>`;
  }

  document.getElementById("sous").innerHTML = `${echap(MC.source)} · offres actives du <b>${dateFr(MC.date)}</b> · population ${echap(MC.population.source.split(",")[0])} · <a href="#methode">méthode et limites</a>`;
  rendre();
})();
