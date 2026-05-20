import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // API Route for Stripe Checkout
  app.post('/api/create-checkout-session', async (req, res) => {
    // For demo/prototype purposes, we use a fake checkout session if STRIPE_SECRET_KEY is missing, 
    // or real checkout session if present
    const { streamId } = req.body;
    
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn("STRIPE_SECRET_KEY is missing. Using a mock response for the demo.");
      // We return a mock session URL that acts as a success redirect
      return res.json({ url: `/?stream=${streamId}&success=true` });
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Premium Stream Access',
                description: `Access to view stream: ${streamId}`,
              },
              unit_amount: 500, // $5.00
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `http://localhost:${PORT}/?stream=${streamId}&success=true`,
        cancel_url: `http://localhost:${PORT}/`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // API Route for Gemini Chat
  app.post('/api/chat', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      
      // Dynamic import to match usage
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      
      const { prompt, history } = req.body;
      
      // For simplicity in a prototype we use pure generateContent with simple history merging
      // or we can use the chats feature
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: "You are a helpful coding assistant and bestie bot. You chat with the streamer and answer their questions, giving coding tutorials while they are live. Keep your answers reasonably concise so they fit in a chat window.",
        }
      });
      
      // Pre-seed history if passed (optional, for simple integration we just rely on passing full log or starting fresh. But wait, ai.chats doesn't let you append history easily after create, except by sending messages. We can just send the latest prompt). Let's just use generateContent for stateless or send the prompt to the chat.
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: "System prompt: You are a helpful coding assistant and bestie bot. You chat with the streamer and answer their questions, giving coding tutorials while they are live. Be friendly." }] },
          ...(history || []).map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          })),
          { role: 'user', parts: [{ text: prompt }] }
        ],
      });

      res.json({ text: response.text });
    } catch (e: any) {
      console.error('Chat error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
