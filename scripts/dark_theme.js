// Événement DOMContentLoaded pour exécuter le script une fois que le document est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Création du bouton pour activer/désactiver le thème sombre
    const darkThemeButton = document.createElement('button');
    darkThemeButton.id = 'dark-theme-button';
    darkThemeButton.innerHTML = `<i class="fa-solid fa-moon"></i>`;
    darkThemeButton.classList.add('dark-theme-toggle');
    darkThemeButton.addEventListener('click', toggleTheme);

    document.body.prepend(darkThemeButton);

    // Vérifie l'état du thème dans le sessionStorage et applique le thème approprié
    const theme = sessionStorage.getItem('theme') || 'light';
    applyTheme(theme);
});

// Fonction pour basculer entre les thèmes
function toggleTheme() {
    // Récupère le thème actuel et bascule entre 'dark' et 'light'
    const currentTheme = sessionStorage.getItem('theme') === 'dark' ? 'light' : 'dark';
    sessionStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
}

// Fonction pour appliquer le thème
function applyTheme(theme) {
    const darkThemeButton = document.getElementById('dark-theme-button');
    if (theme === 'dark') {
        document.body.classList.add('dark-theme'); // Ajoute une classe au body pour le thème sombre
        darkThemeButton.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme'); // Retire la classe pour le thème clair
        darkThemeButton.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

// Ajout d'un événement pour les liens
document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (event) => {
        alert(`Lien cliqué : ${link.href}`);
        event.preventDefault(); // Empêche le comportement par défaut si nécessaire
        console.log('Lien cliqué :', link.href);
        // Gérer ici toute autre logique si nécessaire pour les liens
    });
});
