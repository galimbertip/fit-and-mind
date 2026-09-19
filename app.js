// ============================================================================
// Fit & Mind - Logica applicativa (UI, stato, sincronizzazione)
// Usa le funzioni pure definite in engine.js (caricato prima di questo file,
// quindi generateWorkout, applyFeedback, MOOD_SCALE, ecc. sono già disponibili
// come identificatori globali di script classico, senza bisogno di import).
// ============================================================================

// Configurazione Firebase integrata (progetto del proprietario dell'app)
const firebaseConfig = {
    apiKey: "AIzaSyDviQAQZ8FNfJsJz-Z-azgCR73l4CqThTs",
    authDomain: "fit-and-mind.firebaseapp.com",
    databaseURL: "https://fit-and-mind-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fit-and-mind",
    storageBucket: "fit-and-mind.firebasestorage.app",
    messagingSenderId: "591471755393",
    appId: "1:591471755393:web:b234ea3068fd57d319cd80"
};

let db = null;
let currentUsername = localStorage.getItem('fm_user');
let userRef = null;
let appData = defaultAppData(currentUsername || '');

// Stato transitorio della sessione di meditazione in corso (non persistito)
let meditationMoodBefore = null;
let meditationTimerId = null;
let meditationSeconds = 300;
let meditationTotalSeconds = 300;
let isMeditating = false;
let currentMeditationGoal = 'relax';
let currentMeditationMode = 'guidata'; // 'guidata' | 'libera'
let meditationCues = [];
let meditationSpokenCueSeconds = {};
let ambientEngine = null;
let hitsCtx = null;
let hitsEngine = null;

// --- DATI: default, storage locale, normalizzazione -----------------------

function defaultAppData(username) {
    return {
        username: username || '',
        dob: '', height: '', netWeight: '', weightCondition: 'leggero',
        ambientSoundChoice: 'auto', ambientVolume: 0.4,
        mood: 'Sereno / Equilibrato', sleep: '3/5 - Discreto', energy: 'Media (50%)',
        totalWorkouts: 0, totalMeditations: 0, lastFeedback: 'Nessuno',
        currentWorkoutScheme: null, currentWorkoutDate: '',
        fitness: { level: 1, consecutiveEasy: 0, consecutiveOk: 0 },
        lastExerciseIds: [],
        streak: { count: 0, lastActivityDate: null },
        meditationHistory: [],
        // --- Corpo & Spirito: dall'intervista di onboarding ---
        activityLevel: 'moderato',
        fitnessGoal: 'pancia',
        limitations: [],
        meditationExperience: 'qualche_volta',
        stressLevel: 3,
        selfAwareness: 3,
        meditationGoalDefault: 'relax',
        meditationFormatPref: 'entrambe',
        mind: { level: 1, consecutiveEasy: 0, consecutiveOk: 0 },
        onboardingDone: false
    };
}

function normalizeAppData(d) {
    d = d || defaultAppData(currentUsername);
    d.fitness = d.fitness || { level: 1, consecutiveEasy: 0, consecutiveOk: 0 };
    if (!d.fitness.level) d.fitness.level = 1;
    d.mind = d.mind || { level: 1, consecutiveEasy: 0, consecutiveOk: 0 };
    if (!d.mind.level) d.mind.level = 1;
    d.streak = d.streak || { count: 0, lastActivityDate: null };
    d.meditationHistory = d.meditationHistory || [];
    d.lastExerciseIds = d.lastExerciseIds || [];
    d.totalWorkouts = d.totalWorkouts || 0;
    d.totalMeditations = d.totalMeditations || 0;
    d.lastFeedback = d.lastFeedback || 'Nessuno';
    d.limitations = d.limitations || [];
    d.activityLevel = d.activityLevel || 'moderato';
    d.fitnessGoal = d.fitnessGoal || 'pancia';
    d.meditationExperience = d.meditationExperience || 'qualche_volta';
    d.stressLevel = d.stressLevel || 3;
    d.selfAwareness = d.selfAwareness || 3;
    d.meditationGoalDefault = d.meditationGoalDefault || 'relax';
    d.meditationFormatPref = d.meditationFormatPref || 'entrambe';
    d.weightCondition = d.weightCondition || 'leggero';
    d.ambientSoundChoice = d.ambientSoundChoice || 'auto';
    d.ambientVolume = (typeof d.ambientVolume === 'number') ? d.ambientVolume : 0.4;
    return d;
}

function localKey(username) { return 'fm_data_' + username; }

function loadLocal(username) {
    try {
        const raw = localStorage.getItem(localKey(username));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn('Lettura localStorage fallita:', e);
        return null;
    }
}

function saveLocal(username, data) {
    try {
        localStorage.setItem(localKey(username), JSON.stringify(data));
    } catch (e) {
        console.warn('Scrittura localStorage fallita:', e);
    }
}

// Salva sempre in locale (fonte di verità immediata) e prova a sincronizzare
// su Firebase in background, senza mai bloccare l'interfaccia se la rete manca.
function saveData() {
    if (!currentUsername) return;
    saveLocal(currentUsername, appData);
    if (userRef) {
        userRef.set(appData).catch((err) => console.warn('Sync cloud non riuscita, continuo offline:', err));
    }
}

// --- AVVIO APP --------------------------------------------------------------

function initApp() {
    registerServiceWorker();
    buildMoodPickers();
    initFirebaseConnectionBadge();

    currentUsername = localStorage.getItem('fm_user');
    if (currentUsername) {
        const local = loadLocal(currentUsername);
        appData = normalizeAppData(Object.assign(defaultAppData(currentUsername), local || {}));
        showDashboardUI();
        ensureTodayWorkout();
        renderAllUI();
        attachFirebaseListener(currentUsername);
    } else {
        showWelcomeUI();
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker non registrato:', e));
    }
}

function initFirebaseConnectionBadge() {
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        db.ref('.info/connected').on('value', (snap) => {
            const badge = document.getElementById('sync-badge');
            if (snap.val() === true) {
                badge.innerText = "Online";
                badge.className = "sync-status-badge sync-online";
            } else {
                badge.innerText = "Offline";
                badge.className = "sync-status-badge sync-offline";
            }
        });
    } catch (e) {
        console.warn("Firebase non disponibile, l'app funziona comunque in locale:", e);
        db = null;
    }
}

function attachFirebaseListener(username) {
    if (!db) return;
    try {
        if (userRef) userRef.off();
        userRef = db.ref('user_profile/' + username);
        userRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                appData = normalizeAppData(Object.assign({}, appData, data));
            } else {
                appData = normalizeAppData(appData);
            }
            ensureTodayWorkout();
            renderAllUI();
        }, (err) => console.warn('Ascolto Firebase interrotto, continuo in locale:', err));
    } catch (e) {
        console.warn('Impossibile collegarsi a Firebase, continuo in locale:', e);
        userRef = null;
    }
}

