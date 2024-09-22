const json_colors = {
    "light": [
        "#ff5871", "#ee6291", "#c47ecd", "#9f7fcf", "#818cce", "#5db4f3", "#56c7f9", "#66d7e6", "#7ec9c5", "#84ca8a",
        "#abd57b", "#dae66b", "#eeda00", "#ffd651", "#ffbb50", "#e6776b", "#b3a097", "#afafaf", "#9aaab4", "#ff4356"
    ],
    "dark": [
        "#263238", "#212121", "#37474F", "#1C313A", "#004D40", "#3E2723", "#BF360C", "#4A148C", "#880E4F", "#311B92",
        "#0D47A1", "#01579B", "#006064", "#1B5E20", "#33691E", "#827717", "#F57F17", "#E65100", "#4E342E", "#5D4037"
    ]
}
const colorCache = {};

//mettre l'info dans l'url lors d'un clic sur un bouton
function addInfoToURL(param, info) {
    const url = new URL(window.location.href);
    url.searchParams.set(param, info);
    window.history.replaceState({}, '', url);
    params = new URLSearchParams(window.location.search);
    console.log(params.get('display'))
}

// Fonction simple de hachage pour obtenir un index unique basé sur une chaîne
function hashStringToIndex(str, max) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 4) - hash);
        hash = hash & hash; // Convertit en 32 bits
    }
    return Math.abs(hash) % max;
}

// Fonction pour attribuer une couleur à un événement
function assignColor(vevent) {
    // Obtient le résumé de l'événement
    const vevent_summary = vevent.summary;
    let color;

    // Vérifie si une couleur a déjà été assignée à ce résumé
    if (vevent_summary in colorCache) {
        color = colorCache[vevent_summary]; // Utilise la couleur déjà assignée
    } else {
        // Génère un index basé sur le résumé pour choisir une couleur
        const index = hashStringToIndex(vevent_summary, json_colors.light.length);
        color = json_colors.light[index]; // Sélectionne une couleur basée sur l'index

        // Enregistre la couleur dans le cache pour ce résumé
        colorCache[vevent_summary] = color;
    }

    // Retourne la couleur assignée pour l'événement
    return color;
}

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

        // Récupérer les événements et les ajouter au calendrier
        events.forEach(event => {
            const vevent = new ICAL.Event(event);
            addEventToCalendar(vevent, assignColor(vevent));
        });
    }
    catch (error) {
        console.error('Erreur lors du chargement du fichier ICS:', error);
        showCustomAlert("Le Calendrier n'a pas pu être chargé complétement,_nl_Veuillez réessayer ou Re-choisissez votre groupe.");
    }
}

// Fonction pour ajouter un événement au calendrier
function addEventToCalendar(event ,color) {
    const startDate = event.startDate.toJSDate();
    const endDate = event.endDate.toJSDate();
    const formattedStartDate = startDate.toLocaleString('belgium');
    const formattedEndDate = endDate.toLocaleString('belgium');
    let summary = event.summary;
    let description = event.description;
    if (description == null && summary != null) {
        description = summary
        color = "#808080"
    } else if (description == null && summary == null) {
        description = "Description non disponible"
    }


    // Format de l'identifiant : `day-YYYY-MM-DD`
    const calendarDayId = `day-${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}`;

    // Trouver la case du calendrier correspondant à la date
    const calendarDay = document.getElementById(calendarDayId);
    if (calendarDay) {
        const eventElement = document.createElement('div');
        eventElement.className = 'event';
        eventElement.innerHTML = `${description}<ul><li> -${formattedStartDate}</li> <li> -${formattedEndDate}</li></ul>`;
        eventElement.style.backgroundColor = color;
        calendarDay.appendChild(eventElement);
    }
}

// Fonction pour générer un calendrier structuré en semaines pour le mois en cours
function generateCalendar(calendar_display = "daily") {
    calendar_display = calendar_display.toLowerCase();
    console.log(calendar_display);
    const calendar = document.getElementById('calendar');
    const date = new Date();
    const currentYear = date.getFullYear();
    const currentMonth = date.getMonth(); // Mois actuel (0-11)

    // Détermine le nombre de jours dans le mois
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Détermine le jour de la semaine du premier jour du mois (0 = Dimanche, 1 = Lundi, ...)
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

    // Ajustement pour commencer le calendrier du lundi (si dimanche, mettre à 7 pour aligner sur le lundi)
    const startDay = (firstDayOfMonth === 0) ? 7 : firstDayOfMonth;

    // Créer les en-têtes de jours de la semaine
    const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const headerRow = document.createElement('div');
    headerRow.className = 'week-row';
    daysOfWeek.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.textContent = day;
        headerRow.appendChild(dayHeader);
    });
    calendar.appendChild(headerRow);

    // Variables pour créer le calendrier
    let currentDay = 1;
    let currentWeek = document.createElement('div');
    currentWeek.className = 'week-row';

    // Remplir les jours vides avant le début du mois
    for (let i = 1; i < startDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'day empty';
        currentWeek.appendChild(emptyDay);
    }

    // Générer les jours du mois
    while (currentDay <= daysInMonth) {
        if (currentWeek.children.length === 7) {
            calendar.appendChild(currentWeek);
            currentWeek = document.createElement('div');
            currentWeek.className = 'week-row';
        }

        const dayElement = document.createElement('div');
        dayElement.id = `day-${currentYear}-${currentMonth + 1}-${currentDay}`;
        dayElement.className = 'day';
        dayElement.innerHTML = `<strong>${currentDay}</strong>`;
        currentWeek.appendChild(dayElement);

        currentDay++;
    }

    // Remplir les jours vides à la fin du mois pour compléter la dernière semaine
    while (currentWeek.children.length < 7) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'day empty';
        currentWeek.appendChild(emptyDay);
    }

    // Ajouter la dernière semaine au calendrier
    calendar.appendChild(currentWeek);
}


// Récupère les informations de l'URL
let params = new URLSearchParams(window.location.search);
const calendar_group = params.get('calendar_group') || showCustomAlert("Aucun calendrier spécifié._nl_Veuillez sélectionner un groupe.");
const calendar_display = params.get('display');



generateCalendar(calendar_display);
loadICSFile(calendar_group).then(() => console.log('Calendrier chargé avec succès!'));

