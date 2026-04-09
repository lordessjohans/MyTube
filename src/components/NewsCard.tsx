import React, { useState, useEffect } from 'react';
import { RefreshCw, Newspaper, AlertCircle, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

interface NewsArticle {
  title: string;
  summary: string;
  category: string;
}

export const NewsCard: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || (process.env as any).API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Generate 3 short, futuristic news headlines and summaries related to AI music, Lyria, or the future of creative technology. Format as a JSON array of objects with 'title', 'summary', and 'category' fields. Keep summaries under 100 characters.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                category: { type: Type.STRING }
              },
              required: ["title", "summary", "category"]
            }
          }
        }
      });
      
      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      const data = JSON.parse(text);
      setArticles(data);
    } catch (err: any) {
      console.error("Error fetching news:", err);
      setError("Failed to synchronize news feed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <div className="w-full bg-black/40 backdrop-blur-md border border-white/20 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]" title="Latest AI & Tech News">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
          <Newspaper className="w-3 h-3" />
          News Feed
        </h3>
        <button 
          onClick={fetchNews}
          disabled={loading}
          className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          title="Refresh Feed"
        >
          <RefreshCw className={`w-3 h-3 text-white/50 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
          <span className="text-[8px] text-white/20 uppercase tracking-[0.2em]">Syncing...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="text-[9px] uppercase tracking-wider leading-tight">{error}</span>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div 
              key={articles.map(a => a.title).join(',')}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {articles.map((article, idx) => (
                <motion.div 
                  key={article.title + idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="group cursor-default"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] px-1.5 py-0.5 bg-white/10 text-white/60 uppercase tracking-widest font-bold border border-white/5">
                      {article.category}
                    </span>
                  </div>
                  <h4 className="text-[11px] font-bold text-white group-hover:text-orange-400 transition-colors leading-tight mb-1">
                    {article.title}
                  </h4>
                  <p className="text-[10px] text-white/50 leading-relaxed">
                    {article.summary}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