function logout() {
    if (userRef) { try { userRef.off(); } catch (e) {} }
    localStorage.removeItem('fm_user');
    location.reload();
}

// Elimina definitivamente il profilo corrente (locale + cloud). Pensata soprattutto
// per chi ha un profilo creato prima dell'intervista Corpo & Spirito e vuole
// rifarla da capo con un profilo pulito, invece di restare con dati incompleti.
//
// IMPORTANTE: la rimozione da Firebase è asincrona. Se ricaricassimo la pagina subito
// dopo averla richiesta, il reload interromperebbe la richiesta di rete a metà e i dati
// resterebbero nel cloud — così al login successivo Firebase li "ripesca" e il profilo
// sembra tornato in vita. Per questo aspettiamo la conferma della rimozione (o un
// timeout di sicurezza se il cloud non risponde) prima di ricaricare.
function deleteProfile() {
    const username = currentUsername;
    if (!username) return;

    const ok = confirm(
        'Eliminare definitivamente il profilo "' + username + '"?\n\n' +
        'Tutti i progressi salvati (livelli, allenamenti, meditazioni, streak) verranno cancellati sia da questo dispositivo che dal cloud. L\'azione non è reversibile.'
    );
    if (!ok) return;

    const btn = document.getElementById('btn-delete-profile');
    if (btn) { btn.disabled = true; btn.innerText = 'Eliminazione in corso...'; }

    const ref = userRef || (db ? db.ref('user_profile/' + username) : null);
    if (ref) { try { ref.off(); } catch (e) {} }

    let finished = false;
    const finishDeletion = () => {
        if (finished) return;
        finished = true;
        try { localStorage.removeItem(localKey(username)); } catch (e) {}
        localStorage.removeItem('fm_user');
        location.reload();
    };

    if (ref) {
        ref.remove().then(finishDeletion).catch((err) => {
            console.warn('Rimozione dal cloud non riuscita, elimino comunque i dati locali:', err);
            finishDeletion();
        });
        // Rete assente o troppo lenta: non blocchiamo l'utente all'infinito.
        setTimeout(finishDeletion, 4000);
    } else {
        finishDeletion();
    }
}

// --- SCHERMATE / NAVIGAZIONE -------------------------------------------------

function showWelcomeUI() {
    document.getElementById('welcome-screen').style.display = 'block';
    document.getElementById('app-nav').style.display = 'none';
    document.getElementById('btn-header-logout').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
}

function showDashboardUI() {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('app-nav').style.display = 'flex';
    document.getElementById('btn-header-logout').style.display = 'inline-block';
    switchTab('workout');
    initMeditationTab();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.className = '');
    document.getElementById('tab-' + tabName).classList.add('active');
    document.getElementById('nav-' + tabName).classList.add(tabName === 'meditation' ? 'active-meditation' : 'active');
}

function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}

const WIZARD_TOTAL_STEPS = 4;
let wizardStep = 1;

function openRegisterModal() {
    // Reset dei campi del form: intervista completa per un profilo nuovo.
    document.getElementById('input-username').value = '';
    document.getElementById('input-dob').value = '';
    document.getElementById('input-height').value = '170';
    document.getElementById('input-weight').value = '70';
    document.getElementById('input-weight-condition').value = 'leggero';
    document.getElementById('input-activity').value = 'moderato';
    document.getElementById('input-fitness-goal').value = 'pancia';
    document.getElementById('limit-ginocchia').checked = false;
    document.getElementById('limit-schiena').checked = false;
    document.getElementById('limit-polsi_spalle').checked = false;
    document.getElementById('input-med-experience').value = 'qualche_volta';
    document.getElementById('input-stress').value = '3';
    document.getElementById('input-selfaware').value = '3';
    document.getElementById('input-med-goal').value = 'relax';
    document.getElementById('input-med-format').value = 'entrambe';
    document.getElementById('input-mood').value = 'Sereno / Equilibrato';
    document.getElementById('input-sleep').value = '3/5 - Discreto';
    document.getElementById('input-energy').value = 'Media (50%)';

    document.getElementById('profile-modal-title').innerText = "Facciamo Conoscenza";
    document.getElementById('profile-modal').classList.add('wizard-mode');
    document.getElementById('wizard-progress').style.display = 'block';
    wizardGoToStep(1);
    document.getElementById('profile-modal').style.display = 'flex';
}

function openProfileModal() {
    document.getElementById('input-username').value = appData.username || currentUsername || '';
    document.getElementById('input-dob').value = appData.dob || '';
    document.getElementById('input-height').value = appData.height || '170';
    document.getElementById('input-weight').value = appData.netWeight || '70';
    document.getElementById('input-weight-condition').value = appData.weightCondition || 'leggero';
    document.getElementById('input-activity').value = appData.activityLevel || 'moderato';
    document.getElementById('input-fitness-goal').value = appData.fitnessGoal || 'pancia';
    const limitations = appData.limitations || [];
    document.getElementById('limit-ginocchia').checked = limitations.indexOf('ginocchia') !== -1;
    document.getElementById('limit-schiena').checked = limitations.indexOf('schiena') !== -1;
    document.getElementById('limit-polsi_spalle').checked = limitations.indexOf('polsi_spalle') !== -1;
    document.getElementById('input-med-experience').value = appData.meditationExperience || 'qualche_volta';
    document.getElementById('input-stress').value = String(appData.stressLevel || 3);
    document.getElementById('input-selfaware').value = String(appData.selfAwareness || 3);
    document.getElementById('input-med-goal').value = appData.meditationGoalDefault || 'relax';
    document.getElementById('input-med-format').value = appData.meditationFormatPref || 'entrambe';
    document.getElementById('input-mood').value = appData.mood || 'Sereno / Equilibrato';
    document.getElementById('input-sleep').value = appData.sleep || '3/5 - Discreto';
    document.getElementById('input-energy').value = appData.energy || 'Media (50%)';

    document.getElementById('profile-modal-title').innerText = "Profilo & Stato Psicofisico";
    document.getElementById('profile-modal').classList.remove('wizard-mode');
    document.getElementById('wizard-progress').style.display = 'none';
    document.getElementById('profile-modal').style.display = 'flex';
}

function wizardGoToStep(n) {
    wizardStep = Math.max(1, Math.min(WIZARD_TOTAL_STEPS, n));
    document.querySelectorAll('.wizard-step').forEach((el) => {
        el.classList.toggle('active', Number(el.dataset.step) === wizardStep);
    });
    document.getElementById('wizard-step-num').innerText = String(wizardStep);
    document.getElementById('wizard-btn-back').disabled = wizardStep === 1;
    document.getElementById('wizard-btn-next').innerText = wizardStep === WIZARD_TOTAL_STEPS ? 'Crea il tuo Profilo' : 'Avanti';
}

