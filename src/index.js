require('dotenv').config();
const fs = require('fs');
const path = require('path');
const figlet = require('figlet');
const chalk = require('chalk');
const AWS = require('aws-sdk');
const express = require('express');
const { PORT } = require('./constants');
const Nest = require('./Nest');
const { Observable } = require('rxjs');
const {
    AWS_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY
} = process.env;

const app = express();

AWS.config.update({
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    apiVersions: {
        rekognition: '2016-06-27',
        s3: '2006-03-01',
    }
});

const rekognition = new AWS.Rekognition();
const s3 = new AWS.S3({ params: { Bucket: 'defendr' }});
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
   nest.subscribe(async (event) => {
       console.log(chalk.green('[INFO] Event Received: '), event);

       // Get Snapshot image associated with this event
       const image = await nest.getSnapshot(event.id);

       await new AWS.S3.ManagedUpload({
           params: {
               Bucket: 'defendr',
               Key: 'target_image.jpg',
               Body: image,
               // ACL: "public-read"
           }
       }).promise();

       const sourceImage = path.join(__dirname, '..', 'assets', 'source_image.jpg');

       console.log(chalk.green('[INFO] Received Event snapshot image...'));
       // The event might not have a clear picture of the person because it captures it too soon or too late
       // at this point it might be wise to subscribe to the latest snapshots an analyze all of them until we get
       // a similarity threshold that is close enough to unlock the door

       const params = {
           SourceImage: {
               S3Object: {
                   Bucket: 'defendr',
                   Name: 'source_image.jpg'
               },
           },
           TargetImage: {
              S3Object: {
                  Bucket: 'defendr',
                  Name: 'target_image.jpg'
              }
           },
           SimilarityThreshold: 70
       };

       console.log(chalk.blue('[INFO] Rekognition Params: ', JSON.stringify(params)));

       console.log(chalk.green('[INFO] Analyzing images and comparing to source image: ', sourceImage));
       rekognition.compareFaces(params, (err, response) => {
           if (err) {
               console.log(chalk.red('[ERROR] There was an error comparing the two faces: ', err));
           } else {
               response.FaceMatches.forEach(data => {
                   let position   = data.Face.BoundingBox;
                   let similarity = data.Similarity;
                   console.log(`The face at: ${position.Left}, ${position.Top} matches with ${similarity} % confidence`)
               });
           }
       });
   }, 'event');
   res.json({ subscribed: true });
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

