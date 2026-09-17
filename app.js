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
let ambientAudioCtx = null;
let ambientNodes = null;

// --- DATI: default, storage locale, normalizzazione -----------------------

function defaultAppData(username) {
    return {
        username: username || '',
        dob: '', height: '', netWeight: '',
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
    document.getElementById('input-height').value = '';
    document.getElementById('input-weight').value = '';
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
    document.getElementById('input-height').value = appData.height || '';
    document.getElementById('input-weight').value = appData.netWeight || '';
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

function executeLogin() {
    const input = document.getElementById('login-username-input').value.trim().toLowerCase();
    if (!input) return alert("Inserisci un ID valido");
    currentUsername = input;
    localStorage.setItem('fm_user', currentUsername);
    closeModal('login-modal');

    const local = loadLocal(currentUsername);
    appData = normalizeAppData(Object.assign(defaultAppData(currentUsername), local || {}));
    showDashboardUI();
    ensureTodayWorkout();
    renderAllUI();
    attachFirebaseListener(currentUsername);
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

function renderExerciseList(items, targetId) {
    const container = document.getElementById(targetId);
    container.innerHTML = '';
    (items || []).forEach((ex) => {
        const div = document.createElement('div');
        div.className = 'exercise-item';
        div.innerHTML =
            '<div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">' +
                '<strong style="color: var(--text-primary); font-size: 1rem;"></strong>' +
                '<span style="color: var(--accent-meditation); font-weight: bold;"></span>' +
            '</div>' +
            '<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.3;"></div>';
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

// --- AUDIO AMBIENTE (sintetizzato via WebAudio, nessuna dipendenza esterna) ---

const AMBIENT_PROFILES = {
    relax:     { base: 110, detune: 4, lfo: 0.06,  gain: 0.05 },
    focus:     { base: 174, detune: 3, lfo: 0.10,  gain: 0.045 },
    sleep:     { base: 82,  detune: 2, lfo: 0.04,  gain: 0.05 },
    emotions:  { base: 130, detune: 5, lfo: 0.05,  gain: 0.05 },
    grounding: { base: 98,  detune: 3, lfo: 0.045, gain: 0.055 }
};

function getAmbientAudioCtx() {
    if (!ambientAudioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { ambientAudioCtx = new Ctx(); } catch (e) { return null; }
    }
    return ambientAudioCtx;
}

function startAmbientSound(goalId) {
    const ctx = getAmbientAudioCtx();
    if (!ctx) return;
    stopAmbientSound();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const profile = AMBIENT_PROFILES[goalId] || AMBIENT_PROFILES.relax;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(profile.gain, ctx.currentTime + 2.5);
    master.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(profile.base, ctx.currentTime);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(profile.base + profile.detune, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(profile.lfo, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(profile.gain * 0.4, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);

    osc1.connect(master);
    osc2.connect(master);
    osc1.start();
    osc2.start();
    lfo.start();

    ambientNodes = { master: master, osc1: osc1, osc2: osc2, lfo: lfo };
}

function stopAmbientSound() {
    if (!ambientNodes || !ambientAudioCtx) { ambientNodes = null; return; }
    const ctx = ambientAudioCtx;
    const nodes = ambientNodes;
    try {
        nodes.master.gain.cancelScheduledValues(ctx.currentTime);
        nodes.master.gain.setValueAtTime(nodes.master.gain.value, ctx.currentTime);
        nodes.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
        setTimeout(() => {
            try { nodes.osc1.stop(); nodes.osc2.stop(); nodes.lfo.stop(); } catch (e) {}
        }, 700);
    } catch (e) {}
    ambientNodes = null;
}

// --- VOCE GUIDA (Web Speech API, con fallback automatico a solo testo) --------

function speakCue(text) {
    if (!window.speechSynthesis) return;
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'it-IT';
        utter.rate = 0.9;
        utter.pitch = 0.95;
        const voices = window.speechSynthesis.getVoices();
        const itVoice = voices.find(v => v.lang && v.lang.toLowerCase().indexOf('it') === 0);
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
    document.getElementById('prof-weight').innerText = (appData.netWeight ? appData.netWeight + " kg" : '-');
    document.getElementById('prof-mood').innerText = appData.mood || '-';
    document.getElementById('prof-sleep').innerText = appData.sleep || '-';
    document.getElementById('prof-energy').innerText = appData.energy || '-';

    renderStatsUI();

    if (appData.currentWorkoutScheme) renderWorkoutScheme(appData.currentWorkoutScheme);
}

window.onload = initApp;