function wizardNextStep() {
    if (wizardStep === 1) {
        const userVal = document.getElementById('input-username').value.trim();
        if (!userVal) { alert('Inserisci un ID Utente per continuare'); return; }
    }
    if (wizardStep === WIZARD_TOTAL_STEPS) {
        saveProfile();
        return;
    }
    wizardGoToStep(wizardStep + 1);
}

function wizardPrevStep() {
    wizardGoToStep(wizardStep - 1);
}

function openChangelogModal() {
    document.getElementById('changelog-modal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Porta a termine un login per cui sappiamo che il profilo esiste davvero
// (trovato in locale, oppure confermato sul cloud).
function completeLogin(username, existingData) {
    currentUsername = username;
    localStorage.setItem('fm_user', currentUsername);
    closeModal('login-modal');

    appData = normalizeAppData(Object.assign(defaultAppData(currentUsername), existingData || {}));
    showDashboardUI();
    ensureTodayWorkout();
    renderAllUI();
    attachFirebaseListener(currentUsername);
}

// "Accedi al tuo Profilo" deve riportare indietro un profilo esistente, non aprirne
// silenziosamente uno vuoto con lo stesso nome: altrimenti un profilo eliminato (o
// digitato per errore) sembra "esistere ancora" solo perché la dashboard si apre lo
// stesso. Se i dati non sono già in locale su questo dispositivo, verifichiamo prima
// sul cloud che il profilo esista davvero, prima di entrare.
function executeLogin() {
    const input = document.getElementById('login-username-input').value.trim().toLowerCase();
    if (!input) return alert("Inserisci un ID valido");

    const local = loadLocal(input);
    if (local) {
        completeLogin(input, local);
        return;
    }

    const loginBtn = document.getElementById('btn-execute-login');
    const resetBtn = () => { if (loginBtn) { loginBtn.disabled = false; loginBtn.innerText = 'Accedi'; } };
    if (loginBtn) { loginBtn.disabled = true; loginBtn.innerText = 'Verifica in corso...'; }

    if (!db) {
        resetBtn();
        alert('Nessun dato locale trovato per "' + input + '" e il cloud non è raggiungibile in questo momento.\n\nSe il profilo esiste solo su un altro dispositivo, riprova quando sei online. Se invece è la prima volta, usa "Crea Nuovo Profilo".');
        return;
    }

    let settled = false;
    db.ref('user_profile/' + input).once('value')
        .then((snapshot) => {
            if (settled) return;
            settled = true;
            resetBtn();
            const cloudData = snapshot.val();
            if (!cloudData) {
                alert('Nessun profilo trovato con il nome "' + input + '".\n\nSe è la prima volta, usa "Crea Nuovo Profilo" per fare l\'intervista Corpo & Spirito.');
                return;
            }
            completeLogin(input, cloudData);
        })
        .catch((err) => {
            if (settled) return;
            settled = true;
            resetBtn();
            console.warn('Verifica profilo sul cloud non riuscita:', err);
            alert('Non riesco a verificare il profilo in questo momento (problema di rete). Riprova tra poco.');
        });

    // Rete assente o troppo lenta: non lasciamo il pulsante bloccato per sempre.
    setTimeout(() => {
        if (settled) return;
        settled = true;
        resetBtn();
        alert('La verifica sta impiegando troppo tempo (rete lenta o assente). Riprova quando la connessione è più stabile.');
    }, 6000);
}

function saveProfile() {
    const userVal = document.getElementById('input-username').value.trim().toLowerCase();
    if (!userVal) return alert("Inserisci un ID Utente");

    const isNewUser = userVal !== currentUsername;
    if (isNewUser) {
        const local = loadLocal(userVal);
        appData = normalizeAppData(Object.assign(defaultAppData(userVal), local || {}));
    }
    const isFirstOnboarding = !appData.onboardingDone;

    appData.username = userVal;
    appData.dob = document.getElementById('input-dob').value;
    appData.height = document.getElementById('input-height').value;
    appData.netWeight = document.getElementById('input-weight').value;
    appData.weightCondition = document.getElementById('input-weight-condition').value;
    appData.activityLevel = document.getElementById('input-activity').value;
    appData.fitnessGoal = document.getElementById('input-fitness-goal').value;
    appData.limitations = ['ginocchia', 'schiena', 'polsi_spalle'].filter(l => document.getElementById('limit-' + l).checked);
    appData.meditationExperience = document.getElementById('input-med-experience').value;
    appData.stressLevel = Number(document.getElementById('input-stress').value);
    appData.selfAwareness = Number(document.getElementById('input-selfaware').value);
    appData.meditationGoalDefault = document.getElementById('input-med-goal').value;
    appData.meditationFormatPref = document.getElementById('input-med-format').value;
    appData.mood = document.getElementById('input-mood').value;
    appData.sleep = document.getElementById('input-sleep').value;
    appData.energy = document.getElementById('input-energy').value;

    // I livelli di partenza si calcolano dall'intervista SOLO la prima volta:
    // una modifica successiva ai parametri non deve resettare i progressi guadagnati.
    if (isFirstOnboarding) {
        appData.fitness.level = startingFitnessLevel(appData.activityLevel);
        appData.mind.level = startingMindLevel(appData.meditationExperience, appData.selfAwareness);
        appData.onboardingDone = true;
    }

    currentUsername = userVal;
    localStorage.setItem('fm_user', currentUsername);

    ensureTodayWorkout();
    saveData();
    closeModal('profile-modal');
    showDashboardUI();
    renderAllUI();
    attachFirebaseListener(currentUsername);
}

function calculateAge(dobString) {
    if (!dobString) return '-';
    const diff = Date.now() - new Date(dobString).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

// --- MOTORE ALLENAMENTO (locale, nessuna rete) -------------------------------

function buildFitnessState() {
    return {
        level: (appData.fitness && appData.fitness.level) || MIN_LEVEL,
        lastFeedback: appData.lastFeedback,
        lastExerciseIds: appData.lastExerciseIds || [],
        energy: appData.energy,
        sleep: appData.sleep,
        mood: appData.mood,
        totalWorkouts: appData.totalWorkouts || 0,
        limitations: appData.limitations || []
    };
}

function ensureTodayWorkout() {
    const today = localDateStr();
    if (!appData.currentWorkoutScheme || appData.currentWorkoutDate !== today) {
        const scheme = generateWorkout(buildFitnessState());
        appData.currentWorkoutScheme = scheme;
        appData.currentWorkoutDate = today;
        saveData();
    }
}

function regenerateWorkout() {
    const excludeIds = (appData.currentWorkoutScheme && appData.currentWorkoutScheme.usedIds) || appData.lastExerciseIds || [];
    const state = buildFitnessState();
    state.lastExerciseIds = excludeIds;
    const scheme = generateWorkout(state);
    appData.currentWorkoutScheme = scheme;
    appData.currentWorkoutDate = localDateStr();
    saveData();
    renderWorkoutScheme(scheme);
    renderStatsUI();
}

// Mappa esercizio -> posa illustrata (vedi <defs> in index.html). Sono illustrazioni
// semplici e riutilizzate tra esercizi con posizione del corpo simile: non un disegno
// diverso per ognuno dei ~50 esercizi, ma un set di pose di base facilmente riconoscibili.
const EXERCISE_POSE_MAP = {
    w1: 'standing-arms-out', w2: 'standing-hip-hands', w3: 'marching', w4: 'lunge', w5: 'cat-cow', w6: 'squat', w7: 'jumping-jack', w8: 'torso-twist',
    c1: 'standing-quad-stretch', c2: 'standing-hamstring-stretch', c3: 'childs-pose', c4: 'side-bend', c5: 'lying-breathing',
    k1: 'plank', k2: 'plank', k3: 'crunch', k4: 'leg-raise', k5: 'crunch', k6: 'seated-twist', k7: 'side-plank', k8: 'plank',
    k9: 'dead-bug', k10: 'superman', k11: 'plank', k12: 'v-up', k13: 'hollow-hold', k14: 'torso-twist',
    k15: 'l-sit', k16: 'l-sit', k17: 'l-sit', k18: 'dragon-flag',
    s1: 'squat', s2: 'lunge', s3: 'jumping-jack', s4: 'push-up', s5: 'push-up', s6: 'glute-bridge', s7: 'marching', s8: 'wall-sit',
    s9: 'burpee', s10: 'plank', s11: 'squat', s12: 'burpee', s13: 'lunge', s14: 'lunge', s15: 'pike-push-up',
    s16: 'pistol-squat', s17: 'pistol-squat', s18: 'pistol-squat', s19: 'push-up', s20: 'wall-walk'
};

function poseIdForExercise(exId) {
    return EXERCISE_POSE_MAP[exId] || 'standing-arms-out';
}

function renderExerciseList(items, targetId) {
    const container = document.getElementById(targetId);
    container.innerHTML = '';
    (items || []).forEach((ex) => {
        const div = document.createElement('div');
        div.className = 'exercise-item';
        div.innerHTML =
            '<div class="ex-row">' +
                '<svg class="ex-icon" viewBox="0 0 100 100"><use href="#pose-' + poseIdForExercise(ex.id) + '"></use></svg>' +
                '<div style="flex:1; min-width:0; display: flex; justify-content: space-between; align-items: center;">' +
                    '<strong style="color: var(--text-primary); font-size: 1rem;"></strong>' +
                    '<span style="color: var(--accent-meditation); font-weight: bold; white-space: nowrap; margin-left: 8px;"></span>' +
                '</div>' +
            '</div>' +
            '<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.3; padding-left: 44px;"></div>';
        div.querySelector('strong').textContent = ex.name;
        div.querySelector('span').textContent = (ex.sets ? (ex.sets + ' x ') : '') + ex.qty + ' ' + ex.unit;
        div.lastElementChild.textContent = ex.desc || '';
        container.appendChild(div);
    });
}

function renderWorkoutScheme(scheme) {
    if (!scheme) return;
    document.getElementById('ai-rationale').innerText = scheme.rationale || '';
    document.getElementById('workout-level-badge').innerText = scheme.level || 1;

    const roundsLabel = scheme.rounds ? ('x' + scheme.rounds + ' giri') : '';
    document.getElementById('core-rounds-badge').innerText = roundsLabel;
    document.getElementById('circuit-rounds-badge').innerText = roundsLabel;

    renderExerciseList(scheme.warmup, 'warmup-list');
    renderExerciseList(scheme.core, 'core-list');
    renderExerciseList(scheme.circuit, 'circuit-list');
    renderExerciseList(scheme.cooldown, 'cooldown-list');
}

function completeWorkout() {
    document.getElementById('feedback-card').style.display = 'block';
}

// --- ALLENAMENTO GUIDATO ------------------------------------------------------
// Accompagna la scheda del giorno esercizio per esercizio: countdown automatico per
// quelli a tempo ("sec"), pulsante "Fatto" per quelli a ripetizioni, e un riposo
// cronometrato tra un esercizio e il successivo (default 30s, estendibile di +15s
// quante volte si vuole, o saltabile). Il blocco Core rispetta le "serie" già
// calcolate da formatCoreEx, il blocco Circuito si ripete per il numero di "giri"
// della scheda. Gli esercizi "sec/lato" (es. Plank Laterale) vengono proposti come
// due passaggi separati (un lato, un breve cambio, l'altro lato).
const GUIDED_DEFAULT_REST_SECONDS = 30;
let guidedSteps = [];
let guidedIndex = 0;
let guidedTimerId = null;
let guidedSecondsLeft = 0;
let guidedPaused = false;

function buildGuidedSteps(scheme, restSeconds) {
    const steps = [];
    let first = true;
    const maybeRest = () => {
        if (!first) steps.push({ type: 'rest', seconds: restSeconds });
        first = false;
    };
    const pushExercise = (ex, extra) => {
        const timed = !!(ex.unit && ex.unit.indexOf('sec') > -1);
        steps.push(Object.assign({ type: 'exercise', ex: ex, timed: timed }, extra || {}));
    };
    const addExercise = (ex, extra) => {
        if (ex.unit === 'sec/lato') {
            maybeRest();
            pushExercise(ex, Object.assign({ sideLabel: 'Lato 1 di 2' }, extra));
            steps.push({ type: 'rest', seconds: Math.min(restSeconds, 15) });
            pushExercise(ex, Object.assign({ sideLabel: 'Lato 2 di 2' }, extra));
        } else {
            maybeRest();
            pushExercise(ex, extra);
        }
    };

    (scheme.warmup || []).forEach((ex) => addExercise(ex));
    (scheme.core || []).forEach((ex) => {
        const sets = ex.sets || 1;
        for (let s = 0; s < sets; s++) addExercise(ex, { setIndex: s + 1, setTotal: sets });
    });
    const rounds = scheme.rounds || 1;
    for (let r = 0; r < rounds; r++) {
        (scheme.circuit || []).forEach((ex) => addExercise(ex, { roundIndex: r + 1, roundTotal: rounds }));
    }
    (scheme.cooldown || []).forEach((ex) => addExercise(ex));

    return steps;
}

function startGuidedWorkout() {
    if (!appData.currentWorkoutScheme) return;
    guidedSteps = buildGuidedSteps(appData.currentWorkoutScheme, GUIDED_DEFAULT_REST_SECONDS);
    guidedIndex = 0;
    document.getElementById('guided-modal').style.display = 'flex';
    showGuidedStep();
}

function abortGuidedWorkout() {
    clearGuidedTimer();
    document.getElementById('guided-modal').style.display = 'none';
}

function clearGuidedTimer() {
    if (guidedTimerId) { clearInterval(guidedTimerId); guidedTimerId = null; }
}

function showGuidedStep() {
    clearGuidedTimer();
    if (guidedIndex >= guidedSteps.length) {
        finishGuidedWorkout();
        return;
    }
    const step = guidedSteps[guidedIndex];
    const exerciseSteps = guidedSteps.filter((s) => s.type === 'exercise');
    const doneSoFar = guidedSteps.slice(0, guidedIndex + 1).filter((s) => s.type === 'exercise').length;
    document.getElementById('guided-progress').innerText = 'Esercizio ' + Math.max(1, doneSoFar) + ' di ' + exerciseSteps.length;

    const iconEl = document.getElementById('guided-icon-use');
    const nameEl = document.getElementById('guided-name');
    const descEl = document.getElementById('guided-desc');
    const targetEl = document.getElementById('guided-target');
    const doneBtn = document.getElementById('guided-btn-done');
    const pauseBtn = document.getElementById('guided-btn-pause');
    const extendBtn = document.getElementById('guided-btn-extend');
    const skipRestBtn = document.getElementById('guided-btn-skip-rest');

    if (step.type === 'rest') {
        iconEl.setAttribute('href', '#pose-lying-breathing');
        nameEl.innerText = 'Riposo';
        const next = guidedSteps[guidedIndex + 1];
        descEl.innerText = next ? ('Prossimo: ' + next.ex.name + (next.sideLabel ? ' (' + next.sideLabel + ')' : '')) : '';
        targetEl.innerText = '';
        doneBtn.style.display = 'none';
        pauseBtn.style.display = 'none';
        extendBtn.style.display = 'inline-block';
        skipRestBtn.style.display = 'inline-block';
        startGuidedCountdown(step.seconds);
    } else {
        const ex = step.ex;
        iconEl.setAttribute('href', '#pose-' + poseIdForExercise(ex.id));
        let title = ex.name;
        if (step.sideLabel) title += ' — ' + step.sideLabel;
        if (step.setTotal > 1) title += ' — Set ' + step.setIndex + '/' + step.setTotal;
        if (step.roundTotal > 1) title += ' — Giro ' + step.roundIndex + '/' + step.roundTotal;
        nameEl.innerText = title;
        descEl.innerText = ex.desc || '';
        targetEl.innerText = (ex.sets ? (ex.sets + ' x ') : '') + ex.qty + ' ' + ex.unit;
        extendBtn.style.display = 'none';
        skipRestBtn.style.display = 'none';

        if (step.timed) {
            doneBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-block';
            pauseBtn.innerText = 'Pausa';
            startGuidedCountdown(parseInt(ex.qty, 10) || 20);
        } else {
            doneBtn.style.display = 'inline-block';
            pauseBtn.style.display = 'none';
            document.getElementById('guided-timer').innerText = '';
        }
    }
}

function startGuidedCountdown(totalSeconds) {
    guidedSecondsLeft = totalSeconds;
    guidedPaused = false;
    updateGuidedTimerDisplay();
    clearGuidedTimer();
    guidedTimerId = setInterval(() => {
        if (guidedPaused) return;
        guidedSecondsLeft--;
        updateGuidedTimerDisplay();
        if (guidedSecondsLeft <= 0) {
            clearGuidedTimer();
            playCueSound('chime');
            advanceGuidedStep();
        }
    }, 1000);
}

function updateGuidedTimerDisplay() {
    const m = Math.floor(Math.max(0, guidedSecondsLeft) / 60);
    const s = Math.max(0, guidedSecondsLeft) % 60;
    document.getElementById('guided-timer').innerText = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function guidedTogglePause() {
    guidedPaused = !guidedPaused;
    document.getElementById('guided-btn-pause').innerText = guidedPaused ? 'Riprendi' : 'Pausa';
}

function guidedExtendRest() {
    guidedSecondsLeft += 15;
    updateGuidedTimerDisplay();
}

function guidedSkipRest() {
    clearGuidedTimer();
    advanceGuidedStep();
}

function guidedMarkDone() {
    clearGuidedTimer();
    advanceGuidedStep();
}

function advanceGuidedStep() {
    guidedIndex++;
    showGuidedStep();
}

function finishGuidedWorkout() {
    document.getElementById('guided-modal').style.display = 'none';
    playCueSound('bell');
    completeWorkout();
}

function saveFeedbackAndAdjust(fb) {
    const prevLevel = (appData.fitness && appData.fitness.level) || MIN_LEVEL;

    appData.lastFeedback = fb;
    appData.totalWorkouts = (appData.totalWorkouts || 0) + 1;
    appData.fitness = applyFeedback(appData.fitness, fb);
    appData.lastExerciseIds = (appData.currentWorkoutScheme && appData.currentWorkoutScheme.usedIds) || [];
    appData.streak = updateStreak(appData.streak, localDateStr());

    saveData();
    document.getElementById('feedback-card').style.display = 'none';
    renderStatsUI();

    if (appData.fitness.level > prevLevel) {
        alert("Ottimo lavoro! Sei salito al Livello " + appData.fitness.level + " 💪");
    } else if (appData.fitness.level < prevLevel) {
        alert("Sessione salvata. Livello aggiustato a " + appData.fitness.level + " per consolidare senza strafare.");
    } else {
        alert("Ottimo lavoro! Sessione salvata nel tuo percorso.");
    }
}

// --- MEDITAZIONE --------------------------------------------------------------

function populateMeditationGoalSelect() {
    const select = document.getElementById('meditation-goal');
    select.innerHTML = '';
    MEDITATION_GOALS.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.label;
        select.appendChild(opt);
    });
}

// Inizializza (o ri-inizializza dopo login) il tab Meditazione a partire dalle
// preferenze raccolte nell'intervista di onboarding, senza interrompere una
// sessione eventualmente già in corso.
function initMeditationTab() {
    if (isMeditating) return;
    populateMeditationGoalSelect();
    const goal = MEDITATION_GOALS.some(g => g.id === appData.meditationGoalDefault) ? appData.meditationGoalDefault : 'relax';
    document.getElementById('meditation-goal').value = goal;
    currentMeditationGoal = goal;
    const pref = appData.meditationFormatPref;
    setMeditationMode(pref === 'libera' ? 'libera' : 'guidata');

    populateAmbientSoundSelect();
    document.getElementById('ambient-sound-select').value = appData.ambientSoundChoice || 'auto';
    const volPct = Math.round(((typeof appData.ambientVolume === 'number') ? appData.ambientVolume : 0.4) * 100);
    document.getElementById('ambient-volume-slider').value = volPct;
    document.getElementById('ambient-volume-label').innerText = volPct + '%';
    toggleAmbientControlsVisibility();
    updateVoiceDiagnostics();
}

function setMeditationMode(mode) {
    currentMeditationMode = mode;
    const voiceAvailable = !!window.speechSynthesis;

    document.getElementById('mode-btn-guidata').classList.toggle('selected', mode === 'guidata');
    document.getElementById('mode-btn-libera').classList.toggle('selected', mode === 'libera');
    document.getElementById('guided-duration-info').style.display = (mode === 'guidata') ? 'block' : 'none';
    document.getElementById('free-duration-group').style.display = (mode === 'libera') ? 'block' : 'none';
    document.getElementById('voice-toggle-group').style.display = (mode === 'guidata' && voiceAvailable) ? 'flex' : 'none';
    if (!voiceAvailable) document.getElementById('voice-toggle').checked = false;

    resetMeditation();
}

function updateMeditationConfig() {
    currentMeditationGoal = document.getElementById('meditation-goal').value;
    resetMeditation();
}

function buildMoodPickers() {
    ['mood-before-picker', 'mood-after-picker'].forEach((containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        MOOD_SCALE.forEach((m) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mood-btn';
            btn.dataset.value = String(m.value);
            btn.innerHTML = m.emoji + '<span class="mood-label">' + m.label + '</span>';
            btn.onclick = () => {
                if (containerId === 'mood-before-picker') selectMoodBefore(m.value);
                else selectMoodAfter(m.value);
            };
            container.appendChild(btn);
        });
    });
}

function highlightMoodButton(containerId, value) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.mood-btn').forEach((btn) => {
        btn.classList.toggle('selected', value !== null && Number(btn.dataset.value) === value);
    });
}

