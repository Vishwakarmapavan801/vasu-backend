const { Router } = require('express');
const upload = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = Router();

router.post('/', requireAuth, (req, res, next) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }
    const files = req.files.map((f) => ({
      url: `/uploads/${f.filename}`,
      name: f.originalname,
      size: f.size,
      mimetype: f.mimetype,
    }));
    res.json({ success: true, data: files.length === 1 ? files[0] : files });
  });
});

router.post('/image', requireAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded' });
    res.json({
      success: true,
      data: { url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype },
    });
  });
});

router.post('/video', requireAuth, (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No video uploaded' });
    res.json({
      success: true,
      data: { url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype },
    });
  });
});

module.exports = router;
