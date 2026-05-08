import React, { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, Sparkles, Save, X, RefreshCw } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';

const AVATAR_STYLES = [
  { id: 'circle', name: 'Circle', class: 'rounded-full' },
  { id: 'squircle', name: 'Squircle', class: 'rounded-[2rem]' },
  { id: 'hexagon', name: 'Hexagon', class: '[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]' },
  { id: 'star', name: 'Star', class: '[clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]' },
  { id: 'diamond', name: 'Diamond', class: '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]' },
  { id: 'shield', name: 'Shield', class: '[clip-path:polygon(0%_0%,100%_0%,100%_75%,50%_100%,0%_75%)]' },
  { id: 'message', name: 'Bubble', class: '[clip-path:polygon(0%_0%,100%_0%,100%_75%,25%_75%,0%_100%,0%_75%)]' }
];

const AVATAR_BORDERS = [
  { id: 'none', name: 'None', class: 'border-0' },
  { id: 'thin', name: 'Thin', class: 'border-2' },
  { id: 'thick', name: 'Thick', class: 'border-4' },
  { id: 'double', name: 'Double', class: 'border-8' }
];

const AVATAR_COLORS = [
  { id: 'orange', name: 'Orange', class: 'border-orange-500 text-orange-500 bg-orange-500/20' },
  { id: 'blue', name: 'Blue', class: 'border-blue-500 text-blue-500 bg-blue-500/20' },
  { id: 'green', name: 'Green', class: 'border-green-500 text-green-500 bg-green-500/20' },
  { id: 'purple', name: 'Purple', class: 'border-purple-500 text-purple-500 bg-purple-500/20' },
  { id: 'red', name: 'Red', class: 'border-red-500 text-red-500 bg-red-500/20' },
  { id: 'cyan', name: 'Cyan', class: 'border-cyan-400 text-cyan-400 bg-cyan-400/20' }
];

const AVATAR_ANIMATIONS = [
  { id: 'none', name: 'None', class: '' },
  { id: 'pulse', name: 'Pulse', class: 'animate-pulse' },
  { id: 'spin-slow', name: 'Spin', class: 'animate-[spin_10s_linear_infinite]' },
  { id: 'bounce-slow', name: 'Bounce', class: 'animate-[bounce_3s_infinite]' },
  { id: 'wiggle', name: 'Wiggle', class: 'animate-[wiggle_2s_ease-in-out_infinite]' },
  { id: 'float', name: 'Float', class: 'animate-[float_4s_ease-in-out_infinite]' }
];

const AVATAR_FRAMES = [
  { id: 'none', name: 'None', class: '' },
  { id: 'punk', name: 'Punk', class: 'ring-4 ring-red-600 ring-offset-4 ring-offset-black border-dashed border-4 border-white' },
  { id: 'grunge', name: 'Grunge', class: 'grayscale contrast-150 sepia-[.3] border-8 border-zinc-800 shadow-[0_0_20px_rgba(0,0,0,0.8)]' },
  { id: 'preppy', name: 'Preppy', class: 'ring-4 ring-pink-300 ring-offset-2 border-4 border-white shadow-lg' },
  { id: 'rapper', name: 'Rapper', class: 'border-[12px] border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] brightness-110' },
  { id: 'cheerleader', name: 'Cheer', class: 'ring-8 ring-blue-500 ring-inset border-4 border-red-500' }
];

const AVATAR_THEMES = [
  { id: 'none', name: 'Default', class: '' },
  { id: 'noir', name: 'Noir', class: 'grayscale contrast-125 brightness-90' },
  { id: 'pop', name: 'Pop', class: 'saturate-200 hue-rotate-15 contrast-110' },
  { id: 'vikings', name: 'Vikings', class: 'sepia-[.5] contrast-110 brightness-110 saturate-50' },
  { id: 'punk-theme', name: 'Punk', class: 'invert contrast-150 hue-rotate-180' }
];

