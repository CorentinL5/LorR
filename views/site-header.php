<a class="skip-link" href="#contenu">Aller au contenu</a>
<header class="site-header shell">
    <a class="brand" href="./" aria-label="LorR, accueil">
        <span class="brand-mark" aria-hidden="true">✦</span>
        LorR<span class="brand-dot" aria-hidden="true">.</span>
    </a>
    <nav class="site-nav" aria-label="Navigation principale">
        <a id="go-home" href="./"<?= $route === '/' ? ' aria-current="page"' : '' ?>>Accueil</a>
        <a href="planning"<?= $route === '/planning' ? ' aria-current="page"' : '' ?>>Planning</a>
        <a href="mes-donnees"<?= $route === '/mes-donnees' ? ' aria-current="page"' : '' ?>>Mes données</a>
        <a href="stats"<?= $route === '/stats' ? ' aria-current="page"' : '' ?>>Statistiques</a>
        <a href="soutenir"<?= $route === '/soutenir' ? ' aria-current="page"' : '' ?>>Soutenir</a>
    </nav>
</header>
