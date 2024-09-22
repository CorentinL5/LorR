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
        // Boucle sur chaque clé de l'objet JSON
        let calendar_group;
        for (const [key, value] of Object.entries(data)) {
            // Vérifie si 'groupes' est rempli
            if (Object.keys(value.groupes).length > 0) {
                // Créer un élément h3 et l'ajouter au DOM
                const header = document.createElement('h3');
                header.textContent = `Groupes pour ${key} :`;
                main.appendChild(header);

                // Créer les liens pour chaque groupe
                for (const [groupName] of Object.entries(value.groupes)) {
                    calendar_group = `${(key + "_" + groupName).replace(" ", "_")}`;
                    const link = document.createElement('a');
                    link.href = `calendar.html?calendar_group=${calendar_group}&display=Daily`;
                    link.textContent = groupName;
                    main.appendChild(link);

                    // Ajouter un saut de ligne après chaque lien
                    main.appendChild(document.createElement('br'));
                }
            } else {
                // Créer un paragraphe indiquant l'absence de groupes
                const paragraph = document.createElement('p');
                paragraph.textContent = `Pas de groupes disponibles pour ${key}.`;
                main.appendChild(paragraph);
            }
        }
    })
    .catch(error => {
        console.error('Erreur lors du chargement du fichier JSON:', error);
    });
