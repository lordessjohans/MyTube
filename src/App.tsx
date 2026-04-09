import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Camera, Square, Play, Music, Loader2, AlertCircle, Key, Activity, Cpu, ScanFace, Info, X, Mic, Settings, Video, VideoOff, Volume2, VolumeX, Users, Share2, RefreshCw, Upload } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { motion, AnimatePresence } from 'motion/react';
import * as Tone from 'tone';
import { TeamCommunication } from './TeamCommunication';
import { auth, db } from './firebase';
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { AvatarEditor } from './AvatarEditor';
import { NewsCard } from './components/NewsCard';

let hoverSynth: Tone.Synth | null = null;

async function initAudio() {
  if (Tone.context.state !== 'running') {
    await Tone.start().catch(() => {});
  }
  if (!hoverSynth) {
    hoverSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.01 }
    }).toDestination();
    hoverSynth.volume.value = -15;
  }
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface SmoothedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  score: number;
  opacity: number;
  labelX: number;
  labelY: number;
}

class PCMPlayer {
  audioContext: AudioContext;
  nextStartTime: number;
  pitch: number = 1.0;
  muted: boolean = false;

  constructor(sampleRate: number = 48000) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    this.nextStartTime = this.audioContext.currentTime;
  }

  setPitch(pitch: number) {
    this.pitch = pitch;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  playChunk(base64Data: string) {
    if (this.muted) return;
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // 16-bit PCM stereo
    const int16Array = new Int16Array(bytes.buffer);
    const numSamples = int16Array.length / 2;
    const leftChannel = new Float32Array(numSamples);
    const rightChannel = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      leftChannel[i] = int16Array[i * 2] / 32768.0;
      rightChannel[i] = int16Array[i * 2 + 1] / 32768.0;
    }

    const audioBuffer = this.audioContext.createBuffer(2, numSamples, this.audioContext.sampleRate);
    audioBuffer.getChannelData(0).set(leftChannel);
    audioBuffer.getChannelData(1).set(rightChannel);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = this.pitch;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05;
    }

    source.start(this.nextStartTime);
    // Adjust duration for playbackRate
    this.nextStartTime += audioBuffer.duration / this.pitch;
  }

  stop() {
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

class ProceduralMusicEngine {
  audioContext: AudioContext;
  isPlaying: boolean = false;
  currentVibe: string = 'minimalist ambient drone, quiet';
  targetVibe: string = 'minimalist ambient drone, quiet';
  vibeBlend: number = 1.0;
  nextNoteTime: number = 0;
  timerID: number | null = null;
  
  // Scales (intervals from root)
  scales: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    cyberpunk: [0, 3, 7, 8, 10], // Phrygian dominant-ish
    drone: [0, 7], // Just roots and fifths
    melancholic: [0, 2, 3, 7, 8], // Minor pentatonic-ish
    dissonant: [0, 1, 6, 7, 11], // For fear/disgust
    tribal: [0, 3, 5, 7, 10] // Minor pentatonic
  };

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  setVibe(vibe: string) {
    if (this.targetVibe !== vibe) {
      if (this.vibeBlend >= 1.0) {
        this.currentVibe = this.targetVibe;
      }
      this.targetVibe = vibe;
      this.vibeBlend = 0.0;
    }
  }

  start() {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isPlaying = true;
    this.nextNoteTime = this.audioContext.currentTime + 0.1;
    this.scheduleNext();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerID !== null) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }

  playNote(freq: number, type: OscillatorType, duration: number, vol: number, attack: number, time: number) {
    if (this.audioContext.state === 'closed') return;
    
    // Create multiple oscillators for a thicker soundscape
    const numOscs = 4;
    const masterGain = this.audioContext.createGain();
    masterGain.connect(this.audioContext.destination);
    
    const now = time;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(vol, now + attack);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Add a subtle reverb effect using a convolver or just delay
    const delay = this.audioContext.createDelay();
    delay.delayTime.value = 0.33;
    const feedback = this.audioContext.createGain();
    feedback.gain.value = 0.4;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(masterGain);

    for (let i = 0; i < numOscs; i++) {
      const osc = this.audioContext.createOscillator();
      const filter = this.audioContext.createBiquadFilter();
      
      osc.type = i % 2 === 0 ? type : 'sine';
      osc.frequency.value = freq * (1 + (i * 0.008)); // Slight detune
      
      filter.type = 'lowpass';
      filter.frequency.value = freq * 2;
      filter.frequency.linearRampToValueAtTime(freq * 6, now + attack);
      filter.frequency.linearRampToValueAtTime(freq * 1.5, now + duration);
      
      osc.connect(filter);
      filter.connect(masterGain);
      filter.connect(delay); // Send to delay for space
      
      osc.start(now);
      osc.stop(now + duration);
    }
  }

  getTempoForVibe(vibe: string): number {
    if (vibe.includes('tribal') || vibe.includes('rhythmic')) return 100;
    if (vibe.includes('cyberpunk') || vibe.includes('electronic')) return 60;
    return 40;
  }

  scheduleNext() {
    if (!this.isPlaying) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    while (this.nextNoteTime < this.audioContext.currentTime + 0.5) {
      if (this.vibeBlend < 1.0) {
        this.vibeBlend += 0.02; // crossfade over 50 notes for a much smoother transition
        if (this.vibeBlend > 1.0) this.vibeBlend = 1.0;
      }

      if (this.vibeBlend < 1.0) {
        // Equal power crossfade for smoother audio blending
        const currentWeight = Math.cos(this.vibeBlend * 0.5 * Math.PI);
        const targetWeight = Math.sin(this.vibeBlend * 0.5 * Math.PI);
        this.generateTickForVibe(this.currentVibe, currentWeight, this.nextNoteTime);
        this.generateTickForVibe(this.targetVibe, targetWeight, this.nextNoteTime);
      } else {
        this.generateTickForVibe(this.targetVibe, 1.0, this.nextNoteTime);
      }
      
      // Smoothly interpolate tempo
      const currentTempo = this.getTempoForVibe(this.currentVibe);
      const targetTempo = this.getTempoForVibe(this.targetVibe);
      const tempo = currentTempo * (1 - this.vibeBlend) + targetTempo * this.vibeBlend;
      
      const secondsPerBeat = 60.0 / tempo;
      this.nextNoteTime += secondsPerBeat; // Quarter notes
    }
    
    this.timerID = window.setTimeout(() => this.scheduleNext(), 50);
  }

  generateTickForVibe(vibe: string, weight: number, time: number) {
    if (weight <= 0.01) return;
    
    const isCyberpunk = vibe.includes('cyberpunk') || vibe.includes('electronic');
    const isTribal = vibe.includes('tribal') || vibe.includes('rhythmic') || vibe.includes('happy');
    const isAcoustic = vibe.includes('acoustic') || vibe.includes('guitar');
    const isAmbient = vibe.includes('ambient') || vibe.includes('drone');
    const isSad = vibe.includes('sad') || vibe.includes('melancholy');
    const isTense = vibe.includes('angry') || vibe.includes('fear') || vibe.includes('disgust');
    
    let scale = this.scales.pentatonic;
    let baseNote = 48; // C3
    let oscType: OscillatorType = 'sine';
    let vol = 0.08;
    let duration = 6.0; // Longer durations for soundscape
    let attack = 3.0;

    if (isCyberpunk) {
      scale = this.scales.cyberpunk;
      baseNote = 36; // C2
      oscType = 'sawtooth';
      vol = 0.04;
      duration = 4.0;
      attack = 2.0;
    } else if (isTribal) {
      scale = this.scales.tribal;
      baseNote = 43; // G2
      oscType = 'square';
      vol = 0.06;
      duration = 1.5;
      attack = 0.1;
    } else if (isSad) {
      scale = this.scales.melancholic;
      baseNote = 48;
      oscType = 'sine';
      vol = 0.08;
      duration = 8.0;
      attack = 4.0;
    } else if (isTense) {
      scale = this.scales.dissonant;
      baseNote = 36;
      oscType = 'sawtooth';
      vol = 0.05;
      duration = 5.0;
      attack = 1.5;
    } else if (isAcoustic) {
      scale = this.scales.major;
      baseNote = 48;
      oscType = 'sine';
      vol = 0.08;
      duration = 5.0;
      attack = 2.0;
    } else if (isAmbient) {
      scale = this.scales.drone;
      baseNote = 36;
      oscType = 'sine';
      vol = 0.12;
      duration = 10.0;
      attack = 5.0;
    }

    vol *= weight; // Apply crossfade weight

    // Randomly play a note from the scale
    if (Math.random() > 0.2) {
      const noteIndex = scale[Math.floor(Math.random() * scale.length)];
      const freq = 440 * Math.pow(2, (baseNote + noteIndex - 69) / 12);
      this.playNote(freq, oscType, duration, vol, attack, time);
    }
    
    // Add a bass drone
    if (Math.random() > 0.5) {
      const bassFreq = 440 * Math.pow(2, (baseNote - 12 - 69) / 12);
      this.playNote(bassFreq, 'sine', duration * 2, vol * 1.5, attack * 2, time);
    }
  }
}

