require('dotenv').config();
const figlet = require('figlet');
const chalk = require('chalk');
const request = require('request-promise-native');
const express = require('express');
const {
    AUTHORIZATION_URL,
    PORT,
    CSRF_STATE
} = require('./constants');
const {
    getAccessToken
} = require('./utils');

// Create the Express Server
const app = express();

figlet('Defendr', (err, data) => {
    console.log(chalk.blue(data));
    app.listen(PORT, () => {
        console.log(chalk.green('===================================='));
        console.log(chalk.green(`| Server Listening on port ${PORT} |`));
        console.log(chalk.green('===================================='));
    });
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

    console.log(chalk.blue(`[INFO] Sucessfully Retrieved access_token:`, accessToken.access_token));

    const options = {
        uri: 'https://developer-api.nest.com',
        method: 'GET',
        path: '/',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken.access_token}`,
        },
        followRedirect: true
    };

    try {
        let data = JSON.parse(await request(options));
        res.json(data);
    } catch(err) {
        console.log(chalk.red('[ERROR] Error trading access_token for data.', err.message));

        res.json({
            success: false,
            message: err.message,
            error: err
        });
    }

    /**
     * Handles redirecting the user to the Authorization url to show them what permissions are necessary for this
     * app to function correctly
     * @route GET /
     */
    app.get('/', async (req, res) => {
        console.log(chalk.blue('[INFO] Redirecting to Auth URL: ', AUTHORIZATION_URL));
        res.redirect(AUTHORIZATION_URL);
    });

});
