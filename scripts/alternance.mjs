/* ============================================================
   alternance.mjs — la veille alternance, toutes sources confondues.

   Usage (Node 18+ suffit, rien à installer) :
       node scripts/alternance.mjs               # tout : sources, nettoyage, croisement, contrôles
       node scripts/alternance.mjs --hors-ligne  # sans aucun appel réseau (données locales + caches)

   Ce que ça lit :
       config/alternance.json      les métiers suivis (changer de métier = changer ce fichier)
       data/actives/ + data/brut/  les offres France Travail déjà collectées par scripts/extraire.py
       .env                        les clés des sources facultatives (voir .env.example)

   Les sources, dans l'ordre de priorité (une offre vue deux fois est gardée dans la première) :
       FT   France Travail — le dépôt du cours (data/brut), ou l'API en direct si FT_CLIENT_ID est rempli.
            France Travail agrège déjà des partenaires : PMEJob, DirectEmploi, La bonne alternance,
            Meteojob, TalentPlug… (champ « via »).
       LBA  La bonne alternance — l'API officielle de l'alternance (clé gratuite : LBA_API_KEY).
       ADZ  Adzuna — un agrégateur d'offres qui a une API ouverte (clé gratuite : ADZUNA_APP_ID / _KEY).
       Pas de scraping de LinkedIn, Indeed, HelloWork, Welcome to the Jungle : leurs conditions
       d'utilisation l'interdisent (règle du dépôt, README).

   Ce que ça écrit :
       data/alternance.json        les offres en alternance, nettoyées, + le rapport de qualité
       data/alternance.js          la même chose, lisible par alternance.html ouvert d'un double-clic
       data/alternance-cache/      les réponses déjà obtenues (entreprises, communes) pour ne pas redemander

   Le croisement : chaque employeur est cherché dans l'API Recherche d'entreprises (État, sans clé)
   pour ajouter sa taille, son activité (NAF) et savoir si c'est une école (NAF 85) ou une agence
   d'intérim (NAF 78). Clé du croisement : le nom de l'entreprise + le département.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = new Set(process.argv.slice(2));
const HORS_LIGNE = ARGS.has("--hors-ligne");
const CACHE = path.join(RACINE, "data", "alternance-cache");
fs.mkdirSync(CACHE, { recursive: true });

/* ============================================================
   1) CONFIGURATION ET UTILITAIRES
   ============================================================ */
(function lireEnv() {
  const f = path.join(RACINE, ".env");
  if (!fs.existsSync(f)) return;
  for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
})();
// Une clé laissée à sa valeur d'exemple compte comme absente.
const cle = nom => { const v = process.env[nom]; return v && !/^(PAR_votre|votre|x+$)/i.test(v) ? v : null; };

const CONFIG = JSON.parse(fs.readFileSync(path.join(RACINE, "config", "alternance.json"), "utf8"));
const METIERS = new Map(CONFIG.metiers.map(m => [m.code, m]));
// Intitulés qui ne sont pas du marketing, même classés dans un métier suivi (config : titres_hors_sujet).
const RX_HORS_SUJET = (CONFIG.titres_hors_sujet || []).length ? new RegExp(CONFIG.titres_hors_sujet.join("|")) : null;
const RX_SAUVE = /\b(marketing|communication|publicite|digital|digitale|web|e commerce|ecommerce|community|marque|brand|social media|seo|gms)\b/;
// Minima légaux (config : remuneration_legale) : le SMIC sert à reconnaître le barème recopié tel quel.
const LEGAL = CONFIG.remuneration_legale || { smic_mensuel: 1867.02 };
// Annonces qui ne proposent pas de poste (« on ne recrute pas », annonce test, vivier de CV…) : config annonces_sans_poste.
const listeRx = l => (l || []).length ? new RegExp("\\b(" + l.join("|") + ")\\b") : null;
const RX_SANS_POSTE_TITRE = listeRx((CONFIG.annonces_sans_poste || {}).titre), RX_SANS_POSTE_TEXTE = listeRx((CONFIG.annonces_sans_poste || {}).texte);
// Liste large pour le titre, liste stricte pour le texte (« merci de ne pas postuler si… » n'est pas une annonce vide).
const sansPoste = (titre, texte) => {
  const m = (RX_SANS_POSTE_TITRE && RX_SANS_POSTE_TITRE.exec(norm(titre))) || (RX_SANS_POSTE_TEXTE && RX_SANS_POSTE_TEXTE.exec(norm(texte)));
  if (m && process.env.DEBUG_SANS_POSTE) console.log(`  sans poste : « ${m[0]} » — ${titre}`);
  return !!m;
};
// Seuils de vraisemblance du salaire affiché, en multiples du SMIC (config salaire_vraisemblable).
const VRAISEMBLABLE = Object.assign({ alternance_max_smic: 1.4, stage_max_smic: 1.2, fourchette_max_smic: 2.2 }, CONFIG.salaire_vraisemblable || {});
const ORDRE_SOURCES = ["FT", "LBA", "ADZ"];

const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return defaut; } };
const ecrireJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v), "utf8");
const pause = ms => new Promise(r => setTimeout(r, ms));
const sansAccents = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = s => sansAccents(String(s || "").toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
// Nom d'entreprise comparable : sans forme juridique ni mots vides.
const MOTS_VIDES_ENT = new Set("sas sasu sarl eurl sa sca snc sci selarl scop scic groupe group france et de la le les des du d l the".split(" "));
const normEnt = s => norm(s).split(" ").filter(w => w && !MOTS_VIDES_ENT.has(w)).join(" ");
// Intitulé comparable : sans les mots qui ne disent que « alternance » ou « H/F ».
const MOTS_VIDES_TITRE = new Set("alternance alternant alternante alternants apprenti apprentie apprentissage contrat pro professionnalisation en h f x n stage cdd cdi de d du la le les l et a".split(" "));
const normTitre = s => norm(s).split(" ").filter(w => w && !MOTS_VIDES_TITRE.has(w)).join(" ");
const jaccard = (a, b) => {
  const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let k = 0; for (const x of A) if (B.has(x)) k++;
  return k / (A.size + B.size - k);
};
const sha = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const texteBrut = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function http(url, opts = {}, essais = 3) {
  for (let i = 0; i < essais; i++) {
    let r;
    try { r = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) }); }
    catch (e) { if (i === essais - 1) throw e; await pause(1000 * (i + 1)); continue; }
    if ((r.status === 429 || r.status >= 500) && i < essais - 1) { await pause(1500 * (i + 1)); continue; }
    return r;
  }
}

/* ---- Géographie ---- */
const REGIONS = {
  "Auvergne-Rhône-Alpes": "01 03 07 15 26 38 42 43 63 69 73 74",
  "Bourgogne-Franche-Comté": "21 25 39 58 70 71 89 90",
  "Bretagne": "22 29 35 56",
  "Centre-Val de Loire": "18 28 36 37 41 45",
  "Corse": "2A 2B",
  "Grand Est": "08 10 51 52 54 55 57 67 68 88",
  "Hauts-de-France": "02 59 60 62 80",
  "Île-de-France": "75 77 78 91 92 93 94 95",
  "Normandie": "14 27 50 61 76",
  "Nouvelle-Aquitaine": "16 17 19 23 24 33 40 47 64 79 86 87",
  "Occitanie": "09 11 12 30 31 32 34 46 48 65 66 81 82",
  "Pays de la Loire": "44 49 53 72 85",
  "Provence-Alpes-Côte d'Azur": "04 05 06 13 83 84",
  "Outre-mer": "971 972 973 974 975 976 977 978 986 987 988",
};
const REGION_DE = {};
for (const [r, deps] of Object.entries(REGIONS)) for (const d of deps.split(" ")) REGION_DE[d] = r;
const depValide = d => d in REGION_DE;
function depDeCp(cp) {
  cp = String(cp || "");
  if (!/^\d{5}$/.test(cp) || cp === "99999") return "";
  if (cp.startsWith("97") || cp.startsWith("98")) return cp.slice(0, 3);
  if (cp.startsWith("20")) return cp < "20200" ? "2A" : "2B";
  return cp.slice(0, 2);
}
function depDeCommune(insee) {
  insee = String(insee || "");
  if (/^(2A|2B)\d{3}$/.test(insee)) return insee.slice(0, 2);
  if (!/^\d{5}$/.test(insee)) return "";
  return insee.startsWith("97") || insee.startsWith("98") ? insee.slice(0, 3) : insee.slice(0, 2);
}
const depDeLibelle = lib => { const m = /^\s*(\d{2,3}|2A|2B)\s*-/.exec(lib || ""); return m ? m[1] : ""; };

/* Positions : caches du dépôt (data/geo, écrits par resumer.py) lus, les nôtres écrits à part. */
const GEO_PROF = { c: lireJson(path.join(RACINE, "data", "geo", "communes.json"), {}), d: lireJson(path.join(RACINE, "data", "geo", "departements.json"), {}) };
const GEO = { c: lireJson(path.join(CACHE, "communes.json"), {}), d: lireJson(path.join(CACHE, "departements.json"), {}), appels: 0 };
async function centreCommune(insee) {
  if (GEO_PROF.c[insee]) return GEO_PROF.c[insee];
  if (insee in GEO.c) return GEO.c[insee];
  if (HORS_LIGNE) return null;
  GEO.appels++;
  try { const r = await http(`https://geo.api.gouv.fr/communes/${insee}?fields=centre`); const d = r.ok ? await r.json() : null; GEO.c[insee] = d && d.centre ? d.centre.coordinates.slice().reverse() : null; }
  catch { GEO.c[insee] = null; }
  return GEO.c[insee];
}
async function centreDepartement(dep) {
  if (GEO_PROF.d[dep]) return GEO_PROF.d[dep];
  if (dep in GEO.d) return GEO.d[dep];
  if (HORS_LIGNE) return null;
  GEO.appels++;
  try { const r = await http(`https://geo.api.gouv.fr/communes?codeDepartement=${dep}&fields=centre&boost=population&limit=1`); const d = r.ok ? await r.json() : null; GEO.d[dep] = d && d[0] ? d[0].centre.coordinates.slice().reverse() : null; }
  catch { GEO.d[dep] = null; }
  return GEO.d[dep];
}

