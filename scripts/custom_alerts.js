// Fonction pour afficher une alerte personnalisée
function showCustomAlert(message) {
    getUrl = new URL(window.location.href);
    if (getUrl.searchParams.has('noalert')) { return;}

    // Create the alert container
    const alertBox = document.createElement('div');
    alertBox.style.position = 'fixed';
    alertBox.style.top = '20px';
    alertBox.style.left = '50%';
    alertBox.style.transform = 'translateX(-50%)';
    alertBox.style.backgroundColor = '#f44336'; // Red color for alert
    alertBox.style.color = 'white';
    alertBox.style.padding = '15px';
    alertBox.style.borderRadius = '5px';
    alertBox.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
    alertBox.style.zIndex = '1000';
    alertBox.style.display = 'flex';
    alertBox.style.alignItems = 'center';
    alertBox.style.justifyContent = 'space-between';
    alertBox.style.minWidth = '300px';

    // Add the alert message
    const alertMessage = document.createElement('span');
    alertMessage.innerHTML = message.replace('_nl_', '<br>');
    alertMessage.style.textAlign = 'center';

    alertBox.appendChild(alertMessage);

    // Create a close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '16px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.marginLeft = '15px';
    closeButton.style.transform = 'scale(2)';

    // Add a scale transition on hover
    closeButton.style.transition = 'transform 0.2s';
    closeButton.onmouseover = function () {
        closeButton.style.transform = 'scale(2.6)';
        closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
    };
    closeButton.onmouseout = function () {
        closeButton.style.transform = 'scale(2)';
        closeButton.style.color = 'white';
    };
    closeButton.onclick = function () {
        remove_alertbox(alertBox);
    };


    alertBox.appendChild(closeButton);

    // Append the alert box to the body
    document.body.appendChild(alertBox);

    // Automatically remove the alert after 5 seconds
    setTimeout(() => {
        remove_alertbox(alertBox);
    }, 5000);
}

// Fonction pour supprimer l'alerte
function remove_alertbox(alertBox) {
    // remove the alert after a nice slide animation
    alertBox.style.transition = 'transform 0.5s, opacity 0.5s';
    alertBox.style.transform = 'translateY(-100%)';
    alertBox.style.transform = 'translateX(-25%)';
    alertBox.style.opacity = '0';
    setTimeout(() => {
        alertBox.remove();
    }, 500);
}

// Vérifie si l'URL contient un paramètre 'alert' et affiche l'alerte
let getUrl = new URL(window.location.href);
if (getUrl.searchParams.has('alert') && !getUrl.searchParams.has('noalert')) {
    const alertMessage = getUrl.searchParams.get('alert');
    getUrl.searchParams.delete('alert');
    window.history.replaceState({}, '', getUrl);
    // faire showCustomAlert dans le DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
        showCustomAlert(alertMessage);
    });

}
