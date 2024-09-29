document.addEventListener('DOMContentLoaded', function () {
    // Crée l'élément de chargement
    const loadingElement = document.createElement('div');
    loadingElement.id = 'loading';
    loadingElement.style.position = 'fixed';
    loadingElement.style.top = '0';
    loadingElement.style.left = '0';
    loadingElement.style.width = '100%';
    loadingElement.style.height = '100%';
    loadingElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    loadingElement.style.color = 'white';
    loadingElement.style.display = 'flex';
    loadingElement.style.justifyContent = 'center';
    loadingElement.style.alignItems = 'center';
    loadingElement.style.fontSize = '20px';
    loadingElement.innerText = 'Chargement en cours...';

    // Ajoute l'élément au body
    document.body.appendChild(loadingElement);

    // Attends que la page soit entièrement chargée
    window.addEventListener('load', function () {
        // Cache et retire l'indicateur de chargement
        loadingElement.style.display = 'none';
        console.log('La page est complètement chargée !');
    });
});
