import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === "1";

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || "birianicom-d33d6";
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@birianicom-d33d6.iam.gserviceaccount.com";
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDTxqFL7VK84j6N\nXmaSh8iEO3xbt5owG6E/xackxZdci5ZPI6Zkehf4P3mi9mXdRFzI0Ed2Fo4lbLJ8\nciG79/0helkb6orgnWZw4sHbSk41fKnESKXgRY0ChPWxNeBhpvKFbuq7v1/LHXDF\nfEox1C8ljJgGnzHrZXG1Sp58hyVSixr6vwEQmxlDUHYU5HwRdRDofFcu2ymRWfq5\ndpBhIVHmZUIva1SDSkfsOtskEhz5LeknRnVnp4FrgZSWbqrYt9Qa/VBriooBAAA/\nPGUnRT/zrOvvrO/9gFtOkFWzBsIZvIfrRpxKIzNvJMfDHiQ/g1K+iic0/t2UxFJO\nkd75XWs/AgMBAAECggEACIQLkbgLWa5nVtvy7UrUf1dnsBsj8hyfpqbWCnPU8FMU\nn5NkFNTsCH7U71P6fflKbzDLjti9V+KVEs1WxJjmRDsH65101C9qzSNGfwDv6tVb\n0O7IQh/J2c4Vlc4AJdfGwiLXAZG30mfD/yJOVs6czrpmlULq3k0H/i2aoztJVED9\nAB1lMw7oec2IxYrl3dR5CNgqhj5TNI7aV4SaNjhA0zFcQ9IHdC5GfNOh13yKL7zt\ncDpRgHJUDJc6fcQHPI1QKxQotpz9KNr/tzogvzOKgu88OPxqCmmN2sSxIHLJY34g\n8wx5VcXOF+nTH7S7BV6VjbTnlP55aMGLhGg7IAw2EQKBgQDv3tBvQFv15ER0LtlD\nBN0uxfvNc0yn8fl44TIhqqpCzDUckWcawfGf8B5mk1lt8VC2o3WiXB/PRtL/uaSI\nN4dTHY1k5cq0iod3qFCUpQNPIOQZFdiOvbray8dx2dxBdFRP3+N1ELz+o2oSg6HP\nX+G9S/zPbkimw8uwYrQzwIdyXQKBgQDiBDDi+si8VRKfOlR1yfxwF6KZTNzKhbna\ylEWTIknw+iS8tMkfkfA4B9vJXCziXjVRsUQbcn2gZ6LkeAfE4D/GzIHXAHpfTDJ\npv8+zA6c+f1MD9fXjUPTHVDl8H0GF15VEpEpNTVjtciH5WrXGRzMh+D0HnUXF+vZ\nGjHGIq/ySwKBgGK0dWDSQwU0IVcN0Clb3whYP/2S7IBPejDbuh1QdS93iINw8dR4\n6ky+KkRbbflny6bcLJPbBNvucPT6F1JWR0FUb9KNHJSeTJBYmpAQNwRgrHwGGU7j\nk/hk0nVvCMuGawtTPe32LU87P3LO587FzcZvdmCFKTA2caLreuuw1guhAoGAZnQX\n5Qxhql22D0/VsX9aW0Wbg3qAK53q3e8QStdu5QO9jb9dTxGfXSM7nJqQOBJ9H9Dw\ny72463FeeU4rFms08m9VgliG1VzWnNKCqei+RxJba/tSkHeM40pKvbECO5ykOlQs\nUU25YfWpbVDl2ZOcpmqB4qdb1JgXZVamcXaP43kCgYB1OAeifhYllI+8+iW4fUReI7uQaPbok8bGnM7zTs0PtA2oTASP3UObEJTQo3hzeaIAL3FUzO+bB9xZ9M2YhFx0\nX0GcPvAMaOgsQugVYiNWdoM34Gt7w0RcCQ6hdtCM8oSGBKaHRBxHbLJieQYYsqbx\npf4zHSXjRHiOF9AgyMtOQg==\n-----END PRIVATE KEY-----\n").replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
    });
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

const firestore = admin.apps.length ? admin.firestore() : null;

const app = express();
app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => res.json({ status: "ok", firebase: !!firestore }));

app.route(["/api/mosques", "/api/mosques/"])
  .get(async (req, res) => {
    if (!firestore) return res.status(503).json({ error: "Firebase not configured" });
    try {
      const mosquesSnapshot = await firestore.collection("mosques").get();
      const mosques = mosquesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(mosques);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  })
  .post(async (req, res) => {
    if (!firestore) return res.status(503).json({ error: "Firebase not configured" });
    const { name, lat, lng } = req.body;
    if (!name || !lat || !lng) return res.status(400).json({ error: "Missing fields" });
    try {
      const docRef = await firestore.collection("mosques").add({
        name,
        lat: Number(lat),
        lng: Number(lng),
        food_type: 'জানা নাই',
        likes: 0,
        dislikes: 0,
        report_id: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      const newMosque = { id: docRef.id, name, lat, lng, food_type: 'জানা নাই', likes: 0, dislikes: 0, report_id: null };
      res.json(newMosque);
    } catch (err) {
      console.error("Error adding mosque:", err);
      res.status(500).json({ error: "Failed to create mosque: " + (err instanceof Error ? err.message : String(err)) });
    }
  });

app.delete("/api/mosques/:id", async (req, res) => {
  if (!firestore) return res.status(503).json({ error: "Firebase not configured" });
  const { id } = req.params;
  const { code } = req.body;
  if (code !== "1311") return res.status(403).json({ error: "Invalid code" });
  try {
    await firestore.collection("mosques").doc(id).delete();
    const reportsSnapshot = await firestore.collection("reports").where("mosque_id", "==", id).get();
    const batch = firestore.batch();
    reportsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

app.post("/api/reports", async (req, res) => {
  if (!firestore) return res.status(503).json({ error: "Firebase not configured" });
  const { mosque_id, food_type } = req.body;
  try {
    const docRef = await firestore.collection("reports").add({
      mosque_id,
      food_type,
      likes: 0,
      dislikes: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await firestore.collection("mosques").doc(mosque_id).update({
      food_type,
      report_id: docRef.id,
      likes: 0,
      dislikes: 0
    });
    const newReport = { id: docRef.id, mosque_id, food_type, likes: 0, dislikes: 0 };
    res.json(newReport);
  } catch (err) {
    res.status(500).json({ error: "Failed to add report" });
  }
});

app.post("/api/vote", async (req, res) => {
  if (!firestore) return res.status(503).json({ error: "Firebase not configured" });
  const { report_id, type } = req.body;
  try {
    const reportRef = firestore.collection("reports").doc(report_id);
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) return res.status(404).json({ error: "Report not found" });
    const data = reportDoc.data();
    const mosque_id = data?.mosque_id;
    if (type === "like") {
      await reportRef.update({ likes: admin.firestore.FieldValue.increment(1) });
      if (mosque_id) {
        await firestore.collection("mosques").doc(mosque_id).update({ 
          likes: admin.firestore.FieldValue.increment(1) 
        });
      }
    } else {
      await reportRef.update({ dislikes: admin.firestore.FieldValue.increment(1) });
      if (mosque_id) {
        await firestore.collection("mosques").doc(mosque_id).update({ 
          dislikes: admin.firestore.FieldValue.increment(1) 
        });
      }
    }
    const updatedDoc = await reportRef.get();
    const updated = { id: updatedDoc.id, ...updatedDoc.data() };
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to vote" });
  }
});

const PORT = 3000;
if (process.env.NODE_ENV !== "production" || !isVercel) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
