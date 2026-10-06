/* ============================================================
   archiver-mois.mjs — range les mois écoulés dans des archives compressées.
   Lancé chaque mois par .github/workflows/archive-mensuel.yml, qui dépose chaque archive dans les Releases GitHub
   (« donnees-AAAA-MM »). Rien n'est supprimé ici sans que le workflow ait vérifié que l'archive est bien en ligne.

   Ce qui est rangé pour un mois AAAA-MM :
     data/brut/AAAA-MM/                         les offres France Travail, version par version
     data/actives/AAAA-MM-*.csv                 les offres actives de chaque jour (France Travail)
     data/historique/presence/AAAA-MM-*.csv     les offres vues chaque jour (toutes sources)
     data/historique/offres/AAAA-MM.jsonl       chaque version des offres alternance et stage
   Ce qui reste TOUJOURS dans le dépôt, même après purge : data/serie.csv, data/historique/index.json, jours.json et stats.json
   (la page Évolution et les comparaisons dans le temps continuent de fonctionner).

   Commandes (node scripts/archiver-mois.mjs <commande>) :
     lister                       les mois complets (antérieurs au mois en cours) dont il reste des fichiers dans data/
     creer <AAAA-MM> <fichier>    crée l'archive .tar.gz du mois
     purgeables [--conserver 24]  les mois présents dans data/ qui ont plus de 24 mois (durée modifiable)
     purger <AAAA-MM>             supprime du dossier data/ les fichiers de ce mois (à lancer seulement une fois l'archive en ligne)
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(RACINE, "data");
const [commande, ...args] = process.argv.slice(2);
const RX_MOIS = /^\d{4}-\d{2}$/;
const moisCourant = new Date().toISOString().slice(0, 7);

const lister = d => fs.existsSync(d) ? fs.readdirSync(d) : [];
// Les fichiers (ou dossiers) d'un mois, en chemins relatifs à la racine du dépôt.
function fichiersDuMois(mois) {
  const res = [];
  if (fs.existsSync(path.join(DATA, "brut", mois))) res.push(`data/brut/${mois}`);
  for (const f of lister(path.join(DATA, "actives"))) if (f.startsWith(mois + "-")) res.push(`data/actives/${f}`);
  for (const f of lister(path.join(DATA, "historique", "presence"))) if (f.startsWith(mois + "-")) res.push(`data/historique/presence/${f}`);
  if (fs.existsSync(path.join(DATA, "historique", "offres", mois + ".jsonl"))) res.push(`data/historique/offres/${mois}.jsonl`);
  return res;
}
function moisPresents() {
  const m = new Set();
  for (const d of lister(path.join(DATA, "brut"))) if (RX_MOIS.test(d)) m.add(d);
  for (const f of lister(path.join(DATA, "actives"))) m.add(f.slice(0, 7));
  for (const f of lister(path.join(DATA, "historique", "presence"))) m.add(f.slice(0, 7));
  for (const f of lister(path.join(DATA, "historique", "offres"))) m.add(f.slice(0, 7));
  return [...m].filter(x => RX_MOIS.test(x)).sort();
}
const verifierMois = m => { if (!RX_MOIS.test(m || "")) { console.error("Mois attendu au format AAAA-MM"); process.exit(1); } };

if (commande === "lister") {
  for (const m of moisPresents()) if (m < moisCourant) console.log(m);
} else if (commande === "creer") {
  const [mois, sortie] = args; verifierMois(mois);
  if (!sortie) { console.error("Fichier de sortie manquant"); process.exit(1); }
  if (mois >= moisCourant) { console.error("Ce mois n'est pas terminé : il continue de recevoir des données."); process.exit(1); }
  const fichiers = fichiersDuMois(mois);
  if (!fichiers.length) { console.error(`Aucun fichier pour ${mois}`); process.exit(1); }
  // tar est lancé depuis le dossier de sortie, avec des chemins relatifs : un chemin « C:\… » serait pris pour une machine distante par le tar de Git.
  const dossierSortie = path.dirname(path.resolve(sortie)), nomListe = `liste-${mois}.txt`;
  fs.writeFileSync(path.join(dossierSortie, nomListe), fichiers.join("\n") + "\n", "utf8");
  const r = spawnSync("tar", ["-czf", path.basename(sortie), "-C", RACINE, "-T", nomListe], { stdio: "inherit", cwd: dossierSortie });
  fs.rmSync(path.join(dossierSortie, nomListe), { force: true });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log(`${sortie} : ${fichiers.length} éléments, ${Math.round(fs.statSync(sortie).size / 1024)} Ko`);
} else if (commande === "purgeables") {
  const i = args.indexOf("--conserver");
  const nb = i >= 0 ? parseInt(args[i + 1], 10) : 24;
  if (!(nb >= 1)) { console.error("--conserver : nombre de mois attendu (au moins 1)"); process.exit(1); }
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - nb);
  const limite = d.toISOString().slice(0, 7);          // les mois strictement antérieurs sont purgeables
  for (const m of moisPresents()) if (m < limite && m < moisCourant) console.log(m);
} else if (commande === "purger") {
  const [mois] = args; verifierMois(mois);
  if (mois >= moisCourant) { console.error("Ce mois n'est pas terminé."); process.exit(1); }
  const fichiers = fichiersDuMois(mois);
  for (const f of fichiers) fs.rmSync(path.join(RACINE, f), { recursive: true, force: true });
  console.log(`${mois} : ${fichiers.length} éléments supprimés de data/ (l'archive reste dans les Releases)`);
} else {
  console.error("Commandes : lister | creer <AAAA-MM> <fichier.tar.gz> | purgeables [--conserver 24] | purger <AAAA-MM>");
  process.exit(1);
}
