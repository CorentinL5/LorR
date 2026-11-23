# LorR

LorR crée ton emploi du temps étudiant à partir de l’espace invité public
d’Hyperplanning. Tu choisis les formations et les cours que tu suis, puis tu
retrouves ton planning avec un lien. Aucun compte ni serveur de base de données n’est
nécessaire.

<img src="./assets/planning-hero.webp" alt="Agenda illustré LorR" width="360">

## Créer un planning

1. Colle le lien HTTPS de l’espace invité de ton établissement. Il se termine
   par `/invite`.
2. Choisis tes formations. Tu peux ajouter un autre établissement si nécessaire.
3. Filtre et coche tes cours. LorR regroupe les doublons et coche d’office les
   jours fériés et les vacances signalés par Hyperplanning.
4. Clique sur **Créer mon emploi du temps** pour afficher les séances sur
   toutes les semaines publiées.

Les étapes sont cliquables dès que les choix nécessaires sont faits.
**Enregistrer** garde le planning sur cet appareil et permet de le rouvrir
depuis l’accueil. **Copier mon lien** permet de le retrouver dans un autre
navigateur.

## Consulter les horaires

- **Liste** regroupe les séances par semaine.
- **Semaine** place les cours selon l’heure et la durée. Les cours simultanés
  sont côte à côte. Le sélecteur permet d’aller directement à une semaine.
- **Mois** affiche un aperçu des journées. Clique sur une date ou sur le
  nombre de séances supplémentaires pour voir le détail de la journée.

Chaque cours garde sa couleur pastel. Un clic sur une séance affiche ses
détails. Les périodes fériées ont un seul bloc dans la liste et la grille
semaine. La grille entière s’affiche dans la page, avec la même taille quand
tu changes de période ou de vue.

## Lancer LorR en local

Installe PHP 8.1 ou plus récent, Node.js 20 ou plus récent et npm. Exécute
ces commandes dans le dossier du projet.

```sh
npm ci
npm run install:browser
php -S 127.0.0.1:8000 index.php
```

Ouvre [l’accueil de LorR](http://127.0.0.1:8000/) puis clique sur **Créer mon planning**.

## Configurer le serveur

PHP doit pouvoir lancer Node.js et Chromium. Installe le navigateur avec
le compte qui exécute PHP ou renseigne `LORR_CHROMIUM_PATH` avec le chemin
de Chromium. Le lecteur utilise la fonction PHP `proc_open`. Vérifie que
ton offre LWS autorise cette fonction et l’exécution de Chromium. LWS
[documente des restrictions de `proc_open` sur les offres mutualisées](https://aide.lws.fr/base/Hebergement-web-mutualise/Programmation/Configurer-PHP).
Le routeur PHP sert l’accueil sur `/` et le créateur sur `/planning`.
Sur Apache, active le module `mod_rewrite` et autorise les règles du fichier
`.htaccess`.

Le domaine annuel de la HEH sur `umons.ac.be` est pris en charge. Pour ajouter
d’autres établissements, renseigne leurs noms de domaine exacts dans
`LORR_PLANNING_HOSTS`, séparés par des virgules. Le lecteur utilise les vues
publiques **Promotions** et **Emploi du temps en liste** de PRONOTE Campus.

LorR lit ensemble les formations d’un même établissement. Le serveur met en
cache les horaires pendant deux minutes et la liste des formations pendant
quinze minutes. Le navigateur réutilise les horaires encore frais dans le
même onglet.

## Statistiques publiques

La page `/stats` affiche les chargements de l’accueil, les ouvertures du
créateur et les demandes d’horaires. Elle présente les totaux et les
compteurs des sept derniers jours.

Les statistiques utilisent SQLite si PHP propose l’extension `pdo_sqlite`.
Quand cette extension est indisponible, LorR conserve les compteurs dans
un fichier JSON. Par défaut, ces fichiers sont placés dans `var/`. Donne
à PHP le droit d’écrire dans ce dossier ou choisis un dossier persistant
avec `LORR_STATS_DIR`. Le stockage contient uniquement des totaux et des dates.

## Licence

[Licence MIT](LICENSE)
