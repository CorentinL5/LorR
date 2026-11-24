# LorR

LorR crée ton emploi du temps étudiant à partir de l’espace invité public
d’Hyperplanning. Tu choisis tes formations et tes cours, puis tu retrouves ton
planning avec un lien. Tu peux utiliser LorR sans compte.

[Ouvrir LorR](https://lorr.corentinl5.be/)

<img src="./assets/planning-hero.svg" alt="Agenda illustré LorR" width="360">

## Créer un planning

1. Colle le lien de l’espace invité de ton établissement. Il se termine
   par `/invite`. [Exemple HEH](https://hehplanning2026.umons.ac.be/invite)
2. Choisis tes formations. Tu peux ajouter un autre lien invité si nécessaire.
3. Choisis tes groupes, puis coche les cours que tu suis. LorR sélectionne
   aussi les jours fériés et les vacances signalés par Hyperplanning.
4. Clique sur **Créer mon emploi du temps** pour consulter toutes les
   semaines publiées. Sélectionne la vue **Mois**, **Semaine** ou **Liste**.

Ouvre le lien invité de ton établissement.
[HEH](https://hehplanning2026.umons.ac.be/invite),
[HECh](http://hpl.hech.be:62080/hp/invite),
[IHECS](https://ihecs-prod.pronote-campus.net/hp/invite) et
[HEAJ](https://heaj-2627.pronote-campus.net/hp/invite).

Clique sur une séance pour voir ses détails. **Enregistrer** garde ton planning
sur cet appareil. Depuis l’accueil, **Reprendre ma sélection** rouvre ton
brouillon. Dans **Partager / Télécharger**, **Copier mon lien** permet d’ouvrir ton planning
sur un autre appareil.

> [!NOTE]
> Si LorR ne peut pas créer de lien court, il copie le lien complet.
> Les deux liens donnent accès à ta sélection de formations et de cours.

> [!IMPORTANT]
> Si Hyperplanning répond lentement ou reste indisponible, LorR peut afficher
> les derniers horaires disponibles. Vérifie la date de récupération et
> confirme les changements de dernière minute sur Hyperplanning.

## Exporter ou installer LorR

Dans **Partager / Télécharger**, choisis la façon d’ajouter ton planning.

- **Copier le lien d’abonnement iCal** donne un lien à ajouter comme abonnement.
  L’abonnement suit les horaires publiés pour les cours choisis et inclut tous les
  congés disponibles pour tes formations. Ton application fixe la fréquence des
  mises à jour. Si tu modifies tes choix dans LorR, copie un nouveau lien.
- **Télécharger le fichier .ics** exporte les séances sélectionnées et les
  repères visibles au moment du téléchargement.

> [!WARNING]
> **Horaires non actualisés via ICS.** Le fichier contient les horaires
> disponibles au moment de l’export. Tu utilises le fichier à tes risques.
> Confirme tes horaires sur Hyperplanning ou dans LorR.

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
| `LORR_SUPPORT_URL` | Lien HTTPS Revolut.me ou Ko-fi |

En local, `var/support-url.txt` peut fournir le lien de soutien si la
variable `LORR_SUPPORT_URL` est absente. Git ignore ce fichier.

## Statistiques et soutien

- [Statistiques](https://lorr.corentinl5.be/stats) affiche les compteurs publics.
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
