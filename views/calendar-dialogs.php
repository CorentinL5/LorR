<dialog id="session-detail" class="session-detail" aria-labelledby="session-title">
    <header class="panel-header">
        <h2 id="session-title"></h2>
        <form method="dialog">
            <button type="submit" class="button button-light" aria-label="Fermer" autofocus>×</button>
        </form>
    </header>
    <dl id="session-info"></dl>
</dialog>
<dialog id="day-detail" class="session-detail" aria-labelledby="day-title">
    <header class="panel-header">
        <h2 id="day-title"></h2>
        <form method="dialog">
            <button type="submit" class="button button-light" aria-label="Fermer" autofocus>×</button>
        </form>
    </header>
    <div id="day-sessions"></div>
    <div id="day-actions" class="day-actions" hidden>
        <button id="copy-day" type="button" class="button button-light">Copier les horaires et salles</button>
        <p id="copy-day-status" class="status" role="status"></p>
        <label id="copy-day-fallback" hidden>
            Résumé de la journée
            <textarea id="copy-day-text" rows="5" readonly></textarea>
        </label>
    </div>
</dialog>
