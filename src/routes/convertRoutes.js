'use strict';

const { Router } = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const convertController = require('../controllers/convertController');
const videoConvertController = require('../controllers/videoConvertController');

const router = Router();

router.post('/convert', authMiddleware, convertController.handle);

// Vídeo tem contrato próprio: recebe `source_url` em vez do conteúdo, e devolve
// o MP4 binário em vez de base64. Ver videoConvertController para o porquê.
router.post('/convert/video', authMiddleware, videoConvertController.handle);

module.exports = router;
