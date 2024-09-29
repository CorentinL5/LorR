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
                window.location.href = `calendar.html?calendar_group=${selectedLinks[0]}`;
            } else if (selectedLinks.length > 3) {
                showCustomAlert('Trop de cours sélectionnés');
            } else if (selectedLinks.length > 1) {
                window.location.href = `lessons.html?calendar_group=${selectedLinks.join(',')}`;
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
