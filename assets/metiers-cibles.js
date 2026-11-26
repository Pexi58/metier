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
  if (window.Navigation) Navigation.poser(`Données du ${dateFr(MC.date)}`);

  const echap = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nb = n => n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR");
  const dec = (n, d = 1) => n == null || !isFinite(n) ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pluriel = (n, mot) => `${nb(n)} ${mot}${n > 1 ? "s" : ""}`;
  const INTERMEDIAIRE = /travail temporaire|placement de main|mise à disposition de ressources humaines|agences de placement|activités liées à l'emploi/i;
  const POP_FRANCE = Object.values(MC.departements).reduce((s, d) => s + (d[1] || 0), 0);
  const infoVille = c => MC.villes[c] || [c, null, "", null];   // [nom, population, département, rang en France]
  const VILLES_AFFICHEES = 30;

  /* ---------- État : métier choisi et réglages, gardés dans l'adresse (#m=gms) ---------- */
  const etat = { metier: "tous", intitule: true, inter: false, toutesVilles: false,
                 tri: { villes: ["pop", -1], deps: ["ratio", -1] } };
  const lu = /m=([a-z]+)/.exec(location.hash);
  if (lu && (lu[1] === "tous" || MC.metiers.some(m => m.cle === lu[1]))) etat.metier = lu[1];

  const garde = o => !(etat.inter && INTERMEDIAIRE.test(o.secteur || ""));
  const dans = (o, k) => o.m.includes(k) || (!etat.intitule && o.c.includes(k));
  function selection(metier = etat.metier) {
    const cles = metier === "tous" ? MC.metiers.map(m => m.cle) : [metier];
    return MC.offres.filter(o => cles.some(k => dans(o, k)) && garde(o));
  }
  const libSel = () => etat.metier === "tous" ? "les six métiers" : MC.metiers.find(m => m.cle === etat.metier).libelle;

  /* ---------- Boutons des métiers ---------- */
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

  /* ---------- La fenêtre « les offres comptées » ---------- */
  const fenetre = document.getElementById("fenetre");
  let detailOffres = [], detailTitre = "";
  function montrer(titre, offres, calcul) {
    detailOffres = offres; detailTitre = titre;
    document.getElementById("fenetre-titre").textContent = `${titre} — ${pluriel(offres.length, "offre")}`;
    document.getElementById("fenetre-calcul").innerHTML = `${echap(libSel())}${calcul ? " · " + calcul : ""}`;
    const tri = [...offres].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    document.getElementById("fenetre-liste").innerHTML = tri.length ? tri.map(o => `<div class="item">
        <div class="titre">${o.url ? `<a href="${echap(o.url)}" target="_blank" rel="noopener">${echap(o.intitule)}</a>` : echap(o.intitule)}</div>
        <div class="meta"><span>${echap(o.entreprise || "employeur non précisé")}</span><span>·</span><span>${echap(o.lieu || "lieu non précisé")}</span>
          <span>·</span><span>${echap(o.alternance ? "Alternance" : libContrat(o.contrat))}</span>
          <span>·</span><span>publiée le ${dateFr(o.date)}</span></div></div>`).join("")
      : `<p class="note">Aucune offre.</p>`;
    if (fenetre.showModal) { if (!fenetre.open) fenetre.showModal(); } else fenetre.setAttribute("open", "");
    fenetre.querySelector(".fenetre-corps").scrollTop = 0;
  }
  document.getElementById("fermer").addEventListener("click", () => fenetre.close ? fenetre.close() : fenetre.removeAttribute("open"));
  fenetre.addEventListener("click", e => { if (e.target === fenetre) fenetre.close(); });   // clic à côté = fermer
  document.getElementById("exporter").addEventListener("click", () => {
    const col = ["id", "rome", "intitule", "entreprise", "secteur", "lieu", "ville", "departement", "contrat", "date", "url"];
    const cell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lignes = detailOffres.map(o => [o.id, o.rome, o.intitule, o.entreprise, o.secteur, o.lieu, o.ville ? infoVille(o.ville)[0] : "", o.dep,
      o.alternance ? "Alternance" : o.contrat, o.date, o.url].map(cell).join(";"));
    const blob = new Blob(["﻿" + col.join(";") + "\n" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `offres-${etat.metier}-${detailTitre.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()}-${MC.date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* Barres horizontales cliquables (Chart.js) : un clic montre les offres de la barre. */
  function barresCliquables(id, lignes, quand) {
    zoneSelonBarres(id, lignes.length, 30);
    const clic = (e, el) => { if (el.length) quand(lignes[el[0].index]); };
    const g = dessiner(id, "bar",
      { labels: lignes.map(l => enLignes(l.label, 30)), datasets: [{ data: lignes.map(l => l.valeur), backgroundColor: couleur, hoverBackgroundColor: "#1446c9", borderRadius: 4 }] },
      { indexAxis: "y", onClick: clic,
        onHover: (e, el) => { e.native.target.style.cursor = el.length ? "pointer" : "default"; },
        plugins: { tooltip: { callbacks: { label: c => lignes[c.dataIndex].bulle, footer: () => "Cliquer pour voir les offres" } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { autoSkip: false } } } });
    // dessiner() réutilise le graphique d'un rendu à l'autre : on lui redonne les lignes du moment.
    g.options.onClick = clic;
    g.options.plugins.tooltip.callbacks.label = c => lignes[c.dataIndex].bulle;
    g.update();
  }

  /* Tableau triable : colonnes [clé, titre, numérique ?, rendu] ; un clic sur une ligne appelle quand(ligne). */
  function tableau(id, colonnes, lignes, cleTri, quand, limite) {
    const [cle, sens] = etat.tri[cleTri];
    const triees = [...lignes].sort((a, b) => {
      const x = a[cle], y = b[cle];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y, "fr") : x - y) * sens;
    });
    const vues = limite ? triees.slice(0, limite) : triees;
    const t = document.getElementById(id);
    t.innerHTML = `<thead><tr>${colonnes.map(([k, titre, num]) =>
      `<th scope="col" class="${num ? "n" : ""}"${k === cle ? ` aria-sort="${sens > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-k="${k}">${titre}</button></th>`).join("")}</tr></thead>
      <tbody>${vues.map(l => `<tr data-i="${lignes.indexOf(l)}" tabindex="0">${colonnes.map(([k, , num, rendu]) =>
        `<td class="${num ? "n" : ""}">${rendu ? rendu(l) : echap(l[k])}</td>`).join("")}</tr>`).join("")}</tbody>`;
    t.querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k;
      etat.tri[cleTri] = [k, k === cle ? -sens : (typeof lignes[0]?.[k] === "string" ? 1 : -1)];
      tableau(id, colonnes, lignes, cleTri, quand, limite);
    }));
    t.querySelectorAll("tbody tr").forEach(tr => {
      tr.addEventListener("click", () => quand(lignes[+tr.dataset.i]));
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); quand(lignes[+tr.dataset.i]); } });
    });
  }

  const calculVille = l => `${pluriel(l.offres, "offre")} ÷ ${nb(l.pop)} habitants × 100 000 = ${dec(l.pour100k)} offres pour 100 000 habitants, soit ${nb(l.habParOffre)} habitants par offre.`;

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

    document.getElementById("compte").innerHTML = `<b>${pluriel(n, "offre")}</b> · ${echap(libSel())}`;

    /* ---- Chiffres-clés ---- */
    const parFrance = n / POP_FRANCE * 100000;
    document.getElementById("chiffres").innerHTML = [
      [nb(n), "offres en ligne ce matin"],
      [nb(new Set(nommees.map(o => o.entreprise.trim().toUpperCase())).size), `entreprises nommées — ${pct(n - nommees.length, n)} % des offres ne donnent pas l'employeur`],
      [nb(new Set(localisees.map(o => o.ville)).size), "villes avec au moins une offre"],
      [n ? nb(POP_FRANCE / n) : "—", `habitants pour une offre en France (${dec(parFrance)} offres pour 100 000 habitants)`],
    ].map(([v, l]) => `<div class="chiffre"><b>${v}</b><span>${l}</span></div>`).join("");

    /* ---- 1. Entreprises ---- */
    const ent = compter(nommees, o => o.entreprise.trim().toUpperCase()).slice(0, 15);
    barresCliquables("g-entreprises", ent.map(([nom, v]) => ({ label: nom, valeur: v, bulle: `${pluriel(v, "offre")}, ${pct(v, n)} % de la sélection` })),
      l => montrer(l.label, nommees.filter(o => o.entreprise.trim().toUpperCase() === l.label), `${pluriel(l.valeur, "offre")} sur ${nb(n)}, soit ${pct(l.valeur, n)} %`));
    document.getElementById("sous-ent").textContent = ent.length
      ? `Les 15 employeurs qui publient le plus d'offres. N° 1 : ${ent[0][0]}, avec ${pluriel(ent[0][1], "offre")}.` : "Aucune offre ne nomme son employeur.";
    document.getElementById("note-ent").innerHTML =
      `Noms mis en majuscules pour regrouper les variantes. ${pluriel(n - nommees.length, "offre")} sur ${nb(n)} ne donnent pas le nom de l'employeur et ne peuvent pas compter ici. `
      + (inter && !etat.inter ? `${pluriel(inter, "offre")} viennent d'agences d'intérim ou de placement, qui recrutent pour d'autres entreprises : cochez « Masquer les agences » en haut pour les retirer.` : "");

    /* ---- 2. Villes qui ont au moins une offre, de la plus peuplée à la moins peuplée ---- */
    const parVille = new Map();
    for (const o of localisees) { if (!parVille.has(o.ville)) parVille.set(o.ville, []); parVille.get(o.ville).push(o); }
    const villes = [...parVille].map(([code, lot]) => {
      const [nom, pop, dep, rang] = infoVille(code);
      const e1 = compter(lot.filter(o => o.entreprise), o => o.entreprise.trim().toUpperCase())[0];
      return { code, ville: nom, dep, pop, rang, offres: lot.length,
               pour100k: pop ? lot.length / pop * 100000 : null, habParOffre: pop ? pop / lot.length : null,
               entreprise: e1 ? `${e1[0]} (${e1[1]})` : "—", lot };
    }).filter(l => l.pop).sort((a, b) => a.rang - b.rang);
    villes.forEach((l, i) => { l.place = i + 1; });
    document.getElementById("sous-villes").textContent = villes.length
      ? `Les ${nb(villes.length)} villes qui ont au moins une offre, de la plus peuplée à la moins peuplée.` : "Aucune offre ne donne sa ville.";
    tableau("t-villes", [
      ["place", "N°", true],
      ["ville", "Ville", false, l => `<b>${echap(l.ville)}</b> <span class="petit">${echap(l.dep)}</span>`],
      ["rang", "Rang en France", true, l => `${nb(l.rang)}<sup>${l.rang === 1 ? "re" : "e"}</sup>`],
      ["pop", "Habitants", true, l => nb(l.pop)],
      ["offres", "Offres", true, l => nb(l.offres)],
      ["pour100k", "Offres pour 100 000 hab.", true, l => dec(l.pour100k)],
      ["habParOffre", "Habitants par offre", true, l => nb(l.habParOffre)],
      ["entreprise", "Entreprise n° 1", false],
    ], villes, "villes", l => montrer(`${l.ville} (${nb(l.pop)} habitants)`, l.lot, calculVille(l)),
      etat.toutesVilles ? 0 : VILLES_AFFICHEES);
    document.getElementById("plus-villes").innerHTML = villes.length > VILLES_AFFICHEES
      ? `<button type="button" class="plus" id="b-plus-villes">${etat.toutesVilles ? `Afficher seulement les ${VILLES_AFFICHEES} premières` : `Afficher les ${nb(villes.length)} villes`}</button>` : "";
    const bPlus = document.getElementById("b-plus-villes");
    if (bPlus) bPlus.addEventListener("click", () => { etat.toutesVilles = !etat.toutesVilles; rendre(); });

    /* ---- 3. Ratios : les 30 plus grandes villes qui ont au moins une offre ---- */
    const grandes = villes.slice(0, 30);
    const ratio = [...grandes].sort((a, b) => b.pour100k - a.pour100k);
    barresCliquables("g-ratio", ratio.map(l => ({ label: `${l.ville} (${l.offres})`, valeur: Math.round(l.pour100k * 10) / 10,
      bulle: `${dec(l.pour100k)} offres pour 100 000 habitants — ${nb(l.habParOffre)} habitants par offre`, l })),
      x => montrer(`${x.l.ville} (${nb(x.l.pop)} habitants)`, x.l.lot, calculVille(x.l)));
    const enGrandes = grandes.reduce((s, l) => s + l.offres, 0), popGrandes = grandes.reduce((s, l) => s + l.pop, 0);
    document.getElementById("sous-ratio").textContent = n
      ? `En France : ${nb(POP_FRANCE / n)} habitants pour une offre. Calcul : offres de la ville ÷ habitants × 100 000.` : "";
    document.getElementById("note-ratio").innerHTML =
      `Entre parenthèses : le nombre d'offres de la ville. Ces ${grandes.length} villes réunissent ${pct(popGrandes, POP_FRANCE)} % des habitants et ${pct(enGrandes, n)} % des offres (${nb(enGrandes)} sur ${nb(n)}). `
      + `Une ville avec très peu d'offres a un ratio fragile : une offre de plus ou de moins le change beaucoup. `
      + `${pluriel(n - localisees.length, "offre")} ne donnent que leur département ou leur région : elles comptent au département, pas à une ville.`;

    const parDep = new Map();
    for (const o of offres) if (o.dep) { if (!parDep.has(o.dep)) parDep.set(o.dep, []); parDep.get(o.dep).push(o); }
    const lignesDeps = Object.entries(MC.departements).map(([code, [nom, pop]]) => {
      const lot = parDep.get(code) || [];
      const e1 = compter(lot.filter(o => o.entreprise), o => o.entreprise.trim().toUpperCase())[0];
      return { code, nom, pop, offres: lot.length, ratio: pop ? lot.length / pop * 100000 : null, habParOffre: lot.length ? pop / lot.length : null,
               entreprise: e1 ? `${e1[0]} (${e1[1]})` : "—", lot };
    }).filter(l => l.offres);
    tableau("t-deps", [
      ["code", "Code", false],
      ["nom", "Département", false],
      ["pop", "Habitants", true, l => nb(l.pop)],
      ["offres", "Offres", true, l => nb(l.offres)],
      ["ratio", "Offres pour 100 000 hab.", true, l => dec(l.ratio)],
      ["habParOffre", "Habitants par offre", true, l => nb(l.habParOffre)],
      ["entreprise", "Entreprise n° 1", false],
    ], lignesDeps, "deps", l => montrer(`${l.nom} (${l.code})`, l.lot,
      `${pluriel(l.offres, "offre")} ÷ ${nb(l.pop)} habitants × 100 000 = ${dec(l.ratio)} offres pour 100 000 habitants`));

  }

  function poserMethode() {
    document.getElementById("t-methode").innerHTML = `
      <p style="margin-top:0"><b>Source des offres.</b> ${echap(MC.source)}, offres en ligne le ${dateFr(MC.date)}, France entière, une requête par code ROME.
        <b>Population.</b> ${echap(MC.population.source)}, lue le ${dateFr(MC.population.lu_le)}.</p>
      <p><b>Comment une offre est rattachée à un métier.</b> France Travail range chaque offre dans un code métier (ROME), mais ce classement est imparfait :
        le code des chargés de communication contient aussi des « chargés d'affaires » de chantier, celui des chargés d'études des « chargés d'études VRD ».
        Par défaut, une offre ne compte donc que si son intitulé correspond au métier ; les codes voisins, où France Travail range aussi ce métier, sont fouillés de la même façon.
        Décochez « Seulement les intitulés qui correspondent » pour compter toutes les offres des codes du métier.</p>
      <ul>${MC.metiers.map(m => `<li><b>${echap(m.libelle)}</b> : codes ${m.codes.map(c => `<code>${c}</code> ${echap(m.libelles_codes[c])}`).join(", ")}
        ${m.voisins.length ? `; codes voisins ${m.voisins.map(c => `<code>${c}</code>`).join(", ")}` : ""} — ${echap(m.regle)}.
        <span class="note">${m.retenues} offres retenues (dont ${m.par_voisins} trouvées dans les codes voisins) ; ${m.dans_code} offres dans le code, tous intitulés confondus.</span></li>`).join("")}</ul>
      <p><b>Limites.</b></p>
      <ul>
        <li>Une photo du jour : seules les offres encore en ligne ce matin comptent. Une offre peut proposer plusieurs postes ; elle compte pour une.</li>
        <li>Une offre peut appartenir à deux métiers (un « brand manager » rangé chez les chefs de produit) ; dans « Les six ensemble », elle ne compte qu'une fois.</li>
        <li>« Entreprise » est le nom affiché dans l'annonce : une agence d'intérim ou un cabinet de recrutement peut publier pour un client. La case « Masquer les agences » retire celles dont le secteur est l'intérim ou le placement.</li>
        <li>Ratios par ville : la population est celle de la commune seule. Les offres de banlieue comptent pour leur commune ; le tableau par département donne une image plus juste des grandes agglomérations.</li>
        <li>« Responsable de secteur GMS » : France Travail mélange dans les codes D1510 et D1517 les chefs de secteur des marques (qui visitent les magasins) et ceux des magasins eux-mêmes. « Chargé de clientèle » : le code D1415 (relation client) ; les chargés de clientèle des banques et des assurances sont rangés dans d'autres codes, non suivis ici.</li>
        <li>Pas d'autre source que France Travail sur cette page : LinkedIn, Indeed ou HelloWork interdisent la collecte automatique.</li>
      </ul>`;
  }

  document.getElementById("sous").innerHTML = `Pour six métiers du marketing et de la communication, à partir des offres France Travail en ligne le <b>${dateFr(MC.date)}</b>. `
    + `Choisissez un métier : toute la page se recalcule. Chaque barre, chaque ligne de tableau s'ouvre sur les offres comptées. <a href="#methode">Méthode et limites</a>.`;
  poserMethode();
  rendre();
})();
