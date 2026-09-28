/* ============================================================
   offres.js — la page Offres disponibles.
   Toutes les offres de la collecte du matin (donc encore en ligne),
   filtrables par type, métier, zone, durée de stage, mot-clé ;
   chaque carte mène à l'annonce d'origine.
   Les choix sont dans l'adresse (#c=stage&m=M1620&z=dep:63…) et
   suivent sur les autres pages (Site.memoriser).
   ============================================================ */
"use strict";
const D = window.ALTERNANCE;
if (!D) { document.querySelector(".page").innerHTML = "<p>Données absentes : lancez <code>mettre-a-jour-alternance.cmd</code>.</p>"; throw new Error("données absentes"); }
const { esc, nb, dateFr, libDep, SOURCES } = Site;
const METIER = Object.fromEntries(D.metiers.map(m => [m.code, m]));
const DUREES = D.classes_duree || [];
const AURA = "Auvergne-Rhône-Alpes", IDF = "Île-de-France";
const JOUR = Date.parse(D.date);
const age = o => { const t = Date.parse(o.date); return isFinite(t) ? Math.max(0, Math.round((JOUR - t) / 86400000)) : null; };
const sansAccents = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PAS = 24;

/* ---- État ---- */
const DEFAUT = { c: "alternance", m: D.metier_par_defaut || "*", z: "", q: "", d: DUREES.map((_, i) => i).join(","), e: "0", r: "0", s: "0", tri: "date" };
let E = { ...DEFAUT }, montrees = PAS;
(function lire() {
  const p = new URLSearchParams(location.hash.slice(1)), ch = Site.lireChoix();
  if (ch.c) E.c = ch.c; if (ch.m) E.m = ch.m;
  for (const k of Object.keys(DEFAUT)) if (p.has(k)) E[k] = p.get(k);
  if (E.m !== "*" && !E.m.startsWith("g:") && !METIER[E.m]) E.m = DEFAUT.m;
})();
function ecrireAdresse() {
  const p = new URLSearchParams();
  for (const k of Object.keys(DEFAUT)) if (E[k] !== DEFAUT[k] || k === "m") p.set(k, E[k]);
  history.replaceState(null, "", "#" + p);
  Site.memoriser({ c: E.c, m: E.m });
}

/* ---- Filtres ---- */
const passeMetier = o => E.m === "*" ? true : E.m.startsWith("g:") ? (METIER[o.rome] || {}).groupe === E.m.slice(2) : o.rome === E.m;
const passeZone = o => !E.z ? true : E.z.startsWith("dep:") ? o.dep === E.z.slice(4) : o.reg === E.z.slice(4);
function selection() {
  const durees = new Set(E.d.split(",").filter(Boolean).map(i => DUREES[+i]));
  const mots = sansAccents(E.q).split(/\s+/).filter(Boolean);
  return D.offres.filter(o => {
    if (E.c !== "tous" && (o.contrat || "alternance") !== E.c) return false;
    if (!passeMetier(o) || !passeZone(o)) return false;
    if (E.e !== "1" && o.ecole) return false;
    if (E.r === "1") { const a = age(o); if (a == null || a >= 30) return false; }
    if (E.s === "1" && o.smin == null) return false;
    if (o.contrat === "stage" && !durees.has(o.duree_classe || DUREES.at(-1))) return false;
    if (mots.length) { const t = sansAccents(`${o.titre} ${o.ent} ${o.ville} ${o.lieu}`); if (!mots.every(w => t.includes(w))) return false; }
    return true;
  });
}
const libMetier = () => E.m === "*" ? "tous les métiers" : E.m.startsWith("g:") ? `groupe ${E.m.slice(2)}` : METIER[E.m].libelle;
const libZone = () => !E.z ? "France entière" : E.z.startsWith("dep:") ? libDep(E.z.slice(4)) : E.z.slice(4);
const decrire = () => [`offres : ${({ alternance: "alternance", stage: "stages", tous: "alternance et stages" })[E.c]}`, `métier : ${libMetier()}`, `zone : ${libZone()}`,
  E.q ? `recherche « ${E.q} »` : null, E.e === "1" ? "écoles comprises" : "offres d'écoles retirées", E.r === "1" ? "moins de 30 jours" : null, E.s === "1" ? "avec salaire" : null].filter(Boolean).join(" · ");

