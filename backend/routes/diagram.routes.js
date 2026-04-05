const express = require('express');
const { fetchDiagram, saveDiagram } = require('../controllers/diagram.controller');
const router = express.Router();

router.get('/:id', fetchDiagram);
router.post('/', saveDiagram);

module.exports = router;