require('dotenv').config();
const fs = require('fs');
const path = require('path');
const figlet = require('figlet');
const chalk = require('chalk');
const moment = require('moment');
const AWS = require('aws-sdk');
const express = require('express');
const { PORT, config } = require('./constants');
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
const s3 = new AWS.S3({ params: { Bucket: config.aws.s3.BUCKET_NAME }});
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

/**
 * Uploads a specified image to S3.
 * @param id String a unique identifier for the image.
 * @param path String the path where the image can be read from.
 */
const uploadImage = async (id, path) => {
    console.log(chalk.green('[INFO] Uploading image to S3 from path: '), chalk.blue(path));
    let data;
    try {
        data = fs.readFileSync(path);
    } catch(err) {
        console.log(chalk.red('[ERROR] There was an error reading the image file specified: ', path, err));
    }
    try {
        await new AWS.S3.ManagedUpload({
            params: {
                Bucket: config.aws.s3.BUCKET_NAME,
                Key: `target_image_${id}.jpg`,
                Body: data,
            }
        }).promise();
        console.log(chalk.green('[INFO] Upload Successful!'));
        // TODO delete image from local filesystem
    } catch(err) {
        console.log(chalk.red(`[ERROR] There was an error persisting the image to S3 bucket: ${config.aws.s3.BUCKET_NAME}.`, err));
    }
};

/**
 * Triggers a comparison of faces using Amazon Rekognition to determine
 * if two faces are similar enough to unlock the door.
 * @param id String The event id (this must be the same id used to upload the image to S3 using #uploadImage()
 * @param similarityThreshold Integer input parameter specifies the minimum confidence that compared faces must match to be included in the response
 * @returns {Promise<void>}
 */
const analyzeImage = async (id, similarityThreshold = 70) => {
    const params = {
        SourceImage: {
            S3Object: {
                Bucket: config.aws.s3.BUCKET_NAME,
                // TODO source image will need to be dynamic for different people soon
                Name: 'source_image.jpg'
            },
        },
        TargetImage: {
            S3Object: {
                Bucket: config.aws.s3.BUCKET_NAME,
                Name: `target_image_${id}.jpg`
            }
        },
        SimilarityThreshold: similarityThreshold
    };
    console.log(chalk.green('[INFO] Analyzing images and comparing to source image.'));
    try {
        const response = await rekognition.compareFaces(params).promise();
        response.FaceMatches.forEach(data => {
            let position   = data.Face.BoundingBox;
            let similarity = data.Similarity;
            console.log(`The face at: ${position.Left}, ${position.Top} matches with ${similarity} % confidence`)
        });
    } catch(err) {
        err.message.includes("Request has invalid parameters") ?
            console.log(chalk.red('[ERROR] The target image did not have any recognizable faces. Error message: ', err)) :
            console.log(chalk.red('[ERROR] There was an error comparing the two faces:', err));
    }
};

/**
 * Returns a boolean value if the image name in S3 contains a recognizable human face. If the image contains
 * multiple faces this function will still return true.
 * @param imageName String the name of the image in S3 including all S3 prefixes.
 * @returns {Promise<boolean>} True if the image contains a face and false otherwise
 */
const hasFace = async (imageName) => {
    const params = {
        Image: {
            S3Object: {
                Bucket: config.aws.s3.BUCKET_NAME,
                Name: imageName
            }
        }
    };
    try {
        const { FaceDetails } = await rekognition.detectFaces(params).promise();
        return FaceDetails.length > 0;
    } catch(err) {
        console.log(chalk.red('[ERROR] Failed to detect face within photo: ', err));
        return false;
    }
};

/**
 * Cleans up by removing the image from S3 and/or Local. This function will always delete the image from the local machine but
 * can optionally also remove the image from S3.
 * @param imageName String the name of the image in S3 (the path will be computed based on the name of the image)
 * @param removeS3 boolean true if the image should also be deleted from S3.
 * @returns {Promise<void>}
 */
const cleanup = (imageName, removeS3 = false) => {
    const imagePath = path.join(__dirname, '..', 'assets', imageName);
    return new Promise((res, rej) => {
        fs.unlink(imagePath, async (err) => {
            if (err) {
                console.log(chalk.red('[ERROR] Failed to remove image from local machine. ', err));
                rej(err);
            }

            if(removeS3) {
                try {
                    await s3.deleteObject({ Bucket: config.aws.s3.BUCKET_NAME, Key: imageName }).promise();
                    console.log(chalk.green('[INFO] The image: ', chalk.blue(imageName), 'was removed from the S3 bucket: ', chalk.blue(config.aws.s3.BUCKET_NAME)));
                } catch(err) {
                    console.log(chalk.red('[ERROR] Failed to delete image: ', imageName, ' from S3 bucket: ', config.aws.s3.BUCKET_NAME, err));
                }
            } else {
                console.log(chalk.green('[INFO] Skipping image deletion on S3 for image: '), chalk.blue(imageName), chalk.green(' in bucket: '), chalk.blue(config.aws.s3.BUCKET_NAME));
                res();
            }
        });
    });
};

app.get('/events/subscribe', (req, res) => {
    nest.subscribe(async (event) => {
        console.log(chalk.green('[INFO] Event Received: '), event);
        const imageName = `target_image_${event.id}.jpg`;
        if(!event.types.includes("motion")) {
            const imagePath = path.join(__dirname, '..', 'assets', imageName);
            await nest.getLatestSnapshot(imagePath);
            await uploadImage(event.id, imagePath);
            const hasFace = await hasFace(imageName);

            if(hasFace) {
                await analyzeImage(event.id);
                console.log(chalk.green(`[INFO] Event with the id: ${chalk.blue(event.id)} has finished processing.`));
                // TODO unlock door

                if(config.options.cleanup.LOCAL) {
                    console.log(chalk.green('[INFO] Cleaning Up...'));
                    await cleanup(imageName, config.options.cleanup.S3);
                }
            } else {
                console.log(chalk.green('[INFO] The image '), chalk.blue(imageName), chalk.green(' does not contain a recognizable face.'));
            }

        } else {
            console.log(chalk.green('[INFO] Event does not contain any motion from the camera. Ignoring event.'));
        }
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

