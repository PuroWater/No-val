// 文笔风格接口（0.9.8）：返回后端预设（不含 prompt，prompt 只留在后端注入正文）。
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { WRITING_STYLES } from '../lib/stylePresets.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({
    styles: WRITING_STYLES.map(({ id, label, description }) => ({ id, label, description }))
  });
});

export default router;
