<section id="current-sessions" class="current-sessions" aria-labelledby="current-sessions-title" hidden>
    <h3 id="current-sessions-title">Cours en cours</h3>
    <ul id="current-sessions-list"></ul>
</section>
<section id="upcoming-session" class="upcoming-session" aria-labelledby="upcoming-title" hidden>
    <div>
        <h3 id="upcoming-title">Prochain cours</h3>
        <p id="upcoming-detail"></p>
        <p id="upcoming-countdown" class="upcoming-countdown" hidden></p>
    </div>
    <button id="upcoming-open" type="button" class="button button-light">Voir la séance</button>
</section>
<section id="schedule-conflicts" class="schedule-conflicts" aria-labelledby="schedule-conflicts-title" hidden>
    <h3 id="schedule-conflicts-title">Cours qui se chevauchent</h3>
    <p class="schedule-conflict-period">Aujourd’hui et les six prochains jours</p>
    <ul id="schedule-conflict-days"></ul>
</section>
<div id="display-formation-filter" class="choice-filter display-formation-filter" hidden>
    <label for="display-formation">Formations à afficher</label>
    <select id="display-formation" aria-describedby="display-formation-scope"></select>
    <p id="display-formation-scope">Ce filtre s’applique au calendrier et à la recherche.</p>
</div>
<details id="schedule-search" class="schedule-search" hidden>
    <summary>Rechercher dans mon planning</summary>
    <div class="choice-filter">
        <label for="schedule-search-query">Rechercher une séance</label>
        <input id="schedule-search-query" type="search" placeholder="Ex. algèbre A12" autocomplete="off">
    </div>
    <p id="schedule-search-status" role="status"></p>
    <ul id="schedule-search-results" aria-label="Séances trouvées"></ul>
    <button id="schedule-search-more" type="button" class="button button-light" hidden>Afficher plus de séances</button>
</details>
<div id="view-options" class="planning-display" hidden>
    <div class="view-options" role="group" aria-label="Affichage du planning">
        <button type="button" data-view="month" aria-pressed="false">Mois</button>
        <button type="button" data-view="week" aria-pressed="false">Semaine</button>
        <button type="button" data-view="list" aria-pressed="false">Liste</button>
    </div>
    <label id="past-sessions-option" class="later-notices-option" hidden>
        <input id="show-past-sessions" type="checkbox">
        Afficher les séances passées
    </label>
    <?php if (empty($teacherCalendar)): ?>
    <label class="later-notices-option">
        <input id="include-later-notices" type="checkbox">
        Afficher les congés après mon dernier cours
    </label>
    <?php endif; ?>
</div>
<form id="calendar-date-form" class="calendar-date-form" hidden>
    <div>
        <label for="calendar-date">Aller à une date</label>
        <input id="calendar-date" type="date" max="9999-12-31" required>
    </div>
    <button type="submit" class="button button-light" aria-haspopup="dialog">Voir ce jour</button>
</form>
<div id="calendar-frame">
    <div id="calendar-tools" class="calendar-tools" hidden>
        <button id="calendar-previous" type="button" class="button button-light" aria-label="Période précédente">←</button>
        <p id="calendar-period" aria-live="polite" tabindex="-1"></p>
        <button id="calendar-next" type="button" class="button button-light" aria-label="Période suivante">→</button>
    </div>
    <div id="planning-days"></div>
</div>
<details id="schedule-gaps" class="schedule-gaps" hidden>
    <summary id="schedule-gaps-title">Créneaux libres entre tes cours</summary>
    <p>Au moins 30 min libres entre deux cours, aujourd’hui et dans les six prochains jours.</p>
    <ul id="schedule-gap-list"></ul>
</details>
