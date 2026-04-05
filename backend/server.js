const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const diagramRoutes = require('./routes/diagram.routes');

app.use(cors());
app.use(express.json());

app.use('/api/diagram', diagramRoutes);


mongoose.connect('mongodb://127.0.0.1:27017/diagramDB')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

app.listen(3000, () => {
    console.log('Server running on port 3000');
});