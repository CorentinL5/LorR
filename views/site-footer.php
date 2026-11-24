<footer class="site-footer shell">
    <p>Par un étudiant pour des étudiants</p>
    <?php if ($route !== '/soutenir'): ?>
        <p class="footer-support"<?= $route === '/' ? ' id="proposer-une-idee"' : '' ?>>
            <a class="text-button" href="soutenir">Soutenir LorR</a>
        </p>
    <?php endif; ?>
    <button id="install-app" type="button" class="text-button" aria-controls="install-guide" hidden>Installer LorR</button>
    <p id="install-guide" hidden>Dans Safari, touche « Partager », puis « Sur l’écran d’accueil ». Active « Ouvrir comme app web » si l’option apparaît.</p>
</footer>