/* ---- Rendu ---- */
function carte(o) {
  const a = age(o);
  const quand = a == null ? "" : a === 0 ? "publiée aujourd'hui" : a === 1 ? "publiée hier" : `publiée il y a ${a} jours`;
  const etiq = [
    o.contrat === "stage" ? `<span class="badge stage">Stage${o.duree ? ` · ${o.duree_min && o.duree_min !== o.duree ? o.duree_min + " à " : ""}${o.duree} mois` : ""}</span>`
                          : `<span class="badge alt">${o.type === "apprentissage" ? "Apprentissage" : o.type === "professionnalisation" ? "Contrat pro" : "Alternance"}</span>`,
    o.diplome ? `<span class="badge">${esc(o.diplome)}</span>` : "",
    o.ecole ? `<span class="badge ecole">école</span>` : "",
    a != null && a < 7 ? `<span class="badge ok">nouvelle</span>` : "",
  ].join("");
  const via = o.src === "FT" && o.via && o.via !== "France Travail" ? `France Travail via ${o.via}` : (o.via || SOURCES[o.src]);
  return `<article class="offre">
    <div class="etiquettes">${etiq}</div>
    <h3>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.titre)}</a>` : esc(o.titre)}</h3>
    <div class="qui">${esc(o.ent || "Employeur non précisé")}${o.eff ? ` <span class="note">· ${esc(o.eff)} salariés</span>` : ""}</div>
    <div class="infos"><span>📍 ${esc(o.ville || o.lieu || "Lieu non précisé")}${o.dep ? ` (${esc(o.dep)})` : ""}</span>${o.smin ? `<span class="sal">${nb(o.smin)}${o.smax > o.smin ? "–" + nb(o.smax) : ""} € brut/mois</span>` : ""}<span>${(METIER[o.rome] || {}).libelle || ""}</span></div>
    <div class="bas"><span>${quand} · ${esc(via)}</span>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">Voir l'annonce →</a>` : ""}</div>
  </article>`;
}
let courante = [];
function rendre() {
  ecrireAdresse();
  document.querySelectorAll("#o-contrat button").forEach(b => b.classList.toggle("actif", b.dataset.c === E.c));
  document.getElementById("o-durees-bloc").hidden = E.c === "alternance";
  const dd = new Set(E.d.split(","));
  document.querySelectorAll("#o-durees-bloc button").forEach(b => b.classList.toggle("actif", dd.has(b.dataset.i)));
  const t = selection();
  if (E.tri === "salaire") t.sort((a, b) => (b.smin || -1) - (a.smin || -1));
  else if (E.tri === "ville") t.sort((a, b) => String(a.ville).localeCompare(String(b.ville), "fr"));
  else t.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  courante = t;
  document.getElementById("o-surtitre").textContent = `Offres disponibles · collecte du ${dateFr(D.date)}`;
  document.getElementById("o-compte").innerHTML = `${nb(t.length)} offre${t.length > 1 ? "s" : ""} <span class="note" style="font-weight:400">— ${esc(libMetier())}, ${esc(libZone())}</span>`;
  document.getElementById("o-liste").innerHTML = t.length ? t.slice(0, montrees).map(carte).join("")
    : `<div class="vide-offres carte" style="grid-column:1/-1">Aucune offre ne correspond. Élargissez la zone, changez de métier, ou cochez « Inclure les offres d'écoles ».</div>`;
  const b = document.getElementById("o-plus");
  b.hidden = montrees >= t.length;
  b.textContent = `Afficher ${Math.min(PAS, t.length - montrees)} offres de plus (${nb(t.length - montrees)} restantes)`;
}

/* ---- Mise en place ---- */
const groupes = [...new Set(D.metiers.map(m => m.groupe))];
const horsEcoles = D.offres.filter(o => !o.ecole);
document.getElementById("o-metier").innerHTML = `<option value="*">Tous les métiers (${nb(horsEcoles.length)})</option>`
  + groupes.map(g => `<option value="g:${esc(g)}">Groupe ${esc(g)}</option>`).join("")
  + groupes.map(g => `<optgroup label="${esc(g)}">` + D.metiers.filter(m => m.groupe === g).map(m => `<option value="${m.code}">${esc(m.libelle)} (${nb(horsEcoles.filter(o => o.rome === m.code).length)})</option>`).join("") + `</optgroup>`).join("");
