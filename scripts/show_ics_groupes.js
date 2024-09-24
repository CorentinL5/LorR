// Fonction récursive pour afficher la hiérarchie du JSON
function displayJSON(parentKey, obj, container) {
    Object.entries(obj).forEach(([key, value]) => {
        // Créer une div pour contenir le niveau actuel
        const div = document.createElement('div');

        // Nom de la clé actuelle, construit avec le parent pour garder la hiérarchie
        const fullKey = parentKey ? `${parentKey}_${key}` : key;

        // Vérifier si la valeur est une URL (string)
        if (typeof value === 'string' && value.startsWith('http')) {
            // Créer un lien avec le nom complet
            const link = document.createElement('a');
            link.textContent = key;
            link.href = `calendar.html?calendar_group=${fullKey}`;
            div.appendChild(link);
        } else if (typeof value === 'object') {
            // Appel récursif pour les objets imbriqués
            const header = document.createElement('strong');
            header.textContent = capitalizeEachWord(key.replaceAll("-", " ")).replaceAll("En", "en");
            div.appendChild(header);
            displayJSON(fullKey, value, div);
        } else {
            // Cas non attendu (non URL et non objet)
            div.textContent = `${key}: ${value}`;
        }

        // Ajouter l'élément créé au conteneur parent
        container.appendChild(div);
    });
}

function capitalizeEachWord(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
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

        // Appel initial avec les données JSON et le conteneur
        displayJSON('', data, main);


    })
    .catch(error => {
        console.error('Erreur lors du chargement du fichier JSON:', error);
    });