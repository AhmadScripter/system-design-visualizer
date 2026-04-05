const Diagram = require('../models/diagram.model');

const saveDiagram = async (req, res) => {
    try {
        const diagram = new Diagram(req.body);
        const saved = await diagram.save();

        res.status(200).json({ message: 'diagram saved', id: saved._id });
    }
    catch (error) {
        res.status(500).json({ message: 'internal server error', error });
    }
}

const fetchDiagram = async (req, res) => {
    try {
        const diagram = await Diagram.findById(req.params.id);

        if (!diagram) return res.status(404).json({ message: 'Diagram not found' })
        res.json(diagram);
    } catch (error) {
        res.status(500).json({ message: 'internal server error', error })
    }
}

module.exports = { saveDiagram, fetchDiagram };