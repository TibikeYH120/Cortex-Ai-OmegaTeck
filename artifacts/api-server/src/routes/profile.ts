import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Nincs bejelentkezve" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Felhasználó nem található" });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio ?? null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Get profile error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.put("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Nincs bejelentkezve" });
    return;
  }
  const { name, bio } = req.body;
  try {
    const [user] = await db.update(usersTable)
      .set({ name: name || undefined, bio: bio ?? undefined })
      .where(eq(usersTable.id, userId))
      .returning();
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio ?? null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Update profile error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

export default router;
