#!/usr/bin/node

import express from 'express';
// eslint-disable-next-line import/no-extraneous-dependencies
import dotenv from 'dotenv';
import router from './routes/index';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// app.use(morgan('dev'));
app.use(express.json());

app.use(router);

app.listen(port, () => console.log(`Server running on port ${port}`));