const deps = [...new Set(D.offres.map(o => o.dep).filter(Boolean))].sort();
const regAura = (D.region_suivie || {}).deps || [];
document.getElementById("o-zone").innerHTML = `<option value="">France entière</option><option value="reg:${AURA}">${AURA}</option><option value="dep:63">Puy-de-Dôme (63)</option><option value="reg:${IDF}">${IDF}</option>`
  + `<optgroup label="Départements d'${AURA}">` + regAura.map(d => `<option value="dep:${d}">${esc(libDep(d))}</option>`).join("") + `</optgroup>`
  + `<optgroup label="Autres régions">` + D.regions.filter(r => r !== AURA && r !== IDF).map(r => `<option value="reg:${esc(r)}">${esc(r)}</option>`).join("") + `</optgroup>`
  + `<optgroup label="Autres départements">` + deps.filter(d => !regAura.includes(d)).map(d => `<option value="dep:${d}">${esc(libDep(d))}</option>`).join("") + `</optgroup>`;
document.getElementById("o-durees-bloc").innerHTML = `<span class="note" style="align-self:center">Durée :</span>` + DUREES.map((k, i) => `<button data-i="${i}">${esc(k)}</button>`).join("");

document.getElementById("o-metier").value = E.m;
document.getElementById("o-zone").value = E.z;
document.getElementById("o-mot").value = E.q;
document.getElementById("o-tri").value = E.tri;
document.getElementById("o-ecoles").checked = E.e === "1";
document.getElementById("o-recentes").checked = E.r === "1";
document.getElementById("o-salaire").checked = E.s === "1";

const change = (k, v) => { E[k] = v; montrees = PAS; rendre(); };
document.getElementById("o-contrat").addEventListener("click", e => { const b = e.target.closest("button"); if (b) change("c", b.dataset.c); });
document.getElementById("o-metier").addEventListener("change", e => change("m", e.target.value));
document.getElementById("o-zone").addEventListener("change", e => change("z", e.target.value));
document.getElementById("o-tri").addEventListener("change", e => change("tri", e.target.value));
document.getElementById("o-ecoles").addEventListener("change", e => change("e", e.target.checked ? "1" : "0"));
document.getElementById("o-recentes").addEventListener("change", e => change("r", e.target.checked ? "1" : "0"));
document.getElementById("o-salaire").addEventListener("change", e => change("s", e.target.checked ? "1" : "0"));
let minuteur;
document.getElementById("o-mot").addEventListener("input", e => { clearTimeout(minuteur); minuteur = setTimeout(() => change("q", e.target.value.trim()), 250); });
document.getElementById("o-durees-bloc").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const dd = new Set(E.d.split(",").filter(Boolean));
  dd.has(b.dataset.i) ? dd.delete(b.dataset.i) : dd.add(b.dataset.i);
  change("d", [...dd].sort().join(","));
});
document.getElementById("o-plus").addEventListener("click", () => { montrees += PAS; rendre(); });
document.getElementById("o-verif").addEventListener("click", () => Verif.ouvrir({ titre: "Les offres affichées", calcul: { num: courante.length, den: null, texte: "Offres de la collecte du matin qui passent les filtres, après suppression des doublons" },
  champ: "contrat", filtres: decrire(), offres: courante, base: courante }));
document.getElementById("o-csv").addEventListener("click", () => {
  const lignes = [["offre", "intitule", "entreprise", "ville", "departement", "type", "duree_mois", "diplome", "salaire_min", "salaire_max", "publiee_le", "source", "lien"],
    ...courante.map(o => [o.contrat, o.titre, o.ent, o.ville, o.dep, o.type, o.duree || "", o.diplome || "", o.smin || "", o.smax || "", o.date, o.via || SOURCES[o.src], o.url])];
  const txt = "﻿" + lignes.map(l => l.map(v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = `offres_${E.c}_${D.date}.csv`; a.click();
});
rendre();