/* ---- Salaire : tout est ramené en brut MENSUEL (c'est ainsi qu'on parle d'une rémunération d'apprenti). ---- */
const MOTIF_SALAIRE = /^(annuel|mensuel|horaire)\s+de\s+(\d+(?:[.,]\d+)?)\s*euros(?:\s*à\s*(\d+(?:[.,]\d+)?)\s*euros)?/i;
const SAL_MIN = 300, SAL_MAX = 6000;   // fenêtre de vraisemblance, brut mensuel d'un alternant
function salaireFT(lib) {
  const m = MOTIF_SALAIRE.exec(String(lib || "").trim());
  if (!m) return { smin: null, smax: null, etat: lib ? "illisible" : "absent" };
  const periode = m[1].toLowerCase();
  const vals = [m[2], m[3]].filter(Boolean).map(x => Number(x.replace(",", ".")));
  let corrige = false;
  const mensuel = vals.map(v => {
    if (periode === "mensuel") return v;
    if (periode === "horaire") return v * 151.67;
    // « Annuel de 486 Euros à 1801 Euros » : un montant mensuel saisi dans la case annuelle.
    if (v >= SAL_MIN && v < 3000) { corrige = true; return v; }
    // « Annuel de 20 Euros » : des milliers d'euros.
    if (v > 3 && v < 100) { corrige = true; return v * 1000 / 12; }
    return v / 12;
  }).filter(v => v >= SAL_MIN && v <= SAL_MAX);
  if (!mensuel.length) return { smin: null, smax: null, etat: "rejeté" };
  return { smin: Math.round(Math.min(...mensuel)), smax: Math.round(Math.max(...mensuel)), etat: corrige ? "corrigé" : "ok" };
}

/* ---- Diplôme préparé ou demandé ---- */
const DIPLOMES = ["CAP / BEP", "Bac", "Bac+2", "Bac+3/4", "Bac+5"];
function diplomeTexte(texte) {
  const t = sansAccents(String(texte || "").toLowerCase());
  if (/bac\s*\+\s*5|\bmaster\b|\bmba\b|\bmsc\b|grande ecole|\bmastere\b/.test(t)) return "Bac+5";
  if (/bac\s*\+\s*[34]|\bbachelor\b|\blicence\b/.test(t)) return "Bac+3/4";
  if (/bac\s*\+\s*2|\bbts\b|\bdut\b/.test(t)) return "Bac+2";
  if (/\bbac pro\b|baccalaureat/.test(t)) return "Bac";
  return null;
}
function diplomeFT(o) {
  let meilleur = null;
  for (const f of o.formations || []) {
    const l = sansAccents(String(f.niveauLibelle || "").toLowerCase());
    const n = /bac\s*\+\s*5/.test(l) ? "Bac+5" : /bac\s*\+\s*[34]/.test(l) ? "Bac+3/4" : /bac\s*\+\s*2/.test(l) ? "Bac+2" : /bac/.test(l) ? "Bac" : l ? "CAP / BEP" : null;
    if (n && (!meilleur || DIPLOMES.indexOf(n) > DIPLOMES.indexOf(meilleur))) meilleur = n;
  }
  return meilleur;
}
const DIPLOME_EUROPEEN = { 3: "CAP / BEP", 4: "Bac", 5: "Bac+2", 6: "Bac+3/4", 7: "Bac+5", 8: "Bac+5" };

/* ---- Outils cités ---- */
const REGEX_OUTILS = Object.entries(CONFIG.outils).map(([nom, variantes]) =>
  [nom, new RegExp("(?<![\\p{L}\\p{N}-])(" + variantes.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}\\p{N}-])", "u")]);
const outilsCites = t => REGEX_OUTILS.filter(([, rx]) => rx.test(t)).map(([n]) => n);

/* ---- Type de contrat d'alternance ---- */
function typeAlternance(texteNature, texteLibre) {
  const n = sansAccents(String(texteNature || "").toLowerCase());
  if (/apprenti/.test(n)) return "apprentissage";
  if (/professionnalisation/.test(n)) return "professionnalisation";
  const t = sansAccents(String(texteLibre || "").toLowerCase());
  const a = /apprentissage|apprenti/.test(t), p = /professionnalisation|contrat pro\b/.test(t);
  return a && !p ? "apprentissage" : p && !a ? "professionnalisation" : "non précisé";
}
const estAlternanceTexte = t => /alternan|apprenti|professionnalisation|contrat pro\b|work[- ]study/i.test(sansAccents(t || ""));
// Un stage : le mot « stage », « stagiaire » ou « intern(ship) » — et pas une alternance.
const estStageTexte = t => /\b(stage|stages|stagiaire|internship|intern)\b/i.test(sansAccents(t || "")) && !/stage de (vente|formation)/i.test(sansAccents(t || ""));

/* ---- Durée d'un stage, lue dans le titre et le texte : « 6 mois », « 4 à 6 mois », « 8 semaines ». ---- */
const CLASSES_DUREE = ["2 mois ou moins", "3 à 4 mois", "5 à 6 mois", "Plus de 6 mois", "Non précisée"];
function dureeStage(texte) {
  const t = sansAccents(String(texte || "").toLowerCase()).replace(/\b1[23] ?(e|eme)? mois\b/g, " ");   // « 13e mois » n'est pas une durée
  let m = /\b(\d{1,2})\s*(?:a|-|\/|ou)\s*(\d{1,2})\s*mois\b/.exec(t);
  if (m && +m[1] >= 1 && +m[2] <= 12 && +m[1] <= +m[2]) return { dmin: +m[1], dmax: +m[2] };
  m = /\b(\d{1,2})\s*mois\b/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { dmin: +m[1], dmax: +m[1] };
  m = /\b(\d{1,2})\s*semaines?\b/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 52) { const v = Math.round(+m[1] / 4.33 * 10) / 10; return { dmin: v, dmax: v }; }
  return { dmin: null, dmax: null };
}
const classeDuree = dmax => dmax == null ? CLASSES_DUREE[4] : dmax <= 2 ? CLASSES_DUREE[0] : dmax <= 4 ? CLASSES_DUREE[1] : dmax <= 6 ? CLASSES_DUREE[2] : CLASSES_DUREE[3];

/* ---- Employeur : école ? intermédiaire ? ---- */
// Noms qui trahissent une école ou un groupe de formation (liste à compléter si vous en repérez d'autres).
const RX_ECOLE = /\b(ecole|school|bs|iscod|studi|academy|academie|campus|cfa|business school|pigier|idrac|ifag|iscom|efap|mbway|ifocop|openclassrooms|digital college|sup de|esup|ipac|institut de formation|centre de formation|formation|formations|education|educ|oktogone|galileo|ief2i|iseah|esg|imc alternance|ifcv|regen|athena)\b/;
// Intérim, cabinets de recrutement et sites d'emploi qui publient pour le compte d'autres.
const RX_INTERIM = /\b(interim|randstad|adecco|manpower|synergie|crit|proman|start people|partnaire|supplay|actual|actual talent|leader interim|samsic emploi|expectra|page personnel|michael page|robert half|hays|direct emploi|hellowork|jobteaser|meteojob|indeed|skillie|skale|walt|studentpop|recrutement|recruitment|talent)\b/;
// « Nom d'employeur » qui n'en est pas un : on le traite comme « employeur non précisé ».
const NOMS_GENERIQUES = new Set(["stage", "alternance", "confidentiel", "entreprise confidentielle", "entreprise", "non communique", "anonyme", "france travail", "pole emploi", "client", "notre client"]);

/* ============================================================
   2) SOURCE FT : les offres France Travail du dépôt (et de l'API si clé)
   ============================================================ */
function lireActives(fichier) {
  const lignes = fs.readFileSync(fichier, "utf8").trim().split(/\r?\n/).slice(1);
  return lignes.filter(Boolean).map(l => { const [rome, id, dateAct] = l.split(","); return { rome, id, dateAct }; });
}
function lireBrut() {
  // Dernière version connue de chaque offre (les mois dans l'ordre, les lignes dans l'ordre d'écriture).
  const versions = new Map();
  const dossier = path.join(RACINE, "data", "brut");
  if (!fs.existsSync(dossier)) return versions;
  for (const mois of fs.readdirSync(dossier).sort())
    for (const f of fs.readdirSync(path.join(dossier, mois)).filter(f => f.endsWith(".jsonl")).sort())
      for (const l of fs.readFileSync(path.join(dossier, mois, f), "utf8").split("\n"))
        if (l.trim()) { const v = JSON.parse(l); versions.set(v.id, v); }
  return versions;
}
const estAlternanceFT = o => !!o.alternance || /apprentissage|professionnalisation/i.test(o.natureContrat || "");

