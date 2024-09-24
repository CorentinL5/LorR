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
}

function msToTime(duration, display = "short") {
    let milliseconds = ((duration % 1000) / 100)
        , seconds = ((duration / 1000) % 60)
        , minutes = ((duration / (1000 * 60)) % 60)
        , hours = ((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;
    if (display === "short") {
        return hours + "h" + minutes;
    } else {return hours + ":" + minutes + ":" + seconds + "." + milliseconds;}

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
    const formattedStartDate = startDate.toLocaleString('belgium', { hour: '2-digit', minute: '2-digit' });
    const formattedEndDate = endDate.toLocaleString('belgium', { hour: '2-digit', minute: '2-digit' });
    let summary = event.summary;
    let location = event.location;
    /*let description = event.description;
    if (description == null && summary != null) {
        description = summary
        color = "#808080"
    } else if (description == null && summary == null) {
        description = "Description non disponible"
    }*/


    // Format de l'identifiant : `day-YYYY-MM-DD`
    const calendarDayId = `day-${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}`;

    // Trouver la case du calendrier correspondant à la date
    const calendarDay = document.getElementById(calendarDayId);
    if (calendarDay) {
        // Supprimer la classe "empty" de la case du calendrier
        calendarDay.classList.remove('empty');

        // Créer un élément pour l'événement et l'ajouter à la case du calendrier
        const eventElement = document.createElement('div');
        eventElement.className = 'event';eventElement.innerHTML = `<span class="summary">${summary}</span><br> ${location || ''} <br> ${formattedStartDate} - ${formattedEndDate}`;
        eventElement.style.backgroundColor = color;
        calendarDay.appendChild(eventElement);
    }
}

// Fonction pour générer un calendrier structuré en semaines pour le mois en cours
function generateCalendar() {
    let currentWeek = document.createElement('div');
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = ''; // Vider le calendrier avant de le remplir
    const date = new Date();
    const currentYear = date.getFullYear();
    const currentMonth = date.getMonth(); // Mois actuel (0-11)
    const currentDate = date.getDate(); // Jour actuel (1-31)
    const currentDayOfWeek = (date.getDay() === 0) ? 7 : date.getDay(); // Jour de la semaine actuel (lundi=1, dimanche=7)

    // Calculer les dates pour la semaine précédente, actuelle et suivante
    const startDate = new Date(currentYear, currentMonth, currentDate - currentDayOfWeek - 6); // Début de la semaine précédente (lundi)
    const endDate = new Date(currentYear, currentMonth, currentDate + (7 - currentDayOfWeek) + 7); // Fin de la semaine suivante (dimanche)
    console.log(startDate, endDate);
    // Variables pour créer le calendrier
    let currentDay = new Date(startDate);

    // Générer les jours du calendrier de la semaine précédente à la suivante
    while (currentDay <= endDate) {
        // Commencer une nouvelle semaine chaque lundi
        if (currentDay.getDay() === 1 || calendar.lastChild === null) {
            currentWeek = document.createElement('div');
            currentWeek.className = 'week-row';
            calendar.appendChild(currentWeek);
        }

        // Créer l'élément du jour avec la date formatée
        const dayElement = document.createElement('div');
        dayElement.className = 'day empty';
        dayElement.id = `day-${currentDay.getFullYear()}-${(currentDay.getMonth() + 1)}-${currentDay.getDate()}`;
        if (currentDay.getDate() === currentDate) {
            dayElement.classList.add('today');
        }
        const dayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][currentDay.getDay()];
        const formattedDate = `${dayName} ${currentDay.getDate().toString().padStart(2, '0')}/${(currentDay.getMonth() + 1).toString().padStart(2, '0')}/${currentDay.getFullYear().toString().slice(-2)}`;
        dayElement.innerHTML = `<strong>${formattedDate}</strong>`;

        // Ajouter la classe "old" si la date est passée
        if (currentDay < date.setHours(0, 0, 0, 0)) {
            dayElement.classList.add('old');
        }

        currentWeek.appendChild(dayElement);

        // Passer au jour suivant
        currentDay.setDate(currentDay.getDate() + 1);
    }

    // ajoute un bouton pour aller au jour actuel
    const currentDayElement = `day-${currentYear}-${currentMonth + 1}-${currentDate}`;
    const todayButton = document.createElement('a');
    todayButton.className = 'today-button';
    todayButton.href = `#${currentDayElement}`
    todayButton.innerHTML = 'Aujourd\'hui';
    if (calendar && calendar.parentNode) {
        calendar.parentNode.insertBefore(todayButton, calendar);
    } else {
        console.error('Impossible de trouver le parent du calendrier.');
    }
}


// Récupère les informations de l'URL
let params = new URLSearchParams(window.location.search);
const calendar_group = params.get('calendar_group') || showCustomAlert("Aucun calendrier spécifié._nl_Veuillez sélectionner un groupe.");
const calendar_display = params.get('display');


generateCalendar(calendar_display);
loadICSFile(calendar_group).then(() => console.log('Calendrier chargé avec succès!'));