function selectMoodBefore(value) {
    meditationMoodBefore = value;
    highlightMoodButton('mood-before-picker', value);
}

function selectMoodAfter(value) {
    const entry = {
        date: localDateStr(),
        type: currentMeditationGoal,
        mode: currentMeditationMode,
        durationMin: Math.round(meditationTotalSeconds / 60),
        moodBefore: meditationMoodBefore,
        moodAfter: value
    };
    appData.meditationHistory = (appData.meditationHistory || []).concat([entry]).slice(-60);
    appData.totalMeditations = (appData.totalMeditations || 0) + 1;
    appData.streak = updateStreak(appData.streak, localDateStr());
    saveData();

    document.getElementById('mood-after-container').style.display = 'none';
    document.getElementById('meditation-instruction').innerText = "Grazie per esserti preso cura di te 🧘";
    document.getElementById('mind-feedback-card').style.display = 'block';
    renderStatsUI();
}

function saveMindFeedback(fb) {
    const prevLevel = (appData.mind && appData.mind.level) || MIND_MIN_LEVEL;
    appData.mind = applyFeedback(appData.mind, fb);
    saveData();
    document.getElementById('mind-feedback-card').style.display = 'none';
    renderStatsUI();

    if (appData.mind.level > prevLevel) {
        alert("La tua pratica si approfondisce: Livello Mente " + appData.mind.level + " 🧘✨");
    } else if (appData.mind.level < prevLevel) {
        alert("Sessione salvata. Livello Mente aggiustato a " + appData.mind.level + " per consolidare con calma.");
    } else {
        alert("Sessione salvata nel tuo percorso interiore.");
    }
}

