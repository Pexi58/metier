# Veille alternance — ce qui a été ajouté au dépôt

Deux pages et un script qui se concentrent sur les **offres en alternance** (apprentissage et
professionnalisation), pour **n'importe lequel des 20 métiers suivis** : le métier n'est pas figé,
il se choisit dans la page. Toute la France est couverte, et **Auvergne-Rhône-Alpes** l'est en détail.

## Le site : trois pages, un même menu

En ligne (mis à jour chaque matin) : **https://pexi58.github.io/metier/** (l'adresse du site ouvre directement la Synthèse)

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
  Pour qu'il ait aussi sa part d'alternance (toutes offres France Travail), l'ajouter dans `scripts/extraire.py` (METIERS).
- **Métiers vides** : un métier sans aucune offre le matin de la collecte n'est pas publié (ni liste, ni graphique) ;
  il reste suivi et réapparaît seul dès qu'une offre paraît. La liste du jour est dans `metiers_vides` de `data/alternance.json`.

## D'où viennent les offres

| Source | Clé (dans `.env`) | Ce qu'elle apporte |
|---|---|---|
| France Travail — base du cours (`data/brut`) | aucune | toutes les offres des 20 métiers, France entière (elle relaie déjà PMEJob, DirectEmploi, Meteojob…) |
| La bonne alternance (API officielle de l'alternance) | `LBA_API_KEY` | recherche nationale + recherche autour de 13 villes d'Auvergne-Rhône-Alpes ; donne aussi les entreprises « susceptibles de recruter en alternance » |
| Adzuna (agrégateur de sites d'emploi) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | recherche nationale + recherche dédiée à la région ; le métier est déduit du titre de l'offre |
| API Recherche d'entreprises (État) | aucune | taille, secteur, école ou non de chaque employeur ; liste de toutes les entreprises d'un département |

Une même offre vue dans plusieurs sources n'est comptée **qu'une fois**.
**Pas de scraping** de LinkedIn, Indeed, HelloWork, JobTeaser ou Welcome to the Jungle : leurs conditions d'utilisation
l'interdisent (règle du dépôt). Les API ci-dessus sont les voies autorisées.

### HelloWork et JobTeaser : pourquoi ils ne sont pas dans les sources (vérifié le 29/09/2026)

| | API pour lire les offres ? | Collecte automatique | Accès indirect autorisé |
|---|---|---|---|
| **HelloWork** | Non. La seule API (« ATS Partner ») sert aux logiciels de recrutement à *recevoir* des candidatures. Les flux XML sont réservés aux sites partenaires, sous contrat. | Interdite : [CGU](https://www.hellowork-group.com/fr/legal/cgu-hellowork/) art. 1 et 8.2 (extraction par systèmes automatisés « strictement interdite ») ; [robots.txt](https://www.hellowork.com/robots.txt) : `Disallow: /`. | HelloWork est [partenaire de France Travail](https://www.francetravail.fr/candidat/vos-services-en-ligne/des-partenaires-pour-vous-propos.html) et d'Adzuna, mais l'API France Travail ne donne que les offres des partenaires qui l'acceptent : dans nos données du 28/09, **aucune** offre n'arrive « via HelloWork ». La bonne alternance reçoit le flux HelloWork mais ne le rediffuse pas ([ticket LBA](https://github.com/mission-apprentissage/labonnealternance/issues/5474)), sauf exception annoncée du 11 au 15 octobre 2026 ([ticket](https://github.com/mission-apprentissage/labonnealternance/issues/5565)). |
| **JobTeaser** | Non. Des API existent, réservées aux partenaires (écoles, logiciels RH), sur contrat. | Interdite : [conditions membres](https://www.jobteaser.com/fr/about/terms-for-members) (téléchargement automatisé interdit). La plupart des offres sont derrière la connexion au service carrière de l'école. | Aucun relais trouvé (ni France Travail, ni Adzuna). Seule piste : le service carrière de l'école peut [exporter les offres](https://helpcenter.jobteaser.com/hc/fr/articles/5723950176914-Exporter-les-offres-%C3%A0-des-fins-d-analyses) de son établissement. |

Pour aller plus loin, il faudrait demander un accès par écrit (partenariats HelloWork Group, ou JobTeaser via l'école).
Les offres « via » chaque partenaire de France Travail se lisent dans la page Explorer, section Fiabilité.

**Quotas** : La bonne alternance accepte 60 appels par 31 secondes, Adzuna (offre gratuite) environ 25 par minute
et 250 par jour. Le script espace ses appels, et garde le résultat Adzuna du jour en cache : relancer le même jour
ne consomme pas le quota.

## Ce que le script vérifie et corrige

1. **Doublons** : même identifiant dans deux sources ; même annonce republiée (même titre, même employeur, même ville) ;
   **copie relayée** par un site d'emploi qui efface l'employeur et change la ville (même titre une fois la ville et « H/F » retirés,
   même texte ou même département). La copie reprend l'employeur de l'original : une offre d'école republiée sans nom
   est donc reconnue comme offre d'école, et masquée avec elles.
2. **Hors sujet** : les intitulés de la liste `titres_hors_sujet` (conseiller de vente, assistant d'agence d'intérim, médiateur…)
   sont écartés quelle que soit la source ; Adzuna ne garde le métier de sa recherche que si le titre en cite un mot
   (« Commercial en alternance », remonté par la recherche « e-commerce », n'est plus compté en e-commerce).
3. **Salaires** ramenés en brut mensuel ; un montant mensuel saisi dans la case « annuel » est corrigé ; hors 300–6 000 € : écarté.
   Le **barème légal recopié** (« 486 € à 1 801 € » = 27 % à 100 % du SMIC) est repéré et retiré des médianes. Stages et
   alternances ne sont jamais mélangés dans une médiane. Le SMIC et les barèmes sont dans `config/alternance.json`
   (`remuneration_legale`) : une ligne à changer quand le SMIC augmente.
4. **Employeurs** retrouvés dans le répertoire officiel des entreprises (SIRENE) par leur nom ; **écoles** (activité 85,
   enseignement) et **intérim / cabinets** (activité 78) repérés.
5. **Entreprises « susceptibles de recruter »** : La bonne alternance en renvoie parfois de très loin ; on ne garde que
   celles qui sont vraiment dans le rayon demandé et dans la région.
6. **Contrôles de forme** (identifiants uniques, dates, départements, positions, liens, et recoupement avec
   `data/resume.json` de la base du cours) : affichés dans le terminal et dans la section « Fiabilité ».
7. **Contrôles de sens**, qui comptent au lieu d'afficher « tout va bien » : alternances dont le titre dit « stage »,
   ville du titre différente du lieu, barème recopié, rémunération sous le minimum légal, intitulés de niveau direction,
   stages sans durée, métier déduit d'une recherche par mots-clés. Chaque ligne est cliquable dans les pages et
   montre les offres concernées.
8. **Compétences** : les pourcentages ne portent que sur les offres dont on a le texte complet (France Travail,
   La bonne alternance) ; Adzuna n'en donne qu'un extrait.
9. **Annonces sans poste réel** (« On ne recrute pas » dans le titre, le texte ou à la place du nom de l'employeur,
   annonce test, vivier de CV, candidature spontanée, poste déjà pourvu) : **retirées de tous les chiffres** et
   listées à part (page Offres : « les voir »). Deux listes dans `config/alternance.json` (`annonces_sans_poste`) :
   une large pour le titre, une stricte pour le texte (« merci de ne pas postuler si… » n'est pas une annonce vide).
10. **Salaires invraisemblables** (au-delà de 1,4 × SMIC pour une alternance, 1,2 × SMIC pour un stage, fourchette
   au-delà de 2,2 × SMIC, ou montant illisible) : l'offre reste, son salaire **sort des statistiques** et s'affiche
   barré avec ⚠. Seuils dans `config/alternance.json` (`salaire_vraisemblable`).
11. **Badge « ⚠ à vérifier »** sur chaque offre visée par un contrôle de sens, avec la raison. Sur la page Offres,
   le tri par défaut met **les offres les plus complètes et fiables d'abord** (employeur nommé, salaire exploitable,
   texte complet, lieu exact, récente, sans alerte) ; une case permet de masquer les offres à vérifier.

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
