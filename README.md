# LorR

LorR crée ton emploi du temps étudiant à partir de l’espace invité public
d’Hyperplanning. Tu choisis tes formations et tes cours, puis tu retrouves ton
planning avec un lien. Tu peux utiliser LorR sans compte.

[Ouvrir LorR](https://lorr.corentinl5.be/)

<img src="./assets/planning-hero.svg" alt="Agenda illustré LorR" width="360">

## Créer un planning

1. Colle le lien HTTPS de l’espace invité de ton établissement. Il se termine
   par `/invite`.
2. Choisis tes formations. Tu peux ajouter un autre établissement si nécessaire.
3. Choisis tes groupes, puis coche les cours affichés en une fois ou cours
   par cours. Les cours communs restent visibles. LorR regroupe les doublons
   et coche d’office les jours fériés et les vacances signalés par Hyperplanning.
4. Clique sur **Créer mon emploi du temps** pour afficher les séances sur
   toutes les semaines publiées.

Les étapes sont cliquables dès que les choix nécessaires sont faits.
**Reprendre ma sélection** rouvre le brouillon depuis l’accueil.
Dans l’étape des cours, **Ma sélection** affiche uniquement les cours cochés.
**Enregistrer** garde le planning sur cet appareil et permet de le rouvrir
depuis l’accueil. Dans **Partager**, **Copier mon lien** crée un lien court du type
`/p/Gx2mQ7tW4-Lb` pour ouvrir ce planning dans un autre navigateur.
La barre d’adresse affiche simplement `/planning` après l’ouverture.

LorR conserve la sélection associée au lien court dans SQLite.
Si SQLite est indisponible, le bouton copie le lien autonome avec le code
compressé après `#p=`.
LorR vérifie le code et les domaines invités avant de demander les horaires.

## Consulter les horaires

- **Mois** est la vue par défaut. Le sélecteur permet d’aller à un mois.
  Clique sur une date ou sur le nombre de séances supplémentaires pour voir
  le détail de la journée.
- **Semaine** place les cours selon l’heure et la durée. Les cours simultanés
  sont côte à côte. Le sélecteur permet d’aller directement à une semaine.
- **Liste** regroupe les séances par semaine.

Chaque cours garde sa couleur pastel. Un clic sur une séance affiche ses
détails. Les périodes fériées ont un seul bloc dans la liste et la grille
semaine. La grille entière s’affiche dans la page, avec la même taille quand
tu changes de période ou de vue. Les boutons de vue restent visibles en
haut de l’écran pendant le défilement. Le navigateur se souvient de la vue
choisie.

## Agenda et application web

Dans **Partager**, **Télécharger le .ics** exporte les séances sélectionnées et les repères
visibles du planning. Le fichier contient les horaires disponibles au
moment du téléchargement. Importe-le dans l’application de calendrier
de ton choix.

Sur un site servi en HTTPS, utilise **Installer LorR** si le navigateur
propose l’installation. Sur iPhone et iPad, ouvre LorR dans Safari et
choisis **Partager**, puis **Sur l’écran d’accueil**. Active **Ouvrir comme
app web** si cette option apparaît. Une fois le site chargé, tu peux rouvrir
un planning déjà enregistré hors connexion si les horaires sont encore
disponibles dans le cache du navigateur.
La date de récupération reste visible hors connexion. Si les horaires
ont été récupérés à des moments différents, LorR affiche la date la plus ancienne.

Une fois LorR installé, un lien du même site peut ouvrir le planning dans
l’application si le navigateur autorise la prise en charge des liens.
LorR réutilise la fenêtre déjà ouverte quand le navigateur le permet.
Dans Chrome et Edge, ce choix dépend des réglages de l’application.
[Chrome](https://developer.chrome.com/docs/capabilities/pwa-navigation-management)
· [Edge](https://learn.microsoft.com/fr-fr/microsoft-edge/progressive-web-apps/how-to/handle-urls)

LorR reste installé après un effacement du cache. Pour le réinstaller,
désinstalle d’abord l’application via le navigateur ou l’appareil.

## Passage à PHP

Les premières versions suivies dans ce dépôt utilisaient des pages HTML,
du JavaScript et des fichiers ICS archivés. Le passage à PHP s’est fait en
deux étapes.

1. Les pages sont passées au routeur `index.php`. Le navigateur a gardé le
   JavaScript qui gère la sélection des cours et le calendrier. Le serveur
   utilisait alors Node.js et Chromium pour lire l’espace invité.
2. Sur LWS, le lecteur `server/guest-planning.php` a remplacé Chromium.
   Il utilise les extensions PHP `curl` et `openssl`. Le site fonctionne
   sur LWS sans Node.js et sans compilation de l’interface.

## Lecture des horaires Hyperplanning

Le navigateur envoie le lien invité à `/api/planning`. Le serveur vérifie
le domaine, ouvre une session invitée en HTTPS et lit la liste des formations.
Après le choix des formations, il demande leurs horaires pour les semaines
publiées. Le choix des cours se fait ensuite dans le navigateur.

C’est de l’extraction automatisée de données publiques. Le lecteur PHP
lit les paramètres d’ouverture dans la page `/invite`, puis utilise les
réponses JSON des appels internes de l’espace invité pour les horaires.
L’intégration dépend du format de ces réponses. Un changement chez
Hyperplanning peut nécessiter une mise à jour du lecteur.

L’établissement décide quelles formations et quelles semaines sont
disponibles dans l’espace invité. LorR lit cette publication sans compte et
à la demande. [Documentation de l’espace Invités](https://doc.index-education.com/fr/hyperplanning/hyperplanning/HYPERPLANNING/E/Espace_Invit%C3%A9s.htm)

## Lancer LorR en local

Installe PHP 8.1 ou plus récent avec les extensions `curl` et `openssl`.
Exécute cette commande dans le dossier du projet.

```sh
php -S 127.0.0.1:8000 index.php
```

Ouvre [l’accueil de LorR](http://127.0.0.1:8000/) puis clique sur **Créer mon planning**.

## Configurer le serveur

Sur LWS, déploie `index.php`, `api-planning.php`, `.htaccess`, `robots.txt`,
`manifest.webmanifest`, `sw.js` et les dossiers `views/`, `server/`, `scripts/`,
`styles/` et `assets/`. Laisse `server/read.cjs` dans le dépôt. Garde `.git/`,
les fichiers Markdown, la configuration privée et les données locales hors
de la racine publique.

Pour utiliser le lecteur Chromium de secours sur un autre serveur, installe
Node.js 20 ou plus récent, lance `npm ci` et `npm run install:browser`, puis
autorise `proc_open` pour PHP. Tu peux indiquer le chemin de Chromium
avec `LORR_CHROMIUM_PATH`.

Le routeur PHP sert l’accueil sur `/` et le créateur sur `/planning`.
Sur Apache, active le module `mod_rewrite` et autorise les règles du fichier
`.htaccess`.
Sur l’hébergement, utilise `LORR_STATS_DIR` pour placer SQLite et les fichiers
des statistiques hors de la racine web. Le cache des horaires utilise le
dossier temporaire de PHP. Garde la configuration privée dans les paramètres
de l’hébergement ou dans le dossier local ignoré par Git.

Les pages publiques et les liens de planning partagés utilisent le GIF
LorR en boucle pour l’aperçu des liens. `/robots.txt` indique le sitemap
disponible sur `/sitemap.xml`. Les liens de planning partagés ne sont pas
inclus dans le sitemap et portent une consigne `noindex`.
Pour fixer l’adresse publique, renseigne `LORR_PUBLIC_URL`
avec l’URL HTTPS du site. Inclus le sous-dossier si LorR est installé dans un
sous-dossier. LorR utilise HTTPS sur `lorr.corentinl5.be` et reprend
l’adresse de la requête sur les autres domaines.

Les liens courts utilisent la base SQLite de LorR, `var/lorr-stats.sqlite` par
défaut. PHP doit disposer de `pdo_sqlite` et pouvoir écrire dans le dossier
de la base. Tu peux choisir un dossier persistant avec `LORR_STATS_DIR`.
Conserve la base lors des mises à jour pour garder les liens partagés.

Le domaine annuel de la HEH sur `umons.ac.be` est pris en charge. Pour ajouter
d’autres établissements, renseigne leurs noms de domaine exacts dans
`LORR_PLANNING_HOSTS`, séparés par des virgules. Vérifie que l’espace invité
de chaque établissement fonctionne avec le lecteur avant de l’ajouter.

LorR lit ensemble les formations choisies sur un même espace invité. Le navigateur et le
serveur réutilisent les dernières données jusqu’à sept jours et les affichent
dès qu’elles sont disponibles. Le serveur actualise les horaires après deux
minutes et les listes de formations après quinze minutes. Tu peux consulter
le planning pendant l’actualisation. Si Hyperplanning ne répond pas, LorR
laisse les derniers horaires disponibles à l’écran.

## Statistiques publiques

La page `/stats` affiche les totaux et les compteurs des sept derniers jours.
Elle couvre les chargements de l’accueil, les ouvertures du créateur, les
demandes d’horaires, les cours et séances chargés, les cours différents, les liens
invités distincts et les clics qui ouvrent le détail d’un cours.

LorR compte chaque séance renvoyée pour une formation, y compris depuis le
cache, en excluant les repères du calendrier. Le compteur commence lorsque
cette version est déployée. Chaque cours chargé compte une fois par formation
et par réponse du serveur, même s’il a plusieurs séances. Pour les cours différents,
une matière compte une fois par lien invité au total et une fois par jour de
chargement. Un lien invité compte une fois au total et une fois par jour où
le serveur charge son catalogue.

Les statistiques utilisent SQLite si PHP propose l’extension `pdo_sqlite`.
Quand cette extension est indisponible, LorR conserve les compteurs dans
un fichier JSON. Par défaut, ces fichiers sont placés dans `var/`. Donne
à PHP le droit d’écrire dans ce dossier ou choisis un dossier persistant
avec `LORR_STATS_DIR`. Le serveur stocke les compteurs, les dates et des
empreintes des liens invités et des matières.

## Soutenir LorR

La page `/soutenir` regroupe le lien pour ouvrir une issue GitHub et celui pour
offrir un café. Les deux liens ouvrent un nouvel onglet. Elle affiche les
étoiles, les forks et les abonnés du dépôt. LorR actualise ces chiffres à partir
de l’API publique de GitHub au plus toutes les 30 minutes et garde la dernière
réponse disponible si GitHub ne répond pas.

Sur l’hébergement, renseigne `LORR_SUPPORT_URL` avec ton lien HTTPS Revolut.me
ou Ko-fi. En local avec `php -S`, tu peux écrire le lien dans
`var/support-url.txt` s’il est absent de l’environnement. Git ignore ce fichier.

## Documents du dépôt

Garde ces fichiers dans Git à la racine du dépôt.

| Fichier | Contenu |
| --- | --- |
| [README.md](README.md) | Utilisation, lecture des horaires et déploiement |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Étapes pour travailler avec Corentin dans le dépôt |
| [SECURITY.md](SECURITY.md) | Canal privé pour signaler une faille |
| [LICENSE](LICENSE) | Droits sur le code et la documentation |

## Droits sur le code

Tous droits réservés. Pour contribuer, travaille avec Corentin Lallement
dans le dépôt d’origine. Pour republier le code ou héberger une autre
version de LorR, demande son autorisation écrite. Les versions déjà
distribuées sous licence MIT conservent cette licence. [Conditions complètes](LICENSE)
