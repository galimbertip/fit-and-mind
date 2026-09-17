// ============================================================================
// Fit & Mind - Motore locale di generazione allenamento (no AI, no rete)
// Funzioni pure, testabili fuori dal browser (Node) e riusate identiche
// dentro index.html.
// ============================================================================

const MIN_LEVEL = 1;
const MAX_LEVEL = 10;

// --- LIBRERIA ESERCIZI --------------------------------------------------

const WARMUP_POOL = [
    { id: 'w1', name: 'Circonduzioni Braccia', qty: '30', unit: 'sec', desc: 'Braccia tese lateralmente, disegna cerchi ampi avanti e indietro.' },
    { id: 'w2', name: 'Circonduzioni Anche', qty: '30', unit: 'sec', desc: 'Mani sui fianchi, ruota il bacino descrivendo cerchi ampi.' },
    { id: 'w3', name: 'Marcia sul Posto', qty: '45', unit: 'sec', desc: 'Ginocchia alte, braccia in movimento, ritmo sostenuto per attivare la circolazione.' },
    { id: 'w4', name: 'Affondi in Camminata', qty: '10', unit: 'rep', desc: 'Passo lungo in avanti, scendi piegando entrambe le ginocchia a 90°, alterna gamba.' },
    { id: 'w5', name: 'Cat-Cow (Mobilità Colonna)', qty: '8', unit: 'rep', desc: 'Carponi, alterna inarcamento e arrotondamento della schiena seguendo il respiro.' },
    { id: 'w6', name: 'Squat Mobility Lento', qty: '10', unit: 'rep', desc: 'Scendi lentamente in squat controllando il movimento, senza rimbalzare.' },
    { id: 'w7', name: 'Jumping Jack Leggeri', qty: '30', unit: 'sec', desc: 'Apri e chiudi braccia e gambe a ritmo moderato per scaldare tutto il corpo.' },
    { id: 'w8', name: 'Rotazione Busto', qty: '10', unit: 'rep', desc: 'Piedi larghi, ruota delicatamente il busto a destra e sinistra.' },
];

const COOLDOWN_POOL = [
    { id: 'c1', name: 'Stretching Quadricipite', qty: '20', unit: 'sec/lato', desc: 'In piedi, porta il tallone verso il gluteo tenendolo con la mano.' },
    { id: 'c2', name: 'Stretching Femorali', qty: '20', unit: 'sec/lato', desc: 'Gamba tesa in avanti, busto inclinato leggermente in avanti, senza forzare.' },
    { id: 'c3', name: "Child's Pose", qty: '30', unit: 'sec', desc: 'Seduto sui talloni, allunga le braccia in avanti e rilassa la schiena.' },
    { id: 'c4', name: 'Stretching Laterale', qty: '20', unit: 'sec/lato', desc: 'In piedi, inclina il busto lateralmente allungando un fianco alla volta.' },
    { id: 'c5', name: 'Respirazione Diaframmatica', qty: '60', unit: 'sec', desc: 'Sdraiato, una mano sulla pancia: inspira gonfiandola, espira lentamente.' },
];

