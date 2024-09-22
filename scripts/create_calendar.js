//mettre l'info dans l'url lors d'un clic sur un bouton
function addInfoToURL(param, info) {
    const url = new URL(window.location.href);
    url.searchParams.set(param, info);
    window.history.replaceState({}, '', url);
    params = new URLSearchParams(window.location.search);
    console.log(params.get('display'))
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
            addEventToCalendar(vevent);
        });
    }
    catch (error) {
        console.error('Erreur lors du chargement du fichier ICS:', error);
        window.location.href = "index.html?alert=Le Calendrier n'a pas pu être chargé.";
    }
}

// Fonction pour ajouter un événement au calendrier
function addEventToCalendar(event) {
    const startDate = event.startDate.toJSDate();
    const summary = event.summary;
    const location = event.location;

    // Format de l'identifiant : `day-YYYY-MM-DD`
    const calendarDayId = `day-${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}`;

    // Trouver la case du calendrier correspondant à la date
    const calendarDay = document.getElementById(calendarDayId);
    if (calendarDay) {
        const eventElement = document.createElement('div');
        eventElement.className = 'event';
        eventElement.innerHTML = `${summary} - ${location} (${startDate.toLocaleDateString()})`;
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
const calendar_group = params.get('calendar_group') || (window.location.href = "index.html?alert=Aucun calendrier spécifié._nl_Veuillez sélectionner un groupe.");
const calendar_display = params.get('display');

// Générer le calendrier et charger les événements
generateCalendar(calendar_display);
loadICSFile(calendar_group).then(() => console.log('Calendrier chargé avec succès!'));
