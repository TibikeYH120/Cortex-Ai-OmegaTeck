import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, conversations, messages } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Nincs bejelentkezve" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Felhasználó nem található" }); return; }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio ?? null,
      systemAbout: user.systemAbout ?? null,
      systemRespond: user.systemRespond ?? null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Get profile error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.put("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Nincs bejelentkezve" }); return; }
  const { name, bio, systemAbout, systemRespond } = req.body as {
    name?: string;
    bio?: string;
    systemAbout?: string;
    systemRespond?: string;
  };
  try {
    const [user] = await db.update(usersTable)
      .set({
        name: name || undefined,
        bio: bio !== undefined ? bio : undefined,
        systemAbout: systemAbout !== undefined ? (systemAbout.trim().slice(0, 500) || null) : undefined,
        systemRespond: systemRespond !== undefined ? (systemRespond.trim().slice(0, 500) || null) : undefined,
      })
      .where(eq(usersTable.id, userId))
      .returning();
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio ?? null,
      systemAbout: user.systemAbout ?? null,
      systemRespond: user.systemRespond ?? null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Update profile error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.post("/change-password", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Nincs bejelentkezve" }); return; }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Jelenlegi és új jelszó kötelező" }); return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "Az új jelszónak legalább 6 karakternek kell lennie" }); return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Felhasználó nem található" }); return; }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ error: "Helytelen jelenlegi jelszó" }); return; }
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, userId));
    res.json({ message: "Jelszó sikeresen megváltozott" });
  } catch (err) {
    req.log.error({ err }, "Change password error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Nincs bejelentkezve" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Felhasználó nem található" }); return; }
    const [convResult] = await db.select({ c: count() }).from(conversations);
    const [msgResult] = await db.select({ c: count() }).from(messages);
    res.json({
      conversationCount: Number(convResult?.c ?? 0),
      messageCount: Number(msgResult?.c ?? 0),
      memberSince: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Get stats error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

export default router;
