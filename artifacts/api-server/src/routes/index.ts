import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import anthropicRouter from "./anthropic/index";
import imageRouter from "./image/index";
import ttsRouter from "./tts/index";
import sttRouter from "./stt/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/profile", profileRouter);
router.use("/anthropic", anthropicRouter);
router.use("/image", imageRouter);
router.use("/tts", ttsRouter);
router.use("/stt", sttRouter);

export default router;
