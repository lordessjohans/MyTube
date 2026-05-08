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
