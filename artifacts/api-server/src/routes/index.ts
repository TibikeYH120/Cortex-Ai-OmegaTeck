import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import anthropicRouter from "./anthropic/index";
import imageRouter from "./image/index";
import ttsRouter from "./tts/index";
import sttRouter from "./stt/index";
import cortexV1Router from "./v1/cortex";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/profile", profileRouter);
router.use("/anthropic", anthropicRouter);
router.use("/image", imageRouter);
router.use("/tts", ttsRouter);
router.use("/stt", sttRouter);
router.use("/v1/cortex", cortexV1Router);

export default router;
