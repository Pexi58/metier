# Veille alternance — ce qui a été ajouté au dépôt

Deux pages et un script qui se concentrent sur les **offres en alternance** (apprentissage et
professionnalisation), pour **n'importe lequel des 23 métiers suivis** : le métier n'est pas figé,
il se choisit dans la page. Toute la France est couverte, et **Auvergne-Rhône-Alpes** l'est en détail.

## Le site : trois pages, un même menu

En ligne (mis à jour chaque matin) : **https://pexi58.github.io/metier/presentation.html**

| Page | À quoi elle sert |
|---|---|
| **Synthèse** — `presentation.html` | L'essentiel pour un métier : chiffres-clés, puis une idée par section (combien, où, zoom région, contrat ou durée, qui recrute, compétences, rémunération, méthode). Sommaire sur le côté, bouton « Imprimer / PDF ». |
| **Explorer les données** — `alternance.html` | Tous les filtres (métier, zone, contrat, durée, sources…), la carte, le zoom département par département, la liste des offres, les entreprises à démarcher, et la section « Méthode et sources ». |
| **Offres disponibles** — `offres.html` | Toutes les offres encore en ligne à la collecte du matin, en cartes cliquables vers l'annonce d'origine ; filtres type, métier, zone, durée de stage, mot-clé, salaire affiché ; export CSV. |

Le choix « Alternance / Stage / Les deux » et le métier **suivent d'une page à l'autre**.

**Chaque chiffre est vérifiable** : un clic sur un chiffre-clé, sur une barre de graphique ou sur « Vérifier »
ouvre une fenêtre qui montre le calcul (ex. « 188 ÷ 938 = 20 % »), les filtres appliqués, d'où vient la valeur
(champ de la source ou lu dans le texte), les sources des offres comptées avec le lien vers chaque API, et la
liste de ces offres (chacune cliquable vers l'annonce), exportable en CSV pour refaire le calcul dans Excel.

Les offres **publiées par des écoles** (qui recrutent surtout leurs futurs élèves) sont **masquées par défaut** ;
une case permet de les afficher.

## Utiliser

- **Ouvrir** : double-clic sur `presentation.html` ou `alternance.html` (internet nécessaire pour les graphiques).
- **Mettre à jour les données** : double-clic sur `mettre-a-jour-alternance.cmd` (compter 5 à 10 minutes :
  les API limitent le nombre d'appels par minute). Rien à installer, Node.js suffit.
- **Changer de métier** : liste « Métier » en haut de chaque page.
- **Partager une vue** : l'adresse de la page garde le métier et les filtres (ex. `presentation.html#m=M1620`).
- **Travailler dans Excel** : boutons « Exporter (CSV) ».
- **Ajouter un métier** : une ligne dans `config/alternance.json` (code ROME, libellé, groupe, mots-clés), puis mettre à jour.

## D'où viennent les offres

| Source | Clé (dans `.env`) | Ce qu'elle apporte |
|---|---|---|
| France Travail — base du cours (`data/brut`) | aucune | toutes les offres des 23 métiers, France entière (elle relaie déjà PMEJob, DirectEmploi, Meteojob…) |
| La bonne alternance (API officielle de l'alternance) | `LBA_API_KEY` | recherche nationale + recherche autour de 13 villes d'Auvergne-Rhône-Alpes ; donne aussi les entreprises « susceptibles de recruter en alternance » |
| Adzuna (agrégateur de sites d'emploi) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | recherche nationale + recherche dédiée à la région ; le métier est déduit du titre de l'offre |
| API Recherche d'entreprises (État) | aucune | taille, secteur, école ou non de chaque employeur ; liste de toutes les entreprises d'un département |

Une même offre vue dans plusieurs sources n'est comptée **qu'une fois**.
**Pas de scraping** de LinkedIn, Indeed, HelloWork ou Welcome to the Jungle : leurs conditions d'utilisation
l'interdisent (règle du dépôt). Les API ci-dessus sont les voies autorisées.

**Quotas** : La bonne alternance accepte 60 appels par 31 secondes, Adzuna (offre gratuite) environ 25 par minute
et 250 par jour. Le script espace ses appels, et garde le résultat Adzuna du jour en cache : relancer le même jour
ne consomme pas le quota.

## Ce que le script vérifie et corrige

1. **Doublons** : même identifiant dans deux sources ; même annonce republiée (même titre, même employeur, même ville).
2. **Salaires** ramenés en brut mensuel ; un montant mensuel saisi dans la case « annuel » est corrigé ; hors 300–6 000 € : écarté.
3. **Employeurs** retrouvés dans le répertoire officiel des entreprises (SIRENE) par leur nom ; **écoles** (activité 85,
   enseignement) et **intérim / cabinets** (activité 78) repérés.
4. **Entreprises « susceptibles de recruter »** : La bonne alternance en renvoie parfois de très loin ; on ne garde que
   celles qui sont vraiment dans le rayon demandé et dans la région.
5. **Contrôles automatiques** (identifiants uniques, dates, départements, positions, liens, et recoupement avec
   `data/resume.json` de la base du cours) : affichés dans le terminal et dans la section « Fiabilité ».

## Les fichiers

| Fichier | Rôle |
|---|---|
| `config/alternance.json` | les métiers suivis, la région suivie et ses villes-centres, la grille d'outils |
| `scripts/alternance.mjs` | collecte, nettoyage, dédoublonnage, croisement, contrôles |
| `data/alternance.json` / `.js` | les offres nettoyées + le rapport de qualité (lus par les pages) |
| `data/alternance-recruteurs.json` / `.js` | les entreprises « susceptibles de recruter » de la région |
| `data/alternance-cache/` | réponses déjà obtenues (entreprises, communes, Adzuna du jour) |
| `alternance.html`, `presentation.html`, `assets/alternance.*`, `assets/presentation.*` | les deux pages |
| `mettre-a-jour-alternance.cmd` | double-clic : tout mettre à jour et ouvrir la page |
| `.github/workflows/alternance.yml` | la même chose chaque matin sur GitHub (clés dans les secrets du dépôt) |
