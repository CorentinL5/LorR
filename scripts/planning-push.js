const planningPushPanel = document.getElementById('planning-push');
const enablePlanningPush = document.getElementById('enable-planning-push');
const disablePlanningPush = document.getElementById('disable-planning-push');
const planningPushStatus = document.getElementById('planning-push-status');
const planningPushSupported = window.isSecureContext && 'PushManager' in window
    && 'Notification' in window && 'serviceWorker' in navigator;
let planningPushCode = null;
let subscribedPlanningCode = null;
let planningPushRegistration;
let planningPushNativeSubscription;
let planningPushKey;
let planningPushBusy = false;

function renderPlanningPush(message = '') {
    const eligible = Boolean(planningPushCode && planningPushKey);
    const installRequired = eligible && appleMobile && !installedApp;
    const canEnable = eligible && planningPushSupported && !installRequired && Boolean(planningPushRegistration);
    planningPushPanel.hidden = !installRequired && !canEnable && !subscribedPlanningCode && !message;
    enablePlanningPush.hidden = !canEnable || planningPushCode === subscribedPlanningCode;
    disablePlanningPush.hidden = !subscribedPlanningCode;
    enablePlanningPush.disabled = planningPushBusy;
    disablePlanningPush.disabled = planningPushBusy;
    enablePlanningPush.textContent = subscribedPlanningCode ? 'Suivre cette sélection' : 'M’avertir des changements';
    if (!planningPushBusy) {
        planningPushStatus.textContent = message || (installRequired
            ? 'Sur iPhone ou iPad, ajoute LorR à l’écran d’accueil, puis ouvre LorR pour activer les alertes.'
            : (subscribedPlanningCode
                ? (!planningPushCode || planningPushCode === subscribedPlanningCode
                    ? 'Alertes actives sur cet appareil.' : 'Les alertes suivent la sélection précédente.')
                : ''));
    }
}

function updatePlanningPush(code) {
    planningPushCode = code;
    renderPlanningPush();
}

async function planningPushRequest(action, subscription, code, testId) {
    const response = await fetch('api/planning/push', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action, subscription, code, testId}),
        credentials: 'omit',
    });
    if (!response.ok) {
        throw new Error('La demande de notifications a échoué.', {cause: response.status});
    }
    return response.status === 204 ? null : response.json();
}

async function initPlanningPush() {
    if ((!planningPushSupported && !appleMobile) || !window.isSecureContext) {
        return;
    }
    try {
        const response = await fetch('api/planning/push', {credentials: 'omit'});
        if (response.ok) {
            ({publicKey: planningPushKey} = await response.json());
            renderPlanningPush();
        }
        if (planningPushSupported && !(appleMobile && !installedApp)) {
            planningPushRegistration = await navigator.serviceWorker.ready;
            planningPushNativeSubscription = await planningPushRegistration.pushManager.getSubscription();
            if (planningPushNativeSubscription) {
                const {code} = await planningPushRequest('status', planningPushNativeSubscription);
                subscribedPlanningCode = code;
            }
            renderPlanningPush();
        }
    } catch {
        // A failed status check must leave the planner usable.
        renderPlanningPush();
    }
}