export function AvatarEditor({ user, onClose }: { user: any, onClose: () => void }) {
  const [mode, setMode] = useState<'view' | 'camera' | 'generate'>('view');
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [avatarStyle, setAvatarStyle] = useState(user.avatarStyle || 'circle');
  const [avatarAnimation, setAvatarAnimation] = useState(user.avatarAnimation || 'none');
  const [avatarBorder, setAvatarBorder] = useState(user.avatarBorder || 'thin');
  const [avatarColor, setAvatarColor] = useState(user.avatarColor || 'orange');
  const [avatarFrame, setAvatarFrame] = useState(user.avatarFrame || 'none');
  const [avatarTheme, setAvatarTheme] = useState(user.avatarTheme || 'none');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (mode === 'camera') {
      navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 400 }, audio: false })
        .then(s => {
          setStream(s);
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => console.error("Error accessing camera:", err));
    } else {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [mode]);

  const resizeAndCompressImage = (dataUrl: string, maxWidth: number, maxHeight: number, quality: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Crop to square
        const size = Math.min(video.videoWidth, video.videoHeight);
        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;
        
        canvas.width = 256;
        canvas.height = 256;
        ctx.drawImage(video, startX, startY, size, size, 0, 0, 256, 256);
        
        // Compress to JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const compressed = await resizeAndCompressImage(dataUrl, 256, 256, 0.7);
        setPhotoURL(compressed);
        setMode('view');
      }
    }
  };

  const generateAvatar = async () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!prompt.trim() || !apiKey) return;
    setIsGenerating(true);
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Using a valid model name. Note: standard Gemini models don't generate images directly via generateContent.
      // This is a placeholder for where an image generation API would be called.
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `Generate a detailed description for an avatar: ${prompt}. Return ONLY the description.` }] }]
      });
      
      // Since Gemini doesn't generate images directly, we'll use a high-quality placeholder service 
      // with the prompt as a seed to simulate AI generation for this demo.
      const seed = encodeURIComponent(prompt.substring(0, 50));
      const placeholderUrl = `https://picsum.photos/seed/${seed}/512/512`;
      
      // Fetch and convert to base64 to store in Firestore
      const imgResponse = await fetch(placeholderUrl);
      const blob = await imgResponse.blob();
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const compressed = await resizeAndCompressImage(base64data, 256, 256, 0.7);
        setPhotoURL(compressed);
        setMode('view');
      };
      reader.readAsDataURL(blob);

    } catch (error) {
      console.error("Error generating avatar:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL,
        avatarStyle,
        avatarAnimation,
        avatarBorder,
        avatarColor,
        avatarFrame,
        avatarTheme
      });
      onClose();
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const styleClass = AVATAR_STYLES.find(s => s.id === avatarStyle)?.class || '';
  const animClass = AVATAR_ANIMATIONS.find(a => a.id === avatarAnimation)?.class || '';
  const borderClass = AVATAR_BORDERS.find(b => b.id === avatarBorder)?.class || '';
  const colorClass = AVATAR_COLORS.find(c => c.id === avatarColor)?.class || '';
  const frameClass = AVATAR_FRAMES.find(f => f.id === avatarFrame)?.class || '';
  const themeClass = AVATAR_THEMES.find(t => t.id === avatarTheme)?.class || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-orange-500/30 w-full max-w-md flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
          <h2 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-400" />
            Customize Avatar
          </h2>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-6 overflow-y-auto max-h-[70vh]">
          {/* Avatar Preview */}
          <div className="relative w-48 h-48 flex items-center justify-center bg-black/40 border border-white/10 overflow-hidden">
            {mode === 'camera' ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : photoURL ? (
              <img 
                src={photoURL} 
                alt="Avatar Preview" 
                className={`w-full h-full object-cover transition-all duration-300 ${styleClass} ${animClass} ${borderClass} ${colorClass.split(' ')[0]} ${frameClass} ${themeClass}`}
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center transition-all duration-300 ${styleClass} ${animClass} ${borderClass} ${colorClass} ${frameClass} ${themeClass}`}>
                <ImageIcon className="w-12 h-12 opacity-50" />
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Mode Selection */}
          {mode === 'view' && (
            <div className="flex gap-4 w-full">
              <button 
                onClick={() => setMode('camera')}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white uppercase tracking-widest transition-colors"
              >
                <Camera className="w-4 h-4" /> Camera
              </button>
              <button 
                onClick={() => setMode('generate')}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-sm font-bold text-orange-400 uppercase tracking-widest transition-colors"
              >
                <Sparkles className="w-4 h-4" /> AI Generate
              </button>
            </div>
          )}

          {mode === 'camera' && (
            <div className="flex gap-4 w-full">
              <button 
                onClick={() => setMode('view')}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white uppercase tracking-widest transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={capturePhoto}
                className="flex-1 py-3 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-sm font-bold text-orange-400 uppercase tracking-widest transition-colors"
              >
                Capture
              </button>
            </div>
          )}

          {mode === 'generate' && (
            <div className="w-full flex flex-col gap-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your avatar (e.g., 'A cyberpunk cat with neon glasses')"
                className="w-full bg-black/40 border border-white/20 p-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500 resize-none h-24"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setMode('view')}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={generateAvatar}
                  disabled={isGenerating || !prompt.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-sm font-bold text-orange-400 uppercase tracking-widest transition-colors disabled:opacity-50"
                >
                  {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate
                </button>
              </div>
            </div>
          )}

          {/* Styling Options */}
          {mode === 'view' && (
            <div className="w-full space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Mask Shape</label>
                <div className="grid grid-cols-4 gap-2">
                  {AVATAR_STYLES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setAvatarStyle(s.id)}
                      className={`py-2 flex items-center justify-center border transition-all ${
                        avatarStyle === s.id ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                      }`}
                      title={s.name}
                    >
                      <div className={`w-6 h-6 bg-current ${s.class}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Border</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVATAR_BORDERS.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setAvatarBorder(b.id)}
                        className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${
                          avatarBorder === b.id ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Theme Color</label>
                  <div className="grid grid-cols-3 gap-2">
                    {AVATAR_COLORS.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setAvatarColor(c.id)}
                        className={`aspect-square flex items-center justify-center border transition-all ${
                          avatarColor === c.id ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                        }`}
                        title={c.name}
                      >
                        <div className={`w-4 h-4 rounded-full ${c.class.split(' ')[0]} bg-current`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Animation</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVATAR_ANIMATIONS.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAvatarAnimation(a.id)}
                      className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${
                        avatarAnimation === a.id ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Frame Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVATAR_FRAMES.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setAvatarFrame(f.id)}
                      className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${
                        avatarFrame === f.id ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Visual Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVATAR_THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setAvatarTheme(t.id)}
                      className={`py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${
                        avatarTheme === t.id ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-black/40 flex justify-end">
          <button
            onClick={saveProfile}
            disabled={isSaving || mode !== 'view'}
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-black font-bold text-xs uppercase tracking-widest hover:bg-orange-400 transition-colors disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
