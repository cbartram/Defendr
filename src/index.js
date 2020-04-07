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
const s3 = new AWS.S3({ params: { Bucket: config.aws.s3.bucket }});
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
 * @param Key String The image name to upload to S3
 * @param path String the path where the image can be read from.
 */
const uploadImage = async (path) => {
    console.log(chalk.green('[INFO] Uploading image to S3 from path: '), chalk.blue(path));
    let data;
    try {
        data = fs.readFileSync(path);
    } catch(err) {
        console.log(chalk.red('[ERROR] There was an error reading the image file specified: ', path, err));
    }
    try {
        await s3.upload({
                Bucket: config.aws.s3.bucket,
                Key: path.substring(path.lastIndexOf('/') + 1),
                Body: data,
        }).promise();
    } catch(err) {
        console.log(chalk.red(`[ERROR] There was an error persisting the image to S3 bucket: ${config.aws.s3.bucket}.`, err));
    }
};

/**
 * Triggers a comparison of faces using Amazon Rekognition to determine
 * if two faces are similar enough to unlock the door.
 * @param Name String The name of the image in S3 to analyze
 * @param similarityThreshold Integer input parameter specifies the minimum confidence that compared faces must match to be included in the response
 * @returns {Promise<void>}
 */
const analyzeImage = async (Name, similarityThreshold = 0) => {
    const params = {
        SourceImage: {
            S3Object: {
                Bucket: config.aws.s3.bucket,
                // TODO source image will need to be dynamic for different people soon
                Name: 'source_image.jpg'
            },
        },
        TargetImage: {
            S3Object: {
                Bucket: config.aws.s3.bucket,
                Name
            }
        },
        SimilarityThreshold: similarityThreshold
    };
    console.log(chalk.green('[INFO] Analyzing images and comparing to source image.'));
    try {
        const { FaceMatches } = await rekognition.compareFaces(params).promise();
        console.log(chalk.green('[INFO] Face Matches: ', JSON.stringify(FaceMatches)));
        return FaceMatches.length > 0 ? FaceMatches.map(({ Similarity }) => Similarity) : console.log(chalk.green('[INFO] No faces were present in the analyzed image.'));
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
                Bucket: config.aws.s3.bucket,
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
                    await s3.deleteObject({ Bucket: config.aws.s3.bucket, Key: imageName }).promise();
                    console.log(chalk.green('[INFO] The image:', chalk.blue(imageName), 'was removed from the S3 bucket:', chalk.blue(config.aws.s3.bucket)));
                    res();
                } catch(err) {
                    console.log(chalk.red('[ERROR] Failed to delete image:', imageName, 'from S3 bucket:', config.aws.s3.bucket, err));
                    rej(err);
                }
            } else {
                console.log(chalk.green('[INFO] Skipping image deletion on S3 for image:'), chalk.blue(imageName), chalk.green('in bucket:'), chalk.blue(config.aws.s3.bucket));
                res();
            }
        });
    });
};

const uploadAndAnalyze = async (imagePath) => {
        const imageName = imagePath.substring(imagePath.lastIndexOf('/') + 1);
        // await nest.saveLatestSnapshot(imagePath);
        await uploadImage(imagePath);
        const containsFace = await hasFace(imageName);

        if(containsFace) {
            const similarities = await analyzeImage(imageName);
            console.log(chalk.green('[DEBUG] Similarities: ', similarities));
            console.log(chalk.green(`[INFO] The face is ${chalk.blue(similarities[0])}% similar to the source image.`));

            if(similarities > config.options.similarityThreshold) {
            // TODO unlock door
                console.log(chalk.purple('[INFO] Unlocking Door!'));
            }
            console.log(chalk.green(`[INFO] Event with the id: ${chalk.blue(imageName)} has finished processing.`));

            if(config.options.cleanup.local) {
                console.log(chalk.green('[INFO] Cleaning Up...'));
                await cleanup(imageName, config.options.cleanup.s3);
            }
        } else {
            console.log(chalk.green('[INFO] The image'), chalk.blue(imageName), chalk.green('does not contain a recognizable face.'));
            if(config.options.cleanup.local) {
                console.log(chalk.green('[INFO] Cleaning Up...'));
                await cleanup(imageName, config.options.cleanup.s3);
            }
        }
};

app.get('/events/subscribe', (req, res) => {
    nest.subscribe(async (event) => {
        console.log(chalk.green('[INFO] Event Received: '), chalk.blue(event.id));
        // const imageName = `target_image_${event.id}.jpg`;
        const imageName = `target_image.jpg`;
        const imagePath = path.join(__dirname, '..', 'assets', imageName);
        if(event.types.includes("motion")) {
            let i = 0;
            const intervalId = setInterval(async () => {
                await uploadAndAnalyze(imagePath);
                if(++i === config.options.retries) clearInterval(intervalId);
            }, 5000);
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

