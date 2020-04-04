require('dotenv').config();
const figlet = require('figlet');
const chalk = require('chalk');
const request = require('request-promise-native');
const AWS = require('aws-sdk');
const express = require('express');
const { config, PORT } = require('./constants');

const app = express();

AWS.config.update({
    region: 'us-east-1',
    apiVersions: {
        rekognition: '2016-06-27',
        s3: '2006-03-01',
    }
});

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
    res.json({ success: true });
});