enablePlanningPush.addEventListener('click', async () => {
    const code = planningPushCode;
    planningPushBusy = true;
    renderPlanningPush();
    let message = '';
    try {
        const key = Uint8Array.from(atob(planningPushKey.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
        // Start the browser permission prompt directly from the click, including on iOS.
        planningPushNativeSubscription ??= await planningPushRegistration.pushManager.subscribe({
            userVisibleOnly: true, applicationServerKey: key,
        });
        await planningPushRequest('save', planningPushNativeSubscription, code);
        subscribedPlanningCode = code;
        message = 'Alertes activées. LorR vérifie les changements quand quelqu’un actualise ces horaires.';
    } catch (error) {
        message = Notification.permission === 'denied'
            ? 'Autorise les notifications de LorR dans les réglages de ton navigateur.'
            : (error.cause === 422 ? 'Ce service de notifications n’est pas pris en charge par LorR.'
                : 'Impossible d’activer les alertes. Réessaie dans un instant.');
    } finally {
        planningPushBusy = false;
        renderPlanningPush(message);
    }
});

disablePlanningPush.addEventListener('click', async () => {
    planningPushBusy = true;
    renderPlanningPush();
    let message = '';
    try {
        const subscription = planningPushNativeSubscription;
        if (subscription) {
            await planningPushRequest('remove', subscription);
            if (await subscription.unsubscribe().catch(() => false)) {
                planningPushNativeSubscription = null;
            }
        }
        subscribedPlanningCode = null;
        message = 'Alertes désactivées sur cet appareil.';
    } catch {
        message = 'Impossible de désactiver les alertes. Réessaie dans un instant.';
    } finally {
        planningPushBusy = false;
        renderPlanningPush(message);
    }
});

void initPlanningPush();

const planningTestButtons = [...document.querySelectorAll('[data-planning-test]')];
const planningTestStatus = document.getElementById('planning-test-status');
let planningTestPending = false;
let planningTestId;
let receivedPlanningTestId;
let planningTestReceiptTimer;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'planning-push-test' && planningTestId && event.data.id === planningTestId) {
            clearTimeout(planningTestReceiptTimer);
            receivedPlanningTestId = planningTestId;
            planningTestStatus.textContent = 'Notification Web Push reçue sur cet appareil.';
        }
    });
}

for (const button of planningTestButtons) {
    button.addEventListener('click', async () => {
        if (planningTestPending) return;
        if (!planningPushSupported || (appleMobile && !installedApp)) {
            planningTestStatus.textContent = appleMobile && !installedApp
                ? 'Ouvre LorR depuis l’écran d’accueil pour tester les notifications.'
                : 'Ce navigateur ne permet pas de tester les notifications.';
            return;
        }
        planningTestPending = true;
        clearTimeout(planningTestReceiptTimer);
        planningTestId = null;
        planningTestButtons.forEach(control => { control.disabled = true; });
        const delay = Number(button.dataset.planningTest);
        const push = Boolean(planningPushKey && subscribedPlanningCode && planningPushNativeSubscription);
        try {
            if (!push && Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') {
                planningTestStatus.textContent = 'Autorise les notifications de LorR dans les réglages du navigateur.';
                return;
            }
            if (delay) {
                planningTestStatus.textContent = 'Test prévu dans 30 s. Garde cet onglet ouvert.';
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
            if (push) {
                const bytes = crypto.getRandomValues(new Uint8Array(16));
                planningTestId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
                await planningPushRequest('test', planningPushNativeSubscription, undefined, planningTestId);
                if (receivedPlanningTestId !== planningTestId) {
                    planningTestStatus.textContent = 'Test accepté par le service Web Push. En attente de réception…';
                    planningTestReceiptTimer = setTimeout(() => {
                        planningTestStatus.textContent = 'Réception Web Push non confirmée sur cet appareil après 60 s.';
                    }, 60_000);
                }
            } else {
                const registration = await navigator.serviceWorker.getRegistration();
                if (!registration?.active) {
                    planningTestStatus.textContent = 'LorR prépare les notifications. Réessaie dans un instant.';
                    return;
                }
                await registration.showNotification('Test local LorR', {
                    body: 'Cet appareil peut afficher les notifications de LorR.',
                    icon: new URL('assets/pwa-192.png', location.href).href,
                    tag: 'lorr-local-test',
                    data: {test: true},
                });
                planningTestStatus.textContent = planningPushKey
                    ? 'Test local affiché. Active les alertes pour tester la livraison Web Push.'
                    : 'Test local affiché. Le Web Push reste à activer sur le serveur.';
            }
        } catch (error) {
            planningTestStatus.textContent = error.cause === 429
                ? 'Attends quelques secondes avant de refaire un test.'
                : 'Impossible d’envoyer la notification de test.';
        } finally {
            planningTestPending = false;
            planningTestButtons.forEach(control => { control.disabled = false; });
        }
    });
}