function initialMeditationSeconds() {
    if (currentMeditationMode === 'libera') {
        const raw = Number(document.getElementById('input-free-minutes').value);
        const mins = Math.max(1, Math.min(60, raw || 10));
        return mins * 60;
    }
    const mindLevel = (appData.mind && appData.mind.level) || MIND_MIN_LEVEL;
    return suggestedMeditationMinutes(currentMeditationGoal, mindLevel) * 60;
}

function toggleMeditation() {
    isMeditating ? pauseMeditation() : startMeditation();
}

function startMeditation() {
    isMeditating = true;
    document.getElementById('btn-start-meditation').innerText = "Pausa";
    document.getElementById('mood-after-container').style.display = 'none';
    document.getElementById('mind-feedback-card').style.display = 'none';

    if (document.getElementById('music-toggle').checked) {
        startAmbientSound(currentMeditationGoal);
    }

    if (currentMeditationMode === 'guidata') {
        document.getElementById('meditation-caption').style.display = 'block';
    }
    updateMeditationDisplay();

    meditationTimerId = setInterval(() => {
        meditationSeconds--;
        updateMeditationDisplay();

        if (meditationSeconds <= 0) {
            clearInterval(meditationTimerId);
            isMeditating = false;
            stopAmbientSound();
            cancelSpeech();
            playCueSound('chime');
            document.getElementById('btn-start-meditation').innerText = "Avvia";
            document.getElementById('meditation-instruction').innerText = "Sessione Completata! 🧘 Com'è andata?";
            document.getElementById('meditation-caption').style.display = 'none';
            document.getElementById('mood-after-container').style.display = 'block';
        }
    }, 1000);
}