const VIBE_MAP: Record<string, string> = {
  person: "ethereal ambient drone, calm",
  'cell phone': "cyberpunk synthwave, electronic",
  laptop: "cyberpunk synthwave, electronic",
  tv: "cyberpunk synthwave, electronic",
  cup: "coffee shop jazz, chill acoustic",
  bottle: "coffee shop jazz, chill acoustic",
  bowl: "coffee shop jazz, chill acoustic",
  cat: "playful acoustic guitar, happy melody",
  dog: "playful acoustic guitar, happy melody",
  bird: "playful acoustic guitar, happy melody",
  car: "driving rock beat, fast tempo",
  bus: "driving rock beat, fast tempo",
  truck: "driving rock beat, fast tempo",
  chair: "ambient drone, relaxing",
  couch: "ambient drone, relaxing",
  bed: "ambient drone, relaxing",
  'potted plant': "ethereal flute, ambient nature",
  book: "classical piano, focused",
};

function getVibeForObjects(objects: string[]) {
  if (objects.length === 0) return "minimalist ambient drone, quiet";
  
  const vibes = new Set<string>();
  for (const obj of objects) {
    if (VIBE_MAP[obj]) {
      vibes.add(VIBE_MAP[obj]);
    } else {
      vibes.add("chill lofi beat");
    }
  }
  
  return Array.from(vibes).slice(0, 2).join(", ");
}

const getVibeFromGemini = async (objects: string[], emotion: string, customMood?: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });
    const prompt = `You are an expert sound designer and ambient music producer. 
    Analyze the following scene and generate a highly evocative, 4-6 word description for an immersive ambient soundscape.
    
    Guidelines:
    - Use sophisticated musical terminology (e.g., 'granular', 'reverberant', 'dissonant', 'ethereal', 'sub-bass').
    - Focus on mood, texture, and atmosphere.
    - NEVER use generic terms like 'pop', 'upbeat', 'happy', or 'energetic'.
    - The soundscape must be purely ambient and experimental.
    - Output ONLY the description, no other text.
    
    Scene Context:
    - Emotional State: ${emotion}
    - Visible Objects: ${objects.length > 0 ? objects.join(', ') : 'none'}
    ${customMood ? `- User-Defined Mood: ${customMood}` : ''}
    
    Example Output: 'dark granular industrial drone texture' or 'ethereal shimmering crystalline ambient pads'`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
    });
    return response.text?.trim() || "ethereal atmospheric ambient drone";
  } catch (e: any) {
    console.warn("Gemini API error (falling back to local vibe map):", e.message || e);
    return getVibeForObjects(objects) + `, ${emotion} atmospheric texture${customMood ? ` (${customMood})` : ''}`;
  }
};