function normaliserFT(o, rome, vuLe) {
  const lieu = o.lieuTravail || {};
  const texte = `${o.intitule || ""} ${o.description || ""}`;
  const t = texte.toLowerCase();
  const sal = salaireFT(o.salaire && o.salaire.libelle);
  const dep = depDeCommune(lieu.commune) || depDeCp(lieu.codePostal) || depDeLibelle(lieu.libelle);
  const partenaires = (o.origineOffre && o.origineOffre.partenaires) || [];
  const dureeM = /(\d+)\s*mois/i.exec(o.typeContratLibelle || "");
  const dipl = diplomeFT(o);
  return {
    id: "FT-" + o.id, src: "FT", via: partenaires.length ? partenaires.map(p => p.nom).join(", ") : "France Travail",
    rome, titre: o.intitule || "", ent: (o.entreprise && o.entreprise.nom) || "",
    naf: o.codeNAF || "", secteur: o.secteurActiviteLibelle || "", eff_lib: o.trancheEffectifEtab || "",
    lieu: lieu.libelle || "", ville: String(lieu.libelle || "").replace(/^\s*[\dAB]{2,3}\s*-\s*/, ""), commune: lieu.commune || "", cp: lieu.codePostal || "",
    dep, lat: lieu.latitude || null, lon: lieu.longitude || null, prec: lieu.latitude ? "offre" : null,
    type: typeAlternance(o.natureContrat, texte),
    duree: dureeM ? Number(dureeM[1]) : null,
    diplome: dipl || diplomeTexte(texte), dipl_src: dipl ? "champ" : (diplomeTexte(texte) ? "texte" : null),
    debutant: o.experienceExige === "D",
    sal_lib: (o.salaire && o.salaire.libelle) || "", smin: sal.smin, smax: sal.smax, sal_etat: sal.etat,
    date: (o.dateCreation || "").slice(0, 10), maj: (o.dateActualisation || "").slice(0, 10), vu_le: vuLe || "",
    url: (o.origineOffre && o.origineOffre.urlOrigine) || `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
    outils: outilsCites(t), tele: /t[ée]l[ée]travail/.test(t), postes: Number(o.nombrePostes) || 1,
    empreinte: sha(norm(o.description || "").slice(0, 400)), sans_poste: sansPoste(o.intitule, texte),
  };
}

async function sourceFT(journal) {
  const dossier = path.join(RACINE, "data", "actives");
  const jours = fs.existsSync(dossier) ? fs.readdirSync(dossier).filter(f => f.endsWith(".csv")).sort() : [];
  if (!jours.length) { journal.push({ source: "FT", statut: "aucune donnée locale : lancez scripts/extraire.py", n: 0 }); return { offres: [], serie: [], totaux: {}, jour: null }; }
  const versions = lireBrut();

  // Série jour par jour, et totaux du dernier jour (toutes offres) pour la part de l'alternance.
  const serie = [];
  for (const j of jours) {
    const alt = {}, tot = {};
    for (const a of lireActives(path.join(dossier, j))) {
      tot[a.rome] = (tot[a.rome] || 0) + 1;
      const v = versions.get(a.id);
      if (v && estAlternanceFT(v.offre)) alt[a.rome] = (alt[a.rome] || 0) + 1;
    }
    serie.push({ date: j.replace(".csv", ""), alt, tot });
  }
  const jour = jours.at(-1).replace(".csv", "");
  const totaux = serie.at(-1).tot;

  let offres = [];
  const vues = new Set();
  for (const a of lireActives(path.join(dossier, jours.at(-1)))) {
    const v = versions.get(a.id);
    if (!v || !estAlternanceFT(v.offre) || vues.has(a.id)) continue;
    vues.add(a.id);
    offres.push(normaliserFT(v.offre, a.rome, v.vu_le));
  }
  journal.push({ source: "FT", statut: `dépôt du cours, extraction du ${jour}`, n: offres.length });
  // Le dépôt peut contenir des métiers retirés de config/alternance.json (ex. D1506) : on ne les garde pas.
  // (Compté avant ce filtre, pour que le recoupement avec resume.json porte sur les mêmes offres.)
  offres = offres.filter(o => METIERS.has(o.rome));

  // L'API en direct, si les identifiants sont là : elle remplace le dépôt pour les métiers qu'elle couvre,
  // et couvre aussi les métiers ajoutés dans config/alternance.json.
  const cid = cle("FT_CLIENT_ID"), secret = cle("FT_CLIENT_SECRET");
  if (!cid || !secret || HORS_LIGNE) {
    journal.push({ source: "FT (API en direct)", statut: HORS_LIGNE ? "hors ligne" : "pas de clé FT_CLIENT_ID : on garde le dépôt", n: 0 });
    return { offres, serie, totaux, jour };
  }
  try {
    const r = await http("https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: cid, client_secret: secret, scope: "api_offresdemploiv2 o2dsoffre" }) });
    if (!r.ok) throw new Error(`jeton refusé (${r.status})`);
    const token = (await r.json()).access_token;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const direct = [], couverts = new Set();
    for (const m of CONFIG.metiers) {
      let ok = true;
      // E2 = contrat d'apprentissage, FS = contrat de professionnalisation (référentiel naturesContrats).
      for (const nature of ["E2", "FS"]) {
        for (let debut = 0; debut < 1150; debut += 150) {
          const u = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?codeROME=${m.code}&natureContrat=${nature}&range=${debut}-${debut + 149}`;
          const rep = await http(u, { headers: { Authorization: `Bearer ${token}` } });
          if (rep.status === 204) break;
          if (rep.status !== 200 && rep.status !== 206) { ok = false; console.warn(`  FT ${m.code} ${nature} : ${rep.status}`); break; }
          const lot = (await rep.json()).resultats || [];
          for (const o of lot) direct.push(normaliserFT(o, m.code, aujourdhui));
          if (lot.length < 150) break;
          await pause(300);
        }
      }
      if (ok) couverts.add(m.code);
      await pause(300);
    }
    offres = offres.filter(o => !couverts.has(o.rome)).concat(direct);
    journal.push({ source: "FT (API en direct)", statut: `ok, ${couverts.size} métiers interrogés le ${aujourdhui}`, n: direct.length });
  } catch (e) {
    journal.push({ source: "FT (API en direct)", statut: "erreur : " + e.message + " — on garde le dépôt", n: 0 });
  }
  return { offres, serie, totaux, jour };
}

/* ============================================================
   3) SOURCE LBA : La bonne alternance (API officielle, clé gratuite)
   Deux temps : une recherche nationale par métier (les offres), puis, pour la région suivie,
   une recherche autour de chaque ville-centre (offres locales + entreprises « susceptibles de
   recruter en alternance », que seule la recherche locale renvoie).
   ============================================================ */
const REGION = CONFIG.region_suivie || null;
const DEPS_REGION = new Set(REGION ? (REGIONS[REGION.nom] || "").split(" ") : []);
const distanceKm = (a, b, c, d) => { const r = x => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
// Exécute des tâches asynchrones, n à la fois (pour ne pas attendre 300 appels l'un après l'autre).
async function enParallele(taches, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < taches.length) { const k = i++; await taches[k](); } }));
}

function offreLBA(j, rome, aujourdhui) {
  const idf = j.identifier || {}, w = j.workplace || {}, c = j.contract || {}, of = j.offer || {};
  const loc = w.location || {}, geo = (loc.geopoint && loc.geopoint.coordinates) || [];
  const cp = (/\b(\d{5})\b/.exec(loc.address || "") || [])[1] || "";
  const texte = `${of.title || ""} ${of.description || ""} ${(of.desired_skills || []).join(" ")}`;
  const naf = (w.domain && w.domain.naf) || {};
  const partenaire = idf.partner_label || "La bonne alternance";
  return {
    // Une offre France Travail relayée par LBA garde son identifiant FT : le dédoublonnage la reconnaît.
    id: /france travail|pole emploi/i.test(partenaire) && idf.partner_job_id ? "FT-" + idf.partner_job_id : "LBA-" + (idf.id || sha(JSON.stringify(j))),
    src: "LBA", via: partenaire, rome, titre: of.title || "", ent: w.brand || w.name || w.legal_name || "",
    siret: w.siret || "", naf: naf.code || "", secteur: naf.label || "", eff_lib: w.size || "",
    lieu: loc.address || "", ville: String(loc.address || "").replace(/^.*\b\d{5}\s*/, ""), commune: "", cp,
    dep: depDeCp(cp), lat: geo[1] || null, lon: geo[0] || null, prec: geo.length ? "offre" : null,
    type: typeAlternance((c.type || []).join(" "), texte),
    duree: Number(c.duration) || null,
    diplome: (of.target_diploma && DIPLOME_EUROPEEN[of.target_diploma.european]) || diplomeTexte(texte),
    dipl_src: of.target_diploma && of.target_diploma.european ? "champ" : (diplomeTexte(texte) ? "texte" : null),
    debutant: true, sal_lib: "", smin: null, smax: null, sal_etat: "absent",
    date: String((of.publication && of.publication.creation) || "").slice(0, 10), maj: "", vu_le: aujourdhui,
    url: (j.apply && j.apply.url) || "", outils: outilsCites(texte.toLowerCase()),
    tele: c.remote === "remote" || c.remote === "hybrid", postes: Number(of.opening_count) || 1,
    empreinte: sha(norm(of.description || "").slice(0, 400)), sans_poste: sansPoste(of.title, texte),
  };
}

