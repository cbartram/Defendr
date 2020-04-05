require('dotenv').config();
const figlet = require('figlet');
const chalk = require('chalk');
const AWS = require('aws-sdk');
const express = require('express');
const { PORT } = require('./constants');
const Nest = require('./Nest');
const { Observable } = require('rxjs');

const app = express();

AWS.config.update({
    region: 'us-east-1',
    apiVersions: {
        rekognition: '2016-06-27',
        s3: '2006-03-01',
    }
});

const rekognition = new AWS.Rekognition();
let nest = new Nest();

figlet('Defendr', (err, data) => {
    console.log(chalk.blue(data));
    app.listen(PORT, () => {
        console.log(chalk.green('================================='));
        console.log(chalk.green(`| Server Listening on port ${PORT} |`));
        console.log(chalk.green('================================='));
        nest.init();
    });
});

/**
 * Handles redirecting the user to the Authorization url to show them what permissions are necessary for this
 * app to function correctly
 * @route GET /
 */
app.get('/events/all', async (req, res) => {
    const events = await nest.getEvents();
    res.json(events);
});


app.get('/events/subscribe', (req, res) => {
   nest.subscribeToEvents();
});

/**
 * Finds a specific event given its unique event Id
 */
app.get('/events/:id', async (req, res) => {
    if(!req.params.id || !req.params.id.includes('-labs')) {
        res.status(400).json({ error: true, message: 'Your event id is invalid. It must be a unix timestamp in seconds post fixed by -labs'});
        return;
    }
   const events = await nest.getEvents()
       .filter(({ id }) => id === req.params.id);

    if(events.length > 0) {
        res.json(events[0]);
    } else {
        res.status(400).json({ error: true, message: `No events with the id ${req.params.id} exist.` });ß
    }
});

