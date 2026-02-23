import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("biryani.db");

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

// Seed some initial mosques in Narail Sadar if empty
const mosqueCount = db.prepare("SELECT COUNT(*) as count FROM mosques").get() as { count: number };

// Always re-seed if we want to update the list with more accurate data
if (mosqueCount.count > 0) {
  db.prepare("DELETE FROM mosques").run();
}

const initialMosques = [
  { name: "নড়াইল কেন্দ্রীয় জামে মসজিদ (সদর)", lat: 23.1689, lng: 89.5012 },
  { name: "রূপগঞ্জ বাজার জামে মসজিদ (সদর)", lat: 23.1720, lng: 89.5050 },
  { name: "নড়াইল জেলা মডেল মসজিদ (সদর)", lat: 23.1650, lng: 89.4980 },
  { name: "আদালতপুর জামে মসজিদ (সদর)", lat: 23.1670, lng: 89.5080 },
  { name: "কুড়িগ্রাম জামে মসজিদ (সদর)", lat: 23.1750, lng: 89.4950 },
  { name: "মহিষখোলা জামে মসজিদ (সদর)", lat: 23.1620, lng: 89.5120 },
  { name: "ভওয়াখালী জামে মসজিদ (সদর)", lat: 23.1580, lng: 89.5150 },
  { name: "পুলিশ লাইন মসজিদ (সদর)", lat: 23.1640, lng: 89.5060 },
  { name: "সদর হাসপাতাল মসজিদ (সদর)", lat: 23.1705, lng: 89.5020 },
  { name: "কোর্ট জামে মসজিদ (সদর)", lat: 23.1675, lng: 89.4990 },
  { name: "বাস টার্মিনাল মসজিদ (সদর)", lat: 23.1730, lng: 89.5000 },
  { name: "জেলা পরিষদ মসজিদ (সদর)", lat: 23.1660, lng: 89.5030 },
  { name: "ভাটশালা জামে মসজিদ (সদর)", lat: 23.1800, lng: 89.5100 },
  { name: "দুর্গাপুর জামে মসজিদ (সদর)", lat: 23.1550, lng: 89.4900 },
  { name: "চাচড়া জামে মসজিদ (সদর)", lat: 23.1850, lng: 89.4850 },
  { name: "ডুমুরতলা জামে মসজিদ (সদর)", lat: 23.1450, lng: 89.5000 },
  { name: "গোবরা জামে মসজিদ (সদর)", lat: 23.1300, lng: 89.5200 },
  { name: "মুলিয়া জামে মসজিদ (সদর)", lat: 23.1200, lng: 89.4700 },
  { name: "তুলারামপুর জামে মসজিদ (সদর)", lat: 23.2000, lng: 89.4600 },
  { name: "শাহাবাদ জামে মসজিদ (সদর)", lat: 23.2200, lng: 89.5100 },
  { name: "হাবাখালী জামে মসজিদ (সদর)", lat: 23.2100, lng: 89.4800 },
  { name: "বাঁশগ্রাম জামে মসজিদ (সদর)", lat: 23.2400, lng: 89.5300 },
  { name: "মাইজপাড়া জামে মসজিদ (সদর)", lat: 23.2345, lng: 89.4567 },
  { name: "সিংগিয়া জামে মসজিদ (সদর)", lat: 23.1500, lng: 89.4100 },
  { name: "রতনপুর জামে মসজিদ (সদর)", lat: 23.1900, lng: 89.4200 },
  { name: "পঞ্চগ্রাম জামে মসজিদ (সদর)", lat: 23.2200, lng: 89.4300 },
  { name: "নিধিপুর জামে মসজিদ (সদর)", lat: 23.1700, lng: 89.4400 },
  { name: "মধু জামে মসজিদ (সদর)", lat: 23.1300, lng: 89.4500 },
  { name: "দেবভোগ জামে মসজিদ (সদর)", lat: 23.1600, lng: 89.4600 },
  { name: "ঘোড়াখালী জামে মসজিদ (সদর)", lat: 23.1400, lng: 89.4800 },
  { name: "ইতনা জামে মসজিদ (সদর)", lat: 23.1100, lng: 89.5100 },
  { name: "কালীপুর জামে মসজিদ (সদর)", lat: 23.1800, lng: 89.5200 },
  { name: "চন্দ্রপুর জামে মসজিদ (সদর)", lat: 23.1700, lng: 89.5400 },
  { name: "ভাদুলী জামে মসজিদ (সদর)", lat: 23.1900, lng: 89.5500 },
  { name: "উজিরপুর জামে মসজিদ (সদর)", lat: 23.1200, lng: 89.5500 },
  { name: "কালিয়া রোড জামে মসজিদ (সদর)", lat: 23.1500, lng: 89.5300 },
  { name: "লক্ষ্মীপাশা জামে মসজিদ (সদর)", lat: 23.2000, lng: 89.5800 },
  { name: "দক্ষিণ আদালতপুর মসজিদ (সদর)", lat: 23.1640, lng: 89.5150 },
  { name: "উত্তর রূপগঞ্জ মসজিদ (সদর)", lat: 23.1780, lng: 89.5100 },
  { name: "পশ্চিম কুড়িগ্রাম মসজিদ (সদর)", lat: 23.1770, lng: 89.4900 },
  { name: "পূর্ব মহিষখোলা মসজিদ (সদর)", lat: 23.1600, lng: 89.5250 },
  { name: "ইন্ডাস্ট্রিয়াল এরিয়া মসজিদ (সদর)", lat: 23.1570, lng: 89.5180 },
  { name: "রেলওয়ে স্টেশন রোড মসজিদ (সদর)", lat: 23.1590, lng: 89.5055 },
  { name: "নিউ মার্কেট জামে মসজিদ (সদর)", lat: 23.1680, lng: 89.5130 },
  { name: "পুরাতন শহর জামে মসজিদ (সদর)", lat: 23.1760, lng: 89.5035 },
  { name: "নদীর পাড় জামে মসজিদ (সদর)", lat: 23.1740, lng: 89.5095 },
  { name: "শিশু পার্ক মসজিদ (সদর)", lat: 23.1655, lng: 89.5110 },
  { name: "স্টেডিয়াম রোড মসজিদ (সদর)", lat: 23.1610, lng: 89.5025 },
  { name: "কলেজ রোড জামে মসজিদ (সদর)", lat: 23.1710, lng: 89.5070 },
  { name: "প্রাইমারি স্কুল রোড মসজিদ (সদর)", lat: 23.1630, lng: 89.5090 },
  { name: "নড়াইল সরকারি কলেজ মসজিদ (সদর)", lat: 23.1690, lng: 89.5085 },
  { name: "নড়াইল ভিক্টোরিয়া কলেজ মসজিদ (সদর)", lat: 23.1715, lng: 89.5040 },
  { name: "ডিসি অফিস মসজিদ (সদর)", lat: 23.1665, lng: 89.4975 },
  { name: "এসপি অফিস মসজিদ (সদর)", lat: 23.1645, lng: 89.5055 },
  { name: "নড়াইল টেকনিক্যাল স্কুল মসজিদ (সদর)", lat: 23.1755, lng: 89.5120 },
  { name: "নড়াইল পলিটেকনিক ইনস্টিটিউট মসজিদ (সদর)", lat: 23.1820, lng: 89.5150 },
  { name: "নড়াইল সদর থানা মসজিদ (সদর)", lat: 23.1672, lng: 89.5015 },
  { name: "নড়াইল ফায়ার সার্ভিস মসজিদ (সদর)", lat: 23.1725, lng: 89.4985 }
];

