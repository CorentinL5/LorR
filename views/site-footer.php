<footer class="site-footer shell">
    <p>Par un étudiant pour des étudiants</p>
    <p class="footer-support"<?= $route === '/' ? ' id="proposer-une-idee"' : '' ?>>
        <?php if ($route !== '/soutenir'): ?>
            <a class="text-button" href="soutenir">Soutenir LorR</a>
            <span aria-hidden="true"> · </span>
        <?php endif; ?>
        <a class="text-button" href="https://github.com/CorentinL5/LorR/blob/master/AUTORISATION.md">LorR est-il autorisé ?</a>
    </p>
    <button id="install-app" type="button" class="text-button" aria-controls="install-guide" hidden>Installer LorR</button>
    <p id="install-guide" hidden>Dans Safari, touche « Partager », puis « Sur l’écran d’accueil ». Active « Ouvrir comme app web » si l’option apparaît.</p>
</footer>
