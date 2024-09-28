// Fonction récursive pour afficher la hiérarchie du JSON et générer le formulaire
function displayJSON(parentKey, obj, container, form) {
    Object.entries(obj).forEach(([key, value]) => {
        // Créer une div pour contenir le niveau actuel
        const div = document.createElement('div');

        // Nom de la clé actuelle, construit avec le parent pour garder la hiérarchie
        const fullKey = parentKey ? `${parentKey}_${key}` : key;

        // Vérifier si la valeur est une URL (string)
        if (typeof value === 'string' && value.startsWith('http')) {
            // Créer un lien avec le nom complet
            const linkText = makeTextBetter(key);

            // Créer une checkbox pour chaque lien
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = `calendar.html?calendar_group=${fullKey}`;
            checkbox.id = fullKey;

            // Créer un label pour la checkbox
            const label = document.createElement('label');
            label.htmlFor = fullKey;
            label.textContent = linkText;

            // Ajouter la checkbox et le label au div
            div.appendChild(checkbox);
            div.appendChild(label);
        } else if (typeof value === 'object') {
            // Appel récursif pour les objets imbriqués
            const header = document.createElement('strong');
            header.textContent = makeTextBetter(key);
            div.appendChild(header);
            displayJSON(fullKey, value, div, form);
        } else {
            // Cas non attendu (non URL et non objet)
            div.textContent = `${key}: ${value}`;
        }

        // Ajouter l'élément créé au conteneur parent
        container.appendChild(div);
        form.appendChild(container); // Ajouter le div au formulaire
    });
}

function capitalizeEachWord(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
}

function makeTextBetter(str) {
    return capitalizeEachWord(str.replaceAll("-", " ").replaceAll("_", " ")).replaceAll(" En ", " en ").replaceAll(" Et ", " et ");
}

// Chargement du fichier JSON avec fetch
fetch('./ics/ics.json')
    .then(response => {
        if (!response.ok) {
            throw new Error('Erreur lors du chargement du fichier JSON');
        }
        return response.json();
    })
    .then(data => {
        // Trouver l'élément <main> ou fallback sur <body>
        const main = document.querySelector('main') || document.body;

        // Créer un formulaire pour contenir les choix
        const form = document.createElement('form');
        form.id = 'linkForm';

        // Créer une div pour contenir les choix
        const divChoices = document.createElement('div');
        divChoices.id = 'formChoices';
        // Appel initial avec les données JSON et le formulaire
        displayJSON('', data, divChoices, form);

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
            } else if (selectedLinks.length === 1) {
                window.location.href = selectedLinks[0];
            } else if (selectedLinks.length > 1) {
                showCustomAlert('Veuillez sélectionner un seul cours <br>Cette fonctionnalité n\'est pas encore disponible');
            } else {
                showCustomAlert('Woaw ! <br>Une erreur inconnue est survenue');
            }
        });

        // Ajouter le formulaire à la page
        main.appendChild(form);
    })
    .catch(error => {
        console.error('Erreur lors du chargement du fichier JSON:', error);
    });
