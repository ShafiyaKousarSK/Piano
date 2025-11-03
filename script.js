// Lazy audio context initialization
let audioContext = null;

// Generate all note frequencies for 4 octaves (C3 to C7)
function generateNoteFrequencies() {
    const frequencies = {};
    const baseNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // A4 = 440 Hz (standard tuning)
    const a4 = 440;
    
    // Calculate frequencies for all octaves (3, 4, 5, 6, and start of 7)
    for (let octave = 3; octave <= 6; octave++) {
        baseNotes.forEach((note, index) => {
            const noteName = note + octave;
            // Calculate semitones from A4
            let semitones = 0;
            
            if (octave === 4) {
                semitones = index - 9; // A is at index 9
            } else if (octave < 4) {
                semitones = (octave - 4) * 12 + (index - 9);
            } else {
                semitones = (octave - 4) * 12 + (index - 9);
            }
            
            frequencies[noteName] = a4 * Math.pow(2, semitones / 12);
        });
    }
    
    // Add C7
    frequencies['C7'] = a4 * Math.pow(2, (7 - 4) * 12 - 9);
    
    return frequencies;
}

const noteFrequencies = generateNoteFrequencies();

// Track active notes (with full audio nodes)
const activeNotes = {};

// Get or create audio context
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// Ensure audio context is running
async function ensureAudioContext() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
    return ctx;
}

// Create a more realistic piano sound using multiple oscillators
function createPianoSound(ctx, frequency) {
    const masterGain = ctx.createGain();
    
    // Create multiple oscillators for richer sound
    const oscillators = [];
    const harmonics = [
        { freq: 1.0, gain: 0.6, type: 'sine' },      // Fundamental
        { freq: 2.0, gain: 0.3, type: 'sine' },      // Second harmonic
        { freq: 3.0, gain: 0.15, type: 'triangle' }, // Third harmonic
        { freq: 4.0, gain: 0.08, type: 'sine' }      // Fourth harmonic
    ];
    
    harmonics.forEach(harmonic => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = harmonic.type;
        osc.frequency.value = frequency * harmonic.freq;
        gainNode.gain.value = harmonic.gain;
        
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        osc.start();
        
        oscillators.push({ oscillator: osc, gainNode: gainNode });
    });
    
    // Add some detuning for more realistic sound
    oscillators.forEach(osc => {
        if (Math.random() > 0.5) {
            osc.oscillator.detune.value = (Math.random() - 0.5) * 2;
        }
    });
    
    return { masterGain, oscillators };
}

// Start playing a note (note-on)
async function startNote(note) {
    const ctx = await ensureAudioContext();
    
    // Stop if already playing
    if (activeNotes[note]) {
        stopNote(note);
    }

    const frequency = noteFrequencies[note];
    if (!frequency) {
        return;
    }

    try {
        const { masterGain, oscillators } = createPianoSound(ctx, frequency);
        
        // ADSR Envelope: Attack, Decay, Sustain, Release
        const now = ctx.currentTime;
        const attackTime = 0.01;   // Very quick attack
        const decayTime = 0.1;     // Quick decay
        const sustainLevel = 0.4;  // Sustain level
        const releaseTime = 0.3;   // Release time
        
        // Attack and Decay
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.5, now + attackTime);
        masterGain.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);
        
        // Hold at sustain level (will be released on note-off)
        masterGain.gain.setValueAtTime(sustainLevel, now + attackTime + decayTime);
        
        masterGain.connect(ctx.destination);
        
        // Store note info
        activeNotes[note] = {
            masterGain,
            oscillators,
            frequency,
            startTime: now
        };

        // Visual feedback
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.add('active');
        }
    } catch (error) {
        console.error('Error playing note:', error);
    }
}

// Stop playing a note (note-off)
function stopNote(note) {
    if (!activeNotes[note]) {
        return;
    }

    try {
        const ctx = getAudioContext();
        const { masterGain, oscillators } = activeNotes[note];
        const now = ctx.currentTime;
        const releaseTime = 0.3;
        
        // Release phase
        const currentGain = masterGain.gain.value;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(currentGain, now);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
        
        // Stop oscillators after release
        setTimeout(() => {
            oscillators.forEach(osc => {
                try {
                    osc.oscillator.stop();
                } catch (e) {
                    // Already stopped
                }
            });
            try {
                masterGain.disconnect();
            } catch (e) {
                // Already disconnected
            }
        }, releaseTime * 1000);
        
        delete activeNotes[note];
        
        // Remove visual feedback
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.remove('active');
        }
    } catch (error) {
        console.error('Error stopping note:', error);
    }
}

