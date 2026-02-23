import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === "1";
const dbPath = isVercel ? path.join("/tmp", "biryani.db") : "biryani.db";
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS mosques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS food_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mosque_id INTEGER NOT NULL,
    food_type TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mosque_id) REFERENCES mosques(id)
  );
`);

// Seed initial mosques
const mosqueCount = db.prepare("SELECT COUNT(*) as count FROM mosques").get() as { count: number };
if (mosqueCount.count === 0) {
  const initialMosques = [
    { name: "Narail Central Jame Mosque (সদর)", lat: 23.1689, lng: 89.5012 },
    { name: "Rupganj Bazar Jame Mosque (সদর)", lat: 23.1720, lng: 89.5050 },
    { name: "Narail District Model Mosque (সদর)", lat: 23.1650, lng: 89.4980 },
    { name: "Vatshala Jame Mosque (সদর)", lat: 23.1800, lng: 89.5100 },
    { name: "Durgapur Jame Mosque (সদর)", lat: 23.1550, lng: 89.4900 },
    { name: "Mahiskhola Jame Mosque (সদর)", lat: 23.1620, lng: 89.5120 },
    { name: "Kurigram Jame Mosque (সদর)", lat: 23.1750, lng: 89.4950 },
    { name: "Aladatpur Jame Mosque (সদর)", lat: 23.1670, lng: 89.5080 },
    { name: "Bhowakhali Jame Mosque (সদর)", lat: 23.1580, lng: 89.5150 },
    { name: "Chachra Jame Mosque (সদর)", lat: 23.1850, lng: 89.4850 }
  ];
  const insert = db.prepare("INSERT INTO mosques (name, lat, lng) VALUES (?, ?, ?)");
  initialMosques.forEach(m => insert.run(m.name, m.lat, m.lng));
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.route(["/api/mosques", "/api/mosques/"])
  .get((req, res) => {
    try {
      const mosques = db.prepare(`
        SELECT m.*, 
               COALESCE(f.food_type, 'জানা নাই') as food_type, 
               COALESCE(f.likes, 0) as likes, 
               COALESCE(f.dislikes, 0) as dislikes, 
               f.id as report_id
        FROM mosques m
        LEFT JOIN food_reports f ON m.id = f.mosque_id
        WHERE f.id IS NULL OR f.id = (
          SELECT id FROM food_reports 
          WHERE mosque_id = m.id 
          ORDER BY created_at DESC LIMIT 1
        )
      `).all();
      res.json(mosques);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  })
  .post((req, res) => {
    const { name, lat, lng } = req.body;
    if (!name || !lat || !lng) return res.status(400).json({ error: "Missing fields" });
    try {
      const result = db.prepare("INSERT INTO mosques (name, lat, lng) VALUES (?, ?, ?)").run(name, lat, lng);
      const newMosque = { id: result.lastInsertRowid, name, lat, lng, food_type: 'জানা নাই', likes: 0, dislikes: 0, report_id: null };
      io.emit('mosque_created', newMosque);
      res.json(newMosque);
    } catch (err) {
      res.status(500).json({ error: "Failed to create" });
    }
  });

app.delete("/api/mosques/:id", (req, res) => {
  const { id } = req.params;
  const { code } = req.body;
  if (code !== "1311") return res.status(403).json({ error: "Invalid code" });
  try {
    db.prepare("DELETE FROM food_reports WHERE mosque_id = ?").run(id);
    db.prepare("DELETE FROM mosques WHERE id = ?").run(id);
    io.emit('mosque_deleted', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

app.post("/api/reports", (req, res) => {
  const { mosque_id, food_type } = req.body;
  try {
    const info = db.prepare("INSERT INTO food_reports (mosque_id, food_type) VALUES (?, ?)").run(mosque_id, food_type);
    const newReport = { id: info.lastInsertRowid, mosque_id, food_type, likes: 0, dislikes: 0 };
    io.emit("report_added", newReport);
    res.json(newReport);
  } catch (err) {
    res.status(500).json({ error: "Failed to add report" });
  }
});

app.post("/api/vote", (req, res) => {
  const { report_id, type } = req.body;
  try {
    if (type === "like") {
      db.prepare("UPDATE food_reports SET likes = likes + 1 WHERE id = ?").run(report_id);
    } else {
      db.prepare("UPDATE food_reports SET dislikes = dislikes + 1 WHERE id = ?").run(report_id);
    }
    const updated = db.prepare("SELECT * FROM food_reports WHERE id = ?").get();
    io.emit("vote_updated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to vote" });
  }
});

app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
}

setupVite();

const PORT = 3000;
if (process.env.NODE_ENV !== "production" || !isVercel) {
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