async function sourceLBA(journal) {
  const k = cle("LBA_API_KEY");
  if (!k || HORS_LIGNE) { journal.push({ source: "LBA", statut: HORS_LIGNE ? "hors ligne" : "pas de clé LBA_API_KEY (gratuite sur api.apprentissage.beta.gouv.fr)", n: 0 }); return { offres: [], recruteurs: [] }; }
  const offres = [], erreurs = [];
  const aujourdhui = new Date().toISOString().slice(0, 10);
  // Quota de l'API : 60 requêtes par 31 secondes. On part au plus toutes les 560 ms (tous appels confondus),
  // et si l'API répond quand même 429, on attend que la fenêtre de 31 s soit passée avant de réessayer.
  let prochainDepart = 0;
  const appel = async q => {
    for (let essai = 0; essai < 3; essai++) {
      const attente = Math.max(0, prochainDepart - Date.now());
      prochainDepart = Math.max(Date.now(), prochainDepart) + 560;
      await pause(attente);
      const r = await http(`https://api.apprentissage.beta.gouv.fr/api/job/v1/search?${q}`, { headers: { Authorization: `Bearer ${k}` } });
      if (r.status === 429) { await pause(32000); continue; }
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 100)}`);
      return r.json();
    }
    throw new Error("429 quota dépassé trois fois");
  };
  // a) National, un appel par métier.
  let refus = false;
  await enParallele(CONFIG.metiers.map(m => async () => {
    if (refus) return;
    try { const d = await appel(`romes=${m.code}`); for (const j of d.jobs || []) offres.push(offreLBA(j, m.code, aujourdhui)); }
    catch (e) { erreurs.push(`${m.code} : ${e.message}`); if (/^40[13]/.test(e.message)) refus = true; }
  }), 3);
  const nNational = offres.length;

  // b) Région suivie : chaque ville-centre × chaque métier.
  const recruteurs = new Map();   // siret -> fiche, avec la liste des métiers pour lesquels LBA la propose
  let horsRayon = 0, appelsLocaux = 0;
  if (REGION && !refus) {
    const taches = [];
    for (const c of REGION.centres) for (const m of CONFIG.metiers) taches.push(async () => {
      appelsLocaux++;
      try {
        const d = await appel(`romes=${m.code}&latitude=${c.lat}&longitude=${c.lon}&radius=${REGION.rayon_km}`);
        for (const j of d.jobs || []) offres.push(offreLBA(j, m.code, aujourdhui));
        for (const re of d.recruiters || []) {
          const w = re.workplace || {}, loc = w.location || {}, geo = (loc.geopoint && loc.geopoint.coordinates) || [];
          const cp = (/\b(\d{5})\b/.exec(loc.address || "") || [])[1] || "", dep = depDeCp(cp);
          // LBA renvoie jusqu'à 150 entreprises même quand elles sont loin : on ne garde que celles
          // qui sont vraiment dans le rayon demandé ET dans la région.
          if (geo.length < 2 || distanceKm(c.lat, c.lon, geo[1], geo[0]) > REGION.rayon_km || !DEPS_REGION.has(dep)) { horsRayon++; continue; }
          const cleR = w.siret || norm(w.name) + "|" + cp;
          const f = recruteurs.get(cleR) || { siret: w.siret || "", nom: w.brand || w.name || w.legal_name || "", naf: ((w.domain || {}).naf || {}).code || "",
            secteur: ((w.domain || {}).naf || {}).label || "", eff: w.size || "", adresse: loc.address || "", dep, lat: geo[1], lon: geo[0],
            url: (re.apply && re.apply.url) || "", romes: [] };
          if (!f.romes.includes(m.code)) f.romes.push(m.code);
          recruteurs.set(cleR, f);
        }
      } catch (e) { erreurs.push(`${m.code} ${c.ville} : ${e.message}`); }
    });
    process.stdout.write(`La bonne alternance : ${taches.length} recherches locales en ${REGION.nom}…\n`);
    await enParallele(taches, 4);
  }
  journal.push({ source: "LBA", n: offres.length,
    statut: (erreurs.length ? `${erreurs.length} appels en erreur (ex. ${erreurs[0]}) ; ` : "ok ; ")
      + `${nNational} offres en national + ${offres.length - nNational} vues par ${appelsLocaux} recherches locales en ${REGION ? REGION.nom : "?"} ; `
      + `${recruteurs.size} entreprises « susceptibles de recruter » gardées dans la région (${horsRayon} renvoyées hors rayon, écartées)` });
  return { offres, recruteurs: [...recruteurs.values()] };
}

/* ============================================================
   4) SOURCE ADZ : Adzuna (agrégateur, API ouverte, clé gratuite)
   Offre gratuite limitée (environ 25 appels par minute, 250 par jour) : on espace les appels
   et on garde le résultat du jour en cache (un 2e lancement le même jour ne rappelle pas Adzuna).
   ============================================================ */
/* Adzuna ne connaît pas les codes ROME. Une offre remontée par la recherche « marketing digital » peut être
   un poste de community manager : on regarde l'intitulé, et on prend le métier dont TOUS les mots-clés y figurent
   (le plus précis gagne : « assistant marketing » l'emporte sur « marketing »). Sinon, le métier de la recherche. */
const MOTS_METIER = CONFIG.metiers.map(m => ({ code: m.code, mots: normTitre(m.mots_cles || m.libelle).split(" ").filter(w => w.length > 2) }));
function romeDepuisTitre(titre) {
  const t = new Set(normTitre(titre).split(" "));
  let meilleur = null;
  for (const m of MOTS_METIER) if (m.mots.length && m.mots.every(w => t.has(w)) && (!meilleur || m.mots.length > meilleur.mots.length)) meilleur = m;
  return meilleur ? meilleur.code : null;
}
// Sinon, l'offre ne garde le métier de la recherche que si son titre en cite au moins un mot :
// « Commercial en alternance », remonté par la recherche « e-commerce », n'est pas un poste e-commerce.
const titreCiteRecherche = (titre, m) => {
  const t = new Set(normTitre(titre).split(" "));
  return (MOTS_METIER.find(x => x.code === m.code) || { mots: [] }).mots.some(w => t.has(w));
};
// Dernier recours : le métier dont le titre partage le plus de mots distinctifs (« communication », « merchandising »…),
// les mots de fonction (chargé, assistant, chef…) ne comptant pas. « Assistant communication - BTS », trouvé par la
// recherche « relations publiques », va ainsi en Chargé(e) de communication au lieu d'être écarté.
const MOTS_FONCTION = new Set("charge chargee assistant assistante chef cheffe responsable projet manager directeur directrice officer".split(" "));
function romeProche(titre) {
  const t = new Set(normTitre(titre).split(" "));
  let meilleur = null, max = 0;
  for (const m of MOTS_METIER) {
    const k = m.mots.filter(w => !MOTS_FONCTION.has(w) && t.has(w)).length;
    if (k > max) { max = k; meilleur = m.code; }
  }
  return meilleur;
}

// Adzuna annonce un salaire annuel ; pour l'alternance, beaucoup d'employeurs y mettent un montant mensuel.
function mensuelAdzuna(v) {
  if (!v || !isFinite(v)) return null;
  if (v >= SAL_MIN && v < 3000) return { v, corrige: true };
  return { v: v / 12, corrige: false };
}

/* Une offre d'agrégateur (Adzuna) mise au format commun. */
function offreAgregateur({ id, src, via, rome, contrat, titre, desc, ent, lieu, ville, dep, lat, lon, date, url, sal }) {
  const texte = `${titre} ${desc}`;
  const d = contrat === "stage" ? dureeStage(texte) : { dmin: null, dmax: null };
  return {
    id, src, via, rome, rome_deduit: true, contrat,
    titre, ent, naf: "", secteur: "", eff_lib: "",
    lieu, ville, commune: "", cp: "", dep, lat, lon, prec: lat != null ? "offre" : null,
    type: contrat === "stage" ? "stage" : typeAlternance("", texte),
    duree: contrat === "stage" ? d.dmax : null, duree_min: d.dmin, duree_classe: contrat === "stage" ? classeDuree(d.dmax) : null,
    diplome: diplomeTexte(texte), dipl_src: diplomeTexte(texte) ? "texte" : null,
    debutant: true, sal_lib: sal ? sal.lib : "", smin: sal ? sal.smin : null, smax: sal ? sal.smax : null, sal_etat: sal ? sal.etat : "absent",
    date, maj: "", vu_le: new Date().toISOString().slice(0, 10),
    url, outils: outilsCites(texte.toLowerCase()), tele: /t[ée]l[ée]travail/i.test(desc), postes: 1,
    empreinte: sha(norm(desc).slice(0, 400)), sans_poste: sansPoste(titre, texte),
  };
}
const garderSelonContrat = (contrat, texte) => contrat === "stage" ? estStageTexte(texte) && !estAlternanceTexte(texte) : estAlternanceTexte(texte);

async function sourceAdzuna(journal) {
  const id = cle("ADZUNA_APP_ID"), k = cle("ADZUNA_APP_KEY");
  if (!id || !k || HORS_LIGNE) { journal.push({ source: "ADZ", statut: HORS_LIGNE ? "hors ligne" : "pas de clé ADZUNA_APP_ID / ADZUNA_APP_KEY (gratuite sur developer.adzuna.com)", n: 0 }); return []; }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  // Nom de département -> code, pour les offres qui n'ont que « Puy-de-Dôme ».
  let deps = {};
  try { const r = await http("https://geo.api.gouv.fr/departements?fields=nom,code"); for (const d of await r.json()) deps[norm(d.nom)] = d.code; } catch {}
  const toutes = [], statuts = [];
  let quotaAtteint = false;
  // Deux collectes, chacune gardée en cache pour la journée : l'alternance, puis les stages.
  // (Adzuna gratuit : ~250 appels par jour ; un 2e lancement le même jour ne consomme rien.)
  // Le nombre de pages est un plafond : une recherche s'arrête dès qu'elle a tout reçu. Seules les grosses
  // recherches (ex. « chef de produit stage », 500 offres) vont au bout ; le total reste sous le quota du jour.
  for (const [contrat, pagesFrance, pagesRegion] of [["alternance", 8, 4], ["stage", 12, 4]]) {
    const fCache = path.join(CACHE, `adzuna-${contrat}-${aujourdhui}.json`);
    const cache = lireJson(fCache, null);
    // Offres du cache sans métier : on retente avec la règle du dernier recours (elle a pu changer depuis).
    if (cache) { for (const o of cache.offres) if (!o.rome) o.rome = romeProche(o.titre); toutes.push(...cache.offres); statuts.push(`${contrat} : ${cache.offres.length} (en cache du jour)`); continue; }
    if (quotaAtteint) { statuts.push(`${contrat} : non collecté (quota du jour atteint)`); continue; }
    const offres = [], vus = new Set(), erreurs = [], tronques = [];
    let appels = 0;
    const recherches = [];
    for (const m of CONFIG.metiers) {
      recherches.push({ m, where: "", pages: pagesFrance });
      if (REGION && REGION.adzuna) recherches.push({ m, where: REGION.adzuna, pages: pagesRegion });
    }
    for (const { m, where, pages } of recherches) {
      if (quotaAtteint) break;
      let recus = 0, annonce = 0;
      for (let page = 1; page <= pages; page++) {
        const u = `https://api.adzuna.com/v1/api/jobs/fr/search/${page}?app_id=${id}&app_key=${k}&results_per_page=50&max_days_old=60&sort_by=date`
          + `&what=${encodeURIComponent((m.mots_cles || m.libelle) + " " + contrat)}${where ? "&where=" + encodeURIComponent(where) : ""}`;
        let d;
        appels++;
        try {
          const r = await http(u);
          if (r.status === 429 || r.status === 403) { quotaAtteint = true; erreurs.push(`quota Adzuna atteint (${r.status})`); break; }
          if (!r.ok) { erreurs.push(`${m.code}${where ? " (région)" : ""} : ${r.status}`); break; }
          d = await r.json();
        } catch (e) { erreurs.push(`${m.code} : ${e.message}`); break; }
        await pause(2600);                                    // 25 appels par minute au maximum
        const lot = d.results || [];
        annonce = d.count || 0; recus += lot.length;
        for (const j of lot) {
          const titre = texteBrut(j.title), desc = texteBrut(j.description);
          if (vus.has(j.id) || !garderSelonContrat(contrat, `${titre} ${desc} ${j.contract_type || ""}`)) continue;
          vus.add(j.id);
          const area = (j.location && j.location.area) || [];
          const predit = String(j.salary_is_predicted) === "1";
          const a = predit ? null : mensuelAdzuna(j.salary_min), b = predit ? null : mensuelAdzuna(j.salary_max || j.salary_min);
          const okSal = a && b && a.v >= SAL_MIN && b.v <= SAL_MAX;
          offres.push(offreAgregateur({
            id: "ADZ-" + j.id, src: "ADZ", via: "Adzuna", rome: romeDepuisTitre(titre) || (titreCiteRecherche(titre, m) ? m.code : romeProche(titre)), contrat, titre, desc,
            ent: (j.company && j.company.display_name) || "", lieu: (j.location && j.location.display_name) || "",
            ville: area[3] || area.at(-1) || "", dep: area.map(x => deps[norm(x)]).find(Boolean) || "",
            lat: j.latitude || null, lon: j.longitude || null, date: String(j.created || "").slice(0, 10), url: j.redirect_url || "",
            sal: okSal ? { lib: `${Math.round(a.v)} à ${Math.round(b.v)} € brut mensuel (Adzuna)`, smin: Math.round(Math.min(a.v, b.v)), smax: Math.round(Math.max(a.v, b.v)), etat: a.corrige || b.corrige ? "corrigé" : "ok" }
              : (predit ? { lib: "", smin: null, smax: null, etat: "estimé, écarté" } : null),
          }));
        }
        if (lot.length < 50 || recus >= annonce) break;
      }
      if (annonce > recus) tronques.push(`${m.code}${where ? " (région)" : ""} ${recus}/${annonce}`);
    }
    toutes.push(...offres);
    statuts.push(`${contrat} : ${offres.length} offres, ${appels} appels` + (tronques.length ? `, recherches coupées : ${tronques.slice(0, 6).join(", ")}` : ", aucune recherche coupée")
      + (erreurs.length ? `, erreurs : ${erreurs.slice(0, 2).join(", ")}` : ""));
    if (!erreurs.length) {
      for (const f of fs.readdirSync(CACHE).filter(f => new RegExp(`^adzuna-${contrat}-.*\\.json$`).test(f))) fs.unlinkSync(path.join(CACHE, f));
      ecrireJson(fCache, { offres });
    }
  }
  journal.push({ source: "ADZ", n: toutes.length, statut: statuts.join(" ; ") + " ; métier déduit du titre" });
  return toutes;
}