// CORE = focus pancia. unlockLevel = livello minimo per comparire.
// base/inc/maxVal = progressione del carico (reps o secondi) con il livello.
// Il blocco CORE usa una "doppia progressione" reps x serie (come un vero
// programma di allenamento: si sale di ripetizioni fino a un tetto, poi si
// aggiunge una serie e si riparte da ripetizioni più basse), invece di un
// singolo numero che cresce all'infinito. Vedi CORE_SETS_BASE/MAX/STEPS più sotto.
const CORE_POOL = [
    { id: 'k1', name: 'Plank sulle Ginocchia', unit: 'sec', unlockLevel: 1, repsBase: 20, repsInc: 5, desc: 'Avambracci e ginocchia a terra, corpo allineato, contrai l\'addome.' },
    { id: 'k2', name: 'Plank', unit: 'sec', unlockLevel: 2, repsBase: 20, repsInc: 5, desc: 'Avambracci e punte dei piedi a terra, corpo in linea retta, addome contratto.' },
    { id: 'k3', name: 'Crunch', unit: 'rep', unlockLevel: 1, repsBase: 10, repsInc: 3, desc: 'Sdraiato, ginocchia piegate, solleva le scapole da terra contraendo l\'addome.' },
    { id: 'k4', name: 'Sollevamento Gambe', unit: 'rep', unlockLevel: 2, repsBase: 8, repsInc: 2, desc: 'Sdraiato supino, gambe tese, sollevale fino a 90° mantenendo la schiena a terra.' },
    { id: 'k5', name: 'Bicycle Crunch', unit: 'rep/lato', unlockLevel: 3, repsBase: 8, repsInc: 2, desc: 'Sdraiato, pedala portando il gomito opposto verso il ginocchio che sale.' },
    { id: 'k6', name: 'Russian Twist', unit: 'rep/lato', unlockLevel: 3, repsBase: 8, repsInc: 2, desc: 'Seduto, busto inclinato indietro, ruota il busto toccando terra ai lati.' },
    { id: 'k7', name: 'Plank Laterale', unit: 'sec/lato', unlockLevel: 3, repsBase: 15, repsInc: 5, desc: 'Su un fianco, appoggio su avambraccio e piede, corpo allineato.' },
    { id: 'k8', name: 'Mountain Climber', unit: 'sec', unlockLevel: 2, repsBase: 20, repsInc: 5, desc: 'In posizione plank, porta alternativamente le ginocchia al petto a ritmo sostenuto.' },
    { id: 'k9', name: 'Dead Bug', unit: 'rep/lato', unlockLevel: 2, repsBase: 6, repsInc: 2, desc: 'Supino, braccia e gambe sollevate: estendi braccio e gamba opposti mantenendo la schiena a terra.' },
    { id: 'k10', name: 'Superman', unit: 'rep', unlockLevel: 1, repsBase: 8, repsInc: 2, desc: 'Prono, solleva contemporaneamente braccia, petto e gambe da terra.' },
    { id: 'k11', name: 'Plank Shoulder Tap', unit: 'rep/lato', unlockLevel: 4, repsBase: 6, repsInc: 2, desc: 'In plank su mani, tocca la spalla opposta con la mano alternando, bacino fermo.' },
    { id: 'k12', name: 'V-Up', unit: 'rep', unlockLevel: 5, repsBase: 6, repsInc: 2, desc: 'Sdraiato, solleva contemporaneamente busto e gambe tese a formare una V.' },
    { id: 'k13', name: 'Hollow Body Hold', unit: 'sec', unlockLevel: 6, repsBase: 15, repsInc: 5, desc: 'Sdraiato, solleva spalle e gambe tese qualche centimetro da terra, schiena premuta al suolo.' },
    { id: 'k14', name: 'Twist in Ginocchio (Obliqui)', unit: 'rep/lato', unlockLevel: 2, repsBase: 10, repsInc: 3, desc: 'In ginocchio, busto leggermente inclinato: ruota il busto portando le braccia raccolte da un lato all\'altro, in modo controllato (non a scatti) tenendo il bacino stabile.' },
    // Calisthenics verificati (fonti: GMB Fitness, Greatist) — progressione reale verso L-sit e Dragon Flag,
    // introdotti solo ai livelli alti perché richiedono mesi di lavoro sui prerequisiti (plank, hollow hold).
    { id: 'k15', name: 'L-Sit Tuck (Raccolto)', unit: 'sec', unlockLevel: 5, repsBase: 8, repsInc: 3, avoidIf: ['polsi_spalle'], desc: 'Seduto, mani a terra ai lati del bacino, spalle "depresse" lontano dalle orecchie: solleva il corpo con le ginocchia raccolte al petto.' },
    { id: 'k16', name: 'L-Sit Una Gamba', unit: 'sec', unlockLevel: 7, repsBase: 6, repsInc: 3, avoidIf: ['polsi_spalle'], desc: 'Come il Tuck, ma distendi una gamba alla volta mantenendo l\'altra raccolta: propedeutico all\'L-Sit completo.' },
    { id: 'k17', name: 'L-Sit Completo', unit: 'sec', unlockLevel: 9, repsBase: 5, repsInc: 2, avoidIf: ['polsi_spalle'], desc: 'Mani a terra, entrambe le gambe tese e sollevate parallele al suolo: massima compressione addominale.' },
    { id: 'k18', name: 'Dragon Flag Negativo', unit: 'rep', unlockLevel: 9, repsBase: 4, repsInc: 1, avoidIf: ['schiena'], desc: 'Sdraiato, mani sotto la testa per appoggio: solleva il corpo teso in verticale poi scendi lentissimo controllando con l\'addome, ginocchia piegate se serve. Fermati subito se la schiena si inarca o senti dolore.' },
];

