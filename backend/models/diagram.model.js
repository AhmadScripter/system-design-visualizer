const mongoose = require('mongoose');

const diagramSchema = new mongoose.Schema({
    nodes: Array,
    connections: Array,
},
    { timestamps: true }
)

module.exports = mongoose.model('Diagram', diagramSchema);