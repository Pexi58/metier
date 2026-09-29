# Alternance et stages en marketing, digital et communication

### 👉 **[Voir le site : pexi58.github.io/metier](https://pexi58.github.io/metier/)**

Le site répond à une question : **où et comment trouver une alternance ou un stage** dans le marketing,
le digital et la communication ? Combien d'offres, où, dans quels métiers l'alternance est la porte d'entrée,
pour quelle rémunération, avec quelles compétences. Les données sont collectées chaque matin par deux
Actions GitHub, et **chaque chiffre est cliquable** : le calcul, les filtres, les sources et la liste des
offres comptées s'affichent, avec un export CSV pour refaire le calcul dans Excel.

| Page | À quoi elle sert |
|---|---|
| [Synthèse](https://pexi58.github.io/metier/presentation.html) | l'essentiel pour un métier, une idée par section, les limites |
| [Explorer les données](https://pexi58.github.io/metier/alternance.html) | tous les filtres, la carte, les entreprises à démarcher, la fiabilité |
| [Offres disponibles](https://pexi58.github.io/metier/offres.html) | les annonces en ligne ce matin, filtrables, exportables |
| [Tout le marché](https://pexi58.github.io/metier/marche.html) | toutes les offres d'emploi (pas seulement l'alternance) : la base du cours |

Le détail de la veille alternance (sources, nettoyage, contrôles) est dans [ALTERNANCE.md](ALTERNANCE.md).

**Auteur : Pexi58** — dossier de travail pour la séance « Écouter le marché de votre métier » (M2 MOD, IAE Clermont Auvergne).
Ce dépôt part du dépôt de démonstration du cours ([VincentFavarin/metier](https://github.com/VincentFavarin/metier)) :
la chaîne France Travail (`scripts/extraire.py`, `scripts/resumer.py`, pages `marche.html`, `salaires.html`,
`exigences.html`, `recruteurs.html`, `mouvement.html`) vient de là ; la veille alternance et stages
(`scripts/alternance.mjs`, `presentation.html`, `alternance.html`, `offres.html`) est l'ajout propre à ce dépôt.

## Le métier, tel que le marché le nomme

- **Intitulé principal** : chargé / chargée de marketing digital
- **Variantes rencontrées dans les offres** : chef de projet marketing digital,
  chef de produit digital, traffic manager, CRM manager, chargé d'acquisition
- **Code ROME** : **M1718** — Chargé / Chargée de marketing digital
  (le README disait M1705 « Marketing » ; c'est la première extraction qui a
  donné le bon code : 14 offres sur 22 étaient en M1718)

## Les questions que je pose à ce marché

1. Combien d'offres, et où : Clermont / Puy-de-Dôme, Auvergne-Rhône-Alpes,
   France, télétravail ?
2. Quels contrats et quels salaires affichés ?
3. Quels outils et compétences reviennent le plus — et lesquels la formation
   ne me donnera pas ?
4. Quelles entreprises publient le plus cet intitulé ?

## Ce que la première journée a appris (22/09/2026)

Trois requêtes, même jour, même API :

| Requête | Offres | Lecture |
|---|---|---|
| `motsCles = "chef de projet marketing digital"` | 22 | trop étroit, et du bruit (PMO, communication) |
| `codeROME = M1718` | 113 | le référentiel : homogène, c'est la requête de la veille |
| `motsCles = "marketing digital"` | 424 | large, mais 191 annonces identiques d'un même réseau (M1716) : à dédoublonner avant de compter |

Sur M1718 : 0 offre dans le 63, 11 en Auvergne-Rhône-Alpes, Paris et
Hauts-de-Seine en tête ; 27 % des offres affichent un salaire, médiane
31 000 → 35 700 € annuels ; réseaux sociaux, anglais, SEO/SEA, GA4 et
« IA » reviennent le plus.

## Les métiers suivis

24 codes ROME, choisis pour le M2 MOD parmi les 1 911 du référentiel France
Travail (la liste vit dans `scripts/extraire.py`, `METIERS`, et dans
`config/alternance.json` pour la veille alternance) : le cœur
marketing (M1718 chargé de marketing digital, M1716, M1705, M1703, M1620,
M1706, M1430, M1711), le digital (E1113 e-commerce, D1438, E1101 community
manager, E1124, E1405 SEO, M1886, M1426, M1719 et E1406 influence, E1127
brand manager / brand content) et, décochés par défaut, le groupe
« Communication et commerce », métiers voisins du marketing (E1112, E1103,
E1107, E1404, D1415 CRM, D1510 chef de secteur GMS). D1506 (merchandising) a été retiré le 29/09/2026.
E1127 et D1510 ont été ajoutés le 29/09/2026 : les offres « brand manager »
sont classées par France Travail surtout en E1127, les « chefs de secteur GMS »
surtout en D1510 (vérifié par une recherche par mots-clés dans l'API).
Au 22/09/2026 : 3 362 offres actives (23 métiers).

## La chaîne

```
API France Travail  →  scripts/extraire.py  →  data/brut/<mois>/<ROME>.jsonl   chaque version d'annonce, une seule fois
                                            →  data/actives/<date>.csv         les offres actives du jour (rome, id)
                                            →  data/serie.csv                  par jour et par métier : total, nouvelles, modifiées
                       scripts/resumer.py   →  data/resume.json                ce que les pages affichent (+ data/geo/, cache des positions)
                       marche.html + 4 pages →  https://pexi58.github.io/metier/marche.html
                       .github/workflows/veille.yml : GitHub relance tout ça chaque matin à 7 h
```

- `scripts/extraire.py` — une requête `codeROME` par métier (token OAuth,
  pagination 150 / 1 150, total lu dans `Content-Range`). Le **brut est
  conservé intégralement** : une offre est écrite la première fois qu'on la
  voit, et de nouveau si son contenu change (empreinte SHA-1 du JSON, hors
  `dateActualisation`) — l'évolution d'une annonce est donc gardée, version
  par version. Relancer le même jour n'écrit rien deux fois.
- `scripts/resumer.py` — retravaille le brut des offres actives : salaires
  (libellé texte → min/max annuels bruts), outils cités dans les descriptions
  (grille à adapter), position (lat/lon de l'API, sinon centre de la commune
  via geo.api.gouv.fr, sinon ville principale du département).
- Cinq pages HTML statiques, un chantier par page, toutes servies telles quelles.
  Chacune charge `data/resume.json` et recalcule ses graphiques Chart.js dans le
  navigateur selon la sélection ; net mensuel estimé = brut × 0,78 / 12.
  - `marche.html` — les filtres, les chiffres-clés, la carte Leaflet (survol =
    l'offre, clic = l'annonce sur France Travail), les départements, les
    contrats, et les liens vers les quatre autres pages.
  - `salaires.html` — ce que ça paie. `exigences.html` — ce qu'on vous demande.
    `recruteurs.html` — qui recrute. `mouvement.html` — le marché bouge, et les
    limites de ces chiffres (ancre `#limites`, liée depuis chaque pied de page).
- `assets/commun.js` et `assets/commun.css` — ce que les cinq pages partagent :
  chargement des données, panneau de filtres (mémorisé dans `localStorage`,
  replié ailleurs que sur l'accueil), barre de navigation, utilitaires et
  fabriques de graphiques. Une page ne contient que son HTML et son petit
  script `rendre(offres, D)`.

## Volume et limites GitHub

Jour 1 : 13 Mo de brut ; ensuite seulement le flux (nouvelles et modifiées),
de l'ordre de 2 à 3 Mo par jour, soit ~1 Go par an. GitHub gratuit : dépôt
1 Go recommandé, fichier ≤ 100 Mo, Pages 1 Go publié et 100 Go/mois de bande
passante, Actions illimitées sur un dépôt public. Quand le brut dépassera
quelques centaines de Mo, l'Action archivera chaque mois écoulé (compressé)
dans les Releases du dépôt ou sur Hugging Face Datasets, et le dépôt ne
gardera que les derniers mois.

## Faire tourner chez soi

```
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env        (puis remplir avec ses identifiants francetravail.io)
.venv\Scripts\python.exe scripts\extraire.py --verifier
.venv\Scripts\python.exe scripts\extraire.py
.venv\Scripts\python.exe scripts\resumer.py
.venv\Scripts\python.exe -m http.server 8125      (puis http://localhost:8125)
```

## Faire tourner sans soi (GitHub)

1. Dépôt **public** (GitHub Pages gratuit ne fonctionne que sur un dépôt public).
2. Settings → Secrets and variables → Actions : `FT_CLIENT_ID` et `FT_CLIENT_SECRET`.
3. Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. Actions → veille → Run workflow : le premier commit du bot arrive dans `data/`.

## Règles

- Les identifiants sont dans `.env` (local) ou dans les secrets du dépôt
  (GitHub) : jamais dans un fichier versionné.
- Un canal, une requête, une date : chaque chiffre du site les affiche.
- Pas de scraping de LinkedIn, APEC, Indeed, HelloWork ou JobTeaser (interdit par leurs CGU ;
  HelloWork et JobTeaser n'ont pas d'API ouverte, voir ALTERNANCE.md).