// CIRCUIT = full body / cardio, componente "brucia calorie" della sessione.
const CIRCUIT_POOL = [
    { id: 's1', name: 'Squat a Corpo Libero', unit: 'rep', unlockLevel: 1, base: 12, inc: 2, maxVal: 30, desc: 'Piedi larghezza spalle, scendi spingendo il bacino indietro, ginocchia in linea con i piedi.' },
    { id: 's2', name: 'Affondi Alternati', unit: 'rep/lato', unlockLevel: 1, base: 10, inc: 2, maxVal: 20, desc: 'Passo avanti, scendi piegando entrambe le ginocchia a 90°, torna su e alterna.' },
    { id: 's3', name: 'Jumping Jack', unit: 'sec', unlockLevel: 1, base: 30, inc: 5, maxVal: 60, desc: 'Apri e chiudi gambe e braccia con un piccolo salto, ritmo sostenuto.' },
    { id: 's4', name: 'Push-Up sulle Ginocchia', unit: 'rep', unlockLevel: 1, base: 8, inc: 2, maxVal: 20, desc: 'Ginocchia a terra, mani poco più larghe delle spalle, scendi controllando il petto verso terra.' },
    { id: 's5', name: 'Push-Up', unit: 'rep', unlockLevel: 3, base: 6, inc: 2, maxVal: 20, desc: 'Corpo in linea retta su mani e punte dei piedi, scendi fino a sfiorare terra col petto.' },
    { id: 's6', name: 'Glute Bridge', unit: 'rep', unlockLevel: 1, base: 12, inc: 2, maxVal: 25, desc: 'Supino, ginocchia piegate, solleva il bacino contraendo i glutei.' },
    { id: 's7', name: 'High Knees', unit: 'sec', unlockLevel: 2, base: 20, inc: 5, maxVal: 45, desc: 'Corri sul posto portando le ginocchia il più in alto possibile.' },
    { id: 's8', name: 'Wall Sit', unit: 'sec', unlockLevel: 2, base: 20, inc: 5, maxVal: 60, desc: 'Schiena al muro, scendi come su una sedia immaginaria a 90°, mantieni la posizione.' },
    { id: 's9', name: 'Burpee senza Salto', unit: 'rep', unlockLevel: 3, base: 6, inc: 1, maxVal: 15, desc: 'Da in piedi scendi in plank, torna in piedi senza il salto finale.' },
    { id: 's10', name: 'Plank Jack', unit: 'rep', unlockLevel: 3, base: 10, inc: 2, maxVal: 25, desc: 'In plank, apri e chiudi le gambe con un piccolo salto mantenendo il bacino stabile.' },
    { id: 's11', name: 'Squat Jump', unit: 'rep', unlockLevel: 4, base: 8, inc: 2, maxVal: 20, desc: 'Esegui uno squat e spingi verso l\'alto in un salto, atterra morbido e riparti.' },
    { id: 's12', name: 'Burpee Completo', unit: 'rep', unlockLevel: 5, base: 6, inc: 1, maxVal: 15, desc: 'Da in piedi scendi in plank, push-up opzionale, torna in piedi con salto finale.' },
    { id: 's13', name: 'Skater Jump', unit: 'rep/lato', unlockLevel: 4, base: 8, inc: 2, maxVal: 18, desc: 'Salta lateralmente da una gamba all\'altra come un pattinatore, mantieni l\'equilibrio.' },
    // Calisthenics verificati (fonti: GMB Fitness, PowerliftingTechnique, NASM) — progressioni reali,
    // non le versioni "instant" mostrate nei reel. Il Nordic Curl NON è stato incluso: le fonti (SimpliFaster)
    // lo sconsigliano per chi si allena a casa senza supervisione, per il rischio su ginocchio/menisco.
    { id: 's14', name: 'Affondo Bulgaro (piede rialzato)', unit: 'rep/lato', unlockLevel: 4, base: 8, inc: 2, maxVal: 18, avoidIf: ['ginocchia'], desc: 'Piede posteriore appoggiato su una sedia/gradino, scendi con la gamba anteriore: più intenso dell\'affondo classico, ottimo prima del pistol squat.' },
    { id: 's15', name: 'Pike Push-Up', unit: 'rep', unlockLevel: 4, base: 6, inc: 2, maxVal: 16, avoidIf: ['polsi_spalle'], desc: 'A "V" rovesciata, bacino in alto: piega i gomiti portando la testa verso il pavimento. Prepara le spalle alle progressioni di handstand.' },
    { id: 's16', name: 'Shrimp Squat (assistito)', unit: 'rep/lato', unlockLevel: 6, base: 5, inc: 1, maxVal: 12, avoidIf: ['ginocchia'], desc: 'In piedi su una gamba, tieni l\'altra caviglia dietro con la mano: scendi in squat toccando il ginocchio a terra. Alternativa più accessibile al pistol squat.' },
    { id: 's17', name: 'Pistol Squat Assistito', unit: 'rep/lato', unlockLevel: 7, base: 4, inc: 1, maxVal: 10, avoidIf: ['ginocchia'], desc: 'Tenendoti con una mano a un mobile stabile, scendi su una gamba sola mentre l\'altra resta tesa in avanti. Metodo "bottom-up": è normale che la schiena si arrotondi leggermente.' },
    { id: 's18', name: 'Pistol Squat', unit: 'rep/lato', unlockLevel: 9, base: 3, inc: 1, maxVal: 8, avoidIf: ['ginocchia'], desc: 'Squat su una gamba sola completo, senza appoggio, l\'altra gamba tesa in avanti. Rispetta la tua mobilità di caviglia: non forzare la profondità.' },
    { id: 's19', name: 'Archer Push-Up', unit: 'rep/lato', unlockLevel: 8, base: 4, inc: 1, maxVal: 10, avoidIf: ['polsi_spalle'], desc: 'Mani molto più larghe delle spalle: piega un braccio spostando il peso di lato, l\'altro resta teso. Passo intermedio verso il push-up a un braccio.' },
    { id: 's20', name: 'Wall Walk (verso Handstand)', unit: 'rep', unlockLevel: 6, base: 3, inc: 1, maxVal: 8, avoidIf: ['polsi_spalle'], desc: 'Parti in plank con i piedi al muro, cammina con le mani indietro mentre i piedi salgono sulla parete, il più vicino possibile alla verticale. Scendi con controllo.' },
];

