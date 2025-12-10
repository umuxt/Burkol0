// Simple health check endpoint for testing
export default function handler(req, res) {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.DATABASE_URL ? 'production' : 'development'
  });
}