// Create piano keys
function createPianoKeys() {
    const keysContainer = document.getElementById('piano-keys');
    
    // Keyboard mapping for white and black keys across 4 octaves
    const whiteKeyMap = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '1', '2', '3', '4', '5', '6'];
    const blackKeyMap = ['2', '3', '5', '6', '7', '9', '0', '-', '=', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
    
    // Define the pattern: true = white key, false = black key position
    const keyPattern = [
        { note: 'C', isWhite: true, hasBlackAfter: true },
        { note: 'C#', isWhite: false },
        { note: 'D', isWhite: true, hasBlackAfter: true },
        { note: 'D#', isWhite: false },
        { note: 'E', isWhite: true, hasBlackAfter: false },
        { note: 'F', isWhite: true, hasBlackAfter: true },
        { note: 'F#', isWhite: false },
        { note: 'G', isWhite: true, hasBlackAfter: true },
        { note: 'G#', isWhite: false },
        { note: 'A', isWhite: true, hasBlackAfter: true },
        { note: 'A#', isWhite: false },
        { note: 'B', isWhite: true, hasBlackAfter: false }
    ];
    
    let whiteKeyIndex = 0;
    let blackKeyIndex = 0;
    let position = 0;
    
    // Create keys for 4 octaves (C3 to C7)
    for (let octave = 3; octave <= 6; octave++) {
        keyPattern.forEach((keyInfo) => {
            const fullNote = keyInfo.note + octave;
            
            if (keyInfo.isWhite) {
                // Create white key
                const key = document.createElement('div');
                key.className = 'key white-key';
                key.setAttribute('data-note', fullNote);
                
                if (whiteKeyIndex < whiteKeyMap.length) {
                    key.setAttribute('data-key', whiteKeyMap[whiteKeyIndex]);
                    const label = document.createElement('span');
                    label.className = 'key-label';
                    label.textContent = whiteKeyMap[whiteKeyIndex].toUpperCase();
                    key.appendChild(label);
                }
                
                keysContainer.appendChild(key);
                whiteKeyIndex++;
                position++;
                
                // Add black key after this white key if needed
                if (keyInfo.hasBlackAfter) {
                    const blackNoteIndex = keyPattern.findIndex(k => k.note === keyInfo.note) + 1;
                    if (blackNoteIndex < keyPattern.length) {
                        const blackNoteInfo = keyPattern[blackNoteIndex];
                        const fullBlackNote = blackNoteInfo.note + octave;
                        
                        const blackKey = document.createElement('div');
                        blackKey.className = 'key black-key';
                        blackKey.setAttribute('data-note', fullBlackNote);
                        
                        if (blackKeyIndex < blackKeyMap.length) {
                            blackKey.setAttribute('data-key', blackKeyMap[blackKeyIndex]);
                            const blackLabel = document.createElement('span');
                            blackLabel.className = 'key-label';
                            blackLabel.textContent = blackKeyMap[blackKeyIndex].toUpperCase();
                            blackKey.appendChild(blackLabel);
                        }
                        
                        // Position black key: 45px from the left edge of the previous white key
                        blackKey.style.left = ((position - 1) * 60 + 45) + 'px';
                        
                        keysContainer.appendChild(blackKey);
                        blackKeyIndex++;
                    }
                }
            }
        });
    }
    
    // Add final C7 white key
    const c7Key = document.createElement('div');
    c7Key.className = 'key white-key';
    c7Key.setAttribute('data-note', 'C7');
    if (whiteKeyIndex < whiteKeyMap.length) {
        c7Key.setAttribute('data-key', whiteKeyMap[whiteKeyIndex]);
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = whiteKeyMap[whiteKeyIndex].toUpperCase();
        c7Key.appendChild(label);
    }
    keysContainer.appendChild(c7Key);
}

// Initialize piano
document.addEventListener('DOMContentLoaded', () => {
    createPianoKeys();
    
    const keys = document.querySelectorAll('.key');
    const keyMap = {};

    // Mouse/touch events for note-on and note-off
    keys.forEach(key => {
        const note = key.getAttribute('data-note');
        
        // Mouse events
        key.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            await ensureAudioContext();
            startNote(note);
        });

        key.addEventListener('mouseup', (e) => {
            e.preventDefault();
            stopNote(note);
        });

        key.addEventListener('mouseleave', () => {
            stopNote(note);
        });

        // Touch events
        key.addEventListener('touchstart', async (e) => {
            e.preventDefault();
            await ensureAudioContext();
            startNote(note);
        });

        key.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopNote(note);
        });

        key.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            stopNote(note);
        });
        
        // Build keyboard map
        const keyboardKey = key.getAttribute('data-key');
        if (keyboardKey && note) {
            keyMap[keyboardKey.toLowerCase()] = note;
        }
    });

    // Keyboard events - note-on on keydown, note-off on keyup
    document.addEventListener('keydown', async (e) => {
        const note = keyMap[e.key.toLowerCase()];
        if (note && !e.repeat) {
            await ensureAudioContext();
            startNote(note);
        }
    });

    document.addEventListener('keyup', (e) => {
        const note = keyMap[e.key.toLowerCase()];
        if (note) {
            stopNote(note);
        }
    });
});