function pauseMeditation() {
    isMeditating = false;
    clearInterval(meditationTimerId);
    stopAmbientSound();
    cancelSpeech();
    document.getElementById('btn-start-meditation').innerText = "Riprendi";
}

function resetMeditation() {
    pauseMeditation();
    meditationSeconds = initialMeditationSeconds();
    meditationTotalSeconds = meditationSeconds;
    meditationSpokenCueSeconds = {};
    meditationCues = (currentMeditationMode === 'guidata')
        ? buildMeditationCues(currentMeditationGoal, (appData.mind && appData.mind.level) || MIND_MIN_LEVEL, meditationTotalSeconds)
        : [];
    meditationMoodBefore = null;
    highlightMoodButton('mood-before-picker', null);
    document.getElementById('mood-after-container').style.display = 'none';
    document.getElementById('mind-feedback-card').style.display = 'none';

    const capEl = document.getElementById('meditation-caption');
    capEl.style.display = 'none';
    capEl.innerText = '';

    if (currentMeditationMode === 'guidata') {
        const mindLevel = (appData.mind && appData.mind.level) || MIND_MIN_LEVEL;
        document.getElementById('guided-duration-display').innerText =
            Math.round(meditationTotalSeconds / 60) + ' min · Livello Mente ' + mindLevel + '/' + MIND_MAX_LEVEL;
    }

    updateMeditationDisplay();
    document.getElementById('btn-start-meditation').innerText = "Avvia";
    document.getElementById('meditation-instruction').innerText = (currentMeditationMode === 'guidata')
        ? "Sessione guidata pronta. Trova una posizione comoda e premi avvia."
        : "Sessione libera pronta. Scegli la durata e premi avvia.";
}

