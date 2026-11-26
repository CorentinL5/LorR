# LorR

LorR crée ton emploi du temps à partir de l’espace invité public
d’Hyperplanning. Tu choisis les cours que tu suis ou que tu donnes. Tu peux
utiliser LorR sans compte.

[Ouvrir LorR](https://lorr.corentinl5.be/)

<img src="./assets/planning-hero.svg" alt="Agenda illustré LorR" width="360">

## Créer un planning

1. Choisis ton établissement ou colle le lien de son espace invité.
   Le lien se termine par `/invite`. [Exemple HEH](https://hehplanning2026.umons.ac.be/invite)
2. Choisis tes formations. Tu peux ajouter un autre lien invité si nécessaire.
3. Choisis tes groupes, puis coche les cours que tu suis. LorR sélectionne
   aussi les jours fériés et les vacances signalés par Hyperplanning.
4. Clique sur **Ouvrir mon planning** pour consulter toutes les
   semaines publiées. Sélectionne la vue **Mois**, **Semaine** ou **Liste**.

Ouvre le lien invité de ton établissement.
[HEH](https://hehplanning2026.umons.ac.be/invite),
[HECh](http://hpl.hech.be:62080/hp/invite),
[IHECS](https://ihecs-prod.pronote-campus.net/hp/invite) et
[HEAJ](https://heaj-2627.pronote-campus.net/hp/invite).

Clique sur une séance pour voir ses détails. Depuis l’accueil,
**Reprendre ma sélection** rouvre ton brouillon à l’étape où tu t’es arrêté.
**Ouvrir mon dernier planning** retrouve le dernier planning terminé sur cet
appareil, même si tu as commencé une nouvelle sélection.

Dans **Liens et export**, tu peux garder un lien dans **Mes données** ou ajouter
tout le planning sélectionné à ton agenda.

- **Copier le lien d’abonnement iCal** donne un lien à ajouter comme abonnement.
  Ton agenda décide quand actualiser les horaires. Si tu changes ta sélection,
  copie le nouveau lien.
- **Télécharger le planning (.ics)** crée un fichier avec les horaires disponibles
  au moment du téléchargement. Consulte LorR pour vérifier les changements.

Les deux options incluent les cours et les repères sélectionnés. Les vues Liste,
Semaine et Mois changent l’affichage du planning.

Après avoir chargé ton planning en ligne, tu peux rouvrir les horaires que
LorR a gardés sur cet appareil. Le planning indique la date de la dernière
lecture. Le fichier .ics reste disponible si les horaires de toutes les
formations choisies sont présents dans le cache.

Sur le site en HTTPS, utilise **Installer LorR** si ton navigateur propose
l’installation. Sur iPhone et iPad, ouvre LorR dans Safari, puis choisis
**Partager** et **Sur l’écran d’accueil**. Active **Ouvrir comme app web**
si cette option apparaît.

> [!TIP]
> Ouvre ton planning en ligne avant de partir hors connexion. Tu peux le
> rouvrir hors ligne si les horaires sont encore disponibles sur l’appareil.

## Lancer LorR en local

Installe PHP 8.1 ou plus récent avec les extensions `curl` et `openssl`.
Exécute la commande dans le dossier du projet, puis ouvre
[l’accueil local](http://127.0.0.1:8000/).

```sh
php -S 127.0.0.1:8000 index.php
```

## Déployer sur LWS

1. Active les extensions PHP `curl` et `openssl`. Vérifie qu’Apache applique
   les règles `.htaccess` avec `mod_rewrite`.
2. Déploie `index.php`, `api-planning.php`, `.htaccess`, `robots.txt`,
   `manifest.webmanifest`, `sw.js` et les dossiers `views/`, `server/`,
   `scripts/`, `styles/` et `assets/`. Exclue `server/read.cjs` du déploiement
   PHP. Garde `.git/`, les documents et la configuration privée hors de la
   racine web.
3. Pour les liens courts et les abonnements iCal, active `pdo_sqlite` et donne à PHP le droit
   d’écrire dans le dossier persistant configuré avec `LORR_STATS_DIR`.

> [!IMPORTANT]
> Conserve la base SQLite lors d’une mise à jour. Les liens courts déjà
> partagés dépendent de cette base.

| Réglage | Valeur |
| --- | --- |
| `LORR_PUBLIC_URL` | URL HTTPS publique, avec le sous-dossier si nécessaire |
| `LORR_PLANNING_HOSTS` | Domaines invités supplémentaires séparés par des virgules, pour les adresses HTTPS qui se terminent par la route racine `/invite`. |
| `LORR_STATS_DIR` | Dossier persistant accessible en écriture, hors de la racine web |
| `LORR_PLANNING_CACHE_DIR` | Dossier facultatif pour partager le cache des horaires entre les requêtes PHP. Par défaut, LorR utilise le dossier temporaire de PHP. |
| `LORR_SUPPORT_URL` | Lien HTTPS Revolut.me ou Ko-fi |

En local, `var/support-url.txt` peut fournir le lien de soutien si la
variable `LORR_SUPPORT_URL` est absente. Git ignore ce fichier. LorR affiche
le lien Revolut du projet par défaut.

### Alertes de changement d’horaire

Dans le créateur de planning, sélectionne tes cours et clique sur **M’avertir
des changements**. LorR surveille les séances des 14 prochains jours. Il
signale les changements d’heure ou de salle quand il peut rapprocher les
deux séances du même jour. Le premier relevé sert de référence. Si tu
modifies les cours, clique sur **Suivre cette sélection**. Les alertes sont
activées par appareil, sans compte. Sur iPhone ou iPad, ouvre LorR depuis
l’écran d’accueil pour les activer. LorR accepte les services Web Push
de Google, Mozilla et Apple.

Pour activer les alertes sur un hébergement HTTPS :

1. Exécute `composer install --no-dev --prefer-dist` dans le projet et
   déploie aussi le dossier `vendor/`. Active `mbstring`, `curl`, `openssl`
   et `pdo_sqlite` pour PHP web et PHP CLI.
2. Génère une paire de clés VAPID une fois, hors de la racine web.
   ```sh
   php -r 'require "vendor/autoload.php"; print_r(Minishlink\WebPush\VAPID::createVapidKeys());'
   ```
3. Configure `LORR_PUSH_PUBLIC_KEY`, `LORR_PUSH_PRIVATE_KEY` et
   `LORR_PUSH_SUBJECT` dans l’environnement de PHP web.
   Utilise une adresse de contact au format `mailto:contact@example.org`
   pour `LORR_PUSH_SUBJECT`. Conserve la même paire entre les déploiements.
   Garde la clé privée et la base SQLite hors de la racine web.
4. Donne à PHP web le droit de lire et d’écrire dans `LORR_STATS_DIR`
   et `LORR_PLANNING_CACHE_DIR` si ces dossiers sont configurés.

LorR compare chaque nouvelle lecture d’Hyperplanning aux relevés des personnes
qui suivent la formation. Il utilise le relevé déjà en cache comme référence
initiale si celui-ci est disponible. Une consultation ultérieure permet aussi
de retenter les envois en attente. Lorsqu’aucune visite ne déclenche de lecture,
les changements attendent la prochaine actualisation du planning.

Avec le Terminal LWS, tu peux remplacer les étapes 2 et 3 par
`php server/planning-push-worker.php --init`, depuis le dossier de LorR.
La commande conserve les clés existantes et enregistre les nouvelles clés
dans le stockage privé de LorR. Si tu définis `LORR_STATS_DIR`, utilise le
même dossier dans le Terminal et dans PHP web.

## Statistiques et soutien

- [Statistiques](https://lorr.corentinl5.be/stats) présente l’activité récente, les réponses d’horaires, le cache, les calendriers iCal et les liens courts. L’historique compare les périodes de 7, 14 ou 30 jours terminés. Tu peux télécharger les valeurs par jour au format CSV.
- [Soutenir](https://lorr.corentinl5.be/soutenir) permet de proposer une idée ou d’offrir un café.

## Documents du dépôt

| Fichier | Contenu |
| --- | --- |
| [README.md](README.md) | Utilisation, avertissements et déploiement |
| [HOWITWORKS.md](HOWITWORKS.md) | Architecture, diagrammes UML et parcours dans le code |
| [AUTORISATION.md](AUTORISATION.md) | Accès invité, collecte des horaires et conditions de réutilisation |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Étapes pour travailler avec Corentin dans le dépôt |
| [SECURITY.md](SECURITY.md) | Canal privé pour signaler une faille |
| [LICENSE](LICENSE) | Droits sur le code et la documentation |

## Droits sur le code

Tous droits réservés. Pour contribuer, travaille avec Corentin Lallement
dans le dépôt d’origine. Pour republier le code ou héberger une autre
version de LorR, demande son autorisation écrite. Les versions déjà
distribuées sous licence MIT conservent cette licence. [Conditions complètes](LICENSE)
