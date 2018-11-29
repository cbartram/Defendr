require('dotenv').config();
const figlet = require('figlet');
const chalk = require('chalk');
const request = require('request-promise-native');
const AWS = require('aws-sdk');
const EventSource = require('eventsource');
const express = require('express');
const {
    AUTHORIZATION_URL,
    PORT,
    CSRF_STATE
} = require('./constants');
const {
    getAccessToken,
    getRekognitionLabels
} = require('./util');

// Create the Express Server
const app = express();

// Setup API Version for AWS
AWS.config.update({
    region: 'us-east-1',
    apiVersions: {
        rekognition: '2016-06-27',
        s3: '2006-03-01',
    }
});

// Create the Kinesis Object
const rekognition = new AWS.Rekognition();

figlet('Defendr', (err, data) => {
    console.log(chalk.blue(data));
    app.listen(PORT, () => {
        console.log(chalk.green('================================='));
        console.log(chalk.green(`| Server Listening on port ${PORT} |`));
        console.log(chalk.green('================================='));
    });
});

/**
 * Handles redirecting the user to the Authorization url to show them what permissions are necessary for this
 * app to function correctly
 * @route GET /
 */
app.get('/', async (req, res) => {
    console.log(chalk.blue('[INFO] Redirecting to Auth URL: ', AUTHORIZATION_URL));
    res.redirect(AUTHORIZATION_URL);
});

/**
 * Handles the oauth callback given from nest
 * @route GET /oauth/callback
 */
app.get('/oauth/callback', async (req, res) => {
    const { state, code } = req.query;
    let accessToken;

    // Check and Validate CSRF State
    if(state !== CSRF_STATE) {
        res.status(403).json({
            success: false,
            message: 'Invalid CSRF State Query Parameter'
        });

        return;
    }

    try {
        accessToken = await getAccessToken(code);
    } catch(err) {
        console.log(chalk.red('[ERROR] Error trading code for access_token', err.message));
        res.json({
            success: false,
            message: err.message,
            error: err
        });

        return;
    }

    console.log(chalk.blue(`[INFO] Successfully Retrieved access_token:`, accessToken.access_token));

    const headers = {
        Authorization: `Bearer ${accessToken.access_token}`,
        'Content-Type': 'text/event-stream'
    };

    const source = new EventSource('https://developer-api.nest.com/devices/cameras/5iDi4p4suzIIh2RTlil0k70ahi5nHAz4BCMuppafqTpc1acgItAvbQ', { headers });

    source.addEventListener('put', async event => {
        console.log(chalk.blue('[INFO] Nest Streaming Data Received: ', event.data));
        const  { data } = JSON.parse(event.data);
        const labels = await getRekognitionLabels(rekognition, data.snapshot_url);
        res.json({
            success: true,
            nest: data,
            rekognition: labels,
        });
    });


    source.addEventListener('open', event => {
        console.log(chalk.blue('[INFO] Nest Streaming Connection opened!'));
    });

    source.addEventListener('auth_revoked', event => {
        console.log(chalk.yellow('[WARNING] Authentication token was revoked re-authentication necessary'));
        // Re-authenticate user
        res.redirect(AUTHORIZATION_URL);
    });

    source.addEventListener('error', event => {
        if (event.readyState == EventSource.CLOSED) {
            console.log(chalk.yellow('[WARNING] Connection was closed!', event));
        } else {
            console.log(chalk.red('[ERROR] An unknown error occurred while streaming events: ', event));
        }
    }, false);
});