/* ============================================================
   5) CROISEMENT : API Recherche d'entreprises (État, sans clé, 7 appels/s)
   ============================================================ */
const EFFECTIFS = { NN: "Non renseigné", "00": "0 salarié", "01": "1 à 2", "02": "3 à 5", "03": "6 à 9", 11: "10 à 19", 12: "20 à 49", 21: "50 à 99", 22: "100 à 199", 31: "200 à 249", 32: "250 à 499", 41: "500 à 999", 42: "1 000 à 1 999", 51: "2 000 à 4 999", 52: "5 000 à 9 999", 53: "10 000 et plus" };
// Classes lisibles, dans l'ordre d'affichage.
const CLASSES_EFF = ["0 salarié", "1 à 9", "10 à 49", "50 à 249", "250 à 4 999", "5 000 et plus"];
function classeEffectif(n) {
  if (n == null || !isFinite(n)) return null;
  return n < 1 ? CLASSES_EFF[0] : n < 10 ? CLASSES_EFF[1] : n < 50 ? CLASSES_EFF[2] : n < 250 ? CLASSES_EFF[3] : n < 5000 ? CLASSES_EFF[4] : CLASSES_EFF[5];
}
// Premier nombre d'un libellé de tranche (« 10 à 19 salariés », « 10 000 salariés et plus », « 0 salarié (…) »).
const effectifDeLibelle = lib => { const m = /(\d[\d\s]*)/.exec(String(lib || "")); return m ? Number(m[1].replace(/\s/g, "")) : null; };
const SECTIONS = { A: "Agriculture", B: "Industries extractives", C: "Industrie", D: "Énergie", E: "Eau, déchets", F: "Construction", G: "Commerce", H: "Transports", I: "Hôtellerie-restauration", J: "Information et communication", K: "Finance et assurance", L: "Immobilier", M: "Conseil, pub, études (activités spécialisées)", N: "Services aux entreprises (intérim…)", O: "Administration publique", P: "Enseignement", Q: "Santé et social", R: "Arts, spectacles, loisirs", S: "Associations et autres services", T: "Ménages", U: "Extra-territorial" };
function sectionNaf(naf) {
  const d = parseInt(String(naf || "").slice(0, 2), 10);
  if (!isFinite(d)) return null;
  const t = [[3, "A"], [9, "B"], [33, "C"], [35, "D"], [39, "E"], [43, "F"], [47, "G"], [53, "H"], [56, "I"], [63, "J"], [66, "K"], [68, "L"], [75, "M"], [82, "N"], [84, "O"], [85, "P"], [88, "Q"], [93, "R"], [96, "S"], [98, "T"], [99, "U"]];
  for (const [max, s] of t) if (d <= max) return s;
  return null;
}