function updateMeditationDisplay() {
    const m = Math.floor(meditationSeconds / 60);
    const s = meditationSeconds % 60;
    document.getElementById('meditation-timer').innerText = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;

    if (!isMeditating) return;

    if (currentMeditationMode === 'guidata') {
        const elapsed = meditationTotalSeconds - meditationSeconds;
        meditationCues.forEach((cue) => {
            if (elapsed >= cue.atSecond && !meditationSpokenCueSeconds[cue.atSecond]) {
                meditationSpokenCueSeconds[cue.atSecond] = true;
                document.getElementById('meditation-caption').innerText = cue.text;
                document.getElementById('meditation-instruction').innerText = "Segui il tuo respiro...";
                if (document.getElementById('voice-toggle') && document.getElementById('voice-toggle').checked) {
                    speakCue(cue.text);
                }
            }
        });
    } else {
        if (meditationSeconds % 12 === 0) {
            document.getElementById('meditation-instruction').innerText = "Inspira lentamente ed espandi l'addome...";
        } else if (meditationSeconds % 6 === 0) {
            document.getElementById('meditation-instruction').innerText = "Espirando, rilascia ogni tensione dalle spalle...";
        }
    }
}

// --- AUDIO AMBIENTE (motore "ambiently", sintesi Web Audio, zero file da scaricare) ---
// Ogni obiettivo di meditazione ha 1-2 "strati" sonori procedurali (pioggia, oceano,
// vento, ruscello, uccellini...) mixati con dissolvenze automatiche. Nessun audio
// registrato: tutto generato al volo, quindi nessuna licenza da verificare e nessun
// peso aggiuntivo di download. Se per qualche motivo il modulo non si carica (browser
// molto datato), l'app resta comunque utilizzabile: la meditazione funziona lo stesso,
// semplicemente senza sottofondo.
const AMBIENT_LAYER_PRESETS = {
    relax:     [{ synth: 'rain', volume: 0.45 }, { synth: 'wind', volume: 0.12 }],
    focus:     [{ synth: 'stream', volume: 0.4 }, { synth: 'wind', volume: 0.1 }],
    sleep:     [{ synth: 'ocean', volume: 0.45 }, { synth: 'wind', volume: 0.1 }],
    emotions:  [{ synth: 'stream', volume: 0.35 }, { synth: 'birds', volume: 0.15 }],
    grounding: [{ synth: 'birds', volume: 0.3 }, { synth: 'wind', volume: 0.2 }]
};

// Sottoinsieme curato dei preset "ambiently" adatto a un sottofondo di meditazione
// (escluse voci come "città"/"orologio"/"vinile" pensate per altri usi). "Automatico"
// mantiene il comportamento precedente (combinazione scelta in base all'obiettivo).
const AMBIENT_SOUND_OPTIONS = [
    { id: 'auto', label: "Automatico (in base all'obiettivo)" },
    { id: 'rain', label: '🌧️ Pioggia' },
    { id: 'ocean', label: '🌊 Oceano' },
    { id: 'stream', label: '🏞️ Ruscello' },
    { id: 'wind', label: '🍃 Vento' },
    { id: 'birds', label: '🐦 Uccellini' },
    { id: 'crickets', label: '🦗 Grilli' },
    { id: 'frogs', label: '🐸 Rane' },
    { id: 'fire', label: '🔥 Fuoco / Camino' },
    { id: 'thunder', label: '⛈️ Temporale' },
    { id: 'snow', label: '❄️ Vento gelido' }
];

function populateAmbientSoundSelect() {
    const select = document.getElementById('ambient-sound-select');
    select.innerHTML = '';
    AMBIENT_SOUND_OPTIONS.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.innerText = s.label;
        select.appendChild(opt);
    });
}

function toggleAmbientControlsVisibility() {
    const on = document.getElementById('music-toggle').checked;
    document.getElementById('ambient-sound-group').style.display = on ? 'block' : 'none';
    document.getElementById('ambient-volume-group').style.display = on ? 'flex' : 'none';
}

// Cambio del suono scelto manualmente: salvato sul profilo (sincronizzato come tutto
// il resto), e se la meditazione è già in corso il sottofondo passa dolcemente al
// nuovo suono senza dover fermare/riavviare la sessione.
function onAmbientSoundChange() {
    appData.ambientSoundChoice = document.getElementById('ambient-sound-select').value;
    saveData();
    if (isMeditating && document.getElementById('music-toggle').checked) {
        startAmbientSound(currentMeditationGoal);
    }
}

// Cursore volume: valore percentuale salvato sul profilo (0.4 = 40%, default più
// basso del volume di layer precedente per correggere il "troppo forte" segnalato).
// Se il motore audio è già attivo, il volume cambia dal vivo con una breve dissolvenza.
function onAmbientVolumeChange() {
    const pct = Number(document.getElementById('ambient-volume-slider').value);
    document.getElementById('ambient-volume-label').innerText = pct + '%';
    appData.ambientVolume = pct / 100;
    saveData();
    if (ambientEngine) {
        try { ambientEngine.setMasterVolume(appData.ambientVolume, 120); } catch (e) {}
    }
}

function getAmbientEngine() {
    if (!window.AmbientlyEngine) return null;
    if (!ambientEngine) {
        try {
            ambientEngine = new window.AmbientlyEngine([], {
                fadeMs: 900,
                masterVolume: (typeof appData.ambientVolume === 'number') ? appData.ambientVolume : 0.4
            });
        } catch (e) { return null; }
    }
    return ambientEngine;
}

function startAmbientSound(goalId) {
    const engine = getAmbientEngine();
    if (!engine) { console.warn('Motore suoni ambientali non disponibile: sessione senza sottofondo.'); return; }
    const choice = appData.ambientSoundChoice || 'auto';
    let layers;
    if (choice === 'auto') {
        const preset = AMBIENT_LAYER_PRESETS[goalId] || AMBIENT_LAYER_PRESETS.relax;
        layers = preset.map((l, i) => ({ id: goalId + '_' + i, synth: l.synth, volume: l.volume }));
    } else {
        layers = [{ id: 'manual_' + choice, synth: choice, volume: 0.5 }];
    }
    try {
        engine.crossfadeTo(layers);
        engine.play();
        engine.setMasterVolume((typeof appData.ambientVolume === 'number') ? appData.ambientVolume : 0.4, 0);
    } catch (e) { console.warn('Avvio suono ambientale non riuscito:', e); }
}

function stopAmbientSound() {
    if (!ambientEngine) return;
    try { ambientEngine.pause(); } catch (e) {}
}

// --- SEGNALI SONORI BREVI (bip di fine countdown, stesso motore "ambiently") ---

function getHitsEngine() {
    if (!window.createHits) return null;
    if (!hitsEngine) {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            hitsCtx = hitsCtx || new Ctx();
            hitsEngine = window.createHits(hitsCtx);
        } catch (e) { return null; }
    }
    return hitsEngine;
}

