const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const authRoutes    = require('./routes/auth');
const rideRoutes    = require('./routes/rides');
const driverRoutes  = require('./routes/driver');
const paymentRoutes = require('./routes/payments');
const ratingRoutes  = require('./routes/ratings');
const adminRoutes   = require('./routes/admin');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve frontend static files ─────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/rides',    rideRoutes);
app.use('/api/driver',   driverRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ratings',  ratingRoutes);
app.use('/api/admin',    adminRoutes);

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'OK', service: 'RideFlow API' }));

// ── SPA fallback: serve frontend pages ─────────────────────
app.get('/rider',  (_req, res) => res.sendFile(path.join(__dirname, '../frontend/rider.html')));
app.get('/driver', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/driver.html')));
app.get('/admin',  (_req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));
app.get('/',       (_req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── Global error handler ────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 RideFlow API running on http://localhost:${PORT}`));
