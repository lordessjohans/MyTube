import React, { useState, useEffect } from 'react';
import { RefreshCw, Newspaper, AlertCircle, Loader2, TrendingUp, Zap, Target, ArrowRight, MessageSquare, Calendar, ExternalLink } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

interface IntelPost {
  id: string;
  source: 'Facebook' | 'Instagram' | 'TikTok' | 'X';
  author: string;
  content: string;
  category: 'Lead Inspiration' | 'Product Innovation' | 'Market Trend' | 'Sales Strategy';
  timestamp: string;
}

export const IntelFeed: React.FC = () => {
  const [posts, setPosts] = useState<IntelPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntel = async () => {
    setLoading(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || (process.env as any).API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Generate 5 daily intelligence posts for a media studio dashboard. These should simulate relevant, 'rational', and useful posts from Facebook, Instagram, TikTok, and X that would inspire sales leads. Categorize each into 'Lead Inspiration', 'Product Innovation', 'Market Trend', or 'Sales Strategy'. Format as a JSON array of objects with 'source', 'author', 'content', 'category', and 'timestamp' fields. Content should be insightful and professional.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING, enum: ['Facebook', 'Instagram', 'TikTok', 'X'] },
                author: { type: Type.STRING },
                content: { type: Type.STRING },
                category: { type: Type.STRING, enum: ['Lead Inspiration', 'Product Innovation', 'Market Trend', 'Sales Strategy'] },
                timestamp: { type: Type.STRING }
              },
              required: ["source", "author", "content", "category", "timestamp"]
            }
          }
        }
      });
      
      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      const data = JSON.parse(text).map((p: any, i: number) => ({ ...p, id: `intel-${i}` }));
      setPosts(data);
    } catch (err: any) {
      console.error("Error fetching intel:", err);
      setError("Failed to synchronize intelligence feed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
  }, []);

  return (
    <div className="w-full bg-black/40 backdrop-blur-md border border-white/20 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]" title="Sales & Lead Intelligence">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-[0.3em] flex items-center gap-2">
          <Zap className="w-3 h-3 fill-orange-500" />
          Intelligence Hub
        </h3>
        <button 
          onClick={fetchIntel}
          disabled={loading}
          className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          title="Refresh Intel"
        >
          <RefreshCw className={`w-3 h-3 text-white/50 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          <span className="text-[9px] text-white/30 uppercase tracking-[0.4em] animate-pulse">Scanning Social Net...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider leading-tight">{error}</span>
        </div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {posts.map((post, idx) => (
              <motion.div 
                key={post.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="group relative border-l-2 border-white/10 hover:border-orange-500/50 pl-4 py-1 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 uppercase tracking-widest font-bold border border-orange-500/20">
                      {post.category}
                    </span>
                    <span className="text-[7px] text-white/40 uppercase font-mono tracking-tighter">
                      {post.source} / @{post.author}
                    </span>
                  </div>
                  <span className="text-[7px] text-white/20 font-mono italic">{post.timestamp}</span>
                </div>
                
                <p className="text-[11px] text-white/80 leading-relaxed font-sans mb-3 group-hover:text-white transition-colors">
                  {post.content}
                </p>

                <div className="flex items-center gap-2 mt-4">
                  <button className="px-3 py-1 bg-orange-500 text-black text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 hover:bg-orange-400 transition-colors">
                    <Target className="w-2.5 h-2.5" />
                    Convert Lead
                  </button>
                  <button className="px-3 py-1 bg-white/5 border border-white/10 text-white/60 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 hover:bg-white/10 transition-colors">
                    <Calendar className="w-2.5 h-2.5" />
                    Schedule
                  </button>
                  <button className="ml-auto p-1 text-white/20 hover:text-white/60 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <div className="pt-4 border-t border-white/5">
            <button className="w-full py-2 bg-white/5 hover:bg-white/10 text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 group">
              View Global Market Analysis
              <ArrowRight className="w-2.5 h-2.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
