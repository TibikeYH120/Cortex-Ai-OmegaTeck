import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, messages, conversations } from "@workspace/db";
import { eq, desc, count, gte, and } from "drizzle-orm";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "CortexAdmin#2026";

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const pw = req.headers["x-admin-password"];
  if (!pw || pw !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Verify admin password
router.post("/verify", (req: Request, res: Response) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Hibás jelszó" });
  }
});

// List all users with today's message count
router.get("/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const allUsers = await db
      .select()
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const userList = await Promise.all(
      allUsers.map(async (u) => {
        const [{ value: todayMsgs }] = await db
          .select({ value: count() })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(and(
            eq(conversations.userId, u.id),
            eq(messages.role, "user"),
            gte(messages.createdAt, todayStart),
          ));

        const [{ value: totalMsgs }] = await db
          .select({ value: count() })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(and(
            eq(conversations.userId, u.id),
            eq(messages.role, "user"),
          ));

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          todayMsgs: Number(todayMsgs),
          totalMsgs: Number(totalMsgs),
        };
      })
    );

    res.json(userList);
  } catch (err) {
    req.log.error({ err }, "Admin list users error");
    res.status(500).json({ error: "Server error" });
  }
});

// Change user role
router.patch("/users/:id/role", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { role } = req.body;
  if (!["member", "cortex_plus"].includes(role)) {
    res.status(400).json({ error: "Érvénytelen szerepkör" });
    return;
  }
  try {
    await db.update(usersTable).set({ role }).where(eq(usersTable.id, id));
    res.json({ ok: true, role });
  } catch (err) {
    req.log.error({ err }, "Admin change role error");
    res.status(500).json({ error: "Server error" });
  }
});

// Reset user password
router.post("/users/:id/reset-password", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "A jelszónak legalább 6 karakter kell" });
    return;
  }
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Admin reset password error");
    res.status(500).json({ error: "Server error" });
  }
});

// Delete user
router.delete("/users/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Admin delete user error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
