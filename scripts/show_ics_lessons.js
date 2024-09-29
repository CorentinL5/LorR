let files_to_load;
try {
    files_to_load = new URLSearchParams(window.location.search).get('calendar_group');
    if (files_to_load) {
        files_to_load = files_to_load.split(',');
    }
} catch (error) {
    console.error('Erreur lors du chargement des groupes:', error);
    showCustomAlert("Erreur lors du chargement des groupes.");
}

// Trouver l'élément <main> ou fallback sur <body>
const main = document.querySelector('main') || document.body;

// Créer un formulaire pour contenir les choix
const form = document.createElement('form');
form.id = 'linkForm';

// Créer une div pour contenir les choix
const divChoices = document.createElement('div');
divChoices.id = 'formChoices';

let eventsJSON = {};  // Initialisation de l'objet global

let summaryList = [];  // Initialisation de la liste globale

// Charger et parser les fichiers ICS si files_to_load n'est pas vide
if (files_to_load && files_to_load.length > 0) {
    files_to_load.forEach(ics_file => {
        loadICSFile(ics_file).then(events => {
            // Vérifie si l'objet pour le fichier ICS n'existe pas encore
            if (!eventsJSON[ics_file]) {
                eventsJSON[ics_file] = {};  // Créer un objet pour chaque fichier ICS
            }

            events.forEach(event => {
                const vevent = new ICAL.Event(event);
                const summary = vevent.summary;
                if (!summaryList.includes(summary)) {
                    summaryList.push(summary);  // Ajoute chaque résumé d'événement à la liste globale
                    // Ajoute chaque résumé d'événement dans l'objet du fichier correspondant
                    eventsJSON[ics_file]["." + summary] = "https";
                }
            });

            // Affiche le JSON après chargement de chaque fichier
            console.log(`Événements pour ${ics_file}:`, eventsJSON[ics_file]);
            if (Object.keys(eventsJSON).length === files_to_load.length) {
                // Après avoir chargé tous les fichiers, afficher les choix
                displayJSON('', eventsJSON, divChoices, form);
            }
        }).catch(err => {
            console.error(`Erreur de chargement du fichier ${ics_file}:`, err);
            showCustomAlert(`Erreur de chargement du fichier ${ics_file}`);
        });
    });
} else {
    window.location.href = 'choices.html?alert=Choissisez un groupe ou plusieurs groupes';
}

// Ajouter un bouton pour soumettre les choix sélectionnés
const submitButton = document.createElement('button');
submitButton.type = 'submit';
submitButton.textContent = 'Valider le.s choix';
submitButton.id = 'submitChoices';
form.appendChild(submitButton);

// Ajouter un événement pour gérer la soumission du formulaire
form.addEventListener('submit', (event) => {
    event.preventDefault();
    const selectedLinks = Array.from(form.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
    if (selectedLinks.length === 0) {
        showCustomAlert('Aucun cours sélectionné');
    } else if (selectedLinks.length > 1) {
        window.location.href = `calendar.html?calendar_group=${selectedLinks[0]}`;
    } else {
        showCustomAlert('Woaw ! <br>Une erreur inconnue est survenue');
    }
});

// Ajouter le formulaire à la page
main.appendChild(form);
