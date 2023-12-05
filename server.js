#!/usr/bin/node

import express from 'express';
import dotenv from 'dotenv';
import router from './routes/index.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// app.use(morgan('dev'));
app.use(express.json());

app.use(router);

app.listen(port, () => console.log(`Server running on port ${port}`));
