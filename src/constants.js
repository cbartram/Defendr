const { NEST_ID, PHONE_NUMBER } = process.env;

const config = {
    urls: {
        OAUTH_URL: 'https://oauth2.googleapis.com/token',
        JWT_TOKEN_URL: 'https://nestauthproxyservice-pa.googleapis.com/v1/issue_jwt',
        NEXUS_HOST: 'https://nexusapi-us1.dropcam.com'
    },
    endpoints: {
        EVENTS_ENDPOINT: `/cuepoint/${NEST_ID}/2`,
        SNAPSHOT_ENDPOINT: `/event_snapshot/${NEST_ID}/?crop_type=timeline&width=700`,
        LATEST_IMAGE_ENDPOINT: `/get_image?width=640&uuid=${NEST_ID}`
    },
    aws: {
        s3: {
            bucket: 'defendr'
        },
        sns: {
            phoneNumber: PHONE_NUMBER
        }
    },
    options: {
       // The number of times to upload and analyze the latest image once an event has occurred.
       // For example: a user is walking up to the house and is 20 feet away, an event triggers, the latest snapshot is taken
       // but the user is no where near the house. The analysis might produce a much lower result.
       // This way we will try to analyze the latest image 3 times each 5 seconds apart to give the best chance of getting a clear picture of
       // the users face to analyze.
       retries: 3,

       // The amount of time between each try to pull the latest image from the camera and analyze it for facial
       // recognition. The time is in milliseconds
       retryInterval: 5000,

       // The threshold by which the door unlocks when two images are similar enough. For example: if this value
       // is 85.00 then two faces within the images must be at least 85% similar in order for the door to unlock
       similarityThreshold: 85.00,

      // Property to determine if the image should be permanently
      // removed from S3/local to save space after processing is complete
      cleanup: {
          s3: true,
          local: true,
      }
    }
};

module.exports = {
    config,
    PORT: process.env.PORT || 3000
};
