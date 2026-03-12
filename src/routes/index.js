'use strict';

const { Router } = require('express');
const healthRoutes = require('./healthRoutes');
const convertRoutes = require('./convertRoutes');

const router = Router();

router.use(healthRoutes);
router.use(convertRoutes);

module.exports = router;