// --- HELPER ---------------------------------------------------------------

function computeValueForLevel(ex, level) {
    const effLevel = Math.max(level, ex.unlockLevel);
    const raw = ex.base + ex.inc * (effLevel - ex.unlockLevel);
    return Math.min(raw, ex.maxVal);
}

function poolForLevel(pool, level) {
    return pool.filter(ex => ex.unlockLevel <= level);
}

// Esclude gli esercizi segnalati come da evitare per le limitazioni indicate in fase di
// profilo (es. ginocchia, schiena, polsi/spalle). limitations è un array di stringhe.
function filterByLimitations(pool, limitations) {
    if (!limitations || limitations.length === 0) return pool;
    return pool.filter(ex => !ex.avoidIf || !ex.avoidIf.some(l => limitations.indexOf(l) !== -1));
}

function pickN(arr, n, exclude, rng) {
    const random = rng || Math.random;
    exclude = exclude || [];
    let candidates = arr.filter(e => exclude.indexOf(e.id) === -1);
    if (candidates.length < n) candidates = arr.slice();
    const shuffled = candidates.slice().sort(() => random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
}

function roundsForLevel(level) {
    return Math.min(4, 2 + Math.floor((level - 1) / 3));
}

function isRecoveryDay(state) {
    return state.energy === 'Bassa (20%)' || state.sleep === '1/5 - Scarso' || state.mood === 'Stanco / Affaticato';
}

function buildRationale(ctx) {
    const level = ctx.level, recovery = ctx.recovery, state = ctx.state, rounds = ctx.rounds;
    const feedback = state.lastFeedback;
    const parts = [];

    if (!state.totalWorkouts) {
        parts.push('Benvenuto al tuo primo allenamento: partiamo dal Livello ' + level + ' per trovare il ritmo giusto, poi la scheda si adatterà a te.');
    } else if (recovery) {
        parts.push('Oggi energia, sonno o umore sono sotto tono: sessione più leggera e orientata alla mobilità, il livello resta invariato.');
    } else if (feedback === 'Troppo Facile') {
        parts.push('L\'ultima scheda ti è sembrata leggera: si sale, Livello ' + level + ', con carichi più impegnativi.');
    } else if (feedback === 'Troppo Duro') {
        parts.push('L\'ultima scheda era impegnativa: oggi torniamo un po\' più leggeri, Livello ' + level + ', per consolidare senza strafare.');
    } else {
        parts.push('Stai procedendo bene: Livello ' + level + ', ' + rounds + ' giri di circuito, focus su addome e corpo libero.');
    }

    if (state.mood === 'Stressato / In ansia') {
        parts.push('Hai indicato stress oggi: dopo l\'allenamento vale la pena chiudere con qualche minuto di meditazione.');
    }

    return parts.join(' ');
}

// --- DOPPIA PROGRESSIONE PER IL BLOCCO CORE ---------------------------------
// Schema standard nel personal training: si aumentano le ripetizioni fino a un
// tetto per un numero fisso di livelli, poi si aggiunge una serie e si riparte
// da ripetizioni più basse, fino a un massimo di serie. Stesso principio del
// classico "3x12 -> 4x12" scritto sulle schede in palestra.
const CORE_SETS_BASE = 2;
const CORE_SETS_MAX = 4;
const CORE_REPS_STEPS = 3; // quanti "gradini" di reps prima di aggiungere una serie

function computeSetsReps(ex, level) {
    const idx = Math.max(0, Math.min(MAX_LEVEL - 1, level - ex.unlockLevel));
    let sets = CORE_SETS_BASE;
    let reps = ex.repsBase;
    for (let step = 1; step <= idx; step++) {
        if (step % CORE_REPS_STEPS === 0 && sets < CORE_SETS_MAX) {
            sets += 1;
            reps = ex.repsBase;
        } else {
            reps += ex.repsInc;
        }
    }
    return { sets: sets, reps: reps };
}

function formatCoreEx(ex, level, scale) {
    const sr = computeSetsReps(ex, level);
    let sets = sr.sets;
    let reps = sr.reps;
    if (scale < 1) {
        sets = Math.max(CORE_SETS_BASE, sets - 1);
        reps = Math.round(reps * scale);
    }
    const floor = ex.unit.indexOf('sec') > -1 ? 10 : 6;
    reps = Math.max(reps, floor);
    return { id: ex.id, name: ex.name, sets: sets, qty: String(reps), unit: ex.unit, desc: ex.desc };
}

function formatEx(ex, level, scale) {
    let val = computeValueForLevel(ex, level);
    val = Math.round(val * scale);
    const floor = ex.unit.indexOf('sec') === 0 || ex.unit.indexOf('sec') > -1 ? 10 : 6;
    val = Math.max(val, floor);
    return { id: ex.id, name: ex.name, qty: String(val), unit: ex.unit, desc: ex.desc };
}

// --- API PRINCIPALE ---------------------------------------------------------

// state atteso: { level, lastFeedback, lastExerciseIds, energy, sleep, mood, totalWorkouts }
function generateWorkout(state, rng) {
    const level = state.level || MIN_LEVEL;
    const recovery = isRecoveryDay(state);

    let coreCount = level >= 5 ? 4 : 3;
    let circuitCount = level >= 5 ? 4 : 3;
    let rounds = roundsForLevel(level);

    if (recovery) {
        coreCount = Math.max(2, coreCount - 1);
        circuitCount = Math.max(2, circuitCount - 1);
        rounds = Math.max(1, rounds - 1);
    }

    const exclude = state.lastExerciseIds || [];
    const warmup = pickN(WARMUP_POOL, 3, exclude, rng);
    const cooldown = pickN(COOLDOWN_POOL, 2, exclude, rng);

    const limitations = state.limitations || [];
    const corePoolAtLevel = filterByLimitations(poolForLevel(CORE_POOL, level), limitations);
    const circuitPoolAtLevel = filterByLimitations(poolForLevel(CIRCUIT_POOL, level), limitations);

    const coreExercises = pickN(corePoolAtLevel, coreCount, exclude, rng);
    const circuitExercises = pickN(circuitPoolAtLevel, circuitCount, exclude, rng);

    const scale = recovery ? 0.75 : 1;

    const warmupOut = warmup.map(ex => ({ id: ex.id, name: ex.name, qty: ex.qty, unit: ex.unit, desc: ex.desc }));
    const cooldownOut = cooldown.map(ex => ({ id: ex.id, name: ex.name, qty: ex.qty, unit: ex.unit, desc: ex.desc }));
    const coreOut = coreExercises.map(ex => formatCoreEx(ex, level, scale));
    const circuitOut = circuitExercises.map(ex => formatEx(ex, level, scale));

    const rationale = buildRationale({ level, recovery, state, rounds });
    const usedIds = warmup.concat(coreExercises, circuitExercises, cooldown).map(e => e.id);

    return {
        rationale,
        level,
        rounds,
        recovery,
        warmup: warmupOut,
        core: coreOut,
        circuit: circuitOut,
        cooldown: cooldownOut,
        usedIds
    };
}

// Aggiorna livello + contatori dopo un feedback. state: { level, consecutiveEasy, consecutiveOk }
function applyFeedback(state, feedback) {
    let level = state.level || MIN_LEVEL;
    let consecutiveEasy = state.consecutiveEasy || 0;
    let consecutiveOk = state.consecutiveOk || 0;

    if (feedback === 'Troppo Facile') {
        consecutiveEasy++;
        consecutiveOk = 0;
        if (consecutiveEasy >= 2) {
            level = Math.min(MAX_LEVEL, level + 1);
            consecutiveEasy = 0;
        }
    } else if (feedback === 'Giusto') {
        consecutiveOk++;
        consecutiveEasy = 0;
        if (consecutiveOk >= 4) {
            level = Math.min(MAX_LEVEL, level + 1);
            consecutiveOk = 0;
        }
    } else if (feedback === 'Troppo Duro') {
        level = Math.max(MIN_LEVEL, level - 1);
        consecutiveEasy = 0;
        consecutiveOk = 0;
    }

    return { level: level, consecutiveEasy: consecutiveEasy, consecutiveOk: consecutiveOk };
}

// ============================================================================
// Meditazione: scala umore, statistiche, streak "cura di te" unificato
// ============================================================================

const MOOD_SCALE = [
    { value: 1, emoji: '😣', label: 'Molto teso' },
    { value: 2, emoji: '🙁', label: 'Teso' },
    { value: 3, emoji: '😐', label: 'Neutro' },
    { value: 4, emoji: '🙂', label: 'Sereno' },
    { value: 5, emoji: '😌', label: 'Molto sereno' },
];

// Statistiche sulle ultime N sessioni di meditazione (default 7).
function computeMeditationStats(history, sampleSize) {
    sampleSize = sampleSize || 7;
    const recent = (history || []).slice(-sampleSize);
    const withBoth = recent.filter(h => typeof h.moodBefore === 'number' && typeof h.moodAfter === 'number');
    if (withBoth.length === 0) {
        return { count: recent.length, avgBefore: null, avgAfter: null, avgDelta: null };
    }
    const avgBefore = withBoth.reduce((s, h) => s + h.moodBefore, 0) / withBoth.length;
    const avgAfter = withBoth.reduce((s, h) => s + h.moodAfter, 0) / withBoth.length;
    return { count: recent.length, avgBefore: avgBefore, avgAfter: avgAfter, avgDelta: avgAfter - avgBefore };
}

// Data locale 'YYYY-MM-DD' senza ambiguità di fuso orario (evita i bug di new Date(string) in UTC).
function localDateStr(d) {
    d = d || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function addDaysToDateStr(dateStr, days) {
    const parts = dateStr.split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    dt.setDate(dt.getDate() + days);
    return localDateStr(dt);
}

// Streak unificato: conta un giorno se è stato completato allenamento O meditazione.
// streakState: { count, lastActivityDate }. Va chiamato al massimo una volta per attività completata.
function updateStreak(streakState, todayStr) {
    const last = streakState.lastActivityDate;
    if (last === todayStr) {
        return { count: streakState.count || 1, lastActivityDate: todayStr };
    }
    const yesterdayStr = addDaysToDateStr(todayStr, -1);
    const count = (last === yesterdayStr) ? (streakState.count || 0) + 1 : 1;
    return { count: count, lastActivityDate: todayStr };
}

// ============================================================================
// Motore "Mente": progressione della meditazione, in specchio al motore fitness
// (stesso applyFeedback, stesso principio "cresce con te"), script guidati con
// intensità di guida decrescente man mano che l'utente matura la pratica.
// ============================================================================

const MIND_MIN_LEVEL = 1;
const MIND_MAX_LEVEL = 6;

const MEDITATION_GOALS = [
    { id: 'relax', label: 'Rilassamento & De-Stress' },
    { id: 'focus', label: 'Focus & Energia' },
    { id: 'sleep', label: 'Preparazione al Sonno' },
    { id: 'emotions', label: 'Gestione delle Emozioni' },
    { id: 'grounding', label: 'Radicamento & Crescita Interiore' },
];

// Durata (minuti) consigliata per livello 1..6, con un piccolo scostamento per obiettivo.
// Cresce con la pratica esattamente come i carichi dell'allenamento fisico.
const MIND_BASE_MINUTES_BY_LEVEL = [3, 5, 8, 10, 15, 20];
const MIND_GOAL_OFFSET_MIN = { relax: 0, focus: -1, sleep: 3, emotions: 0, grounding: 2 };

function suggestedMeditationMinutes(goalId, mindLevel) {
    const lvl = Math.max(MIND_MIN_LEVEL, Math.min(MIND_MAX_LEVEL, mindLevel || MIND_MIN_LEVEL));
    const base = MIND_BASE_MINUTES_BY_LEVEL[lvl - 1];
    const offset = MIND_GOAL_OFFSET_MIN[goalId] || 0;
    return Math.max(2, base + offset);
}

// Livello -> "tier" di guida: più il praticante è avanzato, meno prompt riceve
// (si allena a stare in silenzio da solo), non meno tempo di pratica.
function mindTier(mindLevel) {
    if (mindLevel <= 2) return 'base';
    if (mindLevel <= 4) return 'intermedio';
    return 'avanzato';
}
const MIND_TIER_RANK = { base: 1, intermedio: 2, avanzato: 3 };

// Ogni script è una lista di indicazioni con atFraction (0..1 della durata totale, si
// riscala su qualsiasi durata) e showUpToTier: 1 = solo tier Base, 2 = Base+Intermedio,
// 3 = presente in tutti i tier (sono gli "ancoraggi" essenziali della sessione).
const MEDITATION_SCRIPTS = {
    relax: [
        { atFraction: 0.00, showUpToTier: 3, text: 'Trova una posizione comoda, seduto o sdraiato. Chiudi gli occhi quando ti senti pronto.' },
        { atFraction: 0.05, showUpToTier: 1, text: 'Lascia che le spalle si abbassino, un centimetro alla volta.' },
        { atFraction: 0.12, showUpToTier: 2, text: 'Fai un respiro profondo dal naso, e rilascialo lentamente dalla bocca.' },
        { atFraction: 0.20, showUpToTier: 3, text: 'Nota il peso del corpo che si appoggia, senza doverlo sostenere.' },
        { atFraction: 0.30, showUpToTier: 1, text: 'Se un pensiero arriva, va bene. Osservalo, e lascialo passare, come una nuvola.' },
        { atFraction: 0.40, showUpToTier: 2, text: 'Porta l\'attenzione al respiro: inspira contando fino a quattro, espira contando fino a sei.' },
        { atFraction: 0.50, showUpToTier: 3, text: 'Ogni espirazione è un piccolo invito a lasciar andare la tensione.' },
        { atFraction: 0.60, showUpToTier: 1, text: 'Non c\'è nulla da fare, nessun posto dove andare. Solo qui, solo ora.' },
        { atFraction: 0.70, showUpToTier: 2, text: 'Se la mente si distrae, torna dolcemente al respiro, senza giudicarti.' },
        { atFraction: 0.85, showUpToTier: 3, text: 'Tra poco la sessione finirà. Goditi questi ultimi istanti di calma.' },
        { atFraction: 0.97, showUpToTier: 3, text: 'Quando sei pronto, muovi lentamente le dita, e riapri gli occhi.' }
    ],
    focus: [
        { atFraction: 0.00, showUpToTier: 3, text: 'Siediti con la schiena dritta ma non rigida, come se un filo ti tirasse dolcemente verso l\'alto.' },
        { atFraction: 0.05, showUpToTier: 1, text: 'Posiziona le mani sulle ginocchia, palmi rivolti verso il basso.' },
        { atFraction: 0.12, showUpToTier: 2, text: 'Porta tutta l\'attenzione al punto in cui l\'aria entra dalle narici.' },
        { atFraction: 0.22, showUpToTier: 3, text: 'Conta i respiri: uno all\'inspirazione, due all\'espirazione, fino a dieci, poi ricomincia.' },
        { atFraction: 0.35, showUpToTier: 1, text: 'Se perdi il conto, non importa: torna semplicemente a uno.' },
        { atFraction: 0.45, showUpToTier: 2, text: 'Questo è un allenamento per la mente, tanto quanto lo squat lo è per le gambe.' },
        { atFraction: 0.55, showUpToTier: 3, text: 'Nota la chiarezza che si fa strada, respiro dopo respiro.' },
        { atFraction: 0.65, showUpToTier: 1, text: 'Le distrazioni sono normali: il punto non è evitarle, ma tornare, ogni volta.' },
        { atFraction: 0.78, showUpToTier: 2, text: 'Porta un po\' di quell\'energia raccolta nelle prossime ore della giornata.' },
        { atFraction: 0.90, showUpToTier: 3, text: 'Fai due respiri profondi, sentendo l\'energia nel corpo.' },
        { atFraction: 0.98, showUpToTier: 3, text: 'Apri gli occhi quando sei pronto, portando con te questa lucidità.' }
    ],
    sleep: [
        { atFraction: 0.00, showUpToTier: 3, text: 'Sdraiati comodamente, lascia che il materasso sostenga tutto il tuo peso.' },
        { atFraction: 0.04, showUpToTier: 1, text: 'Chiudi gli occhi. Non c\'è nient\'altro da fare stanotte.' },
        { atFraction: 0.10, showUpToTier: 2, text: 'Rilassa la fronte, la mascella, le spalle: lascia che si ammorbidiscano.' },
        { atFraction: 0.18, showUpToTier: 3, text: 'Segui il respiro, senza cambiarlo: lascialo naturale, un po\' più lento.' },
        { atFraction: 0.28, showUpToTier: 1, text: 'Scendi con l\'attenzione: piedi, gambe, bacino... ogni parte più pesante, più rilassata.' },
        { atFraction: 0.40, showUpToTier: 2, text: 'Se la mente ripercorre la giornata, lasciala fare, senza seguirla.' },
        { atFraction: 0.52, showUpToTier: 3, text: 'Sei al sicuro, non devi vegliare su nulla in questo momento.' },
        { atFraction: 0.65, showUpToTier: 1, text: 'Il respiro rallenta ancora un poco, come le onde che si calmano al tramonto.' },
        { atFraction: 0.80, showUpToTier: 2, text: 'Da qui in poi non c\'è bisogno di ascoltare altro: lascia solo che il corpo si appesantisca.' },
        { atFraction: 0.95, showUpToTier: 3, text: 'Buonanotte. Lascia che il sonno arrivi quando è pronto.' }
    ],
    emotions: [
        { atFraction: 0.00, showUpToTier: 3, text: 'Siediti comodamente. Se ti fa sentire bene, porta una mano sul cuore o sulla pancia.' },
        { atFraction: 0.05, showUpToTier: 1, text: 'Fai un respiro, senza cercare di cambiare nulla di come ti senti ora.' },
        { atFraction: 0.12, showUpToTier: 2, text: 'Chiediti in silenzio: cosa provo, adesso, in questo momento?' },
        { atFraction: 0.22, showUpToTier: 3, text: 'Qualunque cosa emerga, prova a nominarla, anche solo dentro di te: "sto provando..."' },
        { atFraction: 0.33, showUpToTier: 1, text: 'Non serve risolverla, né giudicarla: solo riconoscerla.' },
        { atFraction: 0.45, showUpToTier: 2, text: 'Le emozioni sono come onde: salgono, raggiungono un picco, e ridiscendono da sole.' },
        { atFraction: 0.55, showUpToTier: 3, text: 'Lasciale essere presenti nel corpo, senza spingerle via.' },
        { atFraction: 0.68, showUpToTier: 1, text: 'Se aiuta, immagina di dare spazio a ciò che senti, come apriresti una stanza.' },
        { atFraction: 0.80, showUpToTier: 2, text: 'Torna al respiro come punto fermo, ogni volta che ne senti il bisogno.' },
        { atFraction: 0.92, showUpToTier: 3, text: 'Porta con te questa gentilezza verso te stesso, anche dopo la sessione.' },
        { atFraction: 0.98, showUpToTier: 3, text: 'Quando sei pronto, riapri gli occhi.' }
    ],
    grounding: [
        { atFraction: 0.00, showUpToTier: 3, text: 'Siediti in una posizione stabile. Senti il punto di contatto tra il corpo e ciò che ti sostiene.' },
        { atFraction: 0.05, showUpToTier: 1, text: 'Immagina, se ti aiuta, delle radici che scendono da te verso il basso.' },
        { atFraction: 0.12, showUpToTier: 2, text: 'Fai tre respiri, portando l\'attenzione un po\' più in profondità ad ogni espirazione.' },
        { atFraction: 0.25, showUpToTier: 3, text: 'Chiediti, senza fretta di rispondere: cosa conta davvero, oggi, per me?' },
        { atFraction: 0.38, showUpToTier: 1, text: 'Non serve una risposta perfetta. Lascia solo che la domanda risuoni.' },
        { atFraction: 0.50, showUpToTier: 2, text: 'Nota l\'equilibrio tra ciò che fai e ciò che sei: il fare e l\'essere, insieme.' },
        { atFraction: 0.62, showUpToTier: 3, text: 'Porta gratitudine per una piccola cosa, qualunque essa sia, in questo momento.' },
        { atFraction: 0.75, showUpToTier: 1, text: 'Senti il corpo stabile, e la mente più quieta, come acqua che si posa.' },
        { atFraction: 0.88, showUpToTier: 2, text: 'Questo equilibrio che coltivi qui dentro ti accompagna anche fuori.' },
        { atFraction: 0.98, showUpToTier: 3, text: 'Quando sei pronto, riapri gli occhi, portando con te questo centro.' }
    ]
};

// Costruisce la lista di cue (in secondi, ordinate) per una sessione guidata:
// filtra lo script dell'obiettivo in base al tier di guida del livello mente attuale,
// poi scala le posizioni frazionarie sulla durata scelta.
function buildMeditationCues(goalId, mindLevel, durationSeconds) {
    const script = MEDITATION_SCRIPTS[goalId] || MEDITATION_SCRIPTS.relax;
    const tierRank = MIND_TIER_RANK[mindTier(mindLevel)];
    return script
        .filter(cue => tierRank <= cue.showUpToTier)
        .map(cue => ({ atSecond: Math.round(cue.atFraction * durationSeconds), text: cue.text }))
        .sort((a, b) => a.atSecond - b.atSecond);
}

// --- ONBOARDING: livello di partenza da intervista -------------------------

const ACTIVITY_STARTING_LEVEL = { sedentario: 1, leggero: 2, moderato: 3, attivo: 4 };
function startingFitnessLevel(activityAnswer) {
    const lvl = ACTIVITY_STARTING_LEVEL[activityAnswer];
    return lvl ? Math.min(MAX_LEVEL, lvl) : MIN_LEVEL;
}

const MEDITATION_EXPERIENCE_STARTING_LEVEL = { mai: 1, qualche_volta: 2, regolarmente: 3 };
function startingMindLevel(experienceAnswer, selfAwarenessScore) {
    let lvl = MEDITATION_EXPERIENCE_STARTING_LEVEL[experienceAnswer] || MIND_MIN_LEVEL;
    if (typeof selfAwarenessScore === 'number' && selfAwarenessScore >= 4) lvl += 1;
    return Math.max(MIND_MIN_LEVEL, Math.min(MIND_MAX_LEVEL, lvl));
}

if (typeof module !== 'undefined') {
    module.exports = {
        MIN_LEVEL, MAX_LEVEL,
        WARMUP_POOL, COOLDOWN_POOL, CORE_POOL, CIRCUIT_POOL,
        computeValueForLevel, poolForLevel, filterByLimitations, pickN, roundsForLevel, isRecoveryDay,
        buildRationale, formatEx, generateWorkout, applyFeedback,
        CORE_SETS_BASE, CORE_SETS_MAX, CORE_REPS_STEPS, computeSetsReps, formatCoreEx,
        MOOD_SCALE, computeMeditationStats, localDateStr, addDaysToDateStr, updateStreak,
        MIND_MIN_LEVEL, MIND_MAX_LEVEL, MEDITATION_GOALS, MEDITATION_SCRIPTS,
        suggestedMeditationMinutes, mindTier, buildMeditationCues,
        startingFitnessLevel, startingMindLevel
    };
}
