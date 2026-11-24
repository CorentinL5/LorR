# LorR est-il autorisé ?

**L’espace Invités `/invite` de la HEH est public et accessible sans compte.**
LorR est un projet étudiant indépendant qui crée un planning personnel à
partir d’horaires publiés sur Hyperplanning, aussi appelé PRONOTE Campus.
Dans les sources publiques consultées, aucune règle ne tranche explicitement
la republication des horaires par LorR, y compris via iCal.

## Quels horaires LorR récupère-t-il ?

La HEH publie un lien vers ses horaires. Index Éducation permet à chaque
établissement de choisir les emplois du temps visibles dans l’espace Invités.
Il peut aussi protéger certaines pages par un mot de passe. LorR lit les pages
publiées de `/invite` en mode invité, sans demander d’identifiants de compte.
[Horaires de la HEH](https://www.heh.be/)
[Documentation de l’espace Invités](https://docs.index-education.com/docs_fr/fr-pronote-campus-support-fiche-236-881-parametrer-l-espace-invites.php)

Quand tu choisis des formations, LorR récupère leurs horaires par les appels
du lecteur invité. C’est une **collecte automatisée**, aussi appelée scraping.
Tu sélectionnes ensuite tes cours. LorR peut afficher le résultat, l’exporter
en `.ics` ou le servir sous forme d’abonnement iCal. La personne qui possède ton
lien peut accéder au planning correspondant. [Fonctionnement de LorR](HOWITWORKS.md)

## Que dit la notice sur les robots ?

La notice de l’instance HEH rattache la limitation des tentatives robotisées
à la sécurité de la connexion. La politique mobile décrit `CASTGC` comme un
cookie de session et `ielang` comme le cookie qui mémorise la langue. La
dispense de consentement mentionnée concerne le dépôt des cookies fonctionnels.
[Espace Invités de la HEH](https://hehplanning2026.umons.ac.be/invite)
[Politique de confidentialité de PRONOTE Campus](https://www.index-education.com/fr/article-3106-politique-confidentialite-espaces-pronote-campus.php)

Le `robots.txt` de l’instance HEH a renvoyé `404` lors de la vérification du
24 novembre 2026. [Vérifier le `robots.txt`](https://hehplanning2026.umons.ac.be/robots.txt)

## Le règlement de la HEH s’applique-t-il à LorR ?

La page 92 du règlement des études 2026–2027 prévoit une autorisation préalable
pour certains sites créés par des étudiants et consacrés à l’établissement, à
son personnel, à une classe ou à des étudiants. LorR est un outil de planning
pour Hyperplanning. Le fait qu’il utilise les horaires de la HEH ne suffit pas
à établir que le site lui est consacré. Ce passage ne mentionne pas
explicitement la republication d’horaires. [Règlement des études de la HEH, p. 92](https://www.heh.be/upload/pdf_perso/Reglement_des_Etudes_RDE_26-27.pdf#page=92)

La publication d’horaires sur Internet permet leur consultation. Le droit
sur une base de données dépend notamment des investissements consacrés à
l’obtention, à la vérification ou à la présentation de son contenu. Le droit
européen peut limiter la réutilisation d’une partie substantielle d’une base
protégée. Il encadre aussi certaines extractions répétées. Ces règles dépendent
de l’usage réel et de la base concernée.
[Directive 96/9/CE, art. 7 et 8](https://eur-lex.europa.eu/legal-content/FR/TXT/PDF/?uri=CELEX%3A31996L0009)
[CJUE, affaire C‑762/19](https://eur-lex.europa.eu/legal-content/FR/TXT/PDF/?uri=CELEX%3A62019CJ0762)

Si la source publie le nom d’un enseignant, LorR peut l’afficher et l’inclure
dans le fichier `.ics` et l’abonnement. Un nom reste une donnée personnelle
même quand il est public. Le RGPD exige notamment une base légale et un
traitement limité aux données nécessaires.
[RGPD, art. 4 à 6](https://eur-lex.europa.eu/legal-content/FR/TXT/?qid=1568382778842&uri=CELEX%3A32016R0679)

## Comment LorR limite-t-il les requêtes ?

Le créateur de planning et iCal partagent le même cache d’horaires de
**10 minutes**. LorR réalise une seule lecture à la fois par source. Le quota
permet deux démarrages rapprochés, puis regagne une lecture par minute. Si une
lecture est retardée ou échoue, LorR peut servir les dernières données mises
en cache depuis moins de sept jours. Ce réglage réduit la charge sur le
serveur de l’établissement. [Détails sur le cache et l’abonnement](HOWITWORKS.md)

Pour confirmer un changement de dernière minute, vérifie l’horaire publié par
ton établissement. [Horaires invités de la HEH](https://hehplanning2026.umons.ac.be/invite)
