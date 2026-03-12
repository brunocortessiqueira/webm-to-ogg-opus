'use strict';

const { Router } = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const convertController = require('../controllers/convertController');

const router = Router();

router.post('/convert', authMiddleware, convertController.handle);

module.exports = router;