export default function App() {
  const [currentView, setCurrentView] = useState<'studio' | 'feed' | 'profile'>('studio');
  const [user, setUser] = useState<any>(null);
  const [feedItems, setFeedItems] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((u) => {
      if (u) {
        const unsubscribeDoc = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
          if (docSnap.exists()) {
            setUser(docSnap.data());
          }
        });
        return () => unsubscribeDoc();
      } else {
        setUser(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'site_feed'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFeedItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [status, setStatus] = useState('Loading Object Detection Model...');
  const [currentPrompt, setCurrentPrompt] = useState('Waiting for camera...');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [consoleState, setConsoleState] = useState({
    emotion: 'neutral',
    objects: [] as string[],
    blendshapes: { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 }
  });
  const [transcription, setTranscription] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [customMood, setCustomMood] = useState<string>('');
  const [isAiMusicEnabled, setIsAiMusicEnabled] = useState(true);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.5);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const playerRef = useRef<PCMPlayer | null>(null);
  const localSynthRef = useRef<Tone.PolySynth | null>(null);
  const localPatternRef = useRef<Tone.Pattern<any> | null>(null);
  const recognitionRef = useRef<any>(null);
  const bgMusicRef = useRef<HTMLAudioElement>(null);
  
  const objectModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const isPlayingRef = useRef(false);
  const lastPromptRef = useRef<string>("");
  const lastStateRef = useRef<string>("");
  const pendingStateRef = useRef<string | null>(null);
  const vibeTimeoutRef = useRef<any>(null);
  const lastStateUpdateTimeRef = useRef<number>(0);
  const detectLoopRef = useRef<number | null>(null);
  const smoothedBoxesRef = useRef<Map<string, SmoothedBox>>(new Map());
  const smoothedBlendshapesRef = useRef({ smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 });

  const playHoverSound = () => {
    try {
      initAudio();
      if (!hoverSynth || Tone.context.state !== 'running') return;
      
      const now = Tone.now();
      hoverSynth.triggerAttackRelease(800, 0.1, now);
      hoverSynth.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    } catch (e) {}
  };

  useEffect(() => {
    const handleInteraction = () => initAudio();
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscription(currentTranscript);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          setIsTranscribing(false);
          setErrorMsg("Microphone access denied. Please enable microphone permissions in your browser settings.");
        } else if (event.error === 'network') {
          setIsTranscribing(false);
          setErrorMsg("Speech recognition network error. This feature requires a stable internet connection and access to Google's speech services. If you are behind a firewall or VPN, it may be blocked.");
        } else {
          setErrorMsg(`Speech recognition error: ${event.error}`);
        }
      };
      
      recognitionRef.current.onend = () => {
        if (isTranscribing) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      };
    }
  }, [isTranscribing]);

  const toggleTranscription = () => {
    if (isTranscribing) {
      recognitionRef.current?.stop();
      setIsTranscribing(false);
    } else {
      setTranscription('');
      try {
        recognitionRef.current?.start();
        setIsTranscribing(true);
      } catch (e) {
        console.error("Failed to start transcription", e);
      }
    }
  };

  useEffect(() => {
    // Suppress specific TensorFlow Lite info message that appears as an error/clutter
    const suppressTFLite = (...args: any[]) => {
      const msg = args.join(' ');
      if (msg.includes('Created TensorFlow Lite XNNPACK delegate for CPU') || 
          msg.includes('XNNPACK delegate for CPU')) {
        return true;
      }
      return false;
    };

    const originalConsoleInfo = console.info;
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    console.info = (...args) => { if (!suppressTFLite(...args)) originalConsoleInfo(...args); };
    console.log = (...args) => { if (!suppressTFLite(...args)) originalConsoleLog(...args); };
    console.warn = (...args) => { if (!suppressTFLite(...args)) originalConsoleWarn(...args); };
    console.error = (...args) => { if (!suppressTFLite(...args)) originalConsoleError(...args); };

    // Load TensorFlow, COCO-SSD, and MediaPipe FaceLandmarker with retries and fallbacks
    const loadModels = async () => {
      try {
        setStatus('Loading Models...');
        await tf.ready().catch(e => console.warn("TF ready failed:", e));
        
        // COCO-SSD load (Optional)
        try {
          const cocoModel = await cocoSsd.load();
          objectModelRef.current = cocoModel;
        } catch (e) {
          console.warn("Failed to load COCO-SSD model, object detection will be disabled:", e);
        }

        // Try multiple CDNs for MediaPipe WASM (Optional)
        const wasmUrls = [
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
          "https://unpkg.com/@mediapipe/tasks-vision@0.10.3/wasm"
        ];

        let vision = null;
        for (const url of wasmUrls) {
          try {
            vision = await FilesetResolver.forVisionTasks(url);
            if (vision) break;
          } catch (e) {
            console.warn(`Failed to load vision tasks from ${url}`);
          }
        }

        if (vision) {
          try {
            const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              },
              outputFaceBlendshapes: true,
              runningMode: "VIDEO",
              numFaces: 1
            });
            faceLandmarkerRef.current = faceLandmarker;
          } catch (e) {
            console.warn("Failed to load FaceLandmarker model, face tracking will be disabled:", e);
          }
        }

        // Always set loaded to true so the user can at least use the camera and other features
        setIsModelLoaded(true);
        setStatus('Idle');
        
        if (!objectModelRef.current && !faceLandmarkerRef.current) {
          setErrorMsg("Warning: AI models failed to load (likely due to network restrictions). Camera will work, but face/object tracking is disabled.");
        }
      } catch (err: any) {
        console.error("Critical error in loadModels:", err);
        setIsModelLoaded(true); // Still allow app to run
        setStatus('Idle');
      }
    };
    
    loadModels();
    
    return () => {
      stopSession();
      console.info = originalConsoleInfo;
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
    };
  }, []);

  const runDetection = async () => {
    if (!isPlayingRef.current || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (video.readyState >= 2 && ctx) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const detectedClasses = new Set<string>();

        // --- Object Detection (Optional) ---
        if (objectModelRef.current) {
          const predictions = await objectModelRef.current.detect(video);
          
          const newSmoothedBoxes = new Map<string, SmoothedBox>();
          const unassignedPredictions = [...predictions];

          smoothedBoxesRef.current.forEach((box, id) => {
            let closestIdx = -1;
            let minDist = Infinity;
            unassignedPredictions.forEach((pred, idx) => {
              if (pred.class === box.class) {
                const [px, py, pw, ph] = pred.bbox;
                const dist = Math.hypot(px + pw/2 - (box.x + box.width/2), py + ph/2 - (box.y + box.height/2));
                if (dist < 150) {
                  if (dist < minDist) {
                    minDist = dist;
                    closestIdx = idx;
                  }
                }
              }
            });

            if (closestIdx !== -1) {
              const pred = unassignedPredictions[closestIdx];
              const [px, py, pw, ph] = pred.bbox;
              const lerp = 0.15; // Smoothing factor
              box.x += (px - box.x) * lerp;
              box.y += (py - box.y) * lerp;
              box.width += (pw - box.width) * lerp;
              box.height += (ph - box.height) * lerp;
              box.opacity = Math.min(1, box.opacity + 0.1);
              box.score = pred.score;
              
              // Target label position (top right of box)
              const targetLabelX = box.x + box.width + 20;
              const targetLabelY = box.y - 20;
              box.labelX += (targetLabelX - box.labelX) * lerp;
              box.labelY += (targetLabelY - box.labelY) * lerp;

              newSmoothedBoxes.set(id, box);
              unassignedPredictions.splice(closestIdx, 1);
              detectedClasses.add(box.class);
            } else {
              box.opacity -= 0.05; // Fade out
              if (box.opacity > 0) {
                newSmoothedBoxes.set(id, box);
                detectedClasses.add(box.class);
              }
            }
          });

          unassignedPredictions.forEach((pred) => {
            const id = Math.random().toString(36).substring(7);
            const [x, y, width, height] = pred.bbox;
            newSmoothedBoxes.set(id, {
              x, y, width, height, class: pred.class, score: pred.score, opacity: 0,
              labelX: x + width + 40, labelY: y - 40
            });
            detectedClasses.add(pred.class);
          });

          smoothedBoxesRef.current = newSmoothedBoxes;

          // --- Drawing Logic ---
          smoothedBoxesRef.current.forEach((box) => {
            const { x, y, width, height, opacity, labelX, labelY } = box;
            const text = `${box.class} (${Math.round(box.score * 100)}%)`;

            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
            ctx.lineWidth = 1;

            // Draw corners
            const cornerLength = Math.min(15, width / 4, height / 4);
            ctx.beginPath();
            ctx.moveTo(x, y + cornerLength);
            ctx.lineTo(x, y);
            ctx.lineTo(x + cornerLength, y);
            
            ctx.moveTo(x + width - cornerLength, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + cornerLength);
            
            ctx.moveTo(x + width, y + height - cornerLength);
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x + width - cornerLength, y + height);
            
            ctx.moveTo(x + cornerLength, y + height);
            ctx.lineTo(x, y + height);
            ctx.lineTo(x, y + height - cornerLength);
            ctx.stroke();

            // Crosshair center
            ctx.beginPath();
            ctx.moveTo(x + width / 2 - 5, y + height / 2);
            ctx.lineTo(x + width / 2 + 5, y + height / 2);
            ctx.moveTo(x + width / 2, y + height / 2 - 5);
            ctx.lineTo(x + width / 2, y + height / 2 + 5);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.4})`;
            ctx.stroke();

            // Line to label
            ctx.beginPath();
            ctx.moveTo(x + width, y);
            ctx.lineTo(labelX, labelY + 16);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.5})`;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Minimalist Label
            ctx.font = '400 10px "JetBrains Mono", monospace';
            const textWidth = ctx.measureText(text).width;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
            ctx.fillRect(labelX, labelY, textWidth + 8, 16);
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillText(text.toUpperCase(), labelX + 4, labelY + 11);
          });
        }

        const classesArray = Array.from(detectedClasses).sort();
        
        let currentEmotion = "neutral";
        let currentBlendshapes = { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 };
        
        if (faceLandmarkerRef.current) {
          const faceResult = faceLandmarkerRef.current.detectForVideo(video, performance.now());
          
          // Draw Face Mesh Point Cloud on secondary canvas
          if (faceCanvasRef.current) {
            const fCanvas = faceCanvasRef.current;
            const fCtx = fCanvas.getContext('2d');
            if (fCtx) {
              fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
              
              if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
                const time = performance.now() / 1500; // 1.5 seconds per cycle
                
                // Find bounding box of face to center it
                let minX = video.videoWidth, maxX = 0, minY = video.videoHeight, maxY = 0;
                for (const pt of faceResult.faceLandmarks[0]) {
                  const px = pt.x * video.videoWidth;
                  const py = pt.y * video.videoHeight;
                  if (px < minX) minX = px;
                  if (px > maxX) maxX = px;
                  if (py < minY) minY = py;
                  if (py > maxY) maxY = py;
                }
                const faceWidth = maxX - minX;
                const faceHeight = maxY - minY;
                const centerX = minX + faceWidth / 2;
                const centerY = minY + faceHeight / 2;
                
                const scanY = minY + ((Math.sin(time) + 1) / 2) * faceHeight;
                const scale = Math.min(fCanvas.width / faceWidth, fCanvas.height / faceHeight) * 0.8;

                for (const pt of faceResult.faceLandmarks[0]) {
                  const px = pt.x * video.videoWidth;
                  const py = pt.y * video.videoHeight;
                  
                  // Distance from scan line (in pixels)
                  const dist = Math.abs(py - scanY) / faceHeight;
                  // Opacity: high near scan line, low elsewhere
                  const opacity = Math.max(0.15, 1.0 - dist * 4); 
                  
                  fCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                  fCtx.beginPath();
                  
                  // Map to canvas
                  const drawX = fCanvas.width/2 + (px - centerX) * scale;
                  const drawY = fCanvas.height/2 + (py - centerY) * scale;
                  
                  fCtx.arc(drawX, drawY, 1.5, 0, 2 * Math.PI);
                  fCtx.fill();
                }
              }
            }
          }

          if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
            const blendshapes = faceResult.faceBlendshapes[0].categories;
            const getScore = (name: string) => blendshapes.find(b => b.categoryName === name)?.score || 0;
            
            // Physical facial features for sliders
            currentBlendshapes.smile = (getScore('mouthSmileLeft') + getScore('mouthSmileRight')) / 2;
            currentBlendshapes.frown = Math.min(1, (getScore('mouthFrownLeft') + getScore('mouthFrownRight') + getScore('mouthRollLower')) * 5);
            currentBlendshapes.mouthOpen = getScore('jawOpen');
            currentBlendshapes.browRaise = (getScore('browInnerUp') + getScore('browOuterUpLeft') + getScore('browOuterUpRight')) / 3;
            currentBlendshapes.eyeBlink = (getScore('eyeBlinkLeft') + getScore('eyeBlinkRight')) / 2;
            currentBlendshapes.pucker = getScore('mouthPucker');
            
            // High-level emotions for the overall state
            const surpriseScore = (getScore('jawOpen') + getScore('browInnerUp')) / 2;
            const angerScore = (getScore('browDownLeft') + getScore('browDownRight') + getScore('mouthPressLeft')) / 3;
            const fearScore = ((getScore('jawOpen') + getScore('browInnerUp') + getScore('mouthStretchLeft') + getScore('mouthStretchRight')) / 4) * 0.6;
            const disgustScore = Math.min(1, (getScore('noseSneerLeft') + getScore('noseSneerRight') + getScore('mouthUpperUpLeft') + getScore('mouthUpperUpRight')) * 4);
            
            const emotions = [
              { name: 'happy', score: currentBlendshapes.smile },
              { name: 'sadness', score: currentBlendshapes.frown },
              { name: 'surprised', score: surpriseScore },
              { name: 'angry', score: angerScore },
              { name: 'fear', score: fearScore },
              { name: 'disgust', score: disgustScore }
            ];
            
            const maxEmotion = emotions.reduce((max, e) => e.score > max.score ? e : max, emotions[0]);
            if (maxEmotion.score > 0.2) {
              currentEmotion = maxEmotion.name;
            } else {
              currentEmotion = "neutral";
            }
          }

          // Draw arrows and blurred line on main canvas
          if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            const landmarks = faceResult.faceLandmarks[0];
            
            // Draw blurred line scanning over the face every 40 seconds
            const scanTime = performance.now() / 40000; // 40 seconds
            const scanPhase = scanTime % 1; // 0 to 1
            
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            for (const pt of landmarks) {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            }
            
            // Oscillate the scan line up and down
            const scanProgress = (Math.sin(scanPhase * Math.PI * 2) + 1) / 2; // 0 to 1 to 0
            const scanY = minY + scanProgress * (maxY - minY);
            
            // Opacity: 0 at top/bottom, 0.3 in the middle
            const lineOpacity = Math.sin(scanProgress * Math.PI) * 0.3;
            
            ctx.save();
            
            // Clip to face oval
            const faceOvalIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
            ctx.beginPath();
            for (let i = 0; i < faceOvalIndices.length; i++) {
              const pt = landmarks[faceOvalIndices[i]];
              if (i === 0) ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
              else ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
            }
            ctx.closePath();
            ctx.clip();

            if (lineOpacity > 0.01) {
              // Define emotion-based colors
              const emotionColors: Record<string, string> = {
                happy: '#fbbf24', // amber-400
                sadness: '#3b82f6', // blue-500
                surprised: '#22d3ee', // cyan-400
                angry: '#ef4444', // red-500
                fear: '#a855f7', // purple-500
                disgust: '#22c55e', // green-500
                neutral: '#ffffff'
              };
              const color = emotionColors[currentEmotion] || '#ffffff';
              const time = performance.now() / 1000;

              // 1. Draw the actual face landmarks illuminated by the scanner
              // This gives a highly realistic 3D contour effect without wacky math
              ctx.fillStyle = color;
              ctx.shadowColor = color;
              ctx.shadowBlur = 15;
              
              for (let i = 0; i < landmarks.length; i++) {
                const pt = landmarks[i];
                // Calculate vertical distance from the scan line
                const dist = Math.abs(pt.y - scanY);
                const threshold = 0.05; // Slightly thicker illuminated band
                
                if (dist < threshold) {
                  // Opacity falls off as points get further from the scan line
                  const ptOpacity = (1 - (dist / threshold)) * lineOpacity * 2.5;
                  ctx.globalAlpha = Math.min(ptOpacity, 1);
                  
                  // Subtle animation: jitter + breathing size
                  const jitterX = Math.sin(time * 8 + i) * 0.8;
                  const jitterY = Math.cos(time * 8 + i) * 0.8;
                  const pointSize = 1.2 + Math.sin(time * 4 + i * 0.1) * 0.6;

                  ctx.beginPath();
                  ctx.arc(pt.x * canvas.width + jitterX, pt.y * canvas.height + jitterY, pointSize, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              ctx.globalAlpha = 1.0;
            }
            
            ctx.restore();

            // Draw stylized feature highlights based on emotion
            const drawFeatureHighlight = (x: number, y: number, label: string, intensity: number) => {
              if (isNaN(intensity)) return;
              const pct = Math.round(intensity * 100);
              if (pct === 0) return; // neutral is zero%
              
              ctx.save();
              ctx.translate(x * canvas.width, y * canvas.height);
              
              const size = 5 + intensity * 15;
              
              ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.8})`;
              ctx.lineWidth = 1.5;
              
              // Draw brackets [ ]
              ctx.beginPath();
              ctx.moveTo(-size, -size/2);
              ctx.lineTo(-size, -size);
              ctx.lineTo(-size/2, -size);
              
              ctx.moveTo(size, -size/2);
              ctx.lineTo(size, -size);
              ctx.lineTo(size/2, -size);
              
              ctx.moveTo(-size, size/2);
              ctx.lineTo(-size, size);
              ctx.lineTo(-size/2, size);
              
              ctx.moveTo(size, size/2);
              ctx.lineTo(size, size);
              ctx.lineTo(size/2, size);
              ctx.stroke();
              
              // Center dot
              ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
              ctx.beginPath();
              ctx.arc(0, 0, 2, 0, Math.PI * 2);
              ctx.fill();
              
              // Label
              ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.9})`;
              ctx.font = '10px monospace';
              ctx.fillText(`${label} ${pct}%`, size + 5, 3);
              
              ctx.restore();
            };

            const smoothed = smoothedBlendshapesRef.current;
            drawFeatureHighlight(landmarks[61].x, landmarks[61].y, 'SMILE_L', smoothed.smile);
            drawFeatureHighlight(landmarks[291].x, landmarks[291].y, 'SMILE_R', smoothed.smile);
            
            drawFeatureHighlight(landmarks[61].x, landmarks[61].y, 'FROWN_L', smoothed.frown);
            drawFeatureHighlight(landmarks[291].x, landmarks[291].y, 'FROWN_R', smoothed.frown);
            
            drawFeatureHighlight(landmarks[52].x, landmarks[52].y, 'BROW_L', smoothed.browRaise);
            drawFeatureHighlight(landmarks[282].x, landmarks[282].y, 'BROW_R', smoothed.browRaise);
            
            drawFeatureHighlight(landmarks[152].x, landmarks[152].y, 'JAW_OPEN', smoothed.mouthOpen);
            
            drawFeatureHighlight(landmarks[13].x, landmarks[13].y, 'PUCKER', smoothed.pucker);
            
            drawFeatureHighlight(landmarks[159].x, landmarks[159].y, 'BLINK_L', smoothed.eyeBlink);
            drawFeatureHighlight(landmarks[386].x, landmarks[386].y, 'BLINK_R', smoothed.eyeBlink);
          }
        }

        // Update smoothed blendshapes every frame
        const smoothingFactor = 0.15;
        const smoothed = smoothedBlendshapesRef.current;
        smoothed.smile += (currentBlendshapes.smile - smoothed.smile) * smoothingFactor;
        smoothed.frown += (currentBlendshapes.frown - smoothed.frown) * smoothingFactor;
        smoothed.mouthOpen += (currentBlendshapes.mouthOpen - smoothed.mouthOpen) * smoothingFactor;
        smoothed.browRaise += (currentBlendshapes.browRaise - smoothed.browRaise) * smoothingFactor;
        smoothed.eyeBlink += (currentBlendshapes.eyeBlink - smoothed.eyeBlink) * smoothingFactor;
        smoothed.pucker += (currentBlendshapes.pucker - smoothed.pucker) * smoothingFactor;

        // Pitch bend based on facial expressions
        if (playerRef.current) {
          let pitch = 1.0;
          if (smoothed.browRaise > 0.1) {
            pitch = 1.0 + smoothed.browRaise * 0.5; // Up to 1.5
          } else if (smoothed.frown > 0.1) {
            pitch = 1.0 - smoothed.frown * 0.5; // Down to 0.5
          }
          playerRef.current.setPitch(pitch);
        }

        // Throttle React state updates for the console UI to ~10fps
        const now = performance.now();
        if (now - lastStateUpdateTimeRef.current > 100) {
          setConsoleState({
            emotion: currentEmotion,
            objects: classesArray,
            blendshapes: { ...smoothed }
          });
          lastStateUpdateTimeRef.current = now;
        }

        const stateString = `${classesArray.join(',')}|${currentEmotion}`;
        
        if (stateString !== pendingStateRef.current) {
          pendingStateRef.current = stateString;
          
          if (vibeTimeoutRef.current) {
            clearTimeout(vibeTimeoutRef.current);
          }
          
          // Debounce prompt changes by 3 seconds to avoid flickering
          vibeTimeoutRef.current = setTimeout(async () => {
            if (stateString !== lastStateRef.current) {
              lastStateRef.current = stateString;
              
              const newVibe = await getVibeFromGemini(classesArray, currentEmotion, customMood);
              lastPromptRef.current = newVibe;
              setCurrentPrompt(newVibe);
              
              if (sessionRef.current) {
                sessionRef.current.setWeightedPrompts({
                  weightedPrompts: [{ text: newVibe, weight: 1.0 }]
                }).catch(console.error);
              }
            }
          }, 3000);
        }
      } catch (err) {
        console.error("Detection error:", err);
      }
    }
    
    if (isPlayingRef.current) {
      detectLoopRef.current = requestAnimationFrame(runDetection);
    }
  };

  const startSession = async () => {
    if (!isModelLoaded) return;
    
    try {
      setErrorMsg(null);
      setStatus('Starting camera...');
      
      let stream = streamRef.current;
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 1280 }, 
              height: { ideal: 720 },
              facingMode: 'user'
            } 
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(e => console.error("Video play error:", e));
          }
          setIsCameraActive(true);
        } catch (camErr: any) {
          console.error("Camera error:", camErr);
          setStatus('Camera Error');
          setErrorMsg('Camera access denied. Please allow camera access in your browser settings, then refresh the browser page.');
          return;
        }
      }

      // Start detection immediately so it runs even if Lyria fails
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        detectLoopRef.current = requestAnimationFrame(runDetection);
      }

      setStatus('Connecting to Lyria API...');
      playerRef.current = new PCMPlayer(48000);
      playerRef.current.setMuted(!isAiMusicEnabled);

      let timeoutId: any;

      let sessionPromise;
      try {
        const ai = new GoogleGenAI({ 
          apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || 'dummy-key',
          apiVersion: 'v1alpha'
        });

        sessionPromise = ai.live.music.connect({
          model: "lyria-realtime-exp",
          callbacks: {
            onmessage: (message: any) => {
              if (message.setupComplete) {
                console.log("Lyria setup complete");
              }
              const audioChunk = message.audioChunk;
              if (audioChunk?.data && playerRef.current) {
                playerRef.current.playChunk(audioChunk.data);
              }
            },
            onclose: () => {
              clearTimeout(timeoutId);
              if (isPlayingRef.current) {
                setInfoMsg('Lyria connection closed.');
                stopSession(false);
              } else {
                stopSession(false);
              }
            },
            onerror: (err: any) => {
              clearTimeout(timeoutId);
              console.error("Lyria API Error:", err);
              setErrorMsg(err.message || 'Connection error with Lyria API.');
              setInfoMsg(null);
              stopSession(false);
            }
          }
        });
      } catch (err: any) {
        console.warn("Failed to initialize Lyria API:", err);
        clearTimeout(timeoutId);
        // Fallback to local synth
        startLocalSynthFallback();
        return;
      }
      
      timeoutId = setTimeout(() => {
        console.warn("Lyria API timeout");
        setInfoMsg(null);
        startLocalSynthFallback();
      }, 10000); // Reduced timeout to 10s so fallback happens faster

      sessionPromise.then(async session => {
        clearTimeout(timeoutId);
        sessionRef.current = session;
        setStatus('Connected & Playing');
        setIsPlaying(true);
        
        const initialPrompt = "minimalist ambient drone, quiet";
        setCurrentPrompt(initialPrompt);
        lastPromptRef.current = initialPrompt;
        
        try {
          await session.setMusicGenerationConfig({
            musicGenerationConfig: { bpm: 120, temperature: 1.0 }
          });
          await session.setWeightedPrompts({
            weightedPrompts: [{ text: initialPrompt, weight: 1.0 }]
          });
          session.play();
        } catch (e) {
          console.error("Error setting up session:", e);
        }
      }).catch(err => {
        clearTimeout(timeoutId);
        console.error("API Error:", err);
        // Fallback to local synth
        startLocalSynthFallback();
      });

    } catch (err: any) {
      console.error("Setup Error:", err);
      setStatus('Failed to connect');
      setErrorMsg(err.message || 'An unknown error occurred during setup.');
      setInfoMsg(null);
      stopSession(false);
    }
  };

  const stopSession = (closeCamera: boolean = true) => {
    setIsPlaying(false);
    if (vibeTimeoutRef.current) {
      clearTimeout(vibeTimeoutRef.current);
      vibeTimeoutRef.current = null;
    }
    pendingStateRef.current = null;
    
    if (status === 'Connected & Playing' || status === 'Connecting to Lyria API...' || status.includes('Local Synth')) {
      setStatus('Idle');
    }
    
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.conn.close(); } catch (e) {}
      sessionRef.current = null;
    }
    
    if (localPatternRef.current) {
      localPatternRef.current.stop();
      localPatternRef.current.dispose();
      localPatternRef.current = null;
    }
    if (localSynthRef.current) {
      localSynthRef.current.releaseAll();
      localSynthRef.current.dispose();
      localSynthRef.current = null;
    }
    if (Tone.Transport.state === 'started') {
      Tone.Transport.stop();
    }
    
    setConsoleState({
      emotion: 'neutral',
      objects: [],
      blendshapes: { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 }
    });
    smoothedBlendshapesRef.current = { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 };
    smoothedBoxesRef.current.clear();
    
    setInfoMsg(null);

    if (closeCamera) {
      isPlayingRef.current = false;
      setCurrentPrompt('Waiting for camera...');
      
      if (detectLoopRef.current) {
        cancelAnimationFrame(detectLoopRef.current);
        detectLoopRef.current = null;
      }
      
      // Let the canvas fade out via CSS transition instead of clearing immediately
      // if (canvasRef.current) {
      //   const ctx = canvasRef.current.getContext('2d');
      //   if (ctx) {
      //     ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      //   }
      // }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setIsCameraActive(false);
      }
    }
  };

  const handleShare = async () => {
    if (!user) {
      setErrorMsg("Please sign in to share your stream.");
      return;
    }
    
    try {
      playHoverSound();
      
      let snapshot = '';
      if (canvasRef.current) {
        // Capture a low-res snapshot for the feed
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 320;
        tempCanvas.height = 180;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          // Draw the video frame first
          if (videoRef.current) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 180);
          }
          // Then draw the face mesh from the main canvas
          ctx.drawImage(canvasRef.current, 0, 0, 320, 180);
          snapshot = tempCanvas.toDataURL('image/jpeg', 0.6);
        }
      }

      await addDoc(collection(db, 'site_feed'), {
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || '',
        description: `Streaming: ${currentPrompt}`,
        snapshot,
        isLive: isCameraActive,
        createdAt: serverTimestamp()
      });
      setInfoMsg("Live stream shared to feed!");
    } catch (e: any) {
      console.error("Error sharing to feed:", e);
      setErrorMsg("Failed to share to feed: " + e.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedAudioUrl(url);
      setIsAiMusicEnabled(false);
      if (playerRef.current) {
        playerRef.current.setMuted(true);
      }
    }
  };

  const updateAiPrompt = async (manualPrompt?: string) => {
    const promptText = manualPrompt || await getVibeFromGemini(consoleState.objects, consoleState.emotion, customMood);
    setCurrentPrompt(promptText);
    if (sessionRef.current) {
      sessionRef.current.setWeightedPrompts({
        weightedPrompts: [{ text: promptText, weight: 1.0 }]
      }).catch(console.error);
    } else if (localSynthRef.current) {
      // Update local synth based on emotion
      updateLocalSynthVibe(consoleState.emotion);
    }
  };

  const updateLocalSynthVibe = (emotion: string) => {
    if (!localPatternRef.current || !localSynthRef.current) return;
    
    // Change notes and tempo based on emotion
    let notes = ["C4", "E4", "G4", "B4"];
    let interval = "8n";
    
    switch (emotion) {
      case 'happy':
        notes = ["C4", "E4", "G4", "A4", "C5"];
        interval = "16n";
        Tone.Transport.bpm.rampTo(140, 1);
        break;
      case 'sadness':
        notes = ["A3", "C4", "E4", "G4"];
        interval = "4n";
        Tone.Transport.bpm.rampTo(80, 2);
        break;
      case 'angry':
        notes = ["C3", "C#3", "G3", "G#3"];
        interval = "16n";
        Tone.Transport.bpm.rampTo(160, 0.5);
        break;
      case 'fear':
        notes = ["D4", "D#4", "A4", "A#4"];
        interval = "16t";
        Tone.Transport.bpm.rampTo(130, 1);
        break;
      case 'surprised':
        notes = ["C4", "G4", "C5", "G5"];
        interval = "8t";
        Tone.Transport.bpm.rampTo(120, 0.5);
        break;
      default: // neutral
        notes = ["C4", "D4", "E4", "G4", "A4"];
        interval = "8n";
        Tone.Transport.bpm.rampTo(100, 2);
        break;
    }
    
    localPatternRef.current.values = notes;
    localPatternRef.current.interval = interval;
  };

  const startLocalSynthFallback = async () => {
    try {
      await initAudio();
      
      if (!localSynthRef.current) {
        const reverb = new Tone.Reverb(4).toDestination();
        const delay = new Tone.FeedbackDelay("8n", 0.5).connect(reverb);
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1.5 }
        }).connect(delay);
        
        synth.volume.value = -15;
        localSynthRef.current = synth;
        
        const pattern = new Tone.Pattern((time, note) => {
          if (isAiMusicEnabled) {
            synth.triggerAttackRelease(note, "8n", time);
          }
        }, ["C4", "D4", "E4", "G4", "A4"], "randomWalk");
        
        localPatternRef.current = pattern;
      }
      
      Tone.Transport.start();
      localPatternRef.current.start(0);
      
      setStatus('Local Synth Active');
      setIsPlaying(true);
      setInfoMsg("Lyria API unavailable. Using local generative synth.");
      
      const initialPrompt = "minimalist ambient drone, quiet";
      setCurrentPrompt(initialPrompt);
      lastPromptRef.current = initialPrompt;
      
    } catch (e) {
      console.error("Failed to start local synth:", e);
      setErrorMsg("Failed to start audio engine.");
      stopSession(false);
    }
  };

  const toggleAiMusic = () => {
    const newState = !isAiMusicEnabled;
    setIsAiMusicEnabled(newState);
    if (playerRef.current) {
      playerRef.current.setMuted(!newState);
    }
    if (localSynthRef.current) {
      localSynthRef.current.volume.rampTo(newState ? -15 : -Infinity, 0.5);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-black text-white flex flex-col overflow-hidden font-mono relative">
      {/* Header */}
      <header className="relative z-30 w-full p-4 border-b border-white/10 bg-black/80 backdrop-blur flex justify-between items-center shrink-0">
        <div className="font-bold text-xl tracking-tighter text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">MYTUBE</div>
        <nav className="flex gap-4 text-xs uppercase tracking-widest">
          <button onClick={() => setCurrentView('feed')} className={`transition-colors ${currentView === 'feed' ? 'text-orange-400' : 'text-white/50 hover:text-white'}`}>Feed</button>
          <button onClick={() => setCurrentView('studio')} className={`transition-colors ${currentView === 'studio' ? 'text-orange-400' : 'text-white/50 hover:text-white'}`}>Studio</button>
          <button onClick={() => setCurrentView('profile')} className={`transition-colors ${currentView === 'profile' ? 'text-orange-400' : 'text-white/50 hover:text-white'}`}>Profile</button>
        </nav>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 relative w-full overflow-hidden">
        {/* Background Camera Feed (only visible in studio) */}
        {currentView === 'studio' && (
          <div className="absolute inset-0 z-0">
            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 z-10 font-mono text-sm">
                <Camera className="w-8 h-8 mb-4 opacity-50" />
                <p>SYSTEM.CAMERA_OFFLINE</p>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover grayscale contrast-125 opacity-60 transition-opacity duration-500 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-500 z-[15] ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
            />
            {/* Vignette & Scanlines */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] z-10" />
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] z-10" />
            
            {/* Decorative HUD Elements */}
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-hidden">
              <div className="w-[150vw] h-[150vw] sm:w-[600px] sm:h-[600px] border border-white/10 rounded-full border-dashed animate-[spin_60s_linear_infinite] shrink-0" />
              <div className="absolute w-[100vw] h-[100vw] sm:w-[400px] sm:h-[400px] border border-white/5 rounded-full animate-[spin_40s_linear_infinite_reverse] shrink-0" />
              <div className="absolute w-px h-full bg-white/5" />
              <div className="absolute h-px w-full bg-white/5" />
            </div>
          </div>
        )}

        {/* Overlays */}
        <div className="relative z-20 w-full h-full pointer-events-auto p-4 sm:p-6 overflow-y-auto overflow-x-hidden pb-32 sm:pb-6">
          
          {currentView === 'feed' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-bold text-white uppercase tracking-widest mb-6">Site Feed</h2>
              {feedItems.length === 0 ? (
                <div className="p-8 border border-white/10 bg-white/5 text-center text-white/50 text-xs uppercase tracking-widest">
                  No streams shared yet.
                </div>
              ) : (
                feedItems.map(item => (
                  <div key={item.id} className="p-4 border border-white/10 bg-black/40 backdrop-blur flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={item.userPhoto || ''} alt="" className="w-10 h-10 rounded-full bg-white/10 object-cover" />
                        <div>
                          <div className="font-bold text-white text-sm">{item.userName}</div>
                          <div className="text-[10px] text-white/50 uppercase tracking-widest">{item.createdAt?.toDate().toLocaleString()}</div>
                        </div>
                      </div>
                      {item.isLive && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-red-500/20 border border-red-500/50 rounded-full">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-[8px] font-bold text-red-500 uppercase tracking-widest">Live</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-white/90">{item.description}</p>
                    <div className="w-full aspect-video bg-black/60 border border-white/10 overflow-hidden relative group">
                      {item.snapshot ? (
                        <img src={item.snapshot} alt="Stream Preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/30">
                          <Play className="w-12 h-12" />
                        </div>
                      )}
                      {item.isLive && (
                        <button 
                          onClick={() => setCurrentView('studio')}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <div className="px-4 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest">Join Stream</div>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {currentView === 'profile' && (
            <div className="max-w-2xl mx-auto">
              {user ? (
                <AvatarEditor user={user} onClose={() => setCurrentView('studio')} />
              ) : (
                <div className="p-8 border border-white/10 bg-white/5 text-center">
                  <p className="text-white/50 text-xs uppercase tracking-widest mb-4">Please sign in to view your profile.</p>
                  <button onClick={() => setCurrentView('studio')} className="px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/50 text-xs uppercase tracking-widest">
                    Go to Studio
                  </button>
                </div>
              )}
            </div>
          )}

          {currentView === 'studio' && (
            <div className="flex flex-col lg:flex-row justify-between gap-4 min-h-full">
              
              {/* Left Column */}
              <div className="contents lg:flex lg:flex-col lg:justify-between w-full lg:w-80 pointer-events-none shrink-0">
                
                {/* Top Left: System Status & Mobile Controls */}
                <div className="flex flex-col gap-4 shrink-0 order-1 lg:order-none pointer-events-auto">
              
              {/* Status */}
              <div className="flex flex-col items-start gap-4 shrink-0">
                <div className="flex items-start justify-between w-full">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tighter text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">MYTUBE</h1>
                    <p className="text-[10px] text-white/70 font-mono uppercase tracking-widest">Lyria RealTime Engine v2.4</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Small Start/Stop Button (Mobile Landscape Only) */}
                    <button
                      onClick={() => { playHoverSound(); isCameraActive ? stopSession(true) : startSession(); }}
                      onMouseEnter={playHoverSound}
                      disabled={!isModelLoaded}
                      className={`hidden landscape:flex lg:landscape:hidden justify-center items-center gap-2 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all duration-300 border backdrop-blur-md rounded-none ${
                        isCameraActive 
                          ? 'bg-red-500/20 text-red-400 border-red-500 hover:bg-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.4)]' 
                          : 'bg-white/10 text-white border-white hover:bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {!isModelLoaded ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> INIT</>
                      ) : isCameraActive ? (
                        <><Square className="w-3 h-3 fill-current" /> STOP</>
                      ) : (
                        <><Play className="w-3 h-3 fill-current" /> START STREAM</>
                      )}
                    </button>
                    <button 
                      onClick={() => { playHoverSound(); toggleTranscription(); }}
                      onMouseEnter={playHoverSound}
                      className={`p-2 rounded-full transition-colors backdrop-blur-md border shrink-0 ${isTranscribing ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'}`}
                      title="Toggle Transcription"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={handleShare}
                      onMouseEnter={playHoverSound}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md border border-white/20 shrink-0"
                      title="Share to Feed"
                    >
                      <Share2 className="w-5 h-5 text-white" />
                    </button>
                    <button 
                      onClick={() => { playHoverSound(); setIsControlsOpen(true); }}
                      onMouseEnter={playHoverSound}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md border border-white/20 shrink-0"
                      title="Settings & Controls"
                    >
                      <Settings className="w-5 h-5 text-white" />
                    </button>
                    <button 
                      onClick={() => { playHoverSound(); setIsInfoOpen(true); }}
                      onMouseEnter={playHoverSound}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md border border-white/20 shrink-0"
                      title="App Information"
                    >
                      <Info className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-mono text-white/80 flex items-center gap-2 bg-black/40 backdrop-blur px-3 py-1.5 border border-white/20">
                  <motion.div 
                    animate={status === 'Connected & Playing' ? {
                      scale: [1, 1.5, 1],
                      opacity: [1, 0.5, 1],
                    } : {}}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className={`w-2 h-2 rounded-none ${status === 'Connected & Playing' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : status.includes('Connecting') || status.includes('Starting') ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : status === 'Loading Object Detection Model...' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : status.includes('Error') || status.includes('Denied') ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-zinc-600'}`} 
                  />
                  {status}
                </div>
              </div>

              {/* Mobile Controls (Hidden on Desktop & Landscape) */}
              <div className="flex lg:hidden landscape:hidden flex-col items-stretch gap-4 shrink-0">
                <button
                  onClick={() => { playHoverSound(); isCameraActive ? stopSession(true) : startSession(); }}
                  onMouseEnter={playHoverSound}
                  disabled={!isModelLoaded}
                  className={`flex justify-center items-center gap-3 px-10 py-4 font-mono text-sm font-bold uppercase tracking-widest transition-all duration-300 border-2 backdrop-blur-md ${
                    isCameraActive 
                      ? 'bg-red-500/20 text-red-400 border-red-500 hover:bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                      : 'bg-white/10 text-white border-white hover:bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {!isModelLoaded ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> INITIALIZING...</>
                  ) : isCameraActive ? (
                    <><Square className="w-5 h-5 fill-current" /> STOP SYSTEM</>
                  ) : (
                    <><Play className="w-5 h-5 fill-current" /> START SYSTEM</>
                  )}
                </button>
              </div>

              {/* Mobile Camera Viewport Spacer */}
              <div className="h-[45vh] landscape:h-[100vh] lg:hidden pointer-events-none shrink-0" />
            </div>

            {/* Bottom Left: Scan & Affective */}
            <div className="flex flex-col landscape:flex-row lg:landscape:flex-col gap-4 shrink-0 lg:mt-auto order-4 lg:order-none pointer-events-auto">
              
              {/* Middle Left: Face Scanner */}
              <div className="flex flex-col justify-center shrink-0 landscape:flex-1 lg:landscape:flex-none">
                <div className="bg-black/40 backdrop-blur-md border border-white/20 p-4 w-full shadow-[0_0_30px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col h-64 landscape:h-full lg:landscape:h-64 shrink-0" title="Real-time facial landmark tracking">
                  <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 shrink-0 flex items-center gap-2">
                    <ScanFace className="w-3 h-3" />
                    Biometric Scan
                  </h3>
                  <div className="relative w-full flex-1 border border-white/10 flex items-center justify-center bg-white/5 min-h-0">
                    <canvas
                      ref={faceCanvasRef}
                      width={300}
                      height={300}
                      className={`w-full h-full object-contain transition-opacity duration-500 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Left: Affective State */}
              <div className="flex flex-col justify-end shrink-0 landscape:flex-1 lg:landscape:flex-none">
                <div className="bg-black/40 backdrop-blur-md border border-white/20 p-5 w-full h-full shadow-[0_0_30px_rgba(0,0,0,0.8)]" title="Detected emotional state based on facial expressions">
                  <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    Affective State
                  </h3>
                  <div className="text-3xl font-light tracking-tighter mb-4 capitalize text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                    {consoleState.emotion}
                  </div>
                  
                  <div className="space-y-2">
                    {[
                      { label: 'Smile', value: consoleState.blendshapes.smile },
                      { label: 'Frown', value: consoleState.blendshapes.frown },
                      { label: 'Mouth Open', value: consoleState.blendshapes.mouthOpen },
                      { label: 'Brow Raise', value: consoleState.blendshapes.browRaise },
                      { label: 'Eye Blink', value: consoleState.blendshapes.eyeBlink },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-white/60 uppercase tracking-wider">{item.label}</span>
                          <span className="font-bold text-white/90">{isNaN(item.value) ? 0 : (item.value * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-[2px] bg-white/10 overflow-hidden">
                          <motion.div 
                            className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${isNaN(item.value) ? 0 : item.value * 100}%` }}
                            transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column */}
          <div className="contents lg:flex lg:flex-col lg:justify-between lg:items-end w-full lg:w-80 pointer-events-none shrink-0 mt-0">
            
            {/* Top Right: Controls */}
            <div className="hidden lg:flex flex-col items-end gap-4 shrink-0 order-none pointer-events-auto">
              <button
                onClick={() => { playHoverSound(); isCameraActive ? stopSession(true) : startSession(); }}
                onMouseEnter={playHoverSound}
                disabled={!isModelLoaded}
                className={`flex justify-center items-center gap-3 px-10 py-4 font-mono text-sm font-bold uppercase tracking-widest transition-all duration-300 border-2 backdrop-blur-md ${
                  isCameraActive 
                    ? 'bg-red-500/20 text-red-400 border-red-500 hover:bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                    : 'bg-white/10 text-white border-white hover:bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {!isModelLoaded ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> INITIALIZING...</>
                ) : isCameraActive ? (
                  <><Square className="w-5 h-5 fill-current" /> STOP STREAM</>
                ) : (
                  <><Play className="w-5 h-5 fill-current" /> START STREAM</>
                )}
              </button>
            </div>

            {/* Bottom Right: Entities & Audio */}
            <div className="flex flex-col gap-4 shrink-0 w-full order-2 lg:order-none pointer-events-auto">
              
              {/* Detected Entities */}
              <div className="order-1 lg:order-2 w-full bg-black/40 backdrop-blur-md border border-white/20 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]" title="Objects detected in the camera view">
                <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Cpu className="w-3 h-3" />
                  Entities
                </h3>
                {consoleState.objects.length === 0 ? (
                  <p className="text-[10px] text-white/40 italic">No entities detected.</p>
                ) : (
                  <ul className="space-y-1.5">
                    <AnimatePresence>
                      {consoleState.objects.map((obj) => (
                        <motion.li 
                          key={obj}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="text-[10px] flex items-center gap-2 text-white/90 uppercase tracking-wider"
                        >
                          <span className="w-1 h-1 bg-white shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
                          {obj}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

              {/* Audio Profile */}
              <div className="order-2 lg:order-1 w-full bg-black/40 backdrop-blur-md border border-white/20 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]" title="AI-generated musical prompt based on your environment and mood">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Audio Profile</h3>
                  <button 
                    onClick={() => updateAiPrompt()}
                    className="text-[10px] text-orange-400 hover:text-orange-300 uppercase tracking-widest flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                </div>
                <div className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-0.5 h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                  <p className="text-xs leading-relaxed text-white/90 pl-3">
                    {currentPrompt}
                  </p>
                </div>
              </div>

              {/* Audio Controls */}
              <div className="order-3 w-full bg-black/40 backdrop-blur-md border border-white/20 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Music className="w-3 h-3" />
                  Audio Controls
                </h3>
                
                <div className="space-y-4">
                  {/* AI Music Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/60 uppercase tracking-wider">AI Music</span>
                    <button 
                      onClick={toggleAiMusic}
                      className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all ${
                        isAiMusicEnabled 
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500' 
                          : 'bg-white/5 text-white/40 border-white/10'
                      }`}
                    >
                      {isAiMusicEnabled ? 'Active' : 'Stopped'}
                    </button>
                  </div>

                  {/* Custom Mood Input */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/60 uppercase tracking-wider block">Custom Mood</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={customMood}
                        onChange={(e) => setCustomMood(e.target.value)}
                        placeholder="e.g. Cyberpunk Noir"
                        className="flex-1 bg-white/5 border border-white/10 px-2 py-1 text-[10px] text-white focus:outline-none focus:border-orange-500/50"
                      />
                      <button 
                        onClick={() => updateAiPrompt()}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] uppercase tracking-widest"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  {/* Background Music Upload */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/60 uppercase tracking-wider block">Background Music</label>
                    <div className="flex flex-col gap-2">
                      <input 
                        type="file" 
                        accept="audio/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="bg-music-upload"
                      />
                      <label 
                        htmlFor="bg-music-upload"
                        className="w-full py-2 border border-dashed border-white/20 hover:border-white/40 bg-white/5 text-[10px] text-white/60 uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        {uploadedAudioUrl ? 'Change Track' : 'Upload Track'}
                      </label>
                      
                      {uploadedAudioUrl && (
                        <div className="space-y-2">
                          <audio 
                            ref={bgMusicRef}
                            src={uploadedAudioUrl} 
                            loop 
                            autoPlay 
                            className="hidden"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] text-orange-400 uppercase truncate max-w-[120px]">Track Loaded</span>
                            <div className="flex items-center gap-2">
                              <Volume2 className="w-3 h-3 text-white/40" />
                              <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.01" 
                                value={bgMusicVolume}
                                onChange={(e) => {
                                  const vol = parseFloat(e.target.value);
                                  setBgMusicVolume(vol);
                                  if (bgMusicRef.current) bgMusicRef.current.volume = vol;
                                }}
                                className="w-16 h-1 bg-white/10 appearance-none cursor-pointer accent-orange-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcription */}
              <div className="order-3 w-full bg-black/40 backdrop-blur-md border border-white/20 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]" title="Live Audio Transcription">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
                    <Mic className="w-3 h-3" />
                    Transcription
                  </h3>
                  <div className={`w-2 h-2 rounded-full ${isTranscribing ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-white/20'}`} />
                </div>
                <div className="relative overflow-hidden min-h-[60px] max-h-[120px] overflow-y-auto">
                  <div className="absolute top-0 left-0 w-0.5 h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]" />
                  <p className="text-xs leading-relaxed text-white/90 pl-3 font-sans">
                    {transcription || (isTranscribing ? "Listening..." : "Transcription inactive. Click the mic icon to start.")}
                  </p>
                </div>
              </div>

              {/* News Feed */}
              <div className="order-4 w-full">
                <NewsCard />
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  </div>

  {/* Error Modal */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto"
            >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-red-500/50 p-6 max-w-md w-full shadow-[0_0_40px_rgba(239,68,68,0.2)] relative"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-red-500/10 border border-red-500/30 shrink-0">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-500 uppercase tracking-widest">{status}</h3>
                  <p className="text-sm mt-2 text-red-400/80 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
              
              <button 
                onClick={() => setErrorMsg(null)}
                className={`w-full py-3 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
                  status === 'Camera Error' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400' 
                    : 'bg-white/5 hover:bg-white/10 border border-white/20 text-white/70'
                }`}
              >
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Toast (Center Bottom) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col justify-end items-center pointer-events-none z-30 w-[calc(100%-2rem)] sm:w-full max-w-md">
        <AnimatePresence>
          {infoMsg && !errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-black/80 backdrop-blur-md border border-white/30 p-4 flex items-start gap-3 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)] mb-4 w-full"
            >
              <Music className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm">{status}</h3>
                <p className="text-xs mt-1 text-white/80">{infoMsg}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info Modal */}
      <AnimatePresence>
        {isInfoOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto"
            onClick={() => setIsInfoOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-white/20 p-6 max-w-lg w-full shadow-[0_0_40px_rgba(0,0,0,0.8)] relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex flex-col-reverse sm:flex-row sm:items-start justify-between gap-4 mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2 self-start">
                  <Info className="w-5 h-5 shrink-0" />
                  About MyTube
                </h2>
                <button 
                  onClick={() => setIsInfoOpen(false)}
                  className="p-2 shrink-0 border border-white/20 bg-black/50 hover:bg-white/10 text-white/50 hover:text-white transition-colors self-end sm:self-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4 text-sm text-white/80 leading-relaxed">
                <p>
                  <strong>MyTube</strong> uses your device's camera to analyze your facial expressions and the objects around you in real-time.
                </p>
                <p>
                  Based on this visual data, it generates a continuous, procedural ambient soundscape that matches your mood and environment.
                </p>
                <ul className="list-disc pl-5 space-y-2 text-white/70">
                  <li><strong>Biometric Scan:</strong> Tracks your facial landmarks to determine your current emotion (happy, sad, surprised, angry, fear, disgust).</li>
                  <li><strong>Entities:</strong> Detects objects in your environment (like laptops, cups, plants) to influence the musical vibe.</li>
                  <li><strong>Audio Profile:</strong> The AI generates a descriptive prompt based on the scene, which drives the procedural music engine.</li>
                  <li><strong>Transcription:</strong> Click the microphone icon to transcribe your speech in real-time.</li>
                </ul>
                <p className="text-xs text-white/50 mt-4 pt-4 border-t border-white/10">
                  Note: All processing happens locally in your browser or via secure API calls. No video data is saved or transmitted.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Controls Modal */}
      <AnimatePresence>
        {isControlsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto"
            onClick={() => setIsControlsOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-white/20 p-6 max-w-lg w-full shadow-[0_0_40px_rgba(0,0,0,0.8)] relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex flex-col-reverse sm:flex-row sm:items-start justify-between gap-4 mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2 self-start">
                  <Settings className="w-5 h-5 shrink-0" />
                  System Controls
                </h2>
                <button 
                  onClick={() => setIsControlsOpen(false)}
                  className="p-2 shrink-0 border border-white/20 bg-black/50 hover:bg-white/10 text-white/50 hover:text-white transition-colors self-end sm:self-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-6 text-sm text-white/80">
                
                {/* Camera Control */}
                <div className="flex items-center justify-between p-4 border border-white/10 bg-white/5">
                  <div className="flex items-center gap-3">
                    {isCameraActive ? <Video className="w-5 h-5 text-orange-400" /> : <VideoOff className="w-5 h-5 text-white/50" />}
                    <div>
                      <div className="font-bold text-white">Camera Feed</div>
                      <div className="text-xs text-white/50">Toggle visual detection</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { playHoverSound(); isCameraActive ? stopSession(true) : startSession(); }}
                    className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
                      isCameraActive ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                    }`}
                  >
                    {isCameraActive ? 'Stop' : 'Start'}
                  </button>
                </div>

                {/* Audio Control */}
                <div className="flex items-center justify-between p-4 border border-white/10 bg-white/5">
                  <div className="flex items-center gap-3">
                    {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-orange-400" />}
                    <div>
                      <div className="font-bold text-white">Audio Playback</div>
                      <div className="text-xs text-white/50">Mute/unmute generated music</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playHoverSound();
                      setIsMuted(!isMuted);
                      if (Tone.getDestination()) {
                        Tone.getDestination().mute = !isMuted;
                      }
                      if (playerRef.current) {
                        if (!isMuted) {
                          playerRef.current.audioContext.suspend();
                        } else {
                          playerRef.current.audioContext.resume();
                        }
                      }
                    }}
                    className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
                      isMuted ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'
                    }`}
                  >
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                </div>

                {/* Transcription Control */}
                <div className="flex items-center justify-between p-4 border border-white/10 bg-white/5">
                  <div className="flex items-center gap-3">
                    <Mic className={`w-5 h-5 ${isTranscribing ? 'text-red-400 animate-pulse' : 'text-white/50'}`} />
                    <div>
                      <div className="font-bold text-white">Live Transcription</div>
                      <div className="text-xs text-white/50">Speech-to-text overlay</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { playHoverSound(); toggleTranscription(); }}
                    className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
                      isTranscribing ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                    }`}
                  >
                    {isTranscribing ? 'Stop' : 'Start'}
                  </button>
                </div>

                {/* Team Communication */}
                <div className="mt-8">
                  <TeamCommunication />
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="relative z-30 w-full p-4 border-t border-white/10 bg-black/80 backdrop-blur text-center text-[10px] text-white/50 uppercase tracking-widest shrink-0">
        &copy; 2026 MyTube. All rights reserved. | Powered by Lyria RealTime Engine
      </footer>
    </div>
  );
}