const insert = db.prepare("INSERT INTO mosques (name, lat, lng) VALUES (?, ?, ?)");
initialMosques.forEach(m => insert.run(m.name, m.lat, m.lng));


async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  app.use(express.json());

  // API Routes
  app.get("/api/mosques", (req, res) => {
    const mosques = db.prepare(`
      SELECT m.*, 
             COALESCE(f.food_type, 'ছুলামুড়ি') as food_type, 
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
  });

  app.post("/api/reports", (req, res) => {
    const { mosque_id, food_type } = req.body;
    const info = db.prepare("INSERT INTO food_reports (mosque_id, food_type) VALUES (?, ?)").run(mosque_id, food_type);
    const newReport = { id: info.lastInsertRowid, mosque_id, food_type, likes: 0, dislikes: 0 };
    io.emit("report_added", newReport);
    res.json(newReport);
  });

  app.post("/api/vote", (req, res) => {
    const { report_id, type } = req.body; // type: 'like' or 'dislike'
    if (type === "like") {
      db.prepare("UPDATE food_reports SET likes = likes + 1 WHERE id = ?").run(report_id);
    } else {
      db.prepare("UPDATE food_reports SET dislikes = dislikes + 1 WHERE id = ?").run(report_id);
    }
    const updated = db.prepare("SELECT * FROM food_reports WHERE id = ?").get();
    io.emit("vote_updated", updated);
    res.json(updated);
  });

  // Vite middleware for development
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

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
