// navigation.js
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