async function croiserEntreprises(offres, stats) {
  // Le cache porte un numéro de version : quand les règles de correspondance changent, on repart de zéro.
  const VERSION = 2;
  const fichier = path.join(CACHE, "entreprises.json");
  let cache = lireJson(fichier, {});
  if (cache._version !== VERSION) cache = { _version: VERSION };

  // 1) Les noms qui n'en sont pas (« Stage », « Confidentiel »…) : employeur non précisé.
  for (const o of offres) if (NOMS_GENERIQUES.has(norm(o.ent))) { o.ent_annonce = o.ent; o.ent = ""; }

  const cles = [...new Set(offres.filter(o => normEnt(o.ent)).map(o => normEnt(o.ent) + "|" + (o.dep || "")))];
  stats.noms = cles.length;
  let appels = 0, nouveaux = 0;
  const chercher = async (q, dep) => {
    appels++;
    await pause(160);
    const u = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=5&etat_administratif=A${dep && !dep.startsWith("97") ? "&departement=" + dep : ""}`;
    const r = await http(u);
    return r && r.ok ? ((await r.json()).results || []) : null;
  };
  for (const k of cles) {
    if (k in cache) continue;
    if (HORS_LIGNE) continue;
    const [nomN, dep] = k.split("|");
    const brut = offres.find(o => normEnt(o.ent) === nomN).ent;
    // 2) Un nom court ou d'un seul mot (« ESG », « IMC », « OKTOGONE ») a trop d'homonymes en France :
    //    on n'accepte alors qu'un nom IDENTIQUE, trouvé DANS le département de l'offre.
    const fragile = nomN.split(" ").length < 2 || nomN.length < 6;
    const essais = dep ? (fragile ? [dep] : [dep, ""]) : (fragile ? [] : [""]);
    let meilleur = null;
    try {
      for (const d of essais) {
        const res = await chercher(brut, d);
        if (res == null) throw new Error("API indisponible");
        for (const e of res) {
          const noms = [e.nom_complet, e.nom_raison_sociale, e.sigle, (e.siege || {}).nom_commercial,
                        ...((e.siege || {}).liste_enseignes || []), ...(e.matching_etablissements || []).flatMap(x => x.liste_enseignes || [])].filter(Boolean);
          const score = Math.max(0, ...noms.map(n => normEnt(n) === nomN ? 1 : jaccard(normEnt(n), nomN)));
          const seuil = fragile || !d ? 1 : 0.6;     // sans département, seul un nom identique compte
          if (score >= seuil && (!meilleur || score > meilleur.score)) meilleur = { e, score };
        }
        if (meilleur) break;
      }
      nouveaux++;
      cache[k] = meilleur ? {
        siren: meilleur.e.siren, nom: meilleur.e.nom_complet, naf: meilleur.e.activite_principale || "",
        eff: meilleur.e.tranche_effectif_salarie || "NN", cat: meilleur.e.categorie_entreprise || "",
        of: !!(meilleur.e.complements && meilleur.e.complements.est_organisme_formation),
        creation: meilleur.e.date_creation || "", score: Math.round(meilleur.score * 100) / 100,
      } : null;
    } catch { /* on réessaiera au prochain lancement : rien n'est mis en cache */ }
    if (nouveaux % 25 === 0) ecrireJson(fichier, cache);
  }
  ecrireJson(fichier, cache);
  stats.appels = appels;
  let identifiees = 0, incoherentes = 0;
  for (const o of offres) {
    const c = normEnt(o.ent) ? cache[normEnt(o.ent) + "|" + (o.dep || "")] : null;
    // 3) Cohérence : si la source donne déjà l'activité de l'employeur et qu'elle ne ressemble pas
    //    à celle de l'entreprise trouvée (pas la même division NAF), c'est un homonyme : on rejette.
    const incoherent = c && o.naf && c.naf && o.naf.slice(0, 2) !== c.naf.slice(0, 2);
    if (incoherent) incoherentes++;
    // Une école ou un intermédiaire reconnu à son nom (« Direct Emploi », « Skillie ») publie pour d'autres :
    // sa taille ou son secteur ne disent rien de l'employeur réel, on ne les rattache pas.
    const intermediaireParNom = RX_ECOLE.test(norm(o.ent)) || RX_INTERIM.test(norm(o.ent));
    if (c && !incoherent && !intermediaireParNom) {
      identifiees++;
      o.siren = c.siren; o.ent_off = c.nom; o.match = c.score; o.cat = c.cat; o.of = c.of;
      if (!o.naf) o.naf = c.naf;
      o.eff_code = c.eff;
      o.eff = c.eff && c.eff !== "NN" ? classeEffectif(effectifDeLibelle(EFFECTIFS[c.eff])) : null;
    }
    if (!o.eff && o.eff_lib) o.eff = classeEffectif(effectifDeLibelle(o.eff_lib));
    o.section = sectionNaf(o.naf);
    const n = norm(o.ent);
    o.ecole = String(o.naf).startsWith("85") || RX_ECOLE.test(n);
    o.interim = !o.ecole && (String(o.naf).startsWith("78") || RX_INTERIM.test(n));
    o.publie_par = !o.ent ? "Non précisé" : o.ecole ? "École / organisme de formation" : o.interim ? "Intérim / cabinet de recrutement" : "Entreprise";
  }
  stats.identifiees = identifiees;
  stats.incoherentes = incoherentes;
  stats.nouveaux = nouveaux;
}

/* ============================================================
   6) DÉDOUBLONNAGE
   ============================================================ */
function dedoublonner(offres, stats) {
  // a) Même identifiant (une offre FT relayée par LBA, ou vue dans deux requêtes).
  const parId = new Map();
  for (const o of offres) {
    const d = parId.get(o.id);
    if (!d) { parId.set(o.id, { ...o, srcs: [o.src] }); continue; }
    stats.meme_id++;
    if (!d.srcs.includes(o.src)) d.srcs.push(o.src);
  }
  // b) Même annonce republiée : même intitulé, même employeur, même ville (ou même texte).
  //    On garde la première selon l'ordre des sources, puis la plus récente.
  const tri = [...parId.values()].sort((a, b) => ORDRE_SOURCES.indexOf(a.src) - ORDRE_SOURCES.indexOf(b.src) || String(b.date).localeCompare(String(a.date)));
  const parCle = new Map(), sortie = [];
  for (const o of tri) {
    const ent = normEnt(o.ent);
    const cleLieu = norm(o.ville) || o.dep || "?";
    // Le type (alternance / stage) fait partie de la clé : un stage et une alternance au même intitulé sont deux offres.
    const k = o.contrat + "|" + (ent ? `${normTitre(o.titre)}|${ent}|${cleLieu}` : `${normTitre(o.titre)}|${o.empreinte}|${cleLieu}`);
    const d = parCle.get(k);
    if (!d) { o.annonces = 1; parCle.set(k, o); sortie.push(o); continue; }
    stats.proches++;
    fusionner(d, o);
  }
  // c) Même annonce relayée par un site d'emploi qui efface l'employeur et change la ville du titre
  //    (« Chargé marketing - Massy (H/F) » publié par l'école, puis « … (F/H) » sans nom par DirectEmploi) :
  //    même intitulé une fois la ville retirée, et même texte d'annonce ou même département,
  //    à condition que l'une des deux ne nomme pas l'employeur (ou qu'elles nomment le même).
  const parTitre = new Map(), finale = [];
  for (const o of sortie) {
    const t = titreSansLieu(o);
    const liste = parTitre.get(o.contrat + "|" + t) || [];
    // Deux offres qui nomment chacune leur employeur ne passent pas par ici (un même employeur peut
    // recruter dans deux villes). Une seule nommée : même texte ou même département. Aucune : même texte.
    const memeTexte = x => o.empreinte && o.empreinte === x.empreinte && o.empreinte !== EMPREINTE_VIDE;
    const d = t && liste.find(x => (!x.ent !== !o.ent) ? memeTexte(x) || (o.dep && o.dep === x.dep) : !x.ent && !o.ent && memeTexte(x));
    if (!d) { liste.push(o); parTitre.set(o.contrat + "|" + t, liste); finale.push(o); continue; }
    stats.relais++;
    if (process.env.DEBUG_DOUBLONS) console.log(`  relais : « ${d.titre} » ${d.ent || "—"} ${d.ville} (${d.dep})  <=  « ${o.titre} » ${o.ent || "—"} ${o.ville} (${o.dep})`);
    fusionner(d, o);
  }
  return finale;
}
const EMPREINTE_VIDE = sha("");
// Intitulé sans la ville ni le département (souvent ajoutés en fin de titre par les sites relais).
function titreSansLieu(o) {
  const lieu = new Set([...norm(o.ville).split(" "), ...norm(o.lieu).split(" "), o.dep].filter(Boolean));
  return normTitre(o.titre).split(" ").filter(w => !lieu.has(w) && !/^\d+$/.test(w)).join(" ");
}
// L'annonce gardée prend ce qui lui manque chez son double — l'employeur compris : si le double est
// publié par une école, la copie anonyme le sera aussi (et sera masquée avec les offres d'écoles).
function fusionner(d, o) {
  d.annonces++;
  for (const s of o.srcs) if (!d.srcs.includes(s)) d.srcs.push(s);
  if (d.smin == null && o.smin != null) for (const c of ["smin", "smax", "sal_lib", "sal_etat"]) d[c] = o[c];
  if (!d.ent && o.ent) for (const c of ["ent", "naf", "secteur", "eff_lib", "siret"]) d[c] = o[c];
  for (const c of ["diplome", "lat", "lon", "duree", "siret"]) if (d[c] == null || d[c] === "") d[c] = o[c];
}

/* ============================================================
   7) CONTRÔLES : ce qui doit être vrai pour que les chiffres tiennent debout
   ============================================================ */
function controler(offres, ctx) {
  const c = [];
  const ajoute = (nom, ok, detail) => c.push({ nom, ok, detail });
  const ids = new Set(offres.map(o => o.id));
  ajoute("Identifiants uniques", ids.size === offres.length, `${ids.size} identifiants pour ${offres.length} offres`);
  const horsMetier = offres.filter(o => !METIERS.has(o.rome));
  ajoute("Chaque offre a un métier suivi", !horsMetier.length, horsMetier.length ? `${horsMetier.length} offres hors config` : "ok");
  const sansTitre = offres.filter(o => !o.titre);
  ajoute("Chaque offre a un intitulé", !sansTitre.length, `${sansTitre.length} sans intitulé`);
  const sansContrat = offres.filter(o => o.contrat !== "alternance" && o.contrat !== "stage");
  ajoute("Chaque offre est une alternance ou un stage", !sansContrat.length,
    `${offres.filter(o => o.contrat === "alternance").length} alternances, ${offres.filter(o => o.contrat === "stage").length} stages, ${sansContrat.length} autres`);
  const stagesDuree = offres.filter(o => o.contrat === "stage" && o.duree != null && (o.duree < 0.2 || o.duree > 12));
  ajoute("Durées de stage plausibles (1 semaine à 12 mois)", !stagesDuree.length, `${stagesDuree.length} hors limites`);
  const badSal = offres.filter(o => o.smin != null && (o.smin > o.smax || o.smin < SAL_MIN || o.smax > SAL_MAX));
  ajoute("Salaires dans la fenêtre 300–6 000 € brut mensuel", !badSal.length, `${badSal.length} hors fenêtre`);
  const jourRef = ctx.jourRef || ctx.jour || new Date().toISOString().slice(0, 10);
  const futur = offres.filter(o => o.date && o.date > jourRef);
  const sansDate = offres.filter(o => !/^\d{4}-\d{2}-\d{2}$/.test(o.date || ""));
  ajoute("Dates de publication valides, pas dans le futur", !futur.length && sansDate.length < offres.length * 0.05, `${futur.length} dans le futur, ${sansDate.length} sans date`);
  const badDep = offres.filter(o => o.dep && !depValide(o.dep));
  ajoute("Départements reconnus", !badDep.length, badDep.length ? `inconnus : ${[...new Set(badDep.map(o => o.dep))].join(", ")}` : "ok");
  // Métropole + outre-mer : on vérifie seulement que le point n'est pas à (0,0) ou inversé.
  const badPos = offres.filter(o => o.lat != null && (Math.abs(o.lat) > 90 || Math.abs(o.lon) > 180 || (o.dep && !o.dep.startsWith("97") && (o.lat < 41 || o.lat > 51.5 || o.lon < -5.5 || o.lon > 10))));
  ajoute("Positions cohérentes avec la France", !badPos.length, `${badPos.length} points incohérents`);
  const badUrl = offres.filter(o => o.url && !/^https?:\/\//.test(o.url));
  ajoute("Liens vers l'annonce valides", !badUrl.length, `${offres.filter(o => o.url).length} liens, ${badUrl.length} invalides`);
  // Recoupement avec la chaîne du cours : resume.json doit compter autant d'offres en alternance
  // que ce script en a lu dans le dépôt, pour le même jour.
  const resume = lireJson(path.join(RACINE, "data", "resume.json"), null);
  if (resume && ctx.nFTdepot != null && resume.date === ctx.jour) {
    const nResume = resume.offres.filter(o => o.alternance || o.nature === "apprentissage" || o.nature === "professionnalisation").length;
    ajoute("Recoupement avec data/resume.json (chaîne du cours)", nResume === ctx.nFTdepot, `resume.json : ${nResume} offres en alternance le ${resume.date} ; ce script : ${ctx.nFTdepot}`);
  } else ajoute("Recoupement avec data/resume.json (chaîne du cours)", true, resume ? `pas le même jour (${resume.date} / ${ctx.jour}) : sans objet` : "resume.json absent : sans objet");
  return c;
}

/* Contrôles de sens : les contrôles ci-dessus vérifient la forme (identifiants, dates, liens) ; ceux-ci
   comptent les offres dont le CONTENU est douteux. Ils ne bloquent rien : ils disent combien d'offres
   sont à lire avec prudence, et lesquelles (identifiants, pour les retrouver dans la page). */
function controlerSens(offres, signalees = []) {
  const v = [];
  // Chaque ligne marque aussi les offres concernées (o.alertes) : les pages affichent un badge « À vérifier ».
  const ajoute = (nom, liste, detail, alerte) => {
    v.push({ nom, n: liste.length, detail, ids: liste.slice(0, 200).map(o => o.id) });
    if (alerte) for (const o of liste) (o.alertes = o.alertes || []).push(alerte);
  };
  ajoute("Annonces sans poste réel (retirées de tous les chiffres)", signalees,
    "« on ne recrute pas » (dans le titre, le texte ou à la place du nom de l'employeur), annonce test, vivier de CV, candidature spontanée… : listes dans config/alternance.json (annonces_sans_poste)");
  ajoute("Salaire invraisemblable (écarté des statistiques)", offres.filter(o => o.sal_etat === "invraisemblable" || o.sal_etat === "rejeté"),
    `au-dessus de ${VRAISEMBLABLE.alternance_max_smic} × SMIC pour une alternance, ${VRAISEMBLABLE.stage_max_smic} × SMIC pour un stage, fourchette au-delà de ${VRAISEMBLABLE.fourchette_max_smic} × SMIC, ou montant hors de 300–6 000 € par mois : l'offre reste, son salaire ne compte pas`,
    "salaire annoncé invraisemblable");
  const alt = offres.filter(o => o.contrat === "alternance"), stages = offres.filter(o => o.contrat === "stage");
  ajoute("Alternances dont l'intitulé parle de stage", alt.filter(o => o.ambigu),
    "classées en alternance par la source, mais le titre dit « stage » : le contrat réel est peut-être un stage", "le titre parle de stage");
  // Ville citée dans le titre (« … - Massy (H/F) ») différente du lieu de l'offre.
  const villes = new Set(offres.map(o => norm(o.ville)).filter(v => v.length > 2));
  const villeTitre = o => { const m = /\s[-–]\s*([^-–(]+?)\s*(\([^)]*\))?\s*$/.exec(o.titre || ""); return m ? norm(m[1]) : ""; };
  ajoute("Ville du titre différente du lieu de l'offre", offres.filter(o => { const t = villeTitre(o); return t && villes.has(t) && o.ville && !norm(o.ville).includes(t); }),
    "souvent une annonce relayée par un site d'emploi, placée ailleurs que le poste : la carte peut se tromper", "ville du titre ≠ lieu");
  const smic = LEGAL.smic_mensuel, grat = (LEGAL.gratification_horaire || 4.35) * (LEGAL.heures_mois || 151.67);
  ajoute("Barème légal recopié au lieu d'un salaire", offres.filter(o => o.sal_bareme),
    "fourchette « 27 % à 100 % du SMIC » : ce n'est pas ce que l'employeur propose ; retirée des médianes de salaire", "salaire = barème légal recopié");
  ajoute("Rémunération sous le minimum légal", [...alt.filter(o => o.smin != null && o.smin < 0.25 * 0.94 * smic),
    ...stages.filter(o => o.smin != null && o.smin < 0.9 * grat)],
    `alternance sous 27 % du SMIC, ou stage sous la gratification minimale (${Math.round(grat)} € par mois à temps plein) : erreur de saisie ou temps partiel`, "salaire sous le minimum légal");
  ajoute("Intitulés de niveau direction", offres.filter(o => /\b(directeur|directrice|director|chief|head of|cmo|cdo)\b/.test(norm(o.titre))),
    "rares pour une alternance ou un stage : souvent un « assistant(e) de direction » ou un métier mal classé", "intitulé de niveau direction");
  const sansDuree = stages.filter(o => o.duree == null);
  ajoute("Stages sans durée connue", sansDuree,
    `${stages.length ? Math.round(100 * sansDuree.length / stages.length) : 0} % des stages : les agrégateurs ne donnent qu'un extrait de l'annonce`);
  ajoute("Métier déduit d'une recherche par mots-clés", offres.filter(o => o.rome_deduit && !romeDepuisTitre(o.titre)),
    "offres Adzuna : le titre ne contient pas tous les mots du métier, le métier est celui de la recherche qui les a trouvées");
  return v;
}
// Les intitulés réels les plus fréquents d'un métier (sans « alternance », « H/F » ni la ville) : ce que recouvre le code.
function titresFrequents(liste) {
  // Regroupés sur l'intitulé normalisé, montrés avec le libellé d'une annonce (sans « H/F » ni la ville).
  const propre = o => String(o.titre).replace(/\(?\b[HF]\s*[/.]\s*[FH]\b\)?/gi, "").replace(/\s[-–]\s*[^-–]*$/, m => norm(m).includes(norm(o.ville).split(" ")[0] || "§") ? "" : m)
    .replace(/^\s*(alternance|alternant\(?e?\)?|apprenti\(?e?\)?|stage)\s*[-–:]?\s*/i, "").replace(/\s+en (alternance|apprentissage)\b/i, "").replace(/(\s*[-–|:]\s*)+$/, "").replace(/\s{2,}/g, " ").trim();
  const c = new Map();
  for (const o of liste) { const t = titreSansLieu(o); if (!t) continue; const x = c.get(t) || { t: propre(o), n: 0 }; x.n++; c.set(t, x); }
  return [...c.values()].sort((a, b) => b.n - a.n).slice(0, 5);
}

