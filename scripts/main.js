// main.js

// Événement DOMContentLoaded pour afficher le header et le footer
document.addEventListener('DOMContentLoaded', function () {
    // Créer le header
    const header = document.createElement('header');
    header.classList.add('header');

    // Créer le titre
    const title = document.createElement('h1');
    title.innerHTML = '<a href=".">LorR</a>';
    title.classList.add('title');

    // Créer la navigation
    const nav = document.createElement('nav');
    nav.innerHTML = `
        <ul class="nav-list">
            <li><a href="https://github.com/CorentinL5/LorR" target="_blank" rel="noreferrer noopener" class="nav-link">Github</a></li>
        </ul>
    `;

    // Ajouter le titre et la navigation au header
    header.appendChild(title);
    header.appendChild(nav);

    // Créer le footer
    const footer = document.createElement('footer');
    footer.classList.add('footer');
    footer.innerHTML = `
        <p>&copy; 2024 LorR</p>
    `;


    // Insérer le header dans le body
    document.body.prepend(header);

    // Insérer le footer dans le body
    document.body.appendChild(footer);

    // ajouter le css du header et du footer au head
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'styles/navigation.css';
    document.head.appendChild(link);
});

// Fonction pour charger et parser le fichier ICS
async function loadICSFile(f_toload) {
    let icsText;
    try {
        const response = await fetch('ics/ics_files/' + f_toload + '.ics');
        icsText = await response.text();

        // Utiliser ical.js pour parser l'ICS
        const jcalData = ICAL.parse(icsText);
        const comp = new ICAL.Component(jcalData);
        const events = comp.getAllSubcomponents('vevent');

        // Récupérer les événements, les trie et les ajoute au calendrier
        events.sort((a, b) => {
            const eventA = new ICAL.Event(a);
            const eventB = new ICAL.Event(b);
            return eventA.startDate.toJSDate() - eventB.startDate.toJSDate();
        });
        return events;
    }
    catch (error) {
        console.error('Erreur lors du chargement du fichier ICS:', error);
        showCustomAlert("Le Calendrier n'a pas pu être chargé complétement.");
    }
}

// Fonction pour capitaliser chaque mot d'une chaîne de caractères
function capitalizeEachWord(str) {
    return str
        .startsWith(".") ? str.slice(1) : str // Supprimer le point au début
        .toLowerCase() // On commence par mettre tout en minuscule
        .trim() // Supprimer les espaces de début et de fin
        .replace(/\s+/g, ' ') // Remplacer les espaces multiples par un seul espace
        .replace(/(^|\s)\S/g, l => l.toUpperCase()); // Capitaliser chaque mot
}

function makeTextBetter(str) {
    return capitalizeEachWord(str.replaceAll("-", " ").replaceAll("_", " ")).replaceAll(" En ", " en ").replaceAll(" Et ", " et ");
}

// Fonction récursive pour afficher la hiérarchie du JSON et générer le formulaire
function displayJSON(parentKey, obj, container, form, checked) {
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
                checkbox.value = `${fullKey}`;
                checkbox.id = fullKey;
                checkbox.checked = checked;
                if (fullKey.toLowerCase().endsWith("vacances") || fullKey.toLowerCase().endsWith("férié")) {
                    div.style.display = "none";
                }




            // Créer un label pour la checkbox
            const label = document.createElement('label');
            label.htmlFor = fullKey;
            label.textContent = linkText.replace('Summary ', '');

            // Ajouter la checkbox et le label au div
            div.appendChild(checkbox);
            div.appendChild(label);
        } else if (typeof value === 'object') {
            // Appel récursif pour les objets imbriqués
            const header = document.createElement('strong');
            header.textContent = makeTextBetter(key);
            div.appendChild(header);
            displayJSON(fullKey, value, div, form, checked);
        } else {
            // Cas non attendu (non URL et non objet)
            div.textContent = `${key}: ${value}`;
        }

        // Ajouter l'élément créé au conteneur parent
        container.appendChild(div);
        form.appendChild(container); // Ajouter le div au formulaire
    });
}