// Bip breve e gradevole per segnalare la fine di un countdown (esercizio a tempo,
// riposo) anche a chi non sta guardando lo schermo in quel momento.
function playCueSound(name) {
    try {
        const hits = getHitsEngine();
        if (!hits) return;
        if (hitsCtx && hitsCtx.state === 'suspended') hitsCtx.resume().catch(() => {});
        hits.play(name || 'chime');
    } catch (e) {}
}

// --- VOCE GUIDA (Web Speech API, con fallback automatico a solo testo) --------
//
// NOTA: la qualità di questa voce dipende dal dispositivo/browser, non dall'app —
// non è possibile spedire una voce "di studio" pre-registrata dentro una PWA statica
// senza un server che la generi (vedi changelog per i dettagli). Quello che possiamo
// fare senza dipendenze esterne è scegliere, tra le voci italiane disponibili sul
// dispositivo, quella migliore: molti telefoni (soprattutto Android/Chrome) offrono
// sia una voce locale (più robotica, funziona offline) sia una voce "di rete" molto
// più naturale (richiede connessione) - la preferiamo quando c'è.

// Pre-carica la lista voci appena il browser la rende disponibile: su alcuni browser
// il primo getVoices() ritorna vuoto finché non scatta l'evento 'voiceschanged'.
if (window.speechSynthesis) {
    try { window.speechSynthesis.getVoices(); } catch (e) {}
    window.speechSynthesis.onvoiceschanged = function () {
        try { window.speechSynthesis.getVoices(); } catch (e) {}
        updateVoiceDiagnostics();
    };
}

// Mostra a schermo (non solo in console) quante e quali voci italiane il browser
// rende disponibili: su molti telefoni Android la voce robotica non è un bug
// dell'app ma il pacchetto voce di sistema — questo permette di distinguere i due
// casi senza dover aprire gli strumenti sviluppatore.
function updateVoiceDiagnostics() {
    const el = document.getElementById('voice-diag-text');
    if (!el) return;
    if (!window.speechSynthesis) { el.innerText = ''; return; }
    const itVoices = (window.speechSynthesis.getVoices() || []).filter(v => v.lang && v.lang.toLowerCase().indexOf('it') === 0);
    if (itVoices.length === 0) {
        el.innerText = 'Nessuna voce italiana trovata su questo dispositivo/browser.';
        return;
    }
    const names = itVoices.map(v => v.name + (v.localService === false ? ' (rete)' : ' (locale)')).join(', ');
    el.innerText = 'Voci italiane trovate (' + itVoices.length + '): ' + names;
}

function pickBestItalianVoice(voices) {
    const itVoices = (voices || []).filter(v => v.lang && v.lang.toLowerCase().indexOf('it') === 0);
    if (itVoices.length === 0) return null;
    const score = (v) => {
        let s = 0;
        if (v.localService === false) s += 10; // voce di rete: quasi sempre più naturale
        if (/neural|natural|premium|wavenet|multilingual/i.test(v.name || '')) s += 5;
        if (/google/i.test(v.name || '')) s += 3;
        return s;
    };
    return itVoices.slice().sort((a, b) => score(b) - score(a))[0];
}

function speakCue(text) {
    if (!window.speechSynthesis) return;
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'it-IT';
        utter.rate = 0.9;
        utter.pitch = 0.95;
        const itVoice = pickBestItalianVoice(window.speechSynthesis.getVoices());
        if (itVoice) utter.voice = itVoice;
        window.speechSynthesis.speak(utter);
    } catch (e) { console.warn('Sintesi vocale non disponibile, resta il testo a schermo:', e); }
}

function cancelSpeech() {
    if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
}

// --- RENDER GENERALE ----------------------------------------------------------

function renderStatsUI() {
    const level = (appData.fitness && appData.fitness.level) || MIN_LEVEL;
    document.getElementById('stat-level').innerText = level + ' / ' + MAX_LEVEL;
    document.getElementById('total-workouts').innerText = appData.totalWorkouts || 0;
    document.getElementById('last-feedback').innerText = appData.lastFeedback || 'Nessuno';

    const streakCount = (appData.streak && appData.streak.count) || 0;
    document.getElementById('stat-streak').innerText = streakCount + ' giorni 🔥';
    document.getElementById('workout-streak-badge').innerHTML = '🔥 Streak <strong>' + streakCount + '</strong>';
    document.getElementById('workout-level-badge').innerText = level;

    const mindLevel = (appData.mind && appData.mind.level) || MIND_MIN_LEVEL;
    document.getElementById('stat-mind-level').innerText = mindLevel + ' / ' + MIND_MAX_LEVEL;
    document.getElementById('mind-level-badge').innerText = mindLevel;
    document.getElementById('mind-streak-badge').innerHTML = '🔥 Streak <strong>' + streakCount + '</strong>';

    document.getElementById('total-meditations').innerText = appData.totalMeditations || 0;

    const stats = computeMeditationStats(appData.meditationHistory, 7);
    const trendEl = document.getElementById('meditation-trend-text');
    if (stats.avgDelta === null) {
        trendEl.innerText = "Fai una sessione di meditazione con check-in umore per iniziare a vedere il tuo andamento.";
    } else {
        const before = stats.avgBefore.toFixed(1);
        const after = stats.avgAfter.toFixed(1);
        const delta = (stats.avgDelta >= 0 ? '+' : '') + stats.avgDelta.toFixed(1);
        trendEl.innerText = "Nelle ultime " + stats.count + " sessioni, l'umore medio è passato da " + before + " a " + after + " su 5 (" + delta + ").";
    }
}

function renderAllUI() {
    document.getElementById('user-header-name').innerText = "Profilo: " + (appData.username || currentUsername || '').toUpperCase();
    document.getElementById('prof-name').innerText = appData.username || '-';
    document.getElementById('prof-age').innerText = calculateAge(appData.dob) + (appData.dob ? " anni" : "");
    document.getElementById('prof-height').innerText = (appData.height ? appData.height + " cm" : '-');
    const weightConditionLabels = {
        nudo: 'nudo/a digiuno', intimo: 'solo intimo', leggero: 'abb. leggero',
        normale: 'abb. normale', pesante: 'abb. pesante'
    };
    const weightConditionLabel = weightConditionLabels[appData.weightCondition] || '';
    document.getElementById('prof-weight').innerText = appData.netWeight
        ? appData.netWeight + " kg" + (weightConditionLabel ? " (" + weightConditionLabel + ")" : '')
        : '-';
    document.getElementById('prof-mood').innerText = appData.mood || '-';
    document.getElementById('prof-sleep').innerText = appData.sleep || '-';
    document.getElementById('prof-energy').innerText = appData.energy || '-';

    renderStatsUI();

    if (appData.currentWorkoutScheme) renderWorkoutScheme(appData.currentWorkoutScheme);
}

window.onload = initApp;