/* ============================================================
   8) LA CHAÎNE
   ============================================================ */
async function main() {
  const t0 = Date.now();
  const journal = [];
  console.log(HORS_LIGNE ? "Mode hors ligne : aucun appel réseau.\n" : "");

  const ft = await sourceFT(journal);
  const nFTdepot = journal[0] && journal[0].source === "FT" ? journal[0].n : null;
  const lba = await sourceLBA(journal);
  const adz = await sourceAdzuna(journal);
  const brutes = [...ft.offres, ...lba.offres, ...adz];
  // France Travail et La bonne alternance ne donnent ici que des alternances.
  for (const o of brutes) if (!o.contrat) o.contrat = "alternance";
  // Métier retiré de la config depuis la mise en cache (ex. D1506) : Adzuna reclasse par le titre, sinon l'offre sort.
  for (const o of brutes) if (o.rome && !METIERS.has(o.rome)) o.rome = o.src === "ADZ" ? romeProche(o.titre) : null;
  for (let i = brutes.length - 1; i >= 0; i--) if (!brutes[i].rome && brutes[i].src !== "ADZ") brutes.splice(i, 1);
  // Les agrégateurs cherchent aussi dans le texte : « stage marketing » ramène des stages d'ingénieur qui citent
  // le mot une fois. On ne garde que les offres dont le TITRE correspond à un métier suivi ou à son vocabulaire.
  const RX_VOCABULAIRE = /\b(marketing|communication|com|commercial|commerciale|commerce|digital|digitale|numerique|web|produit|produits|brand|marque|ecommerce|social|media|medias|seo|sea|crm|client|clients|clientele|evenementiel|evenement|evenements|merchandising|publicite|pub|influence|influenceur|contenu|contenus|redaction|redacteur|etudes|trade|vente|ventes|acquisition|growth|community|presse|influencer|influenceurs|ugc|traffic|trafic|content|brand|copywriter|graphiste|design|designer|social media|ads|sem|ecommerce|retail|categorie|category|partenariats?|campagnes?|business developer|chef de projet|gms|grande distribution|chef de secteur)\b/;
  const pertinenteAgregateur = o => o.src !== "ADZ" || (o.rome && (romeDepuisTitre(o.titre) || RX_VOCABULAIRE.test(norm(o.titre))));
  // Toutes sources : les intitulés de la liste « titres_hors_sujet » (config), sauf s'ils citent aussi le marketing.
  const horsSujetTitre = o => RX_HORS_SUJET && RX_HORS_SUJET.test(norm(o.titre)) && !RX_SAUVE.test(norm(o.titre));
  const horsSujet = brutes.filter(o => !pertinenteAgregateur(o)), horsListe = brutes.filter(o => pertinenteAgregateur(o) && horsSujetTitre(o));
  for (let i = brutes.length - 1; i >= 0; i--) if (!pertinenteAgregateur(brutes[i]) || horsSujetTitre(brutes[i])) brutes.splice(i, 1);
  journal.push({ source: "Filtre", n: horsSujet.length, statut: `offres d'agrégateurs écartées car leur titre ne correspond pas au métier cherché (ex. ${horsSujet.slice(0, 3).map(o => `« ${o.titre} »`).join(", ")})` });
  journal.push({ source: "Filtre hors sujet", n: horsListe.length, statut: `offres écartées, toutes sources, car leur intitulé n'est pas du marketing (liste « titres_hors_sujet » de config/alternance.json ; ex. ${horsListe.slice(0, 3).map(o => `« ${o.titre} »`).join(", ")})` });
  const parSource = {};
  for (const o of brutes) parSource[o.src] = (parSource[o.src] || 0) + 1;

  const dd = { meme_id: 0, proches: 0, relais: 0 };
  const offres = dedoublonner(brutes, dd);

  // Positions manquantes : centre de la commune, sinon du département.
  for (const o of offres) {
    if (o.lat != null) continue;
    const p = o.commune ? await centreCommune(o.commune) : null;
    if (p) { [o.lat, o.lon] = p; o.prec = "commune"; continue; }
    const q = o.dep ? await centreDepartement(o.dep) : null;
    if (q) { [o.lat, o.lon] = q; o.prec = "departement"; }
  }
  ecrireJson(path.join(CACHE, "communes.json"), GEO.c);
  ecrireJson(path.join(CACHE, "departements.json"), GEO.d);
  for (const o of offres) o.reg = REGION_DE[o.dep] || "";

  console.log("Croisement avec l'API Recherche d'entreprises…");
  const ent = {};
  await croiserEntreprises(offres, ent);

  // Salaire : « 486 € à 1 801 € » n'est pas une offre, c'est le barème légal de l'apprentissage recopié en entier
  // (27 % du SMIC à 100 % du SMIC, avec le SMIC de l'année où l'annonce a été saisie : d'où une marge de 6 %).
  const smic = LEGAL.smic_mensuel;
  // Salaire invraisemblable (alternance à 45 000 € par an, fourchette « 800 à 5 000 € ») : l'offre reste, mais son salaire
  // sort des statistiques. Le montant annoncé est gardé (sal_annonce) pour être montré, avec le signalement.
  for (const o of offres) {
    if (o.smin == null) continue;
    const max = (o.contrat === "stage" ? VRAISEMBLABLE.stage_max_smic : VRAISEMBLABLE.alternance_max_smic) * smic;
    if (o.smin > max || o.smax > VRAISEMBLABLE.fourchette_max_smic * smic) {
      o.sal_annonce = [o.smin, o.smax]; o.smin = o.smax = null; o.sal_etat = "invraisemblable";
    }
  }
  for (const o of offres) o.sal_bareme = o.smin != null && o.smin >= 0.25 * 0.94 * smic && o.smin <= 0.29 * smic && o.smax >= 0.94 * smic && o.smax <= 1.03 * smic;
  // Une alternance dont l'intitulé dit « stage » : on la garde, mais on la signale.
  for (const o of offres) if (o.contrat === "alternance" && /\b(stage|stagiaire)\b/.test(norm(o.titre)))
    o.ambigu = /\b(alternance|alternant|apprenti|apprentissage)\b/.test(norm(o.titre)) ? "stage ou alternance" : "« stage » dans le titre";

  // Noms des départements, pour l'affichage (« Haute-Savoie (74) » plutôt que « 74 »).
  const fNoms = path.join(CACHE, "departements-noms.json");
  let nomsDep = lireJson(fNoms, null);
  if (!nomsDep && !HORS_LIGNE) {
    try { const r = await http("https://geo.api.gouv.fr/departements?fields=nom,code"); nomsDep = Object.fromEntries((await r.json()).map(d => [d.code, d.nom])); ecrireJson(fNoms, nomsDep); } catch {}
  }

  // Date de référence : aujourd'hui si une source a été interrogée en direct, sinon le jour de l'extraction du dépôt.
  const direct = lba.offres.length || adz.length || journal.some(s => /API en direct/.test(s.source) && s.n);
  const jourRef = direct || !ft.jour ? new Date().toISOString().slice(0, 10) : ft.jour;
  const age = d => (Date.parse(jourRef) - Date.parse(d)) / 86400000;
  // Annonces sans poste réel : elles quittent la liste des offres (donc tous les chiffres) et sont publiées à part.
  // Le « nom d'employeur » compte aussi : Adzuna publie des annonces dont l'employeur s'appelle « On ne recrute pas ».
  for (const o of offres) if (!o.sans_poste && sansPoste(o.ent || o.ent_annonce || "", "")) o.sans_poste = true;
  const signalees = offres.filter(o => o.sans_poste);
  for (let i = offres.length - 1; i >= 0; i--) if (offres[i].sans_poste) offres.splice(i, 1);
  for (const o of signalees) o.alertes = ["annonce qui ne propose pas de poste"];
  const controles = controler(offres, { jour: ft.jour, jourRef, nFTdepot });
  const vigilance = controlerSens(offres, signalees);

  // On retire des sorties le champ de travail du dédoublonnage.
  for (const o of [...offres, ...signalees]) { delete o.empreinte; delete o.sans_poste; }
  const qualite = {
    brutes: brutes.length, par_source: parSource, retenues: offres.length,
    par_contrat: { alternance: offres.filter(o => o.contrat === "alternance").length, stage: offres.filter(o => o.contrat === "stage").length },
    durees_stage: offres.filter(o => o.contrat === "stage").reduce((a, o) => (a[o.duree_classe] = (a[o.duree_classe] || 0) + 1, a), {}),
    doublons_meme_id: dd.meme_id, doublons_proches: dd.proches, doublons_relais: dd.relais,
    bareme_recopie: offres.filter(o => o.sal_bareme).length,
    salaires_invraisemblables: offres.filter(o => o.sal_etat === "invraisemblable").length,
    sans_poste: signalees.length,
    sans_entreprise: offres.filter(o => !o.ent).length,
    sans_lieu: offres.filter(o => !o.dep).length,
    positions: offres.reduce((a, o) => (a[o.prec || "aucune"] = (a[o.prec || "aucune"] || 0) + 1, a), {}),
    salaire: offres.reduce((a, o) => (a[o.sal_etat] = (a[o.sal_etat] || 0) + 1, a), {}),
    diplome: offres.reduce((a, o) => (a[o.dipl_src || "inconnu"] = (a[o.dipl_src || "inconnu"] || 0) + 1, a), {}),
    ecoles: offres.filter(o => o.ecole).length, interim: offres.filter(o => o.interim).length,
    entreprises: { noms_distincts: ent.noms, offres_identifiees: ent.identifiees, homonymes_rejetes: ent.incoherentes, appels: ent.appels },
    anciennes_90j: offres.filter(o => o.date && age(o.date) > 90).length,
    sources: journal, controles, vigilance,
  };

  // Métiers vides : sans aucune offre ce matin (alternance ou stage), ils ne sont pas publiés — ni dans les listes,
  // ni dans les graphiques. Ils restent suivis (config) et reviennent d'eux-mêmes le jour où une offre paraît.
  const avecOffres = new Set(offres.map(o => o.rome));
  const metiersVides = CONFIG.metiers.filter(m => !avecOffres.has(m.code));
  if (metiersVides.length) console.log(`Métiers sans offre ce matin, non publiés : ${metiersVides.map(m => `${m.libelle} (${m.code})`).join(", ")}`);
  const sortie = {
    genere_le: new Date().toISOString(),
    date: jourRef, date_ft: ft.jour,
    metiers_vides: metiersVides.map(m => ({ code: m.code, libelle: m.libelle })),
    metiers: CONFIG.metiers.filter(m => avecOffres.has(m.code)).map(m => ({ code: m.code, libelle: m.libelle, groupe: m.groupe,
      alt: offres.filter(o => o.rome === m.code && o.contrat === "alternance").length,
      stage: offres.filter(o => o.rome === m.code && o.contrat === "stage").length, total_ft: ft.totaux[m.code] || 0,
      // Même source et même jour que total_ft (data/actives, avant nettoyage) : la part de l'alternance est cohérente.
      alt_ft: (ft.serie.length ? ft.serie.at(-1).alt[m.code] : 0) || 0,
      titres_frequents: titresFrequents(offres.filter(o => o.rome === m.code && !o.ecole)) })),
    remuneration_legale: LEGAL,
    classes_duree: CLASSES_DUREE,
    // Si le métier par défaut est vide ce matin, les pages ouvrent sur « tous les métiers ».
    metier_par_defaut: avecOffres.has(CONFIG.metier_par_defaut) ? CONFIG.metier_par_defaut : "*", zone_par_defaut: CONFIG.zone_par_defaut || "",
    naf_par_groupe: CONFIG.naf_par_groupe, outils: Object.keys(CONFIG.outils),
    diplomes: DIPLOMES, classes_effectif: CLASSES_EFF, sections: SECTIONS, regions: Object.keys(REGIONS), departements: nomsDep || {},
    serie: ft.serie,
    region_suivie: REGION ? { nom: REGION.nom, deps: [...DEPS_REGION], rayon_km: REGION.rayon_km, centres: REGION.centres.map(c => c.ville) } : null,
    nb_recruteurs_lba: lba.recruteurs.length, qualite, offres, offres_signalees: signalees,
  };
  const json = JSON.stringify(sortie);
  const entete = "/* généré par scripts/alternance.mjs — ne pas modifier à la main */\n";
  fs.writeFileSync(path.join(RACINE, "data", "alternance.json"), json, "utf8");
  fs.writeFileSync(path.join(RACINE, "data", "alternance.js"), entete + "window.ALTERNANCE = " + json + ";\n", "utf8");
  // Les entreprises « susceptibles de recruter » (La bonne alternance) : fichier à part, chargé par la page Alternance seulement.
  // Sans clé LBA, on garde celles du dernier lancement qui en avait une, plutôt que d'effacer la liste.
  const fRec = path.join(RACINE, "data", "alternance-recruteurs.json");
  if (lba.recruteurs.length || !fs.existsSync(fRec)) {
    const rec = JSON.stringify({ date: new Date().toISOString().slice(0, 10), region: REGION ? REGION.nom : "", rayon_km: REGION ? REGION.rayon_km : null, recruteurs: lba.recruteurs });
    fs.writeFileSync(fRec, rec, "utf8");
    fs.writeFileSync(path.join(RACINE, "data", "alternance-recruteurs.js"), entete + "window.ALTERNANCE_RECRUTEURS = " + rec + ";\n", "utf8");
  }

  // ---- Le rapport, lisible dans le terminal ----
  console.log(`\nSources :`);
  for (const s of journal) console.log(`  ${s.source.padEnd(20)} ${String(s.n).padStart(5)}  ${s.statut}`);
  console.log(`\n${brutes.length} offres lues -> ${offres.length} retenues (${dd.meme_id} doublons même identifiant, ${dd.proches} annonces republiées fusionnées, ${dd.relais} copies de sites relais fusionnées)`);
  console.log(`Employeurs : ${ent.noms} noms distincts, ${ent.identifiees} offres reliées à une entreprise (${ent.appels} appels API)`);
  console.log(`Écoles / organismes de formation : ${qualite.ecoles} offres ; intérim / cabinets : ${qualite.interim}`);
  console.log(`Salaire : ${JSON.stringify(qualite.salaire)} ; positions : ${JSON.stringify(qualite.positions)}`);
  console.log(`\nContrôles :`);
  for (const k of controles) console.log(`  ${k.ok ? "OK   " : "ÉCHEC"} ${k.nom} — ${k.detail}`);
  console.log(`
À lire avec prudence (contrôles de sens) :`);
  for (const k of vigilance) console.log(`  ${String(k.n).padStart(5)}  ${k.nom} — ${k.detail}`);
  console.log(`\nÉcrit : data/alternance.json (${Math.round(json.length / 1024)} Ko) et data/alternance.js — ${Math.round((Date.now() - t0) / 1000)} s`);
  if (controles.some(k => !k.ok)) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